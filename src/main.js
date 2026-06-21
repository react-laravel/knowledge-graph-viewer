import { initStore } from './store.js'
import { GraphManager } from './graph.js'
import { SidebarPanel } from './ui.js'
import { InlineEditor } from './editor.js'
import { knowledgeApi } from './api.js'
import './styles.css'

export class App {
  constructor() {
    this.store = initStore()
    this.graphList = []
    this.saveTimer = null
  }

  async init() {
    // 初始化组件
    const cyContainer = document.getElementById('cy')
    this.graph = new GraphManager(cyContainer, {
      onSelect: (selection) => this.ui?.onSelect(selection),
    })

    this.editor = new InlineEditor(this.store, this.graph)
    this.ui = new SidebarPanel(this.store, this.graph, this.editor)

    // 监听 store 变化
    this.store.subscribe(() => {
      this.graph.sync(this.store.toCytoscapeElements())
      this.editor.onStoreUpdate()
      this._updateGraphSelector()
      // 防抖保存到 API
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => this._saveToApi(), 1000)
    })

    // 加载远程数据
    await this._loadGraphsFromApi()
    this.graph.sync(this.store.toCytoscapeElements(), { layout: true })

    // 图谱选择器事件
    this._initGraphSelector()

    // 确保初始渲染
    this._updateGraphSelector()
  }

  // === API 同步 ===

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

  async _saveToApi() {
    try {
      const currentId = this.store.getCurrentGraphId()
      const apiGraph = this.graphList.find((g) => String(g.id) === currentId)
      const data = this.store.exportData()
      const currentData = data.dataMap[currentId] ?? { nodes: [], edges: [] }

      if (apiGraph) {
        await knowledgeApi.update(Number(currentId), { data: currentData })
      } else {
        const name = this.store.getGraphs().find((g) => g.id === currentId)?.name || '未命名图谱'
        const created = await knowledgeApi.create(name, '', currentData)
        this.graphList.push(created)
        this.store.renameGraph(currentId, created.name)
        this._updateGraphSelector()
      }
    } catch {
      // 静默失败，localStorage 已保存
    }
  }

  // === 图谱选择器 ===

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

    // 暴露 API 到全局
    window.kgStore = {
      getGraphs: () => this.store.getGraphs(),
      getCurrentGraphId: () => this.store.getCurrentGraphId(),
      switchGraph: (id) => {
        this.store.switchGraph(id)
        this.graph.sync(this.store.toCytoscapeElements(), { layout: true })
        this.editor.deselect()
        this._updateGraphSelector()
      },
      createGraph: async () => {
        const name = prompt('新图谱名称：', '新图谱')
        if (!name) return
        this.store.createGraph(name, '')
        await this._saveToApi()
        this._updateGraphSelector()
        this.graph.sync(this.store.toCytoscapeElements(), { layout: true })
        this.editor.deselect()
      },
      deleteGraph: async (id) => {
        if (!confirm('确定删除这个图谱吗？')) return
        try {
          await knowledgeApi.delete(Number(id))
        } catch {}
        this.store.deleteGraph(id)
        this.graphList = this.graphList.filter((g) => String(g.id) !== id)
        this.graph.sync(this.store.toCytoscapeElements(), { layout: true })
        this.editor.deselect()
        this._updateGraphSelector()
      },
      refreshList: async () => {
        await this._loadGraphsFromApi()
        this._updateGraphSelector()
      },
      selectAndFocus: (nodeId) => {
        this.editor.selectNode(nodeId)
        this.graph.setSelected(nodeId)
        this.graph.focusNode(nodeId)
      },
      editNode: (nodeId) => {
        this.editor.selectNode(nodeId)
        this.editor.startEdit(nodeId)
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

    // 只有一个图谱时禁用删除按钮
    const btnDelete = document.getElementById('btn-delete-graph')
    if (btnDelete) btnDelete.disabled = graphs.length <= 1
  }
}

// 启动应用
const app = new App()
app.init()
