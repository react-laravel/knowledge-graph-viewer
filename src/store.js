import { defaultGraph } from './data/defaultGraph.js'
import { loadFromStorage, saveToStorage } from './storage.js'
import { enrichEdge, enrichEdges } from './view/relationCategories.js'

function normalizeNodeLinks(links) {
  if (!Array.isArray(links)) return []
  return links
    .map((link) => {
      const url = String(link?.url ?? '').trim()
      if (!url) return null
      return {
        title: String(link?.title ?? '').trim() || url,
        url,
      }
    })
    .filter(Boolean)
}

function isHierarchyEdge(edge) {
  return edge?.hierarchy === true || edge?.hierarchy === 'yes' || edge?.type === '子节点'
}

function normalizeBranchSide(side) {
  return side === 'left' || side === 'right' ? side : ''
}

function isExplicitRoot(node) {
  return node?.isRoot === true || node?.isRoot === 'yes'
}

const LEGACY_PLACEHOLDER_ID_RE = /^新节点(?:_\d+)?$/
const NON_SEMANTIC_PLACEHOLDER_FIELDS = new Set([
  'id',
  'label',
  'group',
  'parent',
  'branchSide',
  'isRoot',
  'draft',
])

function hasMeaningfulValue(value) {
  if (value == null || value === false) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function hasSemanticNodeData(node) {
  return Object.entries(node).some(([key, value]) => (
    !NON_SEMANTIC_PLACEHOLDER_FIELDS.has(key) && hasMeaningfulValue(value)
  ))
}

export class KnowledgeStore {
  graphs = []
  dataMap = {}
  currentGraphId = 'default'
  listeners = new Set()
  undoStacks = {}
  redoStacks = {}
  _edgeIdCounter = 0
  _draftHistoryEntries = {}

  constructor(initialData) {
    this.graphs = initialData?.graphs ?? [
      { id: 'default', name: '示例图谱', description: '', updatedAt: new Date().toISOString() },
    ]
    this.dataMap = initialData?.dataMap ?? {
      default: { nodes: [...defaultGraph.nodes], edges: [...defaultGraph.edges] },
    }
    this.currentGraphId = initialData?.currentGraphId ?? 'default'
    this._ensureStacks(this.currentGraphId)
    // 计算当前最大 edgeId 计数器，避免导入时冲突
    this._syncEdgeCounter()
  }

  // === 当前图谱数据 ===

  _currentData() {
    return this.dataMap[this.currentGraphId] ?? { nodes: [], edges: [] }
  }

  _ensureStacks(graphId) {
    if (!this.undoStacks[graphId]) this.undoStacks[graphId] = []
    if (!this.redoStacks[graphId]) this.redoStacks[graphId] = []
  }

  _getUndoStack() {
    this._ensureStacks(this.currentGraphId)
    return this.undoStacks[this.currentGraphId]
  }

  _getRedoStack() {
    this._ensureStacks(this.currentGraphId)
    return this.redoStacks[this.currentGraphId]
  }

  _pushHistory() {
    const data = this._currentData()
    const entry = { nodes: data.nodes.map((n) => ({ ...n })), edges: data.edges.map((e) => ({ ...e })) }
    this._getUndoStack().push(entry)
    if (this._getUndoStack().length > 50) this._getUndoStack().shift()
    this._getRedoStack().length = 0
    return entry
  }

  _notify({ transient = false } = {}) {
    const snapshot = this.exportPersistedData()
    saveToStorage(snapshot)
    this.listeners.forEach((fn) => fn(snapshot, { transient }))
  }

  _rememberDraftHistory(nodeId, entry) {
    if (!this._draftHistoryEntries[this.currentGraphId]) {
      this._draftHistoryEntries[this.currentGraphId] = new Map()
    }
    this._draftHistoryEntries[this.currentGraphId].set(nodeId, entry)
  }

  _forgetDraftHistory(nodeId, { discard = false } = {}) {
    const graphId = this.currentGraphId
    const entries = this._draftHistoryEntries[graphId]
    const origin = entries?.get(nodeId)
    entries?.delete(nodeId)
    if (!discard) return

    const stack = this._getUndoStack()
    const originIndex = origin ? stack.indexOf(origin) : -1
    if (origin) {
      if (originIndex >= 0) stack.splice(originIndex, 1)
    }

    const removeDraftFromSnapshot = (snapshot) => {
      const containsThisDraft = snapshot.nodes.some(
        (node) => node.id === nodeId && node.draft === true
      )
      if (!containsThisDraft) return
      snapshot.nodes = snapshot.nodes.filter((node) => node.id !== nodeId)
      snapshot.edges = snapshot.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
    }

    // 只清理草稿创建之后产生的历史。更早的历史里可能存在一个已删除、
    // 后来被草稿复用同一 ID 的正式节点，不能把它从撤销记录中误删。
    const newerHistory = originIndex >= 0 ? stack.slice(originIndex) : stack
    newerHistory.forEach(removeDraftFromSnapshot)
    this._getRedoStack().forEach(removeDraftFromSnapshot)
  }

  // === 节点操作 ===

  addNode({ id, label, group }) {
    const trimmedId = id?.trim()
    const trimmedLabel = label?.trim()
    if (!trimmedId || !trimmedLabel) throw new Error('节点 ID 和名称不能为空')
    if (this._currentData().nodes.some((n) => n.id === trimmedId)) {
      throw new Error(`节点「${trimmedId}」已存在`)
    }

    this._pushHistory()
    this.dataMap[this.currentGraphId].nodes.push({ id: trimmedId, label: trimmedLabel, group: group || '' })
    this._notify()
    return trimmedId
  }

  generateNodeId(label) {
    const base = (label?.trim() || '新节点').replace(/\s+/g, '_')
    let id = base
    let i = 1
    while (this._currentData().nodes.some((n) => n.id === id)) {
      id = `${base}_${i++}`
    }
    return id
  }

  getNode(id) {
    return this._currentData().nodes.find((n) => n.id === id) ?? null
  }

  getEdge(id) {
    return this._currentData().edges.find((e) => e.id === id) ?? null
  }

  isHierarchyEdge(edgeOrId) {
    const edge = typeof edgeOrId === 'string' ? this.getEdge(edgeOrId) : edgeOrId
    return isHierarchyEdge(edge)
  }

  getAllNodes() {
    return this._currentData().nodes.map((n) => ({ ...n }))
  }

  /**
   * 返回当前思维导图的中心节点。
   *
   * 新数据以 mode + rootNodeId 为准；旧数据只有在所有普通节点恰好组成
   * 一棵完整的层级树时才会推断根节点，避免把普通关系图误判为思维导图。
   */
  getMindMapRootId() {
    const data = this._currentData()
    const ordinaryNodes = data.nodes.filter((node) => node.group !== 'org' && node.group !== 'aggregate')
    const nodeById = new Map(ordinaryNodes.map((node) => [node.id, node]))

    if (data.mode === 'mindmap' && data.rootNodeId && nodeById.has(data.rootNodeId)) {
      return data.rootNodeId
    }

    const explicitRoot = ordinaryNodes.find(isExplicitRoot)
    if (explicitRoot) return explicitRoot.id

    if (data.nodes.some((node) => node.group === 'org')) return null
    if (ordinaryNodes.length < 2) return null

    const hierarchyEdges = data.edges.filter(isHierarchyEdge)
    if (hierarchyEdges.length !== ordinaryNodes.length - 1) return null
    if (hierarchyEdges.some((edge) => (
      edge.source === edge.target || !nodeById.has(edge.source) || !nodeById.has(edge.target)
    ))) return null

    const incomingCount = new Map(ordinaryNodes.map((node) => [node.id, 0]))
    const undirected = new Map(ordinaryNodes.map((node) => [node.id, []]))
    for (const edge of hierarchyEdges) {
      incomingCount.set(edge.target, incomingCount.get(edge.target) + 1)
      if (incomingCount.get(edge.target) > 1) return null
      undirected.get(edge.source).push(edge.target)
      undirected.get(edge.target).push(edge.source)
    }

    const roots = ordinaryNodes.filter((node) => incomingCount.get(node.id) === 0)
    if (roots.length !== 1) return null

    const visited = new Set()
    const pending = [roots[0].id]
    while (pending.length) {
      const id = pending.pop()
      if (visited.has(id)) continue
      visited.add(id)
      pending.push(...undirected.get(id))
    }

    return visited.size === ordinaryNodes.length ? roots[0].id : null
  }

  isRootNode(nodeId) {
    return !!nodeId && this.getMindMapRootId() === nodeId
  }

  /**
   * 返回可直接给布局层使用的可序列化思维导图结构。
   * 只读取明确的层级边，不会把普通业务关系当成父子关系。
   */
  getMindMapStructure() {
    const rootId = this.getMindMapRootId()
    if (!rootId) return null

    const { nodes, edges } = this._currentData()
    const ordinaryNodes = nodes.filter((node) => node.group !== 'org' && node.group !== 'aggregate')
    const nodeIds = new Set(ordinaryNodes.map((node) => node.id))
    const parentById = {}
    const childrenById = Object.fromEntries(ordinaryNodes.map((node) => [node.id, []]))

    for (const edge of edges) {
      if (
        !isHierarchyEdge(edge)
        || !nodeIds.has(edge.source)
        || !nodeIds.has(edge.target)
        || edge.target === rootId
        || parentById[edge.target]
      ) continue
      parentById[edge.target] = edge.source
      childrenById[edge.source].push(edge.target)
    }

    const nodeById = new Map(ordinaryNodes.map((node) => [node.id, node]))
    const branchSideById = this._getRootBranchAssignments(rootId, childrenById[rootId], nodeById)

    return { rootId, parentById, childrenById, branchSideById }
  }

  _getRootBranchAssignments(rootId, childIds, nodeById = null, excludedNodeId = null) {
    const nodesById = nodeById ?? new Map(this._currentData().nodes.map((node) => [node.id, node]))
    const assignments = {}
    if (!rootId) return assignments
    let leftCount = 0
    let rightCount = 0

    for (const childId of childIds ?? []) {
      if (childId === excludedNodeId) continue
      let side = normalizeBranchSide(nodesById.get(childId)?.branchSide)
      if (!side) side = rightCount <= leftCount ? 'right' : 'left'
      assignments[childId] = side
      if (side === 'left') leftCount += 1
      else rightCount += 1
    }

    return assignments
  }

  _nextRootBranchSide(rootId, excludedNodeId = null) {
    const { nodes, edges } = this._currentData()
    const childIds = edges
      .filter((edge) => edge.source === rootId && isHierarchyEdge(edge) && edge.target !== excludedNodeId)
      .map((edge) => edge.target)
    const assignments = this._getRootBranchAssignments(
      rootId,
      childIds,
      new Map(nodes.map((node) => [node.id, node])),
      excludedNodeId
    )
    const sides = Object.values(assignments)
    const leftCount = sides.filter((side) => side === 'left').length
    const rightCount = sides.length - leftCount
    return rightCount <= leftCount ? 'right' : 'left'
  }

  getParentId(nodeId) {
    const edges = this._currentData().edges
    const edge = edges.find((e) => e.target === nodeId && isHierarchyEdge(e))
      ?? edges.find((e) => e.target === nodeId)
    return edge?.source ?? null
  }

  getHierarchyParentId(nodeId) {
    const edge = this._currentData().edges.find((e) => e.target === nodeId && isHierarchyEdge(e))
    return edge?.source ?? null
  }

  getChildrenIds(nodeId) {
    return this._currentData().edges.filter((e) => e.source === nodeId).map((e) => e.target)
  }

  updateNode(id, updates) {
    const { nodes } = this._currentData()
    const node = nodes.find((n) => n.id === id)
    if (!node) throw new Error('节点不存在')
    if (
      this.isRootNode(id)
      && updates.parent !== undefined
      && (updates.parent || '') !== (node.parent || '')
    ) {
      throw new Error('中心节点不能移动到分组中')
    }

    const nextLabel = updates.label !== undefined ? updates.label.trim() : node.label
    const nextGroup = updates.group !== undefined ? updates.group : node.group
    const nextParent = updates.parent !== undefined ? updates.parent : node.parent
    const updatesDescription = Object.prototype.hasOwnProperty.call(updates, 'description')
    const updatesLinks = Object.prototype.hasOwnProperty.call(updates, 'links')
    const nextDescription = updatesDescription ? String(updates.description ?? '').trim() : node.description
    const nextLinks = updatesLinks ? normalizeNodeLinks(updates.links) : node.links
    const descriptionChanged = updatesDescription && nextDescription !== (node.description ?? '')
    const linksChanged = updatesLinks && JSON.stringify(nextLinks) !== JSON.stringify(normalizeNodeLinks(node.links))
    if (
      nextLabel === node.label &&
      nextGroup === node.group &&
      nextParent === node.parent &&
      !descriptionChanged &&
      !linksChanged
    ) return

    this._pushHistory()
    node.label = nextLabel
    node.group = nextGroup
    node.parent = nextParent
    if (updatesDescription) node.description = nextDescription
    if (updatesLinks) node.links = nextLinks
    this._notify()
  }

  /** 设置节点的父节点（加入家族/区域） */
  setNodeParent(nodeId, parentId) {
    this.updateNode(nodeId, { parent: parentId || '' })
  }

  /** 将节点移出家族 */
  removeNodeFromGroup(nodeId) {
    this.updateNode(nodeId, { parent: '' })
  }

  deleteNode(id) {
    if (this.isRootNode(id)) throw new Error('中心节点不能删除')
    this._pushHistory()
    this.dataMap[this.currentGraphId].nodes = this._currentData().nodes.filter((n) => n.id !== id)
    this.dataMap[this.currentGraphId].edges = this._currentData().edges.filter(
      (e) => e.source !== id && e.target !== id
    )
    this._notify()
  }

  isDraftNode(id) {
    return this.getNode(id)?.draft === true
  }

  addDraftChildNode(parentId) {
    if (parentId && !this.getNode(parentId)) throw new Error('父节点不存在')

    const id = this.generateNodeId('新节点')
    const node = { id, label: '新节点', group: '', draft: true }
    if (parentId && this.isRootNode(parentId)) {
      node.branchSide = this._nextRootBranchSide(parentId)
    }

    const historyEntry = this._pushHistory()
    this.dataMap[this.currentGraphId].nodes.push(node)
    if (parentId) {
      this.dataMap[this.currentGraphId].edges.push({
        id: `e_${Date.now()}_${this._nextEdgeId()}`,
        source: parentId,
        target: id,
        type: '子节点',
        hierarchy: true,
      })
    }
    this._rememberDraftHistory(id, historyEntry)
    this._notify({ transient: true })
    return id
  }

  addDraftSiblingNode(nodeId) {
    if (!this.getNode(nodeId)) throw new Error('节点不存在')
    if (this.isRootNode(nodeId)) return this.addDraftChildNode(nodeId)
    return this.addDraftChildNode(this.getParentId(nodeId))
  }

  finalizeDraftNode(id, label) {
    const node = this.getNode(id)
    if (!node || node.draft !== true) return false
    const trimmedLabel = String(label ?? '').trim()
    if (!trimmedLabel) throw new Error('节点名称不能为空')

    node.label = trimmedLabel
    delete node.draft
    this._forgetDraftHistory(id)
    this._notify()
    return true
  }

  discardDraftNode(id) {
    const node = this.getNode(id)
    if (!node || node.draft !== true || this.isRootNode(id)) return false

    this.dataMap[this.currentGraphId].nodes = this._currentData().nodes.filter((item) => item.id !== id)
    this.dataMap[this.currentGraphId].edges = this._currentData().edges.filter(
      (edge) => edge.source !== id && edge.target !== id
    )
    this._forgetDraftHistory(id, { discard: true })
    this._notify({ transient: true })
    return true
  }

  findLegacyPlaceholderNodeIds({ parentId } = {}) {
    const { nodes, edges } = this._currentData()
    const rootId = this.getMindMapRootId()
    const nodeIds = new Set(nodes.map((node) => node.id))

    return nodes
      .filter((node) => {
        if (
          node.id === rootId
          || isExplicitRoot(node)
          || node.draft === true
          || node.label !== '新节点'
          || !LEGACY_PLACEHOLDER_ID_RE.test(node.id)
          || hasMeaningfulValue(node.group)
          || hasMeaningfulValue(node.parent)
          || hasSemanticNodeData(node)
        ) return false

        const incidentEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
        if (incidentEdges.length !== 1) return false
        const incomingHierarchy = incidentEdges[0]
        if (
          incomingHierarchy.target !== node.id
          || !isHierarchyEdge(incomingHierarchy)
          || !nodeIds.has(incomingHierarchy.source)
        ) return false
        return parentId === undefined || incomingHierarchy.source === parentId
      })
      .map((node) => node.id)
  }

  cleanupLegacyPlaceholderNodes(ids) {
    const candidates = this.findLegacyPlaceholderNodeIds()
    const candidateIds = new Set(candidates)
    const requestedIds = ids === undefined
      ? candidates
      : [...new Set(Array.isArray(ids) ? ids : [ids])]
    const removableIds = requestedIds.filter((id) => candidateIds.has(id))
    if (removableIds.length === 0) return []

    const removing = new Set(removableIds)
    this._pushHistory()
    this.dataMap[this.currentGraphId].nodes = this._currentData().nodes.filter((node) => !removing.has(node.id))
    this.dataMap[this.currentGraphId].edges = this._currentData().edges.filter(
      (edge) => !removing.has(edge.source) && !removing.has(edge.target)
    )
    this._notify()
    return removableIds
  }

  addChildNode(parentId, label = '新节点') {
    const trimmedLabel = label.trim() || '新节点'
    const id = this.generateNodeId(trimmedLabel)

    const node = { id, label: trimmedLabel, group: '' }
    if (parentId && this.isRootNode(parentId)) {
      node.branchSide = this._nextRootBranchSide(parentId)
    }

    this._pushHistory()
    this.dataMap[this.currentGraphId].nodes.push(node)

    if (parentId) {
      this.dataMap[this.currentGraphId].edges.push({
        id: `e_${Date.now()}_${this._nextEdgeId()}`,
        source: parentId,
        target: id,
        type: '子节点',
        hierarchy: true,
      })
    }

    this._notify()
    return id
  }

  addSiblingNode(nodeId, label = '新节点') {
    // 中心主题没有同级，任何入口都只能在它下面创建一级主题。
    if (this.isRootNode(nodeId)) return this.addChildNode(nodeId, label)
    const parentId = this.getParentId(nodeId)
    if (!parentId) {
      const trimmedLabel = label.trim() || '新节点'
      const id = this.generateNodeId(trimmedLabel)
      this._pushHistory()
      this.dataMap[this.currentGraphId].nodes.push({ id, label: trimmedLabel, group: '' })
      this._notify()
      return id
    }
    return this.addChildNode(parentId, label)
  }

  /** 将已有节点移动到另一个普通节点下；层级边与业务关系边彼此独立。 */
  moveNodeUnder(nodeId, parentId) {
    const { nodes, edges } = this._currentData()
    const node = nodes.find((item) => item.id === nodeId)
    const parent = nodes.find((item) => item.id === parentId)
    if (!node || !parent) throw new Error('节点不存在')
    if (nodeId === parentId) throw new Error('不能移动到自己下面')
    if (this.isRootNode(nodeId)) throw new Error('中心节点不能移动')
    if (node.group === 'org' || parent.group === 'org') {
      throw new Error('家族分组不能作为普通节点层级移动')
    }

    let ancestorId = parentId
    const visited = new Set()
    while (ancestorId && !visited.has(ancestorId)) {
      if (ancestorId === nodeId) throw new Error('不能移动到自己的子节点下面')
      visited.add(ancestorId)
      ancestorId = this.getHierarchyParentId(ancestorId)
    }

    const hierarchyEdges = edges.filter((edge) => edge.target === nodeId && isHierarchyEdge(edge))
    const primaryEdge = hierarchyEdges[0]
    const movingToRoot = this.isRootNode(parentId)
    const nextBranchSide = movingToRoot
      ? normalizeBranchSide(node.branchSide) || this._nextRootBranchSide(parentId, nodeId)
      : ''
    const branchSideChanged = normalizeBranchSide(node.branchSide) !== nextBranchSide
    if (primaryEdge?.source === parentId && hierarchyEdges.length === 1 && !branchSideChanged) return false

    this._pushHistory()
    if (nextBranchSide) node.branchSide = nextBranchSide
    else delete node.branchSide
    if (primaryEdge) {
      primaryEdge.source = parentId
      primaryEdge.type = '子节点'
      primaryEdge.hierarchy = true
      this.dataMap[this.currentGraphId].edges = edges.filter(
        (edge) => edge === primaryEdge || !hierarchyEdges.includes(edge)
      )
    } else {
      edges.push({
        id: `e_${Date.now()}_${this._nextEdgeId()}`,
        source: parentId,
        target: nodeId,
        type: '子节点',
        hierarchy: true,
      })
    }

    this._notify()
    return true
  }

  // === 边操作 ===

  addEdge({ source, target, type }) {
    if (!source || !target) throw new Error('请选择源节点和目标节点')
    if (source === target) throw new Error('不能连接同一节点')
    const { nodes, edges } = this._currentData()
    if (!nodes.some((n) => n.id === source)) throw new Error('源节点不存在')
    if (!nodes.some((n) => n.id === target)) throw new Error('目标节点不存在')
    if (edges.some((e) => e.source === source && e.target === target)) {
      throw new Error('该关系已存在')
    }

    const edge = { id: `e_${this._nextEdgeId()}`, source, target, type: type?.trim() || '关系' }
    const enriched = enrichEdge(edge)
    edge.category = enriched.category
    this._pushHistory()
    this.dataMap[this.currentGraphId].edges.push(edge)
    this._notify()
    return edge.id
  }

  updateEdge(id, updates) {
    const { edges } = this._currentData()
    const edge = edges.find((e) => e.id === id)
    if (!edge) throw new Error('关系不存在')
    if (isHierarchyEdge(edge)) throw new Error('层级连线不能直接编辑，请使用“移动到…”调整层级')
    const nextType = updates.type !== undefined ? updates.type.trim() : edge.type
    const nextCategory = updates.category !== undefined ? updates.category : edge.category
    if (nextType === edge.type && nextCategory === edge.category) return

    this._pushHistory()
    edge.type = nextType
    if (updates.category !== undefined) edge.category = nextCategory
    this._notify()
  }

  deleteEdge(id) {
    const edge = this.getEdge(id)
    if (!edge) return
    if (isHierarchyEdge(edge)) throw new Error('层级连线不能直接删除，请移动或删除对应节点')
    this._pushHistory()
    this.dataMap[this.currentGraphId].edges = this._currentData().edges.filter((e) => e.id !== id)
    this._notify()
  }

  // === 搜索 ===

  search(query) {
    const q = query.trim().toLowerCase()
    if (!q) return { nodeIds: [], edgeIds: [] }

    const { nodes, edges } = this._currentData()
    const nodeIds = nodes
      .filter((n) => n.id.toLowerCase().includes(q) || n.label.toLowerCase().includes(q))
      .map((n) => n.id)

    const edgeIds = edges
      .filter(
        (e) =>
          e.type.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.target.toLowerCase().includes(q)
      )
      .map((e) => e.id)

    return { nodeIds, edgeIds }
  }

  // === 撤销/重做 ===

  undo() {
    const stack = this._getUndoStack()
    if (stack.length === 0) return false
    const { nodes, edges } = this._currentData()
    this._getRedoStack().push({ nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) })
    const prev = stack.pop()
    this.dataMap[this.currentGraphId] = {
      ...this._currentData(),
      nodes: prev.nodes.map((n) => ({ ...n })),
      edges: prev.edges.map((e) => ({ ...e })),
    }
    this._notify()
    return true
  }

  redo() {
    const stack = this._getRedoStack()
    if (stack.length === 0) return false
    const { nodes, edges } = this._currentData()
    this._getUndoStack().push({ nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) })
    const next = stack.pop()
    this.dataMap[this.currentGraphId] = {
      ...this._currentData(),
      nodes: next.nodes.map((n) => ({ ...n })),
      edges: next.edges.map((e) => ({ ...e })),
    }
    this._notify()
    return true
  }

  canUndo() {
    return this._getUndoStack().length > 0
  }

  canRedo() {
    return this._getRedoStack().length > 0
  }

  // === 数据导入导出 ===

  exportData() {
    return {
      graphs: this.graphs.map((g) => ({ ...g })),
      dataMap: Object.fromEntries(
        Object.entries(this.dataMap).map(([id, d]) => [
          id,
          {
            ...d,
            nodes: (d.nodes ?? []).map((n) => ({ ...n })),
            edges: (d.edges ?? []).map((e) => ({ ...e })),
          },
        ])
      ),
      currentGraphId: this.currentGraphId,
    }
  }

  exportPersistedData() {
    const data = this.exportData()
    data.dataMap = Object.fromEntries(
      Object.entries(data.dataMap).map(([graphId, graphData]) => {
        const draftIds = new Set(
          (graphData.nodes ?? []).filter((node) => node.draft === true).map((node) => node.id)
        )
        return [
          graphId,
          {
            ...graphData,
            nodes: (graphData.nodes ?? []).filter((node) => !draftIds.has(node.id)),
            edges: (graphData.edges ?? []).filter(
              (edge) => !draftIds.has(edge.source) && !draftIds.has(edge.target)
            ),
          },
        ]
      })
    )
    return data
  }

  toCytoscapeElements({ aggregateNodes = [] } = {}) {
    const { nodes, edges } = this._currentData()
    const enriched = enrichEdges(edges)
    const rootId = this.getMindMapRootId()
    return [
      ...nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          group: n.group || '',
          gender: n.gender || '',
          important: n.important === true || n.important === 'yes' ? 'yes' : '',
          parent: n.parent || '',
          tags: Array.isArray(n.tags) ? n.tags.join(',') : n.tag || '',
          isRoot: n.id === rootId ? 'yes' : 'no',
          mindMap: rootId && n.group !== 'org' && n.group !== 'aggregate' ? 'yes' : 'no',
          branchSide: normalizeBranchSide(n.branchSide),
        },
      })),
      ...aggregateNodes.map((n) => ({
        data: {
          id: n.id,
          label: n.label,
          group: 'aggregate',
          gender: '',
          important: '',
          parent: n.parent || '',
          aggregateKey: n.aggregateKey || '',
          isRoot: 'no',
          mindMap: 'no',
          branchSide: '',
        },
      })),
      ...enriched.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type || '',
          category: e.category,
          hierarchy: isHierarchyEdge(e) ? 'yes' : 'no',
        },
      })),
    ]
  }

  getNodeDegree(nodeId) {
    return this._currentData().edges.filter((e) => e.source === nodeId || e.target === nodeId).length
  }

  pickDefaultFocusNodeId() {
    const nodes = this.getAllNodes().filter((n) => n.group !== 'org' && n.group !== 'aggregate')
    const rootId = this.getMindMapRootId()
    if (rootId && nodes.some((node) => node.id === rootId)) return rootId
    const important = nodes.find((n) => n.important === 'yes' || n.important === true)
    if (important) return important.id
    let best = nodes[0]?.id ?? null
    let max = -1
    for (const n of nodes) {
      const d = this.getNodeDegree(n.id)
      if (d > max) {
        max = d
        best = n.id
      }
    }
    return best
  }

  loadFromData(data) {
    this.graphs = data.graphs ?? this.graphs
    this.dataMap = data.dataMap ?? this.dataMap
    if (!this.graphs.length) {
      this.graphs = [{ id: 'default', name: '示例图谱', description: '', updatedAt: new Date().toISOString() }]
    }
    if (!this.dataMap[this.currentGraphId] || !this.graphs.some((g) => g.id === this.currentGraphId)) {
      this.currentGraphId = this.graphs[0].id
      if (!this.dataMap[this.currentGraphId]) {
        this.dataMap[this.currentGraphId] = { nodes: [...defaultGraph.nodes], edges: [...defaultGraph.edges] }
      }
    }
    this._clearHistory()
    this._notify()
  }

  resetToDefault() {
    const id = this._generateId()
    this.graphs = [{ id, name: '示例图谱', description: '', updatedAt: new Date().toISOString() }]
    this.dataMap = { [id]: { nodes: [...defaultGraph.nodes], edges: [...defaultGraph.edges] } }
    this.currentGraphId = id
    this._clearHistory()
    this._notify()
  }

  _clearHistory() {
    this.undoStacks[this.currentGraphId] = []
    this.redoStacks[this.currentGraphId] = []
    delete this._draftHistoryEntries[this.currentGraphId]
  }

  _generateId() {
    return `g_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  }

  _syncEdgeCounter() {
    let maxNum = 0
    Object.values(this.dataMap).forEach((d) => {
      (d.edges || []).forEach((e) => {
        const m = e.id.match(/^e_(\d+)$/)
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10))
      })
    })
    this._edgeIdCounter = maxNum
  }

  _nextEdgeId() {
    return ++this._edgeIdCounter
  }

  // === 多图谱管理 ===

  getGraphs() {
    return this.graphs.map((g) => ({ ...g }))
  }

  getCurrentGraphId() {
    return this.currentGraphId
  }

  switchGraph(graphId) {
    if (graphId === this.currentGraphId) return
    if (!this.dataMap[graphId]) {
      this.dataMap[graphId] = { nodes: [], edges: [] }
    }
    this.currentGraphId = graphId
    this._clearHistory()
    this._notify()
  }

  createGraph(name, description = '') {
    const id = this._generateId()
    const graphName = String(name ?? '').trim() || '新图谱'
    const rootNodeId = 'root'
    this._pushHistory()
    this.graphs.unshift({ id, name: graphName, description, updatedAt: new Date().toISOString() })
    this.dataMap[id] = {
      mode: 'mindmap',
      rootNodeId,
      nodes: [{ id: rootNodeId, label: graphName, group: '', isRoot: true }],
      edges: [],
    }
    this.currentGraphId = id
    this._clearHistory()
    this._notify()
    return id
  }

  deleteGraph(graphId) {
    if (this.graphs.length <= 1) throw new Error('至少保留一个图谱')
    if (graphId === this.currentGraphId) {
      const idx = this.graphs.findIndex((g) => g.id === graphId)
      const next = this.graphs[idx + 1] || this.graphs[idx - 1]
      if (next) this.switchGraph(next.id)
    }
    this.graphs = this.graphs.filter((g) => g.id !== graphId)
    delete this.dataMap[graphId]
    delete this.undoStacks[graphId]
    delete this.redoStacks[graphId]
    delete this._draftHistoryEntries[graphId]
    this._notify()
  }

  renameGraph(graphId, name) {
    const g = this.graphs.find((g) => g.id === graphId)
    if (g) g.name = name
    this._notify()
  }

  replaceGraphId(oldId, newId, metadata = {}) {
    const oldKey = String(oldId)
    const newKey = String(newId)
    const graph = this.graphs.find((item) => item.id === oldKey)
    if (!graph) throw new Error('图谱不存在')
    if (oldKey !== newKey && this.graphs.some((item) => item.id === newKey)) {
      throw new Error('图谱 ID 已存在')
    }

    graph.id = newKey
    if (metadata.name !== undefined) graph.name = metadata.name
    if (metadata.description !== undefined) graph.description = metadata.description
    if (metadata.updatedAt !== undefined) graph.updatedAt = metadata.updatedAt

    if (oldKey !== newKey) {
      this.dataMap[newKey] = this.dataMap[oldKey] ?? { nodes: [], edges: [] }
      delete this.dataMap[oldKey]

      if (this.undoStacks[oldKey]) {
        this.undoStacks[newKey] = this.undoStacks[oldKey]
        delete this.undoStacks[oldKey]
      }
      if (this.redoStacks[oldKey]) {
        this.redoStacks[newKey] = this.redoStacks[oldKey]
        delete this.redoStacks[oldKey]
      }
      if (this._draftHistoryEntries[oldKey]) {
        this._draftHistoryEntries[newKey] = this._draftHistoryEntries[oldKey]
        delete this._draftHistoryEntries[oldKey]
      }
      if (this.currentGraphId === oldKey) this.currentGraphId = newKey
    }

    this._ensureStacks(newKey)
    this._notify()
    return newKey
  }

  // === 订阅 ===

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

export function initStore(initialData) {
  const saved = loadFromStorage()
  return new KnowledgeStore(saved ?? initialData)
}
