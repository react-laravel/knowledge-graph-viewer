import { initStore } from './store.js'
import { createGraph } from './graph.js'
import { createUI } from './ui.js'
import { createInlineEditor } from './editor.js'
import { knowledgeApi } from './api.js'
import './styles.css'

const store = initStore()
let ui
let editor
let graphList = []
let isHydrating = true

function graphHasValidLayout() {
  const nodes = store.getAllNodes()
  if (nodes.length === 0) return true
  const withPos = nodes.filter(
    (n) => typeof n.x === 'number' && typeof n.y === 'number' && (n.x !== 0 || n.y !== 0)
  )
  return withPos.length >= nodes.length * 0.8
}

function waitForCyReady() {
  return new Promise((resolve) => {
    const check = () => {
      if (graph.cy.width() > 0 && graph.cy.height() > 0) resolve()
      else requestAnimationFrame(check)
    }
    check()
  })
}

function refreshGraphView({ layout = false } = {}) {
  graph.clearSavedPositions()
  graph.resetView()
  const repaired = store.repairOrphanNodes({ silent: true })
  const needsLayout = layout || repaired > 0 || !graphHasValidLayout()
  graph.sync(store.toCytoscapeElements(), { layout: needsLayout })
  if (!needsLayout) graph.fitGraph()
}

async function refreshGraphViewWhenReady(options) {
  await waitForCyReady()
  refreshGraphView(options)
}

function mergeGraphDataFromApi(apiGraphs, localSnapshot) {
  const localGraphs = localSnapshot.graphs ?? []
  const localDataMap = localSnapshot.dataMap ?? {}
  const mergedGraphs = [...localGraphs]
  const mergedDataMap = { ...localDataMap }

  for (const g of apiGraphs) {
    const id = String(g.id)
    const apiNodes = g.data?.nodes ?? []
    const apiEdges = g.data?.edges ?? []
    const local = localDataMap[id]
    const localMeta = localGraphs.find((item) => item.id === id)
    const apiHasBody = apiNodes.length > 0 || apiEdges.length > 0

    if (!mergedGraphs.some((item) => item.id === id)) {
      mergedGraphs.unshift({
        id,
        name: g.name,
        description: g.description ?? '',
        updatedAt: g.updated_at ?? new Date().toISOString(),
      })
    }

    if (!apiHasBody && local) {
      continue
    }

    if (local && apiHasBody) {
      const localTime = new Date(localMeta?.updatedAt ?? 0).getTime()
      const apiTime = new Date(g.updated_at ?? 0).getTime()
      const localScore = local.nodes.length + local.edges.length
      const apiScore = apiNodes.length + apiEdges.length
      if (localTime >= apiTime || localScore > apiScore) {
        continue
      }
    }

    mergedDataMap[id] = {
      nodes: apiNodes.map((n) => ({ ...n })),
      edges: apiEdges.map((e) => ({ ...e })),
    }
  }

  return {
    graphs: mergedGraphs,
    dataMap: mergedDataMap,
    currentGraphId: localSnapshot.currentGraphId ?? mergedGraphs[0]?.id,
  }
}

async function loadGraphsFromApi() {
  const localSnapshot = store.exportData()
  try {
    graphList = await knowledgeApi.list()
    const merged = mergeGraphDataFromApi(graphList, localSnapshot)
    store.loadFromData(merged, { silent: true })
  } catch {
    // API 不可用，继续使用 localStorage
  }
}

async function saveToApi() {
  try {
    const currentId = store.getCurrentGraphId()
    const apiGraph = graphList.find((g) => String(g.id) === currentId)
    const data = store.exportData()
    const currentData = data.dataMap[currentId] ?? { nodes: [], edges: [] }

    if (apiGraph) {
      await knowledgeApi.update(Number(currentId), {
        data: currentData,
      })
    } else {
      const created = await knowledgeApi.create(
        store.getGraphs().find((g) => g.id === currentId)?.name || '未命名图谱',
        '',
        currentData
      )
      graphList.push(created)
      store.renameGraph(currentId, created.name)
      updateGraphSelector()
    }
  } catch {
    // 静默失败，localStorage 已保存
  }
}

