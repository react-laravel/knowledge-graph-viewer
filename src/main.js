import { initStore } from './store.js'
import { GraphManager } from './graph.js'
import { SidebarPanel } from './ui.js'
import { InlineEditor } from './editor.js'
import { knowledgeApi } from './api.js'
import { ViewManager } from './view/viewManager.js'
import { DetailPanel } from './view/detailPanel.js'
import { initTheme } from './theme.js'
import { initAuthUi, requireSso } from './auth.js'
import './styles.css'

const initialTheme = initTheme()

export class App {
  constructor() {
    this.store = initStore()
    this.graphList = []
    this.saveTimers = new Map()
    this.pendingSaveSnapshots = new Map()
    this.saveQueue = Promise.resolve()
    this.savePromise = null
    this.graphIdAliases = new Map()
    this.deletedGraphIds = new Set()
  }

  async init() {
    const user = await requireSso()
    if (!user) return
    initAuthUi(user)

    const cyContainer = document.getElementById('cy')
    this.graph = new GraphManager(cyContainer, {
      onSelect: (selection) => this.ui?.onSelect(selection),
      onPreviewSelect: (selection) => this.ui?.onPreviewSelect(selection),
      onActivate: (selection) => this.ui?.onActivate(selection),
      themeMode: initialTheme,
    })
    window.cy = this.graph.cy

    this.viewManager = new ViewManager(this.store, this.graph)
    this.detailPanel = new DetailPanel(
      document.getElementById('detail-content'),
      this.viewManager,
      (nodeId) => window.kgStore?.selectAndFocus(nodeId)
    )
    this.detailPanel.renderEmpty()

    this.editor = new InlineEditor(this.store, this.graph)
    this.editor.onNodeCreated = (nodeId, parentId) => {
      this.viewManager.revealCreatedNode(nodeId, parentId)
    }

    this.ui = new SidebarPanel(this.store, this.graph, this.editor, this.viewManager, this.detailPanel)

    this.store.subscribe((snapshot, change = {}) => {
      this.editor.onStoreUpdate()
      this._updateGraphSelector()
      this.viewManager.applyView()
      if (!change.transient) {
        this._scheduleSave(snapshot.currentGraphId, snapshot)
      }
    })

    await this._loadGraphsFromApi()
    this.viewManager.init()
    this.ui._syncViewControls()
    this.ui.syncInitialSelection()

    this._initGraphSelector()
    this._updateGraphSelector()
  }

