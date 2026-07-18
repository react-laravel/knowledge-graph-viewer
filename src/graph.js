import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'

cytoscape.use(fcose)

const DEFAULT_LAYOUT_OPTIONS = {
  name: 'fcose',
  animate: true,
  fit: true,
  padding: 80,
  quality: 'proof',
  nodeDimensionsIncludeLabels: true,
  packComponents: true,
  nodeRepulsion: 8000,
  idealEdgeLength: 160,
  edgeElasticity: 0.45,
  nestingFactor: 0.12,
  gravity: 0.35,
  numIter: 2500,
}

const TAP_DELAY_MS = 220
const MIND_MAP_ROOT_GAP = 230
const MIND_MAP_LEVEL_GAP = 190
const MIND_MAP_ROW_GAP = 96

export class GraphManager {
  constructor(container, options = {}) {
    this.container = container
    this.spacePressed = false
    this.layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS }
    this._onSelect = options.onSelect
    this._onActivate = options.onActivate
    this._pendingTapTimer = null
    this._showEdgeLabels = false
    this._hoverHighlight = true
    this._themeMode = options.themeMode === 'dark' ? 'dark' : 'light'
    this._mindMapStructureSignature = ''

    this.cy = cytoscape({
      container,
      style: buildStyles(false, this._themeMode),
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    this._initDragMode()
    this._initEvents()
    this._initMinimap()
  }

  setThemeMode(themeMode) {
    this._themeMode = themeMode === 'dark' ? 'dark' : 'light'
    this.cy.style(buildStyles(this._showEdgeLabels, this._themeMode))
    this._scheduleMinimapDraw()
  }

  resize() {
    this.cy.resize()
    this._scheduleMinimapDraw()
  }

  isMindMap() {
    return this.cy.nodes('[mindMap = "yes"]').length > 0 && this._getMindMapRoot().nonempty()
  }

  _getMindMapRoot() {
    return this.cy.nodes('[isRoot = "yes"]').first()
  }

  // === 小地图 ===

  _initMinimap() {
    this.minimapEl = document.getElementById('minimap')
    if (!this.minimapEl) return

    this.minimapCanvas = document.createElement('canvas')
    this.minimapEl.appendChild(this.minimapCanvas)
    this.minimapCtx = this.minimapCanvas.getContext('2d')

    this.cy.on('pan zoom', () => this._scheduleMinimapDraw())
    this.cy.on('add remove', () => this._scheduleMinimapDraw())
    this.cy.on('layoutstop', () => this._scheduleMinimapDraw())

    this.minimapEl.addEventListener('click', (e) => {
      const rect = this.minimapEl.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      this._navigateToMinimapPoint(x, y, rect.width, rect.height)
    })

    if (typeof ResizeObserver !== 'undefined') {
      this._minimapResizeObserver = new ResizeObserver(() => this._scheduleMinimapDraw())
      this._minimapResizeObserver.observe(this.minimapEl)
    }

    this._scheduleMinimapDraw()
  }

  _scheduleMinimapDraw() {
    if (!this.minimapCanvas) return
    if (this._minimapRaf) cancelAnimationFrame(this._minimapRaf)
    this._minimapRaf = requestAnimationFrame(() => {
      this._minimapRaf = null
      this._drawMinimap()
    })
  }

  _isFinitePos(pos) {
    return pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)
  }

  /** 小地图与主图共用 applyVisibility 计算出的可见集合 */
  _getMinimapElements() {
    if (this._lastVisibleNodeIds?.size) {
      const nodes = this.cy.nodes().filter((n) => this._lastVisibleNodeIds.has(n.id()))
      const edges = this.cy.edges().filter((e) => this._lastVisibleEdgeIds?.has(e.id()))
      const col = nodes.union(edges)
      if (col.length > 0) return col
    }
    const visible = this.cy.elements().not('.kg-hidden')
    return visible.length > 0 ? visible : this.cy.elements()
  }

  /** 将视口对准当前可见节点（避免全图布局后可见节点散落在画布外） */
  fitToVisibleNodes(visibleNodeIds) {
    const allowed = visibleNodeIds instanceof Set ? visibleNodeIds : new Set(visibleNodeIds ?? [])
    if (!allowed.size) return
    const eles = this.cy.nodes().filter((n) => allowed.has(n.id()) && !n.hasClass('kg-hidden'))
    if (eles.empty()) return
    this.cy.fit(eles, 60)
  }

  _getGraphBounds() {
    const nodes = this._getMinimapElements().nodes().filter((n) => this._isFinitePos(n.position()))
    if (nodes.length === 0) return { x: 0, y: 0, w: 100, h: 100 }

    const bb = nodes.boundingBox()
    const padding = 40
    return {
      x: bb.x1 - padding,
      y: bb.y1 - padding,
      w: Math.max(bb.w + padding * 2, 50),
      h: Math.max(bb.h + padding * 2, 50),
    }
  }