const graph = createGraph(document.getElementById('cy'), {
  onSelect: (selection) => ui?.onSelect(selection),
  onPositionChange: (nodeId, pos, { silent = false } = {}) => {
    store.setNodePosition(nodeId, pos.x, pos.y, { silent })
  },
})

editor = createInlineEditor(store, graph)
ui = createUI(store, graph, editor)

// 监听 store 变化，自动保存到 API
let saveTimer = null
store.subscribe(() => {
  if (isHydrating) return
  graph.sync(store.toCytoscapeElements())
  editor.onStoreUpdate()
  updateGraphSelector()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveToApi(), 1000)
})

// 初始加载
async function init() {
  await loadGraphsFromApi()
  await refreshGraphViewWhenReady({ layout: false })
  isHydrating = false
  updateGraphSelector()

  // 图谱选择器事件
  const graphSelect = document.getElementById('graph-select')
  graphSelect?.addEventListener('change', (e) => {
    const id = e.target.value
    if (id && window.kgStore) {
      window.kgStore.switchGraph(id)
    }
  })

  document.getElementById('btn-new-graph')?.addEventListener('click', async () => {
    if (window.kgStore) {
      await window.kgStore.createGraph()
    }
  })

  document.getElementById('btn-delete-graph')?.addEventListener('click', async () => {
    const currentId = store.getCurrentGraphId()
    if (window.kgStore) {
      await window.kgStore.deleteGraph(currentId)
    }
  })

  // 暴露 API 到全局供 UI 调用
  window.kgStore = {
    getGraphs: () => store.getGraphs(),
    getCurrentGraphId: () => store.getCurrentGraphId(),
    switchGraph: async (id) => {
      store.switchGraph(id)
      await refreshGraphViewWhenReady({ layout: true })
      editor.deselect()
      updateGraphSelector()
    },
    createGraph: async () => {
      const name = prompt('新图谱名称：', '新图谱')
      if (!name) return
      graph.clearSavedPositions()
      graph.resetView()
      const { rootNodeId } = store.createGraph(name)
      updateGraphSelector()
      if (rootNodeId) {
        const anchorRoot = () => {
          const nodes = store.getAllNodes()
          if (nodes.length > 1) {
            graph.revealNodes(nodes.map((n) => n.id))
            return
          }
          if (!store.getStoredNodePosition(rootNodeId)) {
            graph.anchorRootNode(rootNodeId)
            graph.sync(store.toCytoscapeElements())
          }
          graph.revealNodes([rootNodeId])
          editor.selectNode(rootNodeId)
          graph.setSelected(rootNodeId)
        }
        if (graph.cy.width() > 0) {
          anchorRoot()
        } else {
          requestAnimationFrame(anchorRoot)
        }
      } else {
        editor.deselect()
      }
      await saveToApi()
    },
    deleteGraph: async (id) => {
      if (!confirm('确定删除这个图谱吗？')) return
      try {
        await knowledgeApi.delete(Number(id))
      } catch {}
      store.deleteGraph(id)
      graphList = graphList.filter((g) => String(g.id) !== id)
      graph.sync(store.toCytoscapeElements(), { layout: true })
      editor.deselect()
      updateGraphSelector()
    },
    refreshList: async () => {
      await loadGraphsFromApi()
      updateGraphSelector()
    },
  }
}

function updateGraphSelector() {
  const select = document.getElementById('graph-select')
  if (!select) return
  const graphs = store.getGraphs()
  const currentId = store.getCurrentGraphId()
  select.innerHTML = graphs
    .map(
      (g) =>
        `<option value="${g.id}" ${g.id === currentId ? 'selected' : ''}>${escapeHtml(g.name || '未命名')}</option>`
    )
    .join('')
  if (graphs.length > 0 && !currentId) {
    store.switchGraph(graphs[0].id)
  }

  // 只有一个图谱时禁用删除按钮
  const btnDelete = document.getElementById('btn-delete-graph')
  if (btnDelete) {
    btnDelete.disabled = graphs.length <= 1
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

init()

// 确保初始渲染时选择器有数据
updateGraphSelector()