  async _loadGraphsFromApi() {
    try {
      this.graphList = await knowledgeApi.list()
      this.store.loadFromData({
        graphs: this.graphList.map((g) => ({
          id: String(g.id),
          name: g.name,
          description: g.description,
          updatedAt: g.updated_at,
        })),
        dataMap: Object.fromEntries(
          this.graphList.map((g) => [
            String(g.id),
            {
              ...(g.data ?? {}),
              nodes: (g.data?.nodes ?? []).map((n) => ({ ...n })),
              edges: (g.data?.edges ?? []).map((e) => ({ ...e })),
            },
          ])
        ),
        currentGraphId: String(this.graphList[0]?.id ?? this.store.getCurrentGraphId()),
      })
    } catch {
      // API 不可用，继续使用 localStorage
    }
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

  _scheduleSave(graphId, snapshot, delay = 1000) {
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

  _cancelScheduledSave(graphId) {
    const id = String(graphId)
    const timer = this.saveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.saveTimers.delete(id)
    this.pendingSaveSnapshots.delete(id)
  }

  _enqueueSave(graphId, snapshot) {
    const task = this.saveQueue.then(() => this._performSaveToApi(graphId, snapshot))
    this.saveQueue = task.catch(() => {})
    this.savePromise = task
    task.finally(() => {
      if (this.savePromise === task) this.savePromise = null
    })
    return task
  }

  _saveToApi(graphId = this.store.getCurrentGraphId(), snapshot = null) {
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

  async _performSaveToApi(graphId, snapshot) {
    const originalId = String(graphId)
    const resolvedId = this._resolveGraphId(originalId)
    if (this.deletedGraphIds.has(originalId) || this.deletedGraphIds.has(resolvedId)) return

    try {
      const apiGraph = this.graphList.find((g) => String(g.id) === resolvedId)
      const currentData = snapshot.dataMap[originalId]
        ?? snapshot.dataMap[resolvedId]
        ?? { nodes: [], edges: [] }
      const graphMeta = snapshot.graphs.find((g) => String(g.id) === originalId)
        ?? snapshot.graphs.find((g) => String(g.id) === resolvedId)
      const name = graphMeta?.name || apiGraph?.name || '未命名图谱'
      const description = graphMeta?.description ?? apiGraph?.description ?? ''

      // 列表请求失败时 graphList 可能为空。纯数字 ID 仍是服务端图谱，
      // 只能更新原记录，不能回退为 POST 后制造重复图谱。
      if (apiGraph || this._isServerGraphId(resolvedId)) {
        const updated = await knowledgeApi.update(Number(resolvedId), {
          name,
          description,
          data: currentData,
        })
        if (apiGraph) Object.assign(apiGraph, updated)
        return
      }

      const created = await knowledgeApi.create(name, description, currentData)
      if (created?.id == null) throw new Error('创建图谱后未返回 ID')

      // 图谱可能在 POST 期间被用户删除；不要把已经删除的本地图谱重新带回列表。
      if (this.deletedGraphIds.has(originalId)) {
        try {
          await knowledgeApi.delete(Number(created.id))
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
        this._updateGraphSelector()
      }
    } catch {
      // 静默失败，localStorage 已保存
    }
  }

  _initGraphSelector() {
    const graphSelect = document.getElementById('graph-select')
    graphSelect?.addEventListener('change', (e) => {
      const id = e.target.value
      if (id && window.kgStore) window.kgStore.switchGraph(id)
    })

    document.getElementById('btn-new-graph')?.addEventListener('click', async () => {
      if (window.kgStore) await window.kgStore.createGraph()
    })

    document.getElementById('btn-delete-graph')?.addEventListener('click', async () => {
      if (window.kgStore) await window.kgStore.deleteGraph(this.store.getCurrentGraphId())
    })

    window.kgStore = {
      getGraphs: () => this.store.getGraphs(),
      getCurrentGraphId: () => this.store.getCurrentGraphId(),
      switchGraph: (id) => {
        if (!this.editor.resolveCurrentEdit?.()) {
          this._updateGraphSelector()
          return
        }
        const previousId = this.store.getCurrentGraphId()
        if (id !== previousId) this._saveToApi(previousId)
        this.store.switchGraph(id)
        this.viewManager.loadForGraph(id)
        this.editor.deselect()
        this.viewManager.applyView({ layout: true })
        this._updateGraphSelector()
        this.ui.syncInitialSelection()
        this.ui.closeAppMenuToCanvas()
      },
      createGraph: async () => {
        if (!this.editor.resolveCurrentEdit?.()) return
        const previousId = this.store.getCurrentGraphId()
        const name = prompt('新图谱名称：', '新图谱')
        if (!name) return
        this._saveToApi(previousId)
        this.store.createGraph(name, '')
        this.viewManager.resetForGraph(this.store.getCurrentGraphId())
        await this._saveToApi(this.store.getCurrentGraphId())
        this._updateGraphSelector()
        this.viewManager.applyView({ layout: true })
        this.editor.deselect()
        this._updateGraphSelector()
        this.ui.syncInitialSelection()
        this.ui.closeAppMenuToCanvas()
      },
      deleteGraph: async (id) => {
        if (!this.editor.resolveCurrentEdit?.()) return
        const nodes = this.store.getAllNodes()
        const onlyCenterNode = nodes.length === 1 && this.store.isRootNode(nodes[0].id)
        if (!onlyCenterNode && !confirm('确定删除这个图谱吗？')) return
        const graphId = String(id)
        const resolvedId = this._resolveGraphId(graphId)
        this.deletedGraphIds.add(graphId)
        this.deletedGraphIds.add(resolvedId)
        this._cancelScheduledSave(graphId)
        if (resolvedId !== graphId) this._cancelScheduledSave(resolvedId)

        // 本地临时图谱尚未 POST，直接删除即可；tombstone 会让已入队任务失效。
        if (this._isServerGraphId(resolvedId)) {
          try {
            await knowledgeApi.delete(Number(resolvedId))
          } catch (error) {
            // 404 等价于服务端已经不存在，仍可完成本地删除。其他错误必须
            // 恢复图谱和保存能力，不能留下永久 tombstone。
            if (error?.status !== 404) {
              this.deletedGraphIds.delete(graphId)
              this.deletedGraphIds.delete(resolvedId)
              const snapshot = this.store.exportPersistedData?.() ?? this.store.exportData()
              this._scheduleSave(graphId, snapshot, 0)
              SidebarPanel.showToast(error?.message || '删除图谱失败，请稍后重试', true)
              this._updateGraphSelector()
              return
            }
          }
        }

        this.store.deleteGraph(graphId)
        this.graphList = this.graphList.filter((g) => {
          const candidateId = String(g.id)
          return candidateId !== graphId && candidateId !== resolvedId
        })
        this.viewManager.loadForGraph(this.store.getCurrentGraphId())
        this.viewManager.applyView({ layout: true })
        this.editor.deselect()
        this._updateGraphSelector()
        this.ui.syncInitialSelection()
        this.ui.closeAppMenuToCanvas()
      },
      refreshList: async () => {
        await this._loadGraphsFromApi()
        this._updateGraphSelector()
      },
      selectAndFocus: (nodeId) => {
        this.ui.onSelect({ type: 'node', id: nodeId })
        this.graph.focusNode(nodeId)
      },
      editNode: (nodeId) => {
        this.ui.onActivate({ type: 'node', id: nodeId })
      },
      deleteNode: (nodeId) => {
        this.editor.deleteNodeById(nodeId)
      },
    }
  }

  _updateGraphSelector() {
    const select = document.getElementById('graph-select')
    if (!select) return
    const graphs = this.store.getGraphs()
    const currentId = this.store.getCurrentGraphId()
    select.innerHTML = graphs
      .map(
        (g) =>
          `<option value="${g.id}" ${g.id === currentId ? 'selected' : ''}>${SidebarPanel.escapeHtml(g.name || '未命名')}</option>`
      )
      .join('')

    const btnDelete = document.getElementById('btn-delete-graph')
    if (btnDelete) btnDelete.disabled = graphs.length <= 1
  }
}

const app = new App()
app.init()