  _mapToMinimap(x, y, bounds, scale, offsetX, offsetY) {
    return {
      x: (x - bounds.x) * scale + offsetX,
      y: (y - bounds.y) * scale + offsetY,
    }
  }

  _drawMinimap() {
    if (!this.minimapCanvas) return

    const rect = this.minimapEl.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    const h = rect.height
    if (w <= 0 || h <= 0) return

    this.minimapCanvas.width = w * dpr
    this.minimapCanvas.height = h * dpr
    this.minimapCanvas.style.width = w + 'px'
    this.minimapCanvas.style.height = h + 'px'

    const ctx = this.minimapCtx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const eles = this._getMinimapElements()
    if (eles.nodes().length === 0) {
      ctx.restore()
      return
    }

    const bounds = this._getGraphBounds()
    if (!Number.isFinite(bounds.w) || !Number.isFinite(bounds.h) || bounds.w <= 0 || bounds.h <= 0) {
      ctx.restore()
      return
    }

    const scale = Math.min(w / bounds.w, h / bounds.h)
    const offsetX = (w - bounds.w * scale) / 2
    const offsetY = (h - bounds.h * scale) / 2

    const mapPoint = (x, y) => this._mapToMinimap(x, y, bounds, scale, offsetX, offsetY)

    const palette = this._getMinimapPalette()

    // 绘制边
    ctx.strokeStyle = palette.edge
    ctx.lineWidth = 0.6
    eles.edges().forEach((e) => {
      const src = e.source().position()
      const tgt = e.target().position()
      if (!this._isFinitePos(src) || !this._isFinitePos(tgt)) return
      const p1 = mapPoint(src.x, src.y)
      const p2 = mapPoint(tgt.x, tgt.y)
      if (!Number.isFinite(p1.x) || !Number.isFinite(p1.y) || !Number.isFinite(p2.x) || !Number.isFinite(p2.y)) {
        return
      }
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    })

    // 绘制 compound 父框
    eles.nodes().filter((n) => n.isParent()).forEach((n) => {
      const children = n.children().not('.kg-hidden')
      const boxNodes = children.length > 0 ? children : n.children()
      if (boxNodes.length === 0) return
      const finiteChildren = boxNodes.filter((c) => this._isFinitePos(c.position()))
      if (finiteChildren.length === 0) return

      const bb = finiteChildren.boundingBox()
      const pad = 20
      const minX = bb.x1 - pad
      const minY = bb.y1 - pad
      const maxX = bb.x2 + pad
      const maxY = bb.y2 + pad
      const p1 = mapPoint(minX, minY)
      const rw = (maxX - minX) * scale
      const rh = (maxY - minY) * scale
      if (!Number.isFinite(p1.x) || !Number.isFinite(p1.y) || rw <= 0 || rh <= 0) return

      ctx.fillStyle = palette.groupFill
      ctx.strokeStyle = palette.groupStroke
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.roundRect(p1.x, p1.y, rw, rh, 3)
      ctx.fill()
      ctx.stroke()
    })

    // 绘制叶节点
    eles.nodes().filter((n) => !n.isParent()).forEach((n) => {
      const pos = n.position()
      if (!this._isFinitePos(pos)) return
      const p = mapPoint(pos.x, pos.y)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return
      const r = 2.5

      ctx.fillStyle = n.hasClass('selected')
        ? palette.selected
        : n.hasClass('highlighted')
          ? palette.highlighted
          : palette.node
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fill()
    })

    // 绘制视口框
    const vp = this._getViewportRect(bounds, scale, offsetX, offsetY)
    if (Number.isFinite(vp.x) && Number.isFinite(vp.y) && vp.w > 0 && vp.h > 0) {
      ctx.strokeStyle = palette.viewportStroke
      ctx.lineWidth = 1.5
      ctx.fillStyle = palette.viewportFill
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h)
      ctx.strokeRect(vp.x, vp.y, vp.w, vp.h)
    }

    const zoom = this.cy.zoom()
    ctx.fillStyle = palette.text
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(Math.round(zoom * 100) + '%', w - 4, h - 4)

