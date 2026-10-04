import { knowledgeApi } from '../api.js'

/**
 * Coordinates remote graph loading, debounced saves and deletion tombstones.
 *
 * This service deliberately owns timers, promises and server ID aliases so the
 * application controller can focus on UI orchestration. Persisted snapshots
 * are supplied by the store and remain the single source of graph data.
 */
export class GraphSyncService {
  constructor(store, options = {}) {
    this.store = store
    this.api = options.api ?? knowledgeApi
    this.onCatalogChange = options.onCatalogChange ?? (() => {})

    this.graphList = []
    this.saveTimers = new Map()
    this.pendingSaveSnapshots = new Map()
    this.saveQueue = Promise.resolve()
    this.savePromise = null
    this.graphIdAliases = new Map()
    this.deletedGraphIds = new Set()
  }

  async loadGraphs() {
    this.graphList = await this.api.list()
    const currentId = String(this.store.getCurrentGraphId())
    const selectedId = this.graphList.some((graph) => String(graph.id) === currentId)
      ? currentId
      : String(this.graphList[0]?.id ?? currentId)
    this.store.loadFromData({
      graphs: this.graphList.map((graph) => ({
        id: String(graph.id),
        name: graph.name,
        description: graph.description,
        updatedAt: graph.updated_at,
      })),
      dataMap: Object.fromEntries(
        this.graphList.map((graph) => [
          String(graph.id),
          {
            ...(graph.data ?? {}),
            nodes: (graph.data?.nodes ?? []).map((node) => ({ ...node })),
            edges: (graph.data?.edges ?? []).map((edge) => ({ ...edge })),
          },
        ])
      ),
      currentGraphId: selectedId,
    })
  }

  scheduleSave(graphId, snapshot, delay = 1000) {
    const id = String(graphId)
    const previousTimer = this.saveTimers.get(id)
    if (previousTimer) clearTimeout(previousTimer)

    this.pendingSaveSnapshots.set(id, snapshot)
    const timer = setTimeout(() => {
      this.saveTimers.delete(id)
      const pendingSnapshot = this.pendingSaveSnapshots.get(id)
      this.pendingSaveSnapshots.delete(id)
      if (pendingSnapshot) this._enqueueSave(id, pendingSnapshot)
    }, delay)
    this.saveTimers.set(id, timer)
  }

  saveNow(graphId = this.store.getCurrentGraphId(), snapshot = null) {
    const id = String(graphId)
    const timer = this.saveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.saveTimers.delete(id)

    const pendingSnapshot = this.pendingSaveSnapshots.get(id)
    this.pendingSaveSnapshots.delete(id)
    const nextSnapshot = snapshot
      ?? pendingSnapshot
      ?? (this.store.exportPersistedData?.() ?? this.store.exportData())

    return this._enqueueSave(id, nextSnapshot)
  }

  async deleteGraph(graphId) {
    const id = String(graphId)
    const resolvedId = this._resolveGraphId(id)
    this.deletedGraphIds.add(id)
    this.deletedGraphIds.add(resolvedId)
    this._cancelScheduledSave(id)
    if (resolvedId !== id) this._cancelScheduledSave(resolvedId)

    if (this._isServerGraphId(resolvedId)) {
      try {
        await this.api.delete(Number(resolvedId))
      } catch (error) {
        // 404 means the graph is already absent remotely. Other failures must
        // restore saving instead of leaving a permanent deletion tombstone.
        if (error?.status !== 404) {
          this.deletedGraphIds.delete(id)
          this.deletedGraphIds.delete(resolvedId)
          const snapshot = this.store.exportPersistedData?.() ?? this.store.exportData()
          this.scheduleSave(id, snapshot, 0)
          throw error
        }
      }
    }

    this.graphList = this.graphList.filter((graph) => {
      const candidateId = String(graph.id)
      return candidateId !== id && candidateId !== resolvedId
    })
    this.onCatalogChange()
  }

  _resolveGraphId(graphId) {
    let current = String(graphId)
    const visited = new Set()
    while (this.graphIdAliases.has(current) && !visited.has(current)) {
      visited.add(current)
      current = this.graphIdAliases.get(current)
    }
    return current
  }

  _isServerGraphId(graphId) {
    return /^\d+$/.test(String(graphId))
  }

  _cancelScheduledSave(graphId) {
    const id = String(graphId)
    const timer = this.saveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.saveTimers.delete(id)
    this.pendingSaveSnapshots.delete(id)
  }

  _enqueueSave(graphId, snapshot) {
    const task = this.saveQueue.then(() => this._performSave(graphId, snapshot))
    this.saveQueue = task.catch(() => {})
    this.savePromise = task
    task.finally(() => {
      if (this.savePromise === task) this.savePromise = null
    })
    return task
  }

  async _performSave(graphId, snapshot) {
    const originalId = String(graphId)
    const resolvedId = this._resolveGraphId(originalId)
    if (this.deletedGraphIds.has(originalId) || this.deletedGraphIds.has(resolvedId)) return

    try {
      const apiGraph = this.graphList.find((graph) => String(graph.id) === resolvedId)
      const currentData = snapshot.dataMap[originalId]
        ?? snapshot.dataMap[resolvedId]
        ?? { nodes: [], edges: [] }
      const graphMeta = snapshot.graphs.find((graph) => String(graph.id) === originalId)
        ?? snapshot.graphs.find((graph) => String(graph.id) === resolvedId)
      const name = graphMeta?.name || apiGraph?.name || '未命名图谱'
      const description = graphMeta?.description ?? apiGraph?.description ?? ''

      // A numeric ID always belongs to a server graph, even if the list request
      // failed and the local catalog is empty. Updating avoids duplicate POSTs.
      if (apiGraph || this._isServerGraphId(resolvedId)) {
        const updated = await this.api.update(Number(resolvedId), {
          name,
          description,
          data: currentData,
        })
        if (apiGraph) Object.assign(apiGraph, updated)
        return
      }

      const created = await this.api.create(name, description, currentData)
      if (created?.id == null) throw new Error('创建图谱后未返回 ID')

      // A graph can be removed while its POST is in flight. Remove the remote
      // record too instead of resurrecting it in the local catalog.
      if (this.deletedGraphIds.has(originalId)) {
        try {
          await this.api.delete(Number(created.id))
        } catch {}
        return
      }

      const createdId = String(created.id)
      this.graphIdAliases.set(originalId, createdId)
      this.graphList.unshift(created)
      if (this.store.getGraphs().some((graph) => graph.id === originalId)) {
        this.store.replaceGraphId(originalId, createdId, {
          name: created.name,
          description: created.description ?? description,
          updatedAt: created.updated_at,
        })
        this.onCatalogChange()
      }
    } catch {
      // localStorage already holds the snapshot. Remote sync retries on the
      // next store change and must not make editing unavailable.
    }
  }
}
