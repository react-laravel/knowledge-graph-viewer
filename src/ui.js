import { exportJson, importJson, clearStorage } from './storage.js'
import { getAggregatableTags } from './view/viewController.js'
import { getTheme, setTheme } from './theme.js'

export class SidebarPanel {
  constructor(store, graph, editor, viewManager, detailPanel) {
    this.store = store
    this.graph = graph
    this.editor = editor
    this.viewManager = viewManager
    this.detailPanel = detailPanel

    this.searchQuery = ''
    this.currentSelection = null
    this.treeExpanded = new Set()
    this._treeQuery = ''
    this._treeAllExpanded = true
    this._treeFirstRender = true

    this._initTabs()
    this._initSearch()
    this._initButtons()
    this._initViewControls()
    this._initStoreListener()
    this._initTree()
    this._initTreeEvents()
    this._updateButtonStates()

    this.editor.onDeselect = () => this.onSelect(null)
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
      this.viewManager.loadForGraph(this.store.getCurrentGraphId())
      this.viewManager.resetForGraph(this.store.getCurrentGraphId())
      this.viewManager.applyView({ layout: true })
      this.syncInitialSelection()
      SidebarPanel.showToast('已恢复默认数据')
    })

    document.getElementById('btn-layout').addEventListener('click', () => {
      this.graph.runLayout()
    })

    this._initLayoutConfig()
  }

  _initViewControls() {
    const catsEl = document.getElementById('category-filters')
    if (catsEl) {
      catsEl.innerHTML = this.viewManager
        .getCategoryList()
        .map(
          (c) => `
        <label class="check-row filter-chip">
          <input type="checkbox" data-category="${c.id}" ${this.viewManager.getState().activeCategories.includes(c.id) ? 'checked' : ''} />
          <span class="cat-dot" style="background:${c.color}"></span>${SidebarPanel.escapeHtml(c.label)}
        </label>`
        )
        .join('')
      catsEl.addEventListener('change', (e) => {
        const cb = e.target.closest('[data-category]')
        if (!cb) return
        this.viewManager.toggleCategory(cb.dataset.category)
        this._syncViewControls()
      })
    }

    document.querySelectorAll('input[name="view-mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.checked) this.viewManager.setViewMode(radio.value)
        this._syncViewControls()
      })
    })

    document.getElementById('btn-reset-focus')?.addEventListener('click', () => {
      this.viewManager.resetFocusToDefault({ layout: false })
      const id = this.viewManager.getState().focusNodeId
      if (id) {
        this.graph.setSelected(id)
        this.graph.focusNode(id)
      }
    })

    this.viewManager.subscribe(() => {
      this._syncViewControls()
      this._renderAggregateActions()
    })

    const depthInput = document.getElementById('focus-depth')
    depthInput?.addEventListener('input', () => {
      document.getElementById('val-focus-depth').textContent = depthInput.value
      this.viewManager.setFocusDepth(Number(depthInput.value))
    })

    document.getElementById('opt-edge-labels')?.addEventListener('change', (e) => {
      this.viewManager.toggleEdgeLabels(e.target.checked)
    })
    document.getElementById('opt-hover')?.addEventListener('change', (e) => {
      this.viewManager.toggleHoverHighlight(e.target.checked)
    })
    const nightMode = document.getElementById('opt-night-mode')
    if (nightMode) {
      nightMode.checked = getTheme() === 'dark'
      nightMode.addEventListener('change', (e) => {
        const theme = setTheme(e.target.checked ? 'dark' : 'light')
        this.graph.setThemeMode?.(theme)
      })
    }

    const timelineCb = document.getElementById('opt-timeline')
    const timelineWrap = document.getElementById('timeline-wrap')
    const timelineInput = document.getElementById('timeline-input')
    const timelineDec = document.getElementById('timeline-dec')
    const timelineInc = document.getElementById('timeline-inc')
    const timelineHint = document.querySelector('#timeline-wrap .hint')
    let timelineRange = this.viewManager.getTimelineRange()

    const clampTimeline = (v) => {
      const n = Math.round(Number(v))
      if (Number.isNaN(n)) return timelineRange.min
      return Math.max(timelineRange.min, Math.min(timelineRange.max, n))
    }

    const applyTimelineValue = (v, { sync = true } = {}) => {
      const clamped = clampTimeline(v)
      if (timelineInput) timelineInput.value = String(clamped)
      timelineDec?.toggleAttribute('disabled', clamped <= timelineRange.min)
      timelineInc?.toggleAttribute('disabled', clamped >= timelineRange.max)
      if (sync && this.viewManager.getState().timelineEnabled) {
        this.viewManager.setTimelineMax(clamped)
      }
      return clamped
    }

    const refreshTimelineBounds = () => {
      timelineRange = this.viewManager.getTimelineRange()
      if (timelineInput) {
        timelineInput.min = String(timelineRange.min)
        timelineInput.max = String(timelineRange.max)
      }
      const st = this.viewManager.getState()
      const initial = st.timelineMax ?? (st.timelineEnabled ? timelineRange.min : timelineRange.max)
      applyTimelineValue(initial, { sync: false })
    }

    refreshTimelineBounds()

    if (timelineHint) {
      timelineHint.textContent = timelineRange.hasData
        ? '节点/边可设置 chapter、time 或 appearAt 字段'
        : '当前图谱无章节数据，请为节点/边添加 chapter 等字段'
    }
    timelineCb?.addEventListener('change', (e) => {
      timelineWrap?.classList.toggle('hidden', !e.target.checked)
      const result = this.viewManager.setTimelineEnabled(e.target.checked)
      if (!result.ok && result.reason === 'no-chapter-data') {
        e.target.checked = false
        timelineWrap?.classList.add('hidden')
        alert('当前图谱没有章节/时间数据，无法启用时间轴过滤。')
        return
      }
      if (e.target.checked) {
        refreshTimelineBounds()
        applyTimelineValue(this.viewManager.getState().timelineMax ?? timelineRange.min)
      }
    })
    timelineDec?.addEventListener('click', () => {
      applyTimelineValue(Number(timelineInput?.value) - 1)
    })
    timelineInc?.addEventListener('click', () => {
      applyTimelineValue(Number(timelineInput?.value) + 1)
    })
    timelineInput?.addEventListener('change', () => {
      applyTimelineValue(timelineInput.value)
    })
    timelineInput?.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        applyTimelineValue(Number(timelineInput.value) + 1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        applyTimelineValue(Number(timelineInput.value) - 1)
      }
    })

    this._refreshTimelineUI = refreshTimelineBounds
    this._applyTimelineUIValue = applyTimelineValue

    this._renderAggregateActions()
    this._syncViewControls()
  }

  _renderAggregateActions() {
    const el = document.getElementById('aggregate-actions')
    if (!el) return
    const graphId = this.store.getCurrentGraphId()
    const data = this.store.exportData().dataMap[graphId] ?? { nodes: [], edges: [] }
    const tags = getAggregatableTags(data, this.viewManager.getState())

    el.innerHTML = tags
      .map(({ tag, count, collapsed: on }) => {
        return `<button type="button" class="btn btn-sm ${on ? 'primary' : ''}" data-agg-tag="${SidebarPanel.escapeHtml(tag)}">${SidebarPanel.escapeHtml(tag)}（${count}）${on ? ' · 已折叠' : ''}</button>`
      })
      .join('')
    el.querySelectorAll('[data-agg-tag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.viewManager.toggleAggregate('', btn.dataset.aggTag)
        this._renderAggregateActions()
      })
    })
  }

  _syncViewControls() {
    const st = this.viewManager.getState()
    document.querySelectorAll('input[name="view-mode"]').forEach((r) => {
      r.checked = r.value === st.viewMode
    })
    this._syncFocusDepthControl(st)
    document.querySelectorAll('#category-filters [data-category]').forEach((cb) => {
      cb.checked = st.activeCategories.includes(cb.dataset.category)
    })
    const optLabels = document.getElementById('opt-edge-labels')
    if (optLabels) optLabels.checked = st.showEdgeLabels
    const optHover = document.getElementById('opt-hover')
    if (optHover) optHover.checked = st.hoverHighlight
    this._syncTimelineControl(st)
    this._syncFocusCenter()
  }

  _syncTimelineControl(st = this.viewManager.getState()) {
    const timelineWrap = document.getElementById('timeline-wrap')
    const optTimeline = document.getElementById('opt-timeline')
    const timelineHint = document.querySelector('#timeline-wrap .hint')
    const range = this.viewManager.getTimelineRange()

    if (optTimeline) optTimeline.checked = !!st.timelineEnabled
    timelineWrap?.classList.toggle('hidden', !st.timelineEnabled)

    if (timelineHint) {
      timelineHint.textContent = range.hasData
        ? '节点/边可设置 chapter、time 或 appearAt 字段'
        : '当前图谱无章节数据，请为节点/边添加 chapter 等字段'
    }

    this._refreshTimelineUI?.()

    if (st.timelineEnabled && st.timelineMax != null) {
      this._applyTimelineUIValue?.(st.timelineMax, { sync: false })
    }
  }

  _syncFocusDepthControl(st = this.viewManager.getState()) {
    const depthWrap = document.getElementById('focus-depth-wrap')
    const depthInput = document.getElementById('focus-depth')
    const valDepth = document.getElementById('val-focus-depth')
    const inFocusMode = st.viewMode !== 'full'

    depthWrap?.classList.toggle('hidden', !inFocusMode)
    if (!inFocusMode) return

    if (depthInput) {
      depthInput.disabled = false
      depthInput.value = String(st.focusDepth)
    }
    if (valDepth) valDepth.textContent = String(st.focusDepth)
  }

  _syncFocusCenter() {
    const wrap = document.getElementById('focus-center-wrap')
    const label = document.getElementById('val-focus-node')
    const btn = document.getElementById('btn-reset-focus')
    const st = this.viewManager.getState()
    if (!label) return

    const inFocusMode = st.viewMode !== 'full'
    wrap?.classList.toggle('muted', !inFocusMode)

    if (!inFocusMode) {
      label.textContent = '无（显示全部）'
      btn?.setAttribute('disabled', 'disabled')
      return
    }

    btn?.removeAttribute('disabled')
    const node = st.focusNodeId ? this.store.getNode(st.focusNodeId) : null
    label.textContent = node?.label ?? st.focusNodeId ?? '—'

    const defaultId = this.viewManager.resolveDefaultFocusNodeId()
    if (defaultId && st.focusNodeId === defaultId) {
      btn?.setAttribute('disabled', 'disabled')
    }
  }

  // === 布局配置 ===

  _initLayoutConfig() {
    const sliders = {
      'layout-repulsion': { key: 'nodeRepulsion', valId: 'val-repulsion', parse: Number },
      'layout-edge-length': { key: 'idealEdgeLength', valId: 'val-edge-length', parse: Number },
      'layout-elasticity': { key: 'edgeElasticity', valId: 'val-elasticity', parse: parseFloat },
      'layout-nesting': { key: 'nestingFactor', valId: 'val-nesting', parse: parseFloat },
      'layout-gravity': { key: 'gravity', valId: 'val-gravity', parse: parseFloat },
    }

    Object.entries(sliders).forEach(([inputId, cfg]) => {
      const input = document.getElementById(inputId)
      if (!input) return
      input.addEventListener('input', () => {
        document.getElementById(cfg.valId).textContent = input.value
      })
    })

    document.getElementById('btn-apply-layout')?.addEventListener('click', () => {
      const opts = { quality: 'proof' }
      Object.entries(sliders).forEach(([inputId, cfg]) => {
        const input = document.getElementById(inputId)
        if (input) opts[cfg.key] = cfg.parse(input.value)
      })
      this.graph.setLayoutOptions(opts)
      this.graph.runLayout()
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
      this._renderAggregateActions()
      this.viewManager.applyView()
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
        <span class="tree-toggle ${toggleClass}" data-toggle="${node.id}"${hasChildren ? ` onclick="event.stopPropagation();window._kgToggle('${node.id}')"` : ''}>${toggleIcon}</span>
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
      // 选择节点：点击 data-select span 或 tree-node div 本身
      const label = e.target.closest('[data-select]')
      const treeNode = !label ? e.target.closest('.tree-node') : null
      if (label || treeNode) {
        const nodeId = (label || treeNode).dataset.select || treeNode.dataset.id
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

  /** 进入页面时与图上默认焦点保持一致 */
  syncInitialSelection() {
    const st = this.viewManager?.getState()
    if (!st?.focusNodeId || st.viewMode === 'full') return
    this.currentSelection = { type: 'node', id: st.focusNodeId }
    this.detailPanel?.update(this.currentSelection, this.store)
    this._updateTreeSelection()
  }

  onSelect(selection) {
    if (!selection) {
      this.currentSelection = null
      this.editor.deselect()
      this.detailPanel?.renderEmpty()
      this._updateButtonStates()
      this._updateTreeSelection()
      return
    }
    this.currentSelection = selection

    if (selection.type === 'node' && this.viewManager?.isAggregateNode(selection.id)) {
      this.viewManager.expandAggregate(selection.id)
      return
    }

    if (selection.type === 'node') {
      this.editor.onNodeSelect(selection.id, { shiftLink: selection.shiftKey })
      if (!selection.shiftKey && this.viewManager) {
        this.viewManager.setFocusNode(selection.id, { replace: this.viewManager.getState().viewMode !== 'expand' })
      }
    } else {
      this.editor.onEdgeSelect(selection.id)
    }

    this.detailPanel?.update(selection, this.store)
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