    ctx.restore()
  }

  _getMinimapPalette() {
    if (this._themeMode === 'dark') {
      return {
        edge: '#4a5875',
        groupFill: 'rgba(125, 146, 184, 0.18)',
        groupStroke: '#5d6f90',
        node: '#9ca9c4',
        selected: '#67d391',
        highlighted: '#ff7a7a',
        viewportStroke: '#7aa2ff',
        viewportFill: 'rgba(122, 162, 255, 0.16)',
        text: '#9aa8c7',
      }
    }

    return {
      edge: '#bbb',
      groupFill: 'rgba(139, 115, 85, 0.18)',
      groupStroke: '#b0a090',
      node: '#777',
      selected: '#27ae60',
      highlighted: '#e74c3c',
      viewportStroke: '#4a90e2',
      viewportFill: 'rgba(74, 144, 226, 0.12)',
      text: '#666',
    }
  }

  _getViewportRect(bounds, scale, offsetX, offsetY) {
    const pan = this.cy.pan()
    const zoom = this.cy.zoom()
    const cw = this.cy.width()
    const ch = this.cy.height()

    const topLeft = {
      x: (-pan.x) / zoom,
      y: (-pan.y) / zoom,
    }
    const bottomRight = {
      x: (-pan.x + cw) / zoom,
      y: (-pan.y + ch) / zoom,
    }

    const x = (topLeft.x - bounds.x) * scale + offsetX
    const y = (topLeft.y - bounds.y) * scale + offsetY
    const w = (bottomRight.x - topLeft.x) * scale
    const h = (bottomRight.y - topLeft.y) * scale

    return { x, y, w: Math.max(w, 4), h: Math.max(h, 4) }
  }

  _navigateToMinimapPoint(mx, my, mmW, mmH) {
    if (this.cy.nodes().length === 0) return

    const bounds = this._getGraphBounds()
    const scaleX = mmW / bounds.w
    const scaleY = mmH / bounds.h
    const scale = Math.min(scaleX, scaleY)
    const offsetX = (mmW - bounds.w * scale) / 2
    const offsetY = (mmH - bounds.h * scale) / 2

    // 小地图坐标 → 图坐标
    const graphX = (mx - offsetX) / scale + bounds.x
    const graphY = (my - offsetY) / scale + bounds.y

    // 以该点为中心平移（保持当前缩放）
    const zoom = this.cy.zoom()
    const cw = this.cy.width()
    const ch = this.cy.height()

    this.cy.pan({
      x: -graphX * zoom + cw / 2,
      y: -graphY * zoom + ch / 2,
      rendered: true,
    })
  }

  // === 拖拽模式：空格控制 ===

  _initDragMode() {
    // 阻止 Cytoscape 自动管理节点状态
    try { this.cy.autolock(false) } catch {}
    try { this.cy.autoungrabify(false) } catch {}

    this._applyNodeDragMode()
    this.container.classList.add('space-panning')

    document.addEventListener('keydown', (e) => {
      if (
        ['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A'].includes(e.target.tagName) ||
        e.target.isContentEditable
      ) return
      if (e.key === ' ' && !this.spacePressed) {
        e.preventDefault()
        this.spacePressed = true
        this._applyNodeDragMode()
        this.container.classList.remove('space-panning')
      }
    })

    document.addEventListener('keyup', (e) => {
      if (e.key === ' ' && this.spacePressed) {
        this.spacePressed = false
        this._applyNodeDragMode()
        this.container.classList.add('space-panning')
      }
    })
  }

  _applyNodeDragMode() {
    this.cy.nodes().forEach((n) => {
      // 中心主题是思维导图的结构锚点，只能通过重新布局定位，不能被用户拖走。
      if (n.data('isRoot') === 'yes') {
        try { n.lock() } catch {}
        try { n.ungrabify() } catch {}
        return
      }
      // 父节点始终可拖拽（按住空格移动位置，不按空格时由 mousedown 拦截为平移画布）
      if (n.isParent()) return
      try { n[this.spacePressed ? 'unlock' : 'lock']() } catch {}
      try { n[this.spacePressed ? 'grabify' : 'ungrabify']() } catch {}
    })
  }

  // === 事件 ===

  _initEvents() {
    this.cy.on('tap', (evt) => {
      const selection = this._selectionFromEvent(evt)
      if (!selection) {
        this._cancelPendingTap()
        if (evt.target === this.cy) this._onSelect?.(null)
        return
      }

      // Cytoscape 会在 dbltap 前先触发两次 tap。稍后派发单击，避免双击编辑时
      // 又触发聚焦或渐进展开。
      this._cancelPendingTap()
      this._pendingTapTimer = setTimeout(() => {
        this._pendingTapTimer = null
        this._onSelect?.(selection)
      }, TAP_DELAY_MS)
    })

    this.cy.on('dbltap', (evt) => {
      this._cancelPendingTap()
      const selection = this._selectionFromEvent(evt)
      if (selection) this._onActivate?.(selection)
    })
  }

  _cancelPendingTap() {
    if (this._pendingTapTimer) {
      clearTimeout(this._pendingTapTimer)
      this._pendingTapTimer = null
    }
  }

  cancelPendingSelection() {
    this._cancelPendingTap()
  }

  _selectionFromEvent(evt) {
    const pos = evt.renderedPosition

    // compound 方框范围内的「外部」节点：Cytoscape 命中会落到 cy，需按坐标补选
    if (evt.target === this.cy) {
      const hit = this._topLeafNodeAt(pos)
      if (!hit) return null
      return {
        type: 'node',
        id: hit.id(),
        shiftKey: !!evt.originalEvent?.shiftKey,
      }
    }

    if (!evt.target.isNode() && !evt.target.isEdge()) return null

    let el = evt.target
    if (el.isNode() && el.isParent()) {
      const hit = this._topLeafNodeAt(pos)
      if (hit) el = hit
    }

    return {
      type: el.isNode() ? 'node' : 'edge',
      id: el.id(),
      shiftKey: !!evt.originalEvent?.shiftKey,
    }
  }

  // === 同步数据 ===

  sync(elements, { layout = false } = {}) {
    const positions = {}
    const selectedIds = this.cy.elements('.selected').map((el) => el.id())
    this.cy.nodes().forEach((n) => {
      positions[n.id()] = { ...n.position() }
    })

    this.cy.elements().remove()
    this.cy.add(elements)

    const nextMindMapSignature = this._computeMindMapStructureSignature()
    const mindMapStructureChanged = nextMindMapSignature !== this._mindMapStructureSignature
    this._mindMapStructureSignature = nextMindMapSignature

    this.cy.nodes().forEach((n) => {
      const saved = positions[n.id()]
      if (saved) n.position(saved)
    })
    selectedIds.forEach((id) => this.cy.getElementById(id).addClass('selected'))

    // 新增元素按当前模式设置拖拽能力
    this._applyNodeDragMode()

    if (layout) {
      this.runLayout()
    } else if (mindMapStructureChanged && this.isMindMap()) {
      // undo/redo、删除恢复和层级移动同样会经过 sync；结构变化必须自动重排，
      // 否则新恢复的节点会停在 Cytoscape 默认原点并与中心主题重叠。
      this._runMindMapLayout()
    }
  }

  _computeMindMapStructureSignature() {
    const root = this._getMindMapRoot()
    if (root.empty()) return ''

    const nodes = this.cy.nodes('[mindMap = "yes"]').map((node) => [
      node.id(),
      node.data('branchSide') || '',
      node.data('label') || '',
    ])
    const edges = this.cy.edges().filter((edge) => {
      const hierarchy = edge.data('hierarchy')
      return hierarchy === true || hierarchy === 'yes' || edge.data('type') === '子节点'
    }).map((edge) => [edge.id(), edge.source().id(), edge.target().id()])

    return JSON.stringify({ rootId: root.id(), nodes, edges })
  }

  // === 布局 ===

  runLayout() {
    if (this.isMindMap()) {
      this._runMindMapLayout()
      return
    }

    // 布局前临时解锁，让 fcose 能正常排布节点
    this.cy.nodes().forEach((n) => {
      try { n.unlock() } catch {}
      try { n.grabify() } catch {}
    })

    const layout = this.cy.layout({ ...this.layoutOptions, fit: false })
    layout.run()
    layout.on('layoutstop', () => {
      this._applyNodeDragMode()
      if (this._lastVisibleNodeIds?.size) this.fitToVisibleNodes(this._lastVisibleNodeIds)
      this._scheduleMinimapDraw()
    })
  }

  /**
   * XMind 风格的稳定左右树布局。只读取 hierarchy 边；业务关系不会改变主题层级。
   * 根固定在逻辑原点，一级主题的 branchSide 由 store 持久化，后代继承所在侧。
   */
  _runMindMapLayout() {
    const root = this._getMindMapRoot()
    if (root.empty()) return

    const nodes = this.cy.nodes('[mindMap = "yes"]').filter((node) => !node.isParent())
    const nodeById = new Map(nodes.map((node) => [node.id(), node]))
    const childrenById = new Map([...nodeById.keys()].map((id) => [id, []]))
    const hierarchyEdges = this.cy.edges().filter((edge) => {
      const hierarchy = edge.data('hierarchy')
      return hierarchy === true || hierarchy === 'yes' || edge.data('type') === '子节点'
    })

    hierarchyEdges.forEach((edge) => {
      const sourceId = edge.source().id()
      const targetId = edge.target().id()
      if (!nodeById.has(sourceId) || !nodeById.has(targetId)) return
      childrenById.get(sourceId)?.push(targetId)
    })

    const rootChildren = childrenById.get(root.id()) ?? []
    const sideByRootChild = new Map()
    let leftCount = 0
    let rightCount = 0
    rootChildren.forEach((id, index) => {
      const storedSide = nodeById.get(id)?.data('branchSide')
      let side = storedSide === 'left' || storedSide === 'right' ? storedSide : null
      if (!side) {
        if (leftCount === rightCount) side = index % 2 === 0 ? 'right' : 'left'
        else side = leftCount < rightCount ? 'left' : 'right'
      }
      sideByRootChild.set(id, side)
      if (side === 'left') leftCount += 1
      else rightCount += 1
    })

    const weightMemo = new Map()
    const subtreeWeight = (id, visiting = new Set()) => {
      if (weightMemo.has(id)) return weightMemo.get(id)
      if (visiting.has(id)) return 1
      const nextVisiting = new Set(visiting).add(id)
      const children = childrenById.get(id) ?? []
      const childWeight = children.reduce(
        (sum, childId) => sum + subtreeWeight(childId, nextVisiting),
        0
      )
      const nodeHeight = nodeById.get(id)?.outerHeight() ?? 0
      const ownWeight = Math.max(1, (nodeHeight + 32) / MIND_MAP_ROW_GAP)
      const normalized = Math.max(ownWeight, childWeight)
      weightMemo.set(id, normalized)
      return normalized
    }

    const positions = new Map([[root.id(), { x: 0, y: 0 }]])
    const visited = new Set([root.id()])

    const placeSubtree = (id, depth, side, top) => {
      if (visited.has(id)) return
      visited.add(id)
      const weight = subtreeWeight(id)
      const direction = side === 'left' ? -1 : 1
      positions.set(id, {
        x: direction * (MIND_MAP_ROOT_GAP + Math.max(0, depth - 1) * MIND_MAP_LEVEL_GAP),
        y: top + (weight * MIND_MAP_ROW_GAP) / 2,
      })

      const children = childrenById.get(id) ?? []
      const childWeight = children.reduce((sum, childId) => sum + subtreeWeight(childId), 0)
      let childTop = top + ((weight - childWeight) * MIND_MAP_ROW_GAP) / 2
      for (const childId of children) {
        placeSubtree(childId, depth + 1, side, childTop)
        childTop += subtreeWeight(childId) * MIND_MAP_ROW_GAP
      }
    }

    for (const side of ['left', 'right']) {
      const branches = rootChildren.filter((id) => sideByRootChild.get(id) === side)
      const totalWeight = branches.reduce((sum, id) => sum + subtreeWeight(id), 0)
      let top = -(totalWeight * MIND_MAP_ROW_GAP) / 2
      for (const id of branches) {
        placeSubtree(id, 1, side, top)
        top += subtreeWeight(id) * MIND_MAP_ROW_GAP
      }
    }

    // 严格的思维导图本应全部从中心可达；导入异常数据时仍给孤立节点稳定位置。
    const detached = [...nodeById.keys()].filter((id) => !visited.has(id))
    detached.forEach((id, index) => {
      positions.set(id, {
        x: (index % 2 === 0 ? 1 : -1) * MIND_MAP_ROOT_GAP,
        y: MIND_MAP_ROW_GAP * (2 + Math.floor(index / 2)),
      })
    })

    this.cy.batch(() => {
      nodes.forEach((node) => {
        try { node.unlock() } catch {}
        const position = positions.get(node.id())
        if (position) node.position(position)
      })
    })

    this._applyNodeDragMode()
    const visible = nodes.filter((node) => !node.hasClass('kg-hidden'))
    this.cy.fit(visible.nonempty() ? visible : nodes, 80)
    this._scheduleMinimapDraw()
  }

  setLayoutOptions(opts) {
    Object.assign(this.layoutOptions, opts)
  }

  // === 节点/边操作 ===

  setHighlight(ids) {
    this.cy.elements().removeClass('highlighted')
    if (!ids.length) return

    const matched = this.cy.collection()
    ids.forEach((id) => {
      const el = this.cy.getElementById(id)
      if (el.nonempty()) matched.merge(el)
    })

    if (matched.nonempty()) {
      matched.addClass('highlighted')
      this.cy.animate({ fit: { eles: matched, padding: 80 }, duration: 300 })
    }
  }

  setShowEdgeLabels(show) {
    this._showEdgeLabels = show
    this.cy.style(buildStyles(show, this._themeMode))
  }

  setHoverHighlight(on) {
    this._hoverHighlight = on
    if (!on) this.clearHoverDim()
  }

  applyVisibility(visibleNodeIds, visibleEdgeIds) {
    const allowedNodes = visibleNodeIds instanceof Set ? visibleNodeIds : new Set(visibleNodeIds)
    const allowedEdges = visibleEdgeIds instanceof Set ? visibleEdgeIds : new Set(visibleEdgeIds)
    this._lastVisibleNodeIds = allowedNodes
    this._lastVisibleEdgeIds = allowedEdges
    this._setVisibleNodeSet(allowedNodes)
    this.cy.edges().forEach((e) => {
      if (allowedEdges.has(e.id())) e.removeClass('kg-hidden')
      else e.addClass('kg-hidden')
    })
    this._scheduleMinimapDraw()
  }

  setHoverFocus(nodeId) {
    if (!this._hoverHighlight) return
    const center = this.cy.getElementById(nodeId)
    if (center.empty()) return
    const hood = center.closedNeighborhood()
    this.cy.elements().addClass('dimmed')
    hood.removeClass('dimmed')
    center.addClass('hover-center')
  }

  clearHoverDim() {
    this.cy.elements().removeClass('dimmed hover-center')
  }

  clearHighlight() {
    this.cy.elements().removeClass('highlighted dimmed hover-center')
  }

  setSelected(id) {
    this.cy.elements().removeClass('selected')
    if (id) this.cy.getElementById(id).addClass('selected')
    // 注意：不触发 _onSelect，避免和 onCanvasDeselect 形成循环调用
    // 选中同步由 Cytoscape tap 事件处理
  }

  setNodeEditing(nodeId, editing) {
    this.cy.nodes().removeClass('node-editing')
    if (editing && nodeId) {
      this.cy.getElementById(nodeId).addClass('node-editing')
    }
  }

  setLinkSource(nodeId) {
    this.cy.nodes().removeClass('link-source')
    if (nodeId) this.cy.getElementById(nodeId).addClass('link-source')
  }

  clearLinkSource() {
    this.cy.nodes().removeClass('link-source')
  }

  setMoveSource(nodeId) {
    this.cy.nodes().removeClass('move-source')
    if (nodeId) this.cy.getElementById(nodeId).addClass('move-source')
  }

  clearMoveSource() {
    this.cy.nodes().removeClass('move-source')
  }

  showRelated(nodeId) {
    this.applyVisibility(this._neighborhoodIds(nodeId), this._neighborhoodEdgeIds(nodeId))
  }

  resetView() {
    const ids = new Set(this.cy.nodes().map((n) => n.id()))
    const eids = new Set(this.cy.edges().map((e) => e.id()))
    this.applyVisibility(ids, eids)
  }

  _neighborhoodIds(nodeId) {
    const visible = new Set([nodeId])
    this.cy.edges().forEach((e) => {
      const s = e.source().id()
      const t = e.target().id()
      if (s === nodeId || t === nodeId) {
        visible.add(s)
        visible.add(t)
      }
    })
    return visible
  }

  _neighborhoodEdgeIds(nodeId) {
    const ids = new Set()
    this.cy.edges().forEach((e) => {
      const s = e.source().id()
      const t = e.target().id()
      if (s === nodeId || t === nodeId) ids.add(e.id())
    })
    return ids
  }

  /** @deprecated use applyVisibility */
  _legacyResetView() {
    this.cy.elements().removeClass('kg-hidden')
  }

  clearSavedPositions() {
    this.cy.nodes().forEach((n) => {
      n.data('_storedX', null)
      n.data('_storedY', null)
    })
  }

  // === 位置计算 ===

  getNodeScreenPosition(nodeId) {
    const node = this.cy.getElementById(nodeId)
    if (node.empty()) return null

    const bb = node.renderedBoundingBox()
    const fontSize = Number.parseFloat(node.style('font-size'))
    return {
      x: bb.x1 + bb.w / 2,
      y: bb.y1 + bb.h / 2,
      w: Math.max(bb.w, 60),
      h: bb.h,
      fontSize: Number.isFinite(fontSize) ? fontSize * this.cy.zoom() : null,
      fontFamily: node.style('font-family'),
      fontWeight: node.style('font-weight'),
      color: node.style('color'),
    }
  }

  getEdgeScreenPosition(edgeId) {
    const edge = this.cy.getElementById(edgeId)
    if (edge.empty()) return null

    const src = edge.source().renderedPosition()
    const tgt = edge.target().renderedPosition()
    return {
      x: (src.x + tgt.x) / 2,
      y: (src.y + tgt.y) / 2,
      w: 100,
      h: 24,
    }
  }

  positionNearParent(parentId, childId) {
    const parent = this.cy.getElementById(parentId)
    const child = this.cy.getElementById(childId)
    if (parent.empty() || child.empty()) return

    if (this.isMindMap()) {
      this._runMindMapLayout()
      return
    }

    const siblings = parent.outgoers('node')
    const index = siblings.length - 1
    const pos = parent.position()
    const angle = -Math.PI / 3 + index * (Math.PI / 6)

    const wasLocked = child.locked()
    try {
      if (wasLocked) child.unlock()
      child.position({
        x: pos.x + 120 * Math.cos(angle),
        y: pos.y + 100 + index * 40,
      })
    } finally {
      if (wasLocked) child.lock()
    }

    this._scheduleMinimapDraw()
  }

  fitGraph() {
    this.cy.fit(undefined, 80)
  }

  focusNode(nodeId) {
    const node = this.cy.getElementById(nodeId)
    if (node.empty()) return
    const pos = node.position()
    const zoom = this.cy.zoom()
    const cw = this.cy.width()
    const ch = this.cy.height()
    this.cy.pan({
      x: -pos.x * zoom + cw / 2,
      y: -pos.y * zoom + ch / 2,
      rendered: true,
    })
  }

  // === 私有方法 ===

  /** 取渲染坐标处最上层的非 compound 节点（避免家族方框挡住外部节点） */
  _topLeafNodeAt(renderedPosition) {
    if (!renderedPosition) return null
    const { x, y } = renderedPosition
    let top = null
    let topZ = -Infinity

    this.cy.nodes().forEach((n) => {
      if (n.isParent()) return
      const bb = n.renderedBoundingBox()
      if (x < bb.x1 || x > bb.x2 || y < bb.y1 || y > bb.y2) return
      const z = Number(n.style('z-index') || 0)
      if (z >= topZ) {
        topZ = z
        top = n
      }
    })

    return top
  }

  _setVisibleNodeSet(visibleNodeIds) {
    const allowed = new Set(visibleNodeIds)

    // 若节点在 compound 分组里，父节点也必须可见
    Array.from(allowed).forEach((id) => {
      const node = this.cy.getElementById(id)
      if (node.nonempty()) {
        node.ancestors().forEach((a) => allowed.add(a.id()))
      }
    })

    this.cy.nodes().forEach((n) => {
      if (allowed.has(n.id())) n.removeClass('kg-hidden')
      else n.addClass('kg-hidden')
    })

    this.cy.edges().forEach((e) => {
      const s = e.source().id()
      const t = e.target().id()
      if (allowed.has(s) && allowed.has(t)) e.removeClass('kg-hidden')
      else e.addClass('kg-hidden')
    })
  }
}

