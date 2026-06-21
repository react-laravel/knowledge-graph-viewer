import { exportJson, importJson, clearStorage } from './storage.js'

export class SidebarPanel {
  constructor(store, graph, editor) {
    this.store = store
    this.graph = graph
    this.editor = editor

    this.searchQuery = ''
    this.currentSelection = null
    this.hasShownRelated = false
    this.treeExpanded = new Set()
    this._treeQuery = ''
    this._treeAllExpanded = true
    this._treeFirstRender = true

    this._initTabs()
    this._initSearch()
    this._initButtons()
    this._initStoreListener()
    this._initTree()
    this._initTreeEvents()
    this._updateButtonStates()
  }

  // === Tab 切换 ===

  _initTabs() {
    const tabs = document.querySelectorAll('.tab')
    const panels = document.querySelectorAll('.tab-panel')
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => t.classList.remove('active'))
        panels.forEach((p) => p.classList.remove('active'))
        tab.classList.add('active')
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active')
      })
    })
  }

  // === 搜索 ===

  _initSearch() {
    const searchInput = document.getElementById('search-input')
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value
      if (!this.searchQuery.trim()) {
        this.graph.clearHighlight()
      } else {
        const { nodeIds, edgeIds } = this.store.search(this.searchQuery)
        this.graph.setHighlight([...nodeIds, ...edgeIds])
      }
      this._updateButtonStates()
    })

    document.getElementById('btn-clear-search').addEventListener('click', () => {
      searchInput.value = ''
      this.searchQuery = ''
      this.graph.clearHighlight()
      this._updateButtonStates()
    })
  }

  // === 按钮事件 ===

  _initButtons() {
    document.getElementById('btn-export').addEventListener('click', () => {
      exportJson(this.store.exportData())
      SidebarPanel.showToast('已导出 JSON')
    })

    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('file-import').click()
    })

    document.getElementById('file-import').addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (!file) return
      try {
        const data = await importJson(file)
        this.store.loadFromData(data)
        this.editor.deselect()
        this.graph.runLayout()
        SidebarPanel.showToast('导入成功')
      } catch (err) {
        SidebarPanel.showToast(err.message, true)
      }
      e.target.value = ''
    })

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!confirm('恢复默认示例数据？当前修改将丢失。')) return
      clearStorage()
      this.store.resetToDefault()
      this.searchQuery = ''
      this.graph.clearHighlight()
      this.editor.deselect()
      this.graph.runLayout()
      SidebarPanel.showToast('已恢复默认数据')
    })

    document.getElementById('btn-layout').addEventListener('click', () => {
      this.graph.runLayout()
    })

    document.getElementById('btn-related-view').addEventListener('click', () => {
      if (!this.currentSelection || this.currentSelection.type !== 'node') {
        SidebarPanel.showToast('请先选中一个节点', true)
        return
      }
      this.graph.showRelated(this.currentSelection.id)
      this.hasShownRelated = true
      this._updateButtonStates()
    })

    document.getElementById('btn-reset-view').addEventListener('click', () => {
      this.graph.resetView()
      this.hasShownRelated = false
      this._updateButtonStates()
    })
  }

  // === Store 订阅 ===

  _initStoreListener() {
    this.store.subscribe(() => {
      if (this.searchQuery.trim()) {
        const { nodeIds, edgeIds } = this.store.search(this.searchQuery)
        this.graph.setHighlight([...nodeIds, ...edgeIds])
      }
      this._renderTree()
    })
  }

  // === 树形节点列表 ===

  _initTree() {
    this.treeView = document.getElementById('tree-view')
    this.treeSearchInput = document.getElementById('tree-search-input')
    const toggleBtn = document.getElementById('btn-tree-toggle')
    this._treeAllExpanded = true

    this._renderTree()

    // 展开/收起按钮直接绑定
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this._treeAllExpanded = !this._treeAllExpanded
        toggleBtn.textContent = this._treeAllExpanded ? '⊟' : '⊞'
        if (!this._treeAllExpanded) {
          this.treeExpanded.clear()
        } else {
          const dataMap = this.store.exportData().dataMap
          const currentId = this.store.getCurrentGraphId()
          const nodes = dataMap[currentId]?.nodes ?? this.store.getAllNodes()
          const childrenMap = {}
          nodes.forEach((n) => {
            const parentId = n.parent || ''
            if (parentId && nodes.some((c) => c.parent === parentId)) {
              if (!childrenMap[parentId]) childrenMap[parentId] = []
              childrenMap[parentId].push(n)
            }
          })
          const expandAll = (nodeId) => {
            if ((childrenMap[nodeId] || []).length > 0) {
              this.treeExpanded.add(nodeId)
              childrenMap[nodeId].forEach((c) => expandAll(c.id))
            }
          }
          nodes.filter((n) => !n.parent).forEach((n) => expandAll(n.id))
        }
        this._renderTree()
      })
    }
  }

  _renderTree() {
    if (!this.treeView) return

    const allNodes = this.store.getAllNodes()
    const currentId = this.store.getCurrentGraphId()
    const dataMap = this.store.exportData().dataMap
    let nodes = dataMap[currentId]?.nodes ?? allNodes

    // 搜索过滤：匹配节点 + 补全祖先路径，保证树结构完整
    if (this._treeQuery) {
      const q = this._treeQuery.trim().toLowerCase()
      if (q) {
        const allNodes = nodes
        const byId = Object.fromEntries(allNodes.map((n) => [n.id, n]))
        const matched = new Set()
        // 第一轮：找到所有匹配节点
        allNodes.forEach((n) => {
          if (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) {
            matched.add(n.id)
            // 向上补全祖先
            let pid = n.parent || ''
            while (pid && byId[pid]) {
              matched.add(pid)
              pid = byId[pid].parent || ''
            }
          }
        })
        nodes = allNodes.filter((n) => matched.has(n.id))
      }
    }

    // 构建 parent → children 映射
    const childrenMap = {}
    const roots = []
    nodes.forEach((n) => {
      const parentId = n.parent || ''
      if (parentId && childrenMap[parentId]) {
        childrenMap[parentId].push(n)
      } else if (parentId) {
        childrenMap[parentId] = [n]
      } else {
        roots.push(n)
      }
    })

    // 按名称排序
    const sortFn = (a, b) => a.label.localeCompare(b.label, 'zh')
    roots.sort(sortFn)
    Object.values(childrenMap).forEach((arr) => arr.sort(sortFn))

    // 首次渲染时自动展开所有有子节点的项
    if (this._treeFirstRender) {
      this._treeFirstRender = false
      const expandAll = (nodeId) => {
        if ((childrenMap[nodeId] || []).length > 0) {
          this.treeExpanded.add(nodeId)
          childrenMap[nodeId].forEach((c) => expandAll(c.id))
        }
      }
      roots.forEach((n) => expandAll(n.id))
    }

    // 渲染
    this.treeView.innerHTML = roots.map((n) => this._renderTreeNode(n, childrenMap, 0)).join('')
  }

  _renderTreeNode(node, childrenMap, depth) {
    const children = childrenMap[node.id] || []
    const hasChildren = children.length > 0
    const isExpanded = this.treeExpanded.has(node.id)
    const isSelected = this.currentSelection?.id === node.id && this.currentSelection?.type === 'node'
    const isOrg = node.group === 'org'

    const toggleClass = hasChildren ? (isExpanded ? 'expanded' : '') : 'empty'
    const toggleIcon = '▸'
    const labelClass = isOrg ? 'tree-label org' : 'tree-label'
    const selectedClass = isSelected ? 'selected' : ''
    const childrenClass = hasChildren && !isExpanded ? 'collapsed' : ''

    const childHtml = hasChildren
      ? `<div class="tree-children ${childrenClass}">${children.map((c) => this._renderTreeNode(c, childrenMap, depth + 1)).join('')}</div>`
      : ''

    return `
      <div class="tree-node ${selectedClass}" data-id="${node.id}" style="padding-left: ${6 + depth * 16}px">
        <span class="tree-toggle ${toggleClass}" data-toggle="${node.id}"${hasChildren ? ` onclick="window._kgToggle('${node.id}')"` : ''}>${toggleIcon}</span>
        <span class="${labelClass}" data-select="${node.id}">${SidebarPanel.escapeHtml(node.label)}</span>
        <span class="tree-actions">
          <button class="tree-btn" data-edit="${node.id}" title="编辑">✎</button>
          <button class="tree-btn danger" data-delete="${node.id}" title="删除">×</button>
        </span>
      </div>
      ${childHtml}
    `
  }

  // tree 事件委托
  _initTreeEvents() {
    if (!this.treeView) return

    // 节点展开/折叠的全局入口（inline onclick 调用）
    window._kgToggle = (nodeId) => {
      if (this.treeExpanded.has(nodeId)) {
        this.treeExpanded.delete(nodeId)
      } else {
        this.treeExpanded.add(nodeId)
      }
      this._renderTree()
    }

    // 树内搜索
    if (this.treeSearchInput) {
      this.treeSearchInput.addEventListener('input', () => {
        this._treeQuery = this.treeSearchInput.value
        this._renderTree()
      })
    }

    this.treeView.addEventListener('click', (e) => {
      // 选择节点
      const label = e.target.closest('[data-select]')
      if (label) {
        const nodeId = label.dataset.select
        if (window.kgStore) window.kgStore.selectAndFocus(nodeId)
        return
      }

      // 编辑按钮
      const editBtn = e.target.closest('[data-edit]')
      if (editBtn) {
        const nodeId = editBtn.dataset.edit
        if (window.kgStore) window.kgStore.editNode(nodeId)
        return
      }

      // 删除按钮
      const delBtn = e.target.closest('[data-delete]')
      if (delBtn) {
        const nodeId = delBtn.dataset.delete
        if (window.kgStore) window.kgStore.deleteNode(nodeId)
        return
      }
    })

    this.treeView.addEventListener('dblclick', (e) => {
      const label = e.target.closest('[data-select]')
      if (label) {
        const nodeId = label.dataset.select
        if (window.kgStore) window.kgStore.editNode(nodeId)
      }
    })
  }

  // === 选择回调 ===

  onSelect(selection) {
    if (!selection) {
      this.currentSelection = null
      this.editor.onCanvasDeselect()
      this._updateButtonStates()
      this._updateTreeSelection()
      return
    }
    this.currentSelection = selection
    if (selection.type === 'node') {
      this.editor.onNodeSelect(selection.id, { shiftLink: selection.shiftKey })
    } else {
      this.editor.onEdgeSelect(selection.id)
    }
    this._updateButtonStates()
    this._updateTreeSelection()
  }

  _updateTreeSelection() {
    if (!this.treeView) return
    this.treeView.querySelectorAll('.tree-node').forEach((el) => {
      const nodeId = el.dataset.id
      el.classList.toggle('selected', this.currentSelection?.id === nodeId && this.currentSelection?.type === 'node')
    })
  }

  // === 按钮状态管理 ===

  _updateButtonStates() {
    const btnRelated = document.getElementById('btn-related-view')
    if (btnRelated) {
      btnRelated.disabled = !this.currentSelection || this.currentSelection.type !== 'node'
    }
    const btnReset = document.getElementById('btn-reset-view')
    if (btnReset) {
      btnReset.disabled = !this.hasShownRelated
    }
    const btnClear = document.getElementById('btn-clear-search')
    if (btnClear) {
      btnClear.disabled = !this.searchQuery.trim()
    }
  }

  static showToast(message, isError = false) {
    const toast = document.getElementById('toast')
    toast.textContent = message
    toast.className = `toast show${isError ? ' error' : ''}`
    clearTimeout(SidebarPanel._toastTimer)
    SidebarPanel._toastTimer = setTimeout(() => {
      toast.className = 'toast'
    }, 2500)
  }

  static escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}
