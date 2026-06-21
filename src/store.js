import { defaultGraph } from './data/defaultGraph.js'
import { loadFromStorage, saveToStorage } from './storage.js'

let nextId = 1

function generateId() {
  return `g_${Date.now()}_${nextId++}`
}

export function createStore(initialData = {}) {
  // 图谱列表（每个图谱: {id, name, description, updatedAt}）
  let graphs = initialData.graphs ?? [{ id: 'default', name: '示例图谱', description: '', updatedAt: new Date().toISOString() }]
  // 每个图谱的 nodes/edges
  const dataMap = initialData.dataMap ?? { default: { nodes: [...defaultGraph.nodes], edges: [...defaultGraph.edges] } }
  let currentGraphId = initialData.currentGraphId ?? graphs[0]?.id ?? 'default'
  const listeners = new Set()
  const undoStacks = {}
  const redoStacks = {}

  function ensureStacks(graphId) {
    if (!undoStacks[graphId]) undoStacks[graphId] = []
    if (!redoStacks[graphId]) redoStacks[graphId] = []
  }

  function getUndoStack() { ensureStacks(currentGraphId); return undoStacks[currentGraphId] }
  function getRedoStack() { ensureStacks(currentGraphId); return redoStacks[currentGraphId] }

  function currentData() {
    return dataMap[currentGraphId] ?? { nodes: [], edges: [] }
  }

  function notify() {
    const snapshot = exportData()
    saveToStorage(snapshot)
    listeners.forEach((fn) => fn(snapshot))
  }

  function pushHistory() {
    const data = currentData()
    getUndoStack().push([{ ...data, nodes: data.nodes.map((n) => ({ ...n })), edges: data.edges.map((e) => ({ ...e })) }])
    if (getUndoStack().length > 50) getUndoStack().shift()
    getRedoStack().length = 0
  }

  function exportData() {
    return {
      graphs: graphs.map((g) => ({ ...g })),
      dataMap: Object.fromEntries(
        Object.entries(dataMap).map(([id, d]) => [
          id,
          { nodes: d.nodes.map((n) => ({ ...n })), edges: d.edges.map((e) => ({ ...e })) },
        ])
      ),
      currentGraphId,
    }
  }

  function isValidNodePosition(x, y) {
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)
  }

  function setNodePosition(nodeId, x, y, { silent = false } = {}) {
    const { nodes } = currentData()
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return
    const nx = Math.round(x * 100) / 100
    const ny = Math.round(y * 100) / 100
    if (node.x === nx && node.y === ny) return
    node.x = nx
    node.y = ny
    if (!silent) notify()
  }

  function getGraphRootNodeId() {
    const { nodes, edges } = currentData()
    if (!nodes.length) return null
    const targets = new Set(edges.map((e) => e.target))
    const root =
      nodes.find((n) => n.label === '中心主题') ??
      nodes.find((n) => n.important === 'yes' && !targets.has(n.id)) ??
      nodes.find((n) => !targets.has(n.id))
    return root?.id ?? nodes[0]?.id ?? null
  }

  function getStoredNodePosition(nodeId) {
    const node = currentData().nodes.find((n) => n.id === nodeId)
    if (!node || !isValidNodePosition(node.x, node.y)) return null
    return { x: node.x, y: node.y }
  }

  function toCytoscapeElements() {
    const { nodes, edges } = currentData()
    return [
      ...nodes.map((n) => {
        const data = {
          id: n.id,
          label: n.label,
          group: n.group || '',
          gender: n.gender || '',
        }
        if (n.important === 'yes') data.important = 'yes'
        if (n.parent) data.parent = n.parent
        const element = { data }
        if (isValidNodePosition(n.x, n.y)) {
          element.position = { x: n.x, y: n.y }
        }
        return element
      }),
      ...edges.map((e) => ({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type || '',
        },
      })),
    ]
  }

  function addNode({ id, label, group }) {
    const trimmedId = id?.trim()
    const trimmedLabel = label?.trim()
    if (!trimmedId || !trimmedLabel) throw new Error('节点 ID 和名称不能为空')
    const { nodes } = currentData()
    if (nodes.some((n) => n.id === trimmedId)) throw new Error(`节点「${trimmedId}」已存在`)

    pushHistory()
    dataMap[currentGraphId].nodes.push({ id: trimmedId, label: trimmedLabel, group: group || '' })
    notify()
    return trimmedId
  }

  function generateNodeId(label) {
    const base = (label?.trim() || '新节点').replace(/\s+/g, '_')
    let id = base
    let i = 1
    const { nodes } = currentData()
    while (nodes.some((n) => n.id === id)) {
      id = `${base}_${i++}`
    }
    return id
  }

  function getParentId(nodeId) {
    const { edges } = currentData()
    const edge = edges.find((e) => e.target === nodeId)
    return edge?.source ?? null
  }

  function getChildrenIds(nodeId) {
    const { edges } = currentData()
    return edges.filter((e) => e.source === nodeId).map((e) => e.target)
  }

  function addChildNode(parentId, label = '新节点', beforeNotify) {
    const trimmedLabel = label.trim() || '新节点'
    const id = generateNodeId(trimmedLabel)

    pushHistory()
    dataMap[currentGraphId].nodes.push({ id, label: trimmedLabel, group: '' })

    if (parentId) {
      dataMap[currentGraphId].edges.push({ id: `e${Date.now()}_${nextId++}`, source: parentId, target: id, type: '子节点' })
    }

    beforeNotify?.(id)
    notify()
    return id
  }

  function addSiblingNode(nodeId, label = '新节点', beforeNotify) {
    const parentId = getParentId(nodeId) ?? nodeId
    return addChildNode(parentId, label, beforeNotify)
  }

  function updateNode(id, updates) {
    const { nodes } = currentData()
    const node = nodes.find((n) => n.id === id)
    if (!node) throw new Error('节点不存在')

    const nextLabel = updates.label !== undefined ? updates.label.trim() : node.label
    const nextGroup = updates.group !== undefined ? updates.group : node.group
    if (nextLabel === node.label && nextGroup === node.group) return

    pushHistory()
    node.label = nextLabel
    node.group = nextGroup
    notify()
  }

  function deleteNode(id) {
    pushHistory()
    dataMap[currentGraphId].nodes = currentData().nodes.filter((n) => n.id !== id)
    dataMap[currentGraphId].edges = currentData().edges.filter((e) => e.source !== id && e.target !== id)
    notify()
  }

  function addEdge({ source, target, type }) {
    if (!source || !target) throw new Error('请选择源节点和目标节点')
    if (source === target) throw new Error('不能连接同一节点')
    const { nodes, edges } = currentData()
    if (!nodes.some((n) => n.id === source)) throw new Error('源节点不存在')
    if (!nodes.some((n) => n.id === target)) throw new Error('目标节点不存在')
    if (edges.some((e) => e.source === source && e.target === target)) {
      throw new Error('该关系已存在')
    }

    const edge = { id: `e${Date.now()}_${nextId++}`, source, target, type: type?.trim() || '关系' }
    pushHistory()
    dataMap[currentGraphId].edges.push(edge)
    notify()
    return edge.id
  }

  function updateEdge(id, updates) {
    const { edges } = currentData()
    const edge = edges.find((e) => e.id === id)
    if (!edge) throw new Error('关系不存在')
    const nextType = updates.type !== undefined ? updates.type.trim() : edge.type
    if (nextType === edge.type) return

    pushHistory()
    edge.type = nextType
    notify()
  }

  function deleteEdge(id) {
    pushHistory()
    dataMap[currentGraphId].edges = currentData().edges.filter((e) => e.id !== id)
    notify()
  }

  function search(query) {
    const q = query.trim().toLowerCase()
    if (!q) return { nodeIds: [], edgeIds: [] }

    const { nodes, edges } = currentData()
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

  function getNode(id) {
    return currentData().nodes.find((n) => n.id === id) ?? null
  }

  function getEdge(id) {
    return currentData().edges.find((e) => e.id === id) ?? null
  }

  function getAllNodes() {
    return currentData().nodes.map((n) => ({ ...n }))
  }

  function undo() {
    const stack = getUndoStack()
    if (stack.length === 0) return false
    const { nodes, edges } = currentData()
    getRedoStack().push([{ ...{ nodes, edges }, nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) }])
    const prev = stack.pop()
    dataMap[currentGraphId] = { nodes: prev.nodes.map((n) => ({ ...n })), edges: prev.edges.map((e) => ({ ...e })) }
    notify()
    return true
  }

  function redo() {
    const stack = getRedoStack()
    if (stack.length === 0) return false
    const { nodes, edges } = currentData()
    getUndoStack().push([{ ...{ nodes, edges }, nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) }])
    const next = stack.pop()
    dataMap[currentGraphId] = { nodes: next.nodes.map((n) => ({ ...n })), edges: next.edges.map((e) => ({ ...e })) }
    notify()
    return true
  }

  function canUndo() {
    return getUndoStack().length > 0
  }

  function canRedo() {
    return getRedoStack().length > 0
  }

  function clearHistory() {
    undoStacks[currentGraphId] = []
    redoStacks[currentGraphId] = []
  }

  function loadFromData(data, { silent = false } = {}) {
    graphs = data.graphs ?? graphs
    dataMap = data.dataMap ?? dataMap
    if (data.currentGraphId && graphs.some((g) => g.id === data.currentGraphId)) {
      currentGraphId = data.currentGraphId
    }
    if (!graphs.length) {
      graphs = [{ id: 'default', name: '示例图谱', description: '', updatedAt: new Date().toISOString() }]
    }
    if (!dataMap[currentGraphId] || !graphs.some((g) => g.id === currentGraphId)) {
      currentGraphId = graphs[0].id
      if (!dataMap[currentGraphId]) {
        dataMap[currentGraphId] = { nodes: [...defaultGraph.nodes], edges: [...defaultGraph.edges] }
      }
    }
    clearHistory()
    if (!silent) notify()
  }

  function resetToDefault() {
    const id = generateId()
    graphs = [{ id, name: '示例图谱', description: '', updatedAt: new Date().toISOString() }]
    dataMap = { [id]: { nodes: [...defaultGraph.nodes], edges: [...defaultGraph.edges] } }
    currentGraphId = id
    clearHistory()
    notify()
  }

  // === 多图谱管理 ===

  function getGraphs() {
    return graphs.map((g) => ({ ...g }))
  }

  function getCurrentGraphId() {
    return currentGraphId
  }

  function switchGraph(graphId) {
    if (graphId === currentGraphId) return
    if (!dataMap[graphId]) {
      dataMap[graphId] = { nodes: [], edges: [] }
    }
    currentGraphId = graphId
    clearHistory()
    notify()
  }

  function createGraph(name, description = '', beforeNotify) {
    const id = generateId()
    const rootId = generateNodeId('中心主题')
    pushHistoryForCurrent()
    graphs.unshift({ id, name, description, updatedAt: new Date().toISOString() })
    dataMap[id] = {
      nodes: [{ id: rootId, label: '中心主题', group: '', important: 'yes' }],
      edges: [],
    }
    currentGraphId = id
    clearHistory()
    beforeNotify?.(rootId)
    notify()
    return { graphId: id, rootNodeId: rootId }
  }

  function deleteGraph(graphId) {
    if (graphs.length <= 1) throw new Error('至少保留一个图谱')
    if (graphId === currentGraphId) {
      const idx = graphs.findIndex((g) => g.id === graphId)
      const next = graphs[idx + 1] || graphs[idx - 1]
      if (next) switchGraph(next.id)
    }
    graphs = graphs.filter((g) => g.id !== graphId)
    delete dataMap[graphId]
    delete undoStacks[graphId]
    delete redoStacks[graphId]
    notify()
  }

  function repairOrphanNodes({ silent = false } = {}) {
    const { nodes, edges } = currentData()
    if (nodes.length <= 1) return 0

    const root =
      nodes.find((n) => n.label === '中心主题') ??
      nodes.find((n) => n.important === 'yes') ??
      nodes[0]

    const orphans = nodes.filter((n) => {
      if (n.id === root.id) return false
      return !edges.some((e) => e.source === n.id || e.target === n.id)
    })

    if (!orphans.length) return 0

    pushHistory()
    orphans.forEach((n) => {
      edges.push({
        id: `e${Date.now()}_${nextId++}`,
        source: root.id,
        target: n.id,
        type: '子节点',
      })
    })
    if (!silent) notify()
    else saveToStorage(exportData())
    return orphans.length
  }

  function renameGraph(graphId, name) {
    const g = graphs.find((g) => g.id === graphId)
    if (g) g.name = name
    notify()
  }

  function pushHistoryForCurrent() {
    const data = currentData()
    ensureStacks(currentGraphId)
    undoStacks[currentGraphId].push([{ ...data, nodes: data.nodes.map((n) => ({ ...n })), edges: data.edges.map((e) => ({ ...e })) }])
    if (undoStacks[currentGraphId].length > 50) undoStacks[currentGraphId].shift()
    redoStacks[currentGraphId].length = 0
  }

  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  return {
    addNode,
    addChildNode,
    addSiblingNode,
    getParentId,
    getChildrenIds,
    updateNode,
    deleteNode,
    addEdge,
    updateEdge,
    deleteEdge,
    search,
    getNode,
    getEdge,
    getAllNodes,
    getStoredNodePosition,
    setNodePosition,
    getGraphRootNodeId,
    exportData,
    toCytoscapeElements,
    loadFromData,
    resetToDefault,
    undo,
    redo,
    canUndo,
    canRedo,
    subscribe,
    // 多图谱 API
    getGraphs,
    getCurrentGraphId,
    switchGraph,
    createGraph,
    deleteGraph,
    renameGraph,
    repairOrphanNodes,
  }
}

export function initStore() {
  const saved = loadFromStorage()
  return createStore(saved ?? {})
}