function buildStyles(showEdgeLabels, themeMode = 'light') {
  const edgeLabel = showEdgeLabels ? 'data(type)' : ''
  const styles = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      shape: 'round-rectangle',
      'background-color': '#ffffff',
      color: '#333333',
      'border-width': 1,
      'border-color': '#cccccc',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': 11,
      'font-family': 'PingFang SC, Microsoft YaHei, sans-serif',
      'text-wrap': 'wrap',
      'text-max-width': 72,
      width: 'label',
      height: 'label',
      padding: '6px',
      'z-index': 10,
    },
  },
  {
    selector: 'node[gender = "m"]',
    style: { 'background-color': '#fff9e6', 'border-color': '#d9c9a3' },
  },
  {
    selector: 'node[gender = "f"]',
    style: { 'background-color': '#ffffff', 'border-color': '#dddddd' },
  },
  {
    selector: 'node[important = "yes"]',
    style: { color: '#c0392b' },
  },
  {
    selector: 'node[mindMap = "yes"]',
    style: {
      'font-size': 14,
      'text-max-width': 150,
      padding: '10px',
      color: '#26364d',
      'border-color': '#9aabc2',
      'border-width': 2,
    },
  },
  {
    selector: 'node[isRoot = "yes"]',
    style: {
      'font-size': 18,
      'font-weight': 'bold',
      'text-max-width': 190,
      padding: '14px',
      color: '#ffffff',
      'background-color': '#397ec8',
      'border-color': '#2b68a9',
      'border-width': 3,
    },
  },
  {
    selector: 'node[group = "org"]',
    style: {
      'background-color': '#f3e8d7',
      'border-color': '#d4b896',
      color: '#5c4a32',
      'font-size': 12,
      'font-weight': 'bold',
      'text-max-width': 90,
      padding: '10px',
    },
  },
  {
    selector: 'node[group = "aggregate"]',
    style: {
      shape: 'round-rectangle',
      'background-color': '#eef2ff',
      'border-color': '#6366f1',
      'border-width': 2,
      'border-style': 'dashed',
      color: '#4338ca',
      'font-weight': 'bold',
    },
  },
  {
    selector: 'node:parent',
    style: {
      'background-opacity': 0.06,
      'background-color': '#8b7355',
      'border-width': 1,
      'border-color': '#d4c4b0',
      'border-style': 'dashed',
      label: 'data(label)',
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': -8,
      'font-size': 11,
      color: '#8b7355',
      padding: 24,
      'z-index': 1,
      'z-compound-depth': 'bottom',
      // 家族方框仅作视觉分组，不拦截其范围内的普通节点点击
      events: 'no',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      opacity: 0.2,
      'line-color': '#bbbbbb',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#bbbbbb',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      label: edgeLabel,
      'font-size': 10,
      color: '#444444',
      'font-family': 'PingFang SC, Microsoft YaHei, sans-serif',
      'text-rotation': 'autorotate',
      'text-margin-y': -10,
      'text-background-color': '#ffffff',
      'text-background-opacity': 1,
      'text-background-padding': 3,
      'text-background-shape': 'roundrectangle',
      'text-border-width': 1,
      'text-border-color': '#dddddd',
      'text-border-opacity': 1,
      'z-index': 1,
    },
  },
  { selector: 'edge[category = "family"]', style: { 'line-color': '#4a90e2', 'target-arrow-color': '#4a90e2' } },
  { selector: 'edge[category = "spouse"]', style: { 'line-color': '#e74c3c', 'target-arrow-color': '#e74c3c' } },
  { selector: 'edge[category = "master"]', style: { 'line-color': '#27ae60', 'target-arrow-color': '#27ae60' } },
  { selector: 'edge[category = "sibling"]', style: { 'line-color': '#9b59b6', 'target-arrow-color': '#9b59b6' } },
  { selector: 'edge[category = "romance"]', style: { 'line-color': '#e91e8c', 'target-arrow-color': '#e91e8c' } },
  { selector: 'edge[category = "social"]', style: { 'line-color': '#95a5a6', 'target-arrow-color': '#95a5a6' } },
  { selector: 'edge[category = "org"]', style: { 'line-color': '#8b7355', 'target-arrow-color': '#8b7355' } },
  { selector: 'edge[category = "conflict"]', style: { 'line-color': '#c0392b', 'target-arrow-color': '#c0392b' } },
  { selector: 'edge[category = "other"]', style: { 'line-color': '#bbbbbb', 'target-arrow-color': '#bbbbbb' } },
  {
    selector: 'edge[hierarchy = "yes"]',
    style: {
      width: 2,
      opacity: 0.9,
      'line-color': '#6f9fd8',
      'target-arrow-shape': 'none',
      'curve-style': 'bezier',
      label: '',
    },
  },
  {
    selector: '.highlighted',
    style: {
      'border-width': 3,
      'border-color': '#e74c3c',
      'background-color': '#fff0f0',
      'z-index': 10,
    },
  },
  {
    selector: '.dimmed',
    style: { opacity: 0.06 },
  },
  {
    selector: 'edge.dimmed',
    style: { opacity: 0.04 },
  },
  {
    selector: '.hover-center',
    style: { 'border-width': 2, 'border-color': '#4a90e2', opacity: 1, 'z-index': 20 },
  },
  {
    selector: 'node.hover-center',
    style: { opacity: 1 },
  },
  {
    selector: ':neighbor',
    style: { opacity: 1 },
  },
  {
    selector: 'edge.highlighted',
    style: {
      width: 3,
      opacity: 1,
      'line-color': '#e74c3c',
      'target-arrow-color': '#e74c3c',
      color: '#c0392b',
      'z-index': 10,
    },
  },
  {
    selector: '.selected',
    style: { 'border-width': 2, 'border-color': '#27ae60' },
  },
  {
    selector: 'node[isRoot = "yes"].selected',
    style: { 'border-width': 4 },
  },
  {
    selector: 'edge.selected',
    style: {
      width: 2,
      'line-color': '#27ae60',
      'target-arrow-color': '#27ae60',
    },
  },
  {
    selector: 'node.link-source',
    style: { 'border-width': 2, 'border-color': '#9b59b6' },
  },
  {
    selector: 'node.move-source',
    style: { 'border-width': 3, 'border-color': '#f39c12' },
  },
  {
    selector: 'node.node-editing',
    style: { 'text-opacity': 0 },
  },
  {
    selector: '.kg-hidden',
    style: { display: 'none' },
  },
  ]

  if (themeMode === 'dark') {
    styles.push(
      {
        selector: 'node',
        style: {
          'background-color': '#141b2d',
          color: '#d9e2ff',
          'border-color': '#3d4a66',
        },
      },
      {
        selector: 'node[gender = "m"]',
        style: { 'background-color': '#262033', 'border-color': '#7b6b4b' },
      },
      {
        selector: 'node[gender = "f"]',
        style: { 'background-color': '#151d31', 'border-color': '#56617d' },
      },
      {
        selector: 'node[important = "yes"]',
        style: { color: '#ff8f86' },
      },
      {
        selector: 'node[mindMap = "yes"]',
        style: {
          'background-color': '#141b2d',
          color: '#e4ebff',
          'border-color': '#53617d',
        },
      },
      {
        selector: 'node[isRoot = "yes"]',
        style: {
          'background-color': '#294e82',
          color: '#ffffff',
          'border-color': '#70a5e8',
        },
      },
      {
        selector: 'node[group = "org"]',
        style: {
          'background-color': '#262433',
          'border-color': '#766852',
          color: '#d6c39a',
        },
      },
      {
        selector: 'node[group = "aggregate"]',
        style: {
          'background-color': '#1b2540',
          'border-color': '#8ea5ff',
          color: '#c8d3ff',
        },
      },
      {
        selector: 'node:parent',
        style: {
          'background-color': '#8ea5ff',
          'border-color': '#4f6082',
          color: '#aab8d7',
        },
      },
      {
        selector: 'edge',
        style: {
          opacity: 0.5,
          color: '#d6def5',
          'text-background-color': '#101624',
          'text-border-color': '#34405a',
        },
      },
      {
        selector: 'edge[hierarchy = "yes"]',
        style: {
          opacity: 0.9,
          'line-color': '#5f8fc8',
          'target-arrow-shape': 'none',
        },
      },
      {
        selector: '.highlighted',
        style: {
          'border-color': '#ff7a7a',
          'background-color': '#3a1d2a',
        },
      },
      {
        selector: '.hover-center',
        style: { 'border-color': '#7aa2ff' },
      },
      {
        selector: 'edge.highlighted',
        style: {
          'line-color': '#ff7a7a',
          'target-arrow-color': '#ff7a7a',
          color: '#ffb1aa',
        },
      },
      {
        selector: '.selected',
        style: { 'border-color': '#67d391' },
      },
      {
        selector: 'edge.selected',
        style: {
          'line-color': '#67d391',
          'target-arrow-color': '#67d391',
        },
      },
      {
        selector: 'node.link-source',
        style: { 'border-color': '#c6a4ff' },
      },
      {
        selector: 'node.move-source',
        style: { 'border-color': '#ffc45c' },
      }
    )
  }

  return styles
}
