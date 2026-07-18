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
    this._treeGraphId = null
    this._knownHierarchyEdgeIds = new Set()
    this._treeClickTimer = null
    this.moveSourceId = null
    this._appMenuOpen = false
    this._workspaceSidebarOpen = false
    this._appMenuReturnFocus = null
    this._workspaceSidebarReturnFocus = null

    this._initTabs()
    this._initApplicationChrome()
    this._initSearch()
    this._initButtons()
    this._initNodeActions()
    this._initViewControls()
    this._initStoreListener()
    this._initTree()
    this._initTreeEvents()
    this._updateButtonStates()

    this.editor.onDeselect = () => this.onSelect(null)
    this.editor.onLinkModeStart = () => this.cancelMoveMode()
  }

  // === Tab 切换 ===

  _initTabs() {
    this.tabs = [...document.querySelectorAll('#sidebar .tab')]
    this.panels = [...document.querySelectorAll('#sidebar .tab-panel')]
    this.tabs.forEach((tab) => {
      tab.id = `tab-${tab.dataset.tab}`
      tab.addEventListener('click', () => {
        this._activateTab(tab.dataset.tab)
      })
      tab.addEventListener('keydown', (event) => {
        const visibleTabs = this.tabs.filter((item) => item.offsetParent !== null)
        const currentIndex = visibleTabs.indexOf(tab)
        if (currentIndex < 0) return
        let nextIndex = null
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % visibleTabs.length
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + visibleTabs.length) % visibleTabs.length
        if (event.key === 'Home') nextIndex = 0
        if (event.key === 'End') nextIndex = visibleTabs.length - 1
        if (nextIndex == null) return
        event.preventDefault()
        this._activateTab(visibleTabs[nextIndex].dataset.tab, { focus: true })
      })
    })
    this._activateTab(this.tabs.find((tab) => tab.classList.contains('active'))?.dataset.tab || 'view')
  }

  _activateTab(tabName, { focus = false } = {}) {
    if (tabName === 'detail' && !this._isMobileViewport()) tabName = 'view'
    const activeTab = this.tabs?.find((tab) => tab.dataset.tab === tabName)
    const activePanel = document.getElementById(`panel-${tabName}`)
    if (!activeTab || !activePanel) return

    this.tabs.forEach((tab) => {
      const active = tab === activeTab
      tab.classList.toggle('active', active)
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
    })
    this.panels.forEach((panel) => {
      const active = panel === activePanel
      panel.classList.toggle('active', active)
      panel.setAttribute('aria-hidden', String(!active))
    })
    activePanel.setAttribute('aria-labelledby', activeTab.id)
    if (focus) activeTab.focus()
  }

  // === 顶部工具栏、主菜单与右侧工作栏 ===

  _initApplicationChrome() {
    this.viewportMedia = window.matchMedia('(max-width: 900px)')
    this.appMenu = document.getElementById('app-menu')
    this.appMenuButton = document.getElementById('btn-app-menu')
    this.appMenuCloseButton = document.getElementById('btn-app-menu-close')
    this.appMenuBackdrop = document.getElementById('app-menu-backdrop')
    this.workspaceSidebar = document.getElementById('sidebar')
    this.workspaceSidebarButton = document.getElementById('btn-sidebar-toggle')
    this.workspaceSidebarCloseButton = document.getElementById('btn-sidebar-close')
    this.workspaceSidebarBackdrop = document.getElementById('mobile-sidebar-backdrop')
    this.graphPane = document.getElementById('graph-pane')
    this.desktopDetailPanel = document.getElementById('detail-panel')
    this.mobileDetailHost = document.getElementById('mobile-detail-host')
    this.detailContent = document.getElementById('detail-content')
    this.toolbarSearchControl = document.querySelector('.toolbar-search-control')
    this.toolbarViewMode = document.getElementById('view-mode-select')

    if (!this.appMenu || !this.workspaceSidebar) return

    this.appMenuButton?.addEventListener('click', () => this._setAppMenuOpen(!this._appMenuOpen))
    this.appMenuCloseButton?.addEventListener('click', () => this._setAppMenuOpen(false))
    this.appMenuBackdrop?.addEventListener('click', () => this._setAppMenuOpen(false))
    this.workspaceSidebarButton?.addEventListener('click', () => {
      this._setWorkspaceSidebarOpen(!this._workspaceSidebarOpen)
    })
    this.workspaceSidebarCloseButton?.addEventListener('click', () => this._setWorkspaceSidebarOpen(false))
    this.workspaceSidebarBackdrop?.addEventListener('click', () => this._setWorkspaceSidebarOpen(false))

    document.addEventListener('keydown', (event) => {
      const activeModal = this._appMenuOpen
        ? this.appMenu
        : this._isMobileViewport() && this._workspaceSidebarOpen
          ? this.workspaceSidebar
          : null
      if (!activeModal) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (this._appMenuOpen) this._setAppMenuOpen(false)
        else this._setWorkspaceSidebarOpen(false)
        return
      }
      if (event.key === 'Tab') this._trapFocus(activeModal, event)
    }, true)

    const syncViewport = () => this._syncResponsiveChrome()
    this.viewportMedia.addEventListener?.('change', syncViewport)
    syncViewport()
  }

  _isMobileViewport() {
    return Boolean(this.viewportMedia?.matches)
  }

  _syncResponsiveChrome() {
    const mobile = this._isMobileViewport()
    const activeElement = document.activeElement
    const activeDetailControl = this.detailContent?.contains(activeElement) ? activeElement : null
    const detailTab = this.tabs?.find((tab) => tab.dataset.tab === 'detail')
    const detailHadFocus = Boolean(detailTab?.contains(document.activeElement))
    const detailActive = detailTab?.classList.contains('active')

    activeDetailControl?.blur?.()

    if (mobile) {
      if (this.detailContent && this.mobileDetailHost && !this.mobileDetailHost.contains(this.detailContent)) {
        this.mobileDetailHost.append(this.detailContent)
      }
      this._setWorkspaceSidebarOpen(false, { restoreFocus: false })
    } else {
      if (detailActive) this._activateTab('view', { focus: detailHadFocus })
      if (this.detailContent && this.desktopDetailPanel && !this.desktopDetailPanel.contains(this.detailContent)) {
        this.desktopDetailPanel.append(this.detailContent)
      }
      this._setWorkspaceSidebarOpen(true, { restoreFocus: false })
    }
    this._setAppMenuOpen(false, { restoreFocus: false })
    this._syncModalIsolation()
    this._notifyGraphResize()
    if (activeDetailControl) {
      if (mobile) this._focusCanvas()
      else requestAnimationFrame(() => activeDetailControl.focus?.())
    }
  }

  _setAppMenuOpen(open, { restoreFocus = true } = {}) {
    if (!this.appMenu) return
    const nextOpen = Boolean(open)
    if (nextOpen && !this._appMenuOpen) {
      this._appMenuReturnFocus = document.activeElement
      if (this._isMobileViewport()) this._setWorkspaceSidebarOpen(false, { restoreFocus: false })
    }
    this._appMenuOpen = nextOpen
    this.appMenu.classList.toggle('app-menu-open', nextOpen)
    this.appMenu.setAttribute('aria-hidden', String(!nextOpen))
    this.appMenuButton?.setAttribute('aria-expanded', String(nextOpen))
    if (this.appMenuBackdrop) this.appMenuBackdrop.hidden = !nextOpen
    if (nextOpen) {
      this.appMenu.setAttribute('role', 'dialog')
      this.appMenu.setAttribute('aria-modal', 'true')
    } else {
      this.appMenu.removeAttribute('role')
      this.appMenu.removeAttribute('aria-modal')
    }
    this._syncModalIsolation()

    if (nextOpen) {
      requestAnimationFrame(() => this.appMenuCloseButton?.focus())
    } else if (restoreFocus) {
      const returnFocus = this._appMenuReturnFocus || this.appMenuButton
      requestAnimationFrame(() => returnFocus?.focus?.())
    }
  }

  _setWorkspaceSidebarOpen(open, { restoreFocus = true } = {}) {
    if (!this.workspaceSidebar) return
    const nextOpen = Boolean(open)
    const mobile = this._isMobileViewport()
    if (nextOpen && !this._workspaceSidebarOpen) {
      this._workspaceSidebarReturnFocus = document.activeElement
      if (mobile) this._setAppMenuOpen(false, { restoreFocus: false })
    }
    this._workspaceSidebarOpen = nextOpen
    this.workspaceSidebar.classList.toggle('sidebar-collapsed', !nextOpen)
    this.workspaceSidebar.classList.toggle('mobile-sidebar-open', mobile && nextOpen)
    this.workspaceSidebar.setAttribute('aria-hidden', String(!nextOpen))
    this.workspaceSidebarButton?.setAttribute('aria-expanded', String(nextOpen))
    if (this.workspaceSidebarBackdrop) this.workspaceSidebarBackdrop.hidden = !(mobile && nextOpen)

    if (mobile && nextOpen) {
      this.workspaceSidebar.setAttribute('role', 'dialog')
      this.workspaceSidebar.setAttribute('aria-modal', 'true')
    } else {
      this.workspaceSidebar.removeAttribute('role')
      this.workspaceSidebar.removeAttribute('aria-modal')
    }
    this._syncModalIsolation()
    this._notifyGraphResize()

    if (mobile && nextOpen) {
      requestAnimationFrame(() => this.workspaceSidebarCloseButton?.focus())
    } else if (!nextOpen && restoreFocus) {
      const savedFocus = this._workspaceSidebarReturnFocus
      const returnFocus = savedFocus && savedFocus !== document.body && !this.workspaceSidebar.contains(savedFocus)
        ? savedFocus
        : this.workspaceSidebarButton
      requestAnimationFrame(() => returnFocus?.focus?.())
    }
  }

  _syncModalIsolation() {
    const menuModal = this._appMenuOpen
    const sidebarModal = this._isMobileViewport() && this._workspaceSidebarOpen
    const anyModal = menuModal || sidebarModal

    if (this.graphPane) this.graphPane.inert = anyModal
    if (this.desktopDetailPanel) this.desktopDetailPanel.inert = anyModal
    if (this.toolbarSearchControl) this.toolbarSearchControl.inert = anyModal
    if (this.toolbarViewMode) this.toolbarViewMode.inert = anyModal
    if (this.appMenuButton) this.appMenuButton.inert = anyModal
    if (this.workspaceSidebarButton) this.workspaceSidebarButton.inert = anyModal
    if (this.appMenu) this.appMenu.inert = !menuModal
    if (this.workspaceSidebar) this.workspaceSidebar.inert = !this._workspaceSidebarOpen || menuModal
  }

  _trapFocus(container, event) {
    const focusable = [...container.querySelectorAll(
      'button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hidden && element.offsetParent !== null)
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!container.contains(document.activeElement)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  _notifyGraphResize() {
    requestAnimationFrame(() => this.graph.resize?.())
  }

  closeAppMenu(options) {
    this._setAppMenuOpen(false, options)
  }

  closeWorkspaceSidebar(options) {
    this._setWorkspaceSidebarOpen(false, options)
  }

  _closeMenuToCanvas() {
    this.closeAppMenu({ restoreFocus: false })
    this._focusCanvas()
  }

  closeAppMenuToCanvas() {
    this._closeMenuToCanvas()
  }

  _focusCanvas() {
    document.getElementById('cy')?.focus({ preventScroll: true })
  }

  // === 搜索 ===

  _initSearch() {
    this.searchInputs = [...document.querySelectorAll('[data-graph-search]')]
    this.searchClearButtons = [...document.querySelectorAll('[data-clear-search]')]
    this.searchInputs.forEach((input) => {
      input.addEventListener('input', () => this._setSearchQuery(input.value))
    })
    this.searchClearButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this._setSearchQuery('')
        this.searchInputs.find((input) => input.offsetParent !== null)?.focus()
      })
    })
    this._syncSearchControls()
  }

  _setSearchQuery(value) {
    this.searchQuery = String(value ?? '')
    if (!this.searchQuery.trim()) {
      this.graph.clearHighlight()
    } else {
      const { nodeIds, edgeIds } = this.store.search(this.searchQuery)
      this.graph.setHighlight([...nodeIds, ...edgeIds])
    }
    this._updateButtonStates()
  }

  _syncSearchControls() {
    this.searchInputs?.forEach((input) => {
      if (input.value !== this.searchQuery) input.value = this.searchQuery
    })
    this.searchClearButtons?.forEach((button) => {
      const hasQuery = Boolean(this.searchQuery.trim())
      button.hidden = !hasQuery
      button.disabled = !hasQuery
    })
  }

  // === 按钮事件 ===

  _initButtons() {
    document.getElementById('btn-export').addEventListener('click', () => {
      exportJson(this.store.exportPersistedData?.() ?? this.store.exportData())
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
        this.viewManager.resetForGraph(this.store.getCurrentGraphId())
        this.viewManager.applyView({ layout: true })
        this.syncInitialSelection()
        SidebarPanel.showToast('导入成功')
        this._closeMenuToCanvas()
      } catch (err) {
        SidebarPanel.showToast(err.message, true)
      }
      e.target.value = ''
    })

    document.getElementById('btn-reset').addEventListener('click', () => {
      if (!confirm('恢复默认示例数据？当前修改将丢失。')) return
      clearStorage()
      this.store.resetToDefault()
      this._setSearchQuery('')
      this.editor.deselect()
      this.viewManager.loadForGraph(this.store.getCurrentGraphId())
      this.viewManager.resetForGraph(this.store.getCurrentGraphId())
      this.viewManager.applyView({ layout: true })
      this.syncInitialSelection()
      SidebarPanel.showToast('已恢复默认数据')
      this._closeMenuToCanvas()
    })

    document.getElementById('btn-cleanup-placeholders')?.addEventListener('click', () => {
      const candidateIds = this.store.findLegacyPlaceholderNodeIds?.() ?? []
      if (candidateIds.length === 0) {
        SidebarPanel.showToast('没有可清理的未完成节点')
        this._updateCleanupButton()
        return
      }
      const preview = candidateIds.slice(0, 8).map((nodeId) => {
        const parentId = this.store.getHierarchyParentId?.(nodeId)
        const parentLabel = parentId ? this.store.getNode(parentId)?.label || parentId : '无父节点'
        return `• ${String(parentLabel).replace(/\s+/g, ' ')} > ${nodeId}`
      }).join('\n')
      const remaining = candidateIds.length > 8 ? `\n…以及另外 ${candidateIds.length - 8} 个` : ''
      const message = `发现 ${candidateIds.length} 个名称为“新节点”、没有内容、业务关系或子节点的候选项：\n\n${preview}${remaining}\n\n请确认它们确实是未完成节点。清理后可在离开图谱前使用撤销恢复。`
      if (!confirm(message)) return

      const deletedIds = this.store.cleanupLegacyPlaceholderNodes?.(candidateIds) ?? []
      if (deletedIds.length === 0) {
        SidebarPanel.showToast('没有可清理的未完成节点')
        this._updateCleanupButton()
        return
      }
      if (this.currentSelection && deletedIds.includes(this.currentSelection.id)) {
        this.currentSelection = null
        this.editor.deselect()
      }
      this._syncSelectionUi()
      this._updateCleanupButton()
      SidebarPanel.showToast(`已清理 ${deletedIds.length} 个未完成节点，可撤销`)
      this._closeMenuToCanvas()
    })

    document.getElementById('btn-layout').addEventListener('click', () => {
      this.graph.runLayout()
      this._closeMenuToCanvas()
    })

    this._initLayoutConfig()
  }

  _initNodeActions() {
    this.nodeActionBar = document.getElementById('node-action-bar')
    this.nodeActionLabel = document.getElementById('node-action-label')
    this.addChildNodeButton = document.getElementById('btn-add-child-node')
    this.addSiblingNodeButton = document.getElementById('btn-add-sibling-node')
    this.editSelectedNodeButton = document.getElementById('btn-edit-selected-node')
    this.moveNodeButton = document.getElementById('btn-move-node')
    this.cancelMoveButton = document.getElementById('btn-cancel-move')
    if (!this.nodeActionBar || !this.moveNodeButton || !this.cancelMoveButton) return

    this.moveNodeButton.addEventListener('click', (event) => {
      event.stopPropagation()
      this.startMoveMode()
    })
    this.addChildNodeButton?.addEventListener('click', (event) => {
      event.stopPropagation()
      const parentId = this._getValidNodeActionId()
      if (!parentId) return
      const childId = this.editor.createChild(parentId)
      if (!childId) return
      this.currentSelection = { type: 'node', id: childId }
      this._syncSelectionUi()
    })
    this.addSiblingNodeButton?.addEventListener('click', (event) => {
      event.stopPropagation()
      const nodeId = this._getValidNodeActionId()
      if (!nodeId) return
      const siblingId = this.editor.createSibling(nodeId)
      if (!siblingId) return
      this.currentSelection = { type: 'node', id: siblingId }
      this._syncSelectionUi()
    })
    this.editSelectedNodeButton?.addEventListener('click', (event) => {
      event.stopPropagation()
      const nodeId = this.currentSelection?.type === 'node' ? this.currentSelection.id : null
      if (nodeId) this.editor.startEdit(nodeId)
    })
    this.cancelMoveButton.addEventListener('click', (event) => {
      event.stopPropagation()
      this.cancelMoveMode({ toast: true })
    })
    this.nodeActionBar.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.moveSourceId) return
      event.preventDefault()
      this.cancelMoveMode({ toast: true })
    })
    this._updateNodeActionBar()
  }

  /**
   * 操作栏按钮的 mousedown 会先让节点编辑框失焦。未命名草稿会在此时被删除，
   * 所以 click 阶段必须以 editor 的实时选择为准，不能继续使用 UI 中的旧 ID。
   */
  _getValidNodeActionId() {
    const nodeId = this.editor.selectedNodeId
    const node = nodeId ? this.store.getNode(nodeId) : null
    if (node && node.group !== 'org') {
      this.currentSelection = { type: 'node', id: nodeId }
      return nodeId
    }

    const editorSelection = this._getEditorSelection()
    if (editorSelection?.type === 'node' && this.store.getNode(editorSelection.id)) {
      this.currentSelection = editorSelection
    } else if (editorSelection?.type === 'edge' && this.store.getEdge(editorSelection.id)) {
      this.currentSelection = editorSelection
    } else {
      this.currentSelection = null
    }
    this._syncSelectionUi()
    return null
  }

  startMoveMode() {
    const nodeId = this.currentSelection?.type === 'node' ? this.currentSelection.id : null
    const node = nodeId ? this.store.getNode(nodeId) : null
    if (node && this.store.isRootNode?.(nodeId)) {
      SidebarPanel.showToast('中心主题固定不动', true)
      return
    }
    if (!node || node.group === 'org') {
      SidebarPanel.showToast('请先选择一个普通节点', true)
      return
    }
    if (this.editor.editingNodeId && !this.editor.commitEdit()) return

    this.editor.cancelLinkMode()
    this.moveSourceId = nodeId
    this.editor.setMoveModeActive(true)
    this.graph.setMoveSource(nodeId)
    this.graph.setSelected(nodeId)
    this.graph.container.classList.add('move-mode')
    this._updateNodeActionBar()
    SidebarPanel.showToast(`请选择「${node.label}」的新父节点`)
  }

  cancelMoveMode({ toast = false } = {}) {
    if (!this.moveSourceId) return
    this.moveSourceId = null
    this.editor.setMoveModeActive(false)
    this.graph.clearMoveSource()
    this.graph.container.classList.remove('move-mode')
    this._updateNodeActionBar()
    if (toast) SidebarPanel.showToast('已取消移动')
  }

  _completeMove(targetId) {
    const sourceId = this.moveSourceId
    if (!sourceId) return false
    const source = this.store.getNode(sourceId)
    const target = this.store.getNode(targetId)
    if (!source || !target) {
      this.cancelMoveMode()
      return false
    }

    try {
      const changed = this.store.moveNodeUnder(sourceId, targetId)
      this.cancelMoveMode()
      if (changed) this.graph.positionNearParent(targetId, sourceId)
      this.currentSelection = { type: 'node', id: sourceId }
      this.editor.selectNode(sourceId)
      this.graph.setSelected(sourceId)
      this._syncSelectionUi()
      SidebarPanel.showToast(
        changed ? `已将「${source.label}」移动到「${target.label}」下面` : '节点已经在该位置'
      )
      return true
    } catch (error) {
      SidebarPanel.showToast(error.message, true)
      return false
    }
  }

  _updateNodeActionBar() {
    if (!this.nodeActionBar) return
    const nodeId = this.moveSourceId ?? (this.currentSelection?.type === 'node' ? this.currentSelection.id : null)
    const node = nodeId ? this.store.getNode(nodeId) : null
    const show = !!node && node.group !== 'org'
    this.nodeActionBar.classList.toggle('hidden', !show)
    if (!show) return

    const moving = !!this.moveSourceId
    const isRoot = this.store.isRootNode?.(nodeId)
    this.nodeActionBar.classList.toggle('moving', moving)
    this.nodeActionLabel.textContent = moving
      ? `请选择「${node.label}」的新父节点`
      : isRoot ? `中心主题：${node.label}` : `已选：${node.label}`
    this.addChildNodeButton.hidden = moving
    this.addSiblingNodeButton.hidden = moving || isRoot
    this.editSelectedNodeButton.hidden = moving
    this.moveNodeButton.hidden = moving || isRoot
    this.cancelMoveButton.hidden = !moving
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

    document.getElementById('view-mode-select')?.addEventListener('change', (event) => {
      this.viewManager.setViewMode(event.target.value)
      this._syncViewControls()
    })

    document.getElementById('btn-reset-focus')?.addEventListener('click', () => {
      this.viewManager.resetFocusToDefault({ layout: false })
      const id = this.viewManager.getState().focusNodeId
      if (id) {
        this.graph.setSelected(id)
        this.graph.focusNode(id)
      }
    })

    document.getElementById('btn-set-focus')?.addEventListener('click', () => {
      if (this.store.getMindMapRootId?.()) {
        SidebarPanel.showToast('思维导图的中心主题固定不变')
        return
      }
      const nodeId = this.currentSelection?.type === 'node' ? this.currentSelection.id : null
      if (!nodeId || this.viewManager.isAggregateNode(nodeId)) {
        SidebarPanel.showToast('请先选择一个节点', true)
        return
      }
      this.viewManager.setFocusNode(nodeId, { replace: true, layout: false })
      this.graph.setSelected(nodeId)
      this.graph.focusNode(nodeId)
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
    const showRedChamberFeatures = this._isRedChamberExample()
    const isMindMap = Boolean(this.store.getMindMapRootId?.())
    document.getElementById('relation-filter-section')?.classList.toggle('hidden', !showRedChamberFeatures)
    document.getElementById('timeline-section')?.classList.toggle('hidden', !showRedChamberFeatures)
    document.getElementById('network-layout-section')?.classList.toggle('hidden', isMindMap)
    document.getElementById('mindmap-layout-section')?.classList.toggle('hidden', !isMindMap)
    const viewModeSelect = document.getElementById('view-mode-select')
    if (viewModeSelect) viewModeSelect.value = st.viewMode
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

  _isRedChamberExample() {
    if (!this.viewManager.getTimelineRange().hasData) return false
    const nodeIds = new Set(this.store.getAllNodes().map((node) => node.id))
    return ['贾宝玉', '林黛玉', '薛宝钗', '王熙凤'].filter((id) => nodeIds.has(id)).length >= 3
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
    const title = document.getElementById('focus-center-label')
    const btn = document.getElementById('btn-reset-focus')
    const setBtn = document.getElementById('btn-set-focus')
    const st = this.viewManager.getState()
    if (!label) return

    const mindMapRootId = this.store.getMindMapRootId?.()
    if (mindMapRootId) {
      const root = this.store.getNode(mindMapRootId)
      if (title) title.textContent = '中心主题'
      label.textContent = root?.label ?? '—'
      wrap?.classList.remove('muted')
      btn?.setAttribute('disabled', 'disabled')
      setBtn?.setAttribute('disabled', 'disabled')
      return
    }

    if (title) title.textContent = '当前中心'

    const inFocusMode = st.viewMode !== 'full'
    wrap?.classList.toggle('muted', !inFocusMode)

    if (!inFocusMode) {
      label.textContent = '无（显示全部）'
      btn?.setAttribute('disabled', 'disabled')
      setBtn?.setAttribute('disabled', 'disabled')
      return
    }

    btn?.removeAttribute('disabled')
    const node = st.focusNodeId ? this.store.getNode(st.focusNodeId) : null
    label.textContent = node?.label ?? st.focusNodeId ?? '—'

    const selectedNodeId = this.currentSelection?.type === 'node' ? this.currentSelection.id : null
    if (!selectedNodeId || selectedNodeId === st.focusNodeId || this.viewManager.isAggregateNode(selectedNodeId)) {
      setBtn?.setAttribute('disabled', 'disabled')
    } else {
      setBtn?.removeAttribute('disabled')
    }

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

    document.getElementById('btn-mindmap-layout')?.addEventListener('click', () => {
      this.graph.runLayout()
    })
  }

  // === Store 订阅 ===

  _initStoreListener() {
    this.store.subscribe(() => {
      let selectionChanged = false
      if (this.currentSelection) {
        const selectionExists = this.currentSelection.type === 'node'
          ? !!this.store.getNode(this.currentSelection.id)
          : !!this.store.getEdge(this.currentSelection.id)
        if (!selectionExists) {
          const editorSelection = this._getEditorSelection()
          const editorSelectionExists = editorSelection?.type === 'node'
            ? !!this.store.getNode(editorSelection.id)
            : editorSelection?.type === 'edge'
              ? !!this.store.getEdge(editorSelection.id)
              : false
          this.currentSelection = editorSelectionExists ? editorSelection : null
          selectionChanged = true
        }
      }
      if (this.moveSourceId && !this.store.getNode(this.moveSourceId)) this.cancelMoveMode()
      if (this.searchQuery.trim()) {
        const { nodeIds, edgeIds } = this.store.search(this.searchQuery)
        this.graph.setHighlight([...nodeIds, ...edgeIds])
      }
      this._renderTree()
      this._renderAggregateActions()
      this._updateCleanupButton()
      if (selectionChanged) this._syncSelectionUi()
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
          const mindMapRootId = this.store.getMindMapRootId?.()
          const treeParentId = (node) => (
            mindMapRootId ? (this.store.getHierarchyParentId(node.id) || '') : (node.parent || '')
          )
          const childrenMap = {}
          nodes.forEach((n) => {
            const parentId = treeParentId(n)
            if (parentId) {
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
          nodes.filter((n) => !treeParentId(n)).forEach((n) => expandAll(n.id))
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
    const currentData = dataMap[currentId] ?? { nodes: allNodes, edges: [] }
    let nodes = currentData.nodes ?? allNodes
    const mindMapRootId = this.store.getMindMapRootId?.()

    if (this._treeGraphId !== currentId) {
      this._treeGraphId = currentId
      this.treeExpanded.clear()
      this._knownHierarchyEdgeIds.clear()
      this._treeFirstRender = true
      this._treeAllExpanded = true
      const toggleBtn = document.getElementById('btn-tree-toggle')
      if (toggleBtn) toggleBtn.textContent = '⊟'
    }

    if (mindMapRootId) {
      const hierarchyEdges = (currentData.edges ?? []).filter(
        (edge) => edge.hierarchy === true || edge.hierarchy === 'yes' || edge.type === '子节点'
      )
      const nextEdgeIds = new Set()
      hierarchyEdges.forEach((edge) => {
        const edgeKey = edge.id || `${edge.source}->${edge.target}`
        nextEdgeIds.add(edgeKey)
        // 新增主题时自动展开它的父主题；用户之后仍可手动收起。
        if (!this._knownHierarchyEdgeIds.has(edgeKey)) this.treeExpanded.add(edge.source)
      })
      this._knownHierarchyEdgeIds = nextEdgeIds
    }

    const treeParentId = (node) => (
      mindMapRootId ? (this.store.getHierarchyParentId(node.id) || '') : (node.parent || '')
    )

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
            let pid = treeParentId(n)
            while (pid && byId[pid]) {
              matched.add(pid)
              pid = treeParentId(byId[pid])
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
      const parentId = treeParentId(n)
      if (parentId && childrenMap[parentId]) {
        childrenMap[parentId].push(n)
      } else if (parentId) {
        childrenMap[parentId] = [n]
      } else {
        roots.push(n)
      }
    })

    // 关系图按名称查找更方便；思维导图保留创建顺序，避免大纲与画布分支顺序跳动。
    if (!mindMapRootId) {
      const sortFn = (a, b) => a.label.localeCompare(b.label, 'zh')
      roots.sort(sortFn)
      Object.values(childrenMap).forEach((arr) => arr.sort(sortFn))
    }

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
    const isRoot = this.store.isRootNode?.(node.id)

    const toggleClass = hasChildren ? (isExpanded ? 'expanded' : '') : 'empty'
    const toggleIcon = '▸'
    const labelClass = isOrg ? 'tree-label org' : 'tree-label'
    const selectedClass = isSelected ? 'selected' : ''
    const childrenClass = hasChildren && !isExpanded ? 'collapsed' : ''

    const childHtml = hasChildren
      ? `<div class="tree-children ${childrenClass}">${children.map((c) => this._renderTreeNode(c, childrenMap, depth + 1)).join('')}</div>`
      : ''

    return `
      <div class="tree-node ${selectedClass}" data-id="${node.id}" style="padding-left: ${4 + depth * 10}px">
        <span class="tree-toggle ${toggleClass}" data-toggle="${node.id}"${hasChildren ? ` onclick="event.stopPropagation();window._kgToggle('${node.id}')"` : ''}>${toggleIcon}</span>
        <span class="${labelClass}" data-select="${node.id}">${SidebarPanel.escapeHtml(node.label)}</span>
        <span class="tree-actions">
          <button class="tree-btn" data-edit="${node.id}" title="编辑">✎</button>
          ${isRoot ? '' : `<button class="tree-btn danger" data-delete="${node.id}" title="删除">×</button>`}
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
      // 操作按钮必须优先于整行选择，否则点击编辑/删除只会选中节点。
      const editBtn = e.target.closest('[data-edit]')
      if (editBtn) {
        e.preventDefault()
        if (this._isMobileViewport()) this.closeWorkspaceSidebar({ restoreFocus: false })
        if (window.kgStore) window.kgStore.editNode(editBtn.dataset.edit)
        return
      }

      const delBtn = e.target.closest('[data-delete]')
      if (delBtn) {
        e.preventDefault()
        if (window.kgStore) window.kgStore.deleteNode(delBtn.dataset.delete)
        return
      }

      // 选择节点：点击 data-select span 或 tree-node div 本身
      const label = e.target.closest('[data-select]')
      const treeNode = !label ? e.target.closest('.tree-node') : null
      if (label || treeNode) {
        const nodeId = (label || treeNode).dataset.select || treeNode.dataset.id
        clearTimeout(this._treeClickTimer)
        this._treeClickTimer = setTimeout(() => {
          this._treeClickTimer = null
          if (window.kgStore) window.kgStore.selectAndFocus(nodeId)
          if (this._isMobileViewport()) {
            this.closeWorkspaceSidebar({ restoreFocus: false })
            document.activeElement?.blur?.()
          }
        }, 220)
        return
      }
    })

    this.treeView.addEventListener('dblclick', (e) => {
      if (e.target.closest('[data-toggle], .tree-actions')) return
      const label = e.target.closest('[data-select]')
      const treeNode = !label ? e.target.closest('.tree-node') : null
      if (!label && !treeNode) return
      clearTimeout(this._treeClickTimer)
      this._treeClickTimer = null
      const nodeId = (label || treeNode).dataset.select || treeNode.dataset.id
      if (this._isMobileViewport()) this.closeWorkspaceSidebar({ restoreFocus: false })
      if (window.kgStore) window.kgStore.editNode(nodeId)
    })
  }

  // === 选择回调 ===

  /** 进入页面时与图上默认焦点保持一致 */
  syncInitialSelection() {
    this.cancelMoveMode()
    this.currentSelection = null
    this.editor.deselect()
    this.detailPanel?.renderEmpty()
    const st = this.viewManager?.getState()
    const rootId = this.store.getMindMapRootId?.()
    const nodeId = rootId || (st?.viewMode !== 'full' ? st?.focusNodeId : null)
    if (!nodeId) {
      this._updateTreeSelection()
      this._updateNodeActionBar()
      this._syncFocusCenter()
      return
    }
    this.currentSelection = { type: 'node', id: nodeId }
    this.editor.selectNode(nodeId)
    this.detailPanel?.update(this.currentSelection, this.store)
    this._updateTreeSelection()
    this._updateNodeActionBar()
    this._syncFocusCenter()
  }

  onSelect(selection) {
    if (!selection) {
      clearTimeout(this._treeClickTimer)
      this._treeClickTimer = null
      this.graph.cancelPendingSelection?.()
      this.cancelMoveMode()
      this.currentSelection = null
      this.editor.deselect()
      this.detailPanel?.renderEmpty()
      this._updateButtonStates()
      this._updateTreeSelection()
      this._updateNodeActionBar()
      this._syncFocusCenter()
      return
    }

    if (this.moveSourceId) {
      if (selection.type === 'node' && !this.viewManager?.isAggregateNode(selection.id)) {
        this._completeMove(selection.id)
      } else {
        SidebarPanel.showToast('请选择一个普通节点作为新父节点', true)
      }
      return
    }
    if (selection.type === 'node' && this.viewManager?.isAggregateNode(selection.id)) {
      this.viewManager.expandAggregate(selection.id)
      return
    }

    if (selection.type === 'node') {
      const selected = this.editor.onNodeSelect(selection.id, { shiftLink: selection.shiftKey })
      if (selected) {
        this.currentSelection = selection
        // “渐进展开”本身就是用户主动选择的交互模式；中心展开则必须再点“设为中心”。
        if (this.viewManager?.getState().viewMode === 'expand') {
          this.viewManager.expandFromNode(selection.id)
        }
      } else {
        this.currentSelection = this._getEditorSelection()
      }
    } else {
      this.editor.onEdgeSelect(selection.id)
      this.currentSelection = selection
    }

    this._syncSelectionUi()
  }

  /**
   * pointer tap 阶段只立即同步普通选择；渐进展开、移动、关联和聚合等
   * 单击专属动作仍由 onetap 后的 onSelect 执行，双击只进入编辑。
   */
  onPreviewSelect(selection) {
    if (!selection) {
      this.onSelect(null)
      return true
    }
    if (this.moveSourceId || this.editor.linkSourceId || selection.shiftKey) return false
    if (selection.type === 'node' && this.viewManager?.isAggregateNode(selection.id)) return false

    if (selection.type === 'node') {
      const selected = this.editor.onNodeSelect(selection.id)
      if (!selected) return false
      this.currentSelection = selection
    } else {
      this.editor.onEdgeSelect(selection.id)
      this.currentSelection = selection
    }
    this._syncSelectionUi()
    return true
  }

  /** 双击只执行显式编辑，不再附带聚焦或累加展开。 */
  onActivate(selection) {
    if (!selection) return
    if (this.moveSourceId) {
      if (selection.type === 'node' && !this.viewManager?.isAggregateNode(selection.id)) {
        this._completeMove(selection.id)
      } else {
        SidebarPanel.showToast('请选择一个普通节点作为新父节点', true)
      }
      return
    }
    if (selection.type === 'node' && this.viewManager?.isAggregateNode(selection.id)) {
      this.viewManager.expandAggregate(selection.id)
      return
    }

    if (selection.type === 'node') {
      const selected = this.editor.onNodeSelect(selection.id, { shiftLink: selection.shiftKey })
      if (selected) {
        this.currentSelection = selection
        this.editor.startEdit(selection.id)
      } else {
        this.currentSelection = this._getEditorSelection()
      }
    } else {
      this.editor.onEdgeSelect(selection.id)
      this.editor.startEdgeEdit(selection.id)
      this.currentSelection = selection
    }

    this._syncSelectionUi()
  }

  _getEditorSelection() {
    if (this.editor.selectedEdgeId) return { type: 'edge', id: this.editor.selectedEdgeId }
    if (this.editor.selectedNodeId) return { type: 'node', id: this.editor.selectedNodeId }
    return null
  }

  _syncSelectionUi() {
    if (this.currentSelection) this.detailPanel?.update(this.currentSelection, this.store)
    else this.detailPanel?.renderEmpty()
    this._updateButtonStates()
    this._updateTreeSelection()
    this._updateNodeActionBar()
    this._syncFocusCenter()
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
    this._syncSearchControls()
    this._updateCleanupButton()
  }

  _updateCleanupButton() {
    const button = document.getElementById('btn-cleanup-placeholders')
    if (!button) return
    const count = this.store.findLegacyPlaceholderNodeIds?.().length ?? 0
    button.hidden = count === 0
    button.textContent = count > 0 ? `清理未完成节点（${count}）` : '清理未完成节点'
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
