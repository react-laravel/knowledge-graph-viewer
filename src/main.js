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
    this.saveTimer = null
  }

  async init() {
    const user = await requireSso()
    if (!user) return
    initAuthUi(user)

    const cyContainer = document.getElementById('cy')
    this.graph = new GraphManager(cyContainer, {
      onSelect: (selection) => this.ui?.onSelect(selection),
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
    this.editor.onNodeExpand = (nodeId) => {
      if (this.viewManager.isAggregateNode(nodeId)) {
        this.viewManager.expandAggregate(nodeId)
      } else {
        this.viewManager.expandFromNode(nodeId)
      }
    }

    this.ui = new SidebarPanel(this.store, this.graph, this.editor, this.viewManager, this.detailPanel)

    this.store.subscribe(() => {
      this.editor.onStoreUpdate()
      this._updateGraphSelector()
      this.viewManager.applyView()
      if (this.saveTimer) clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => this._saveToApi(), 1000)
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
        this.store.switchGraph(id)
        this.viewManager.loadForGraph(id)
        this.editor.deselect()
        this.viewManager.applyView({ layout: true })
        this._updateGraphSelector()
        this.ui.syncInitialSelection()
      },
      createGraph: async () => {
        const name = prompt('新图谱名称：', '新图谱')
        if (!name) return
        this.store.createGraph(name, '')
        this.viewManager.resetForGraph(this.store.getCurrentGraphId())
        await this._saveToApi()
        this._updateGraphSelector()
        this.viewManager.applyView({ layout: true })
        this.editor.deselect()
        this._updateGraphSelector()
        this.ui.syncInitialSelection()
      },
      deleteGraph: async (id) => {
        if (!confirm('确定删除这个图谱吗？')) return
        try {
          await knowledgeApi.delete(Number(id))
        } catch {}
        this.store.deleteGraph(id)
        this.graphList = this.graphList.filter((g) => String(g.id) !== id)
        this.viewManager.loadForGraph(this.store.getCurrentGraphId())
        this.viewManager.applyView({ layout: true })
        this.editor.deselect()
        this._updateGraphSelector()
        this.ui.syncInitialSelection()
      },
      refreshList: async () => {
        await this._loadGraphsFromApi()
        this._updateGraphSelector()
      },
      selectAndFocus: (nodeId) => {
        this.viewManager.setFocusNode(nodeId, { replace: true, layout: false })
        this.editor.selectNode(nodeId)
        this.graph.setSelected(nodeId)
        this.graph.focusNode(nodeId)
        this.ui.onSelect({ type: 'node', id: nodeId })
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

    const btnDelete = document.getElementById('btn-delete-graph')
    if (btnDelete) btnDelete.disabled = graphs.length <= 1
  }
}

const app = new App()
app.init()
