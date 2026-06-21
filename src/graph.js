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

export class GraphManager {
  constructor(container, options = {}) {
    this.container = container
    this.spacePressed = false
    this.layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS }

    this.cy = cytoscape({
      container,
      style: STYLES,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    this._onSelect = options.onSelect || null

    this._initDragMode()
    this._initEvents()
    this._initMinimap()
  }

  // === 小地图 ===

  _initMinimap() {
    this.minimapEl = document.getElementById('minimap')
    if (!this.minimapEl) return

    this.minimapCanvas = document.createElement('canvas')
    this.minimapEl.appendChild(this.minimapCanvas)
    this.minimapCtx = this.minimapCanvas.getContext('2d')

    // 监听主图变化更新小地图
    this.cy.on('pan zoom', () => this._drawMinimap())
    this.cy.on('add remove', () => this._drawMinimap())
    this.cy.on('layoutstop', () => this._drawMinimap())

    // 点击小地图跳转
    this.minimapEl.addEventListener('click', (e) => {
      const rect = this.minimapEl.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      this._navigateToMinimapPoint(x, y, rect.width, rect.height)
    })

    // 初始绘制
    this._drawMinimap()
  }

  _getGraphBounds() {
    const nodes = this.cy.nodes()
    if (nodes.length === 0) return { x: 0, y: 0, w: 100, h: 100 }

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    nodes.forEach((n) => {
      const pos = n.position()
      minX = Math.min(minX, pos.x)
      minY = Math.min(minY, pos.y)
      maxX = Math.max(maxX, pos.x)
      maxY = Math.max(maxY, pos.y)
    })

    const padding = 80
    return {
      x: minX - padding,
      y: minY - padding,
      w: maxX - minX + padding * 2 || 100,
      h: maxY - minY + padding * 2 || 100,
    }
  }

  _drawMinimap() {
    if (!this.minimapCanvas) return

    const rect = this.minimapEl.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    const h = rect.height

    this.minimapCanvas.width = w * dpr
    this.minimapCanvas.height = h * dpr
    this.minimapCanvas.style.width = w + 'px'
    this.minimapCanvas.style.height = h + 'px'

    const ctx = this.minimapCtx
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    if (this.cy.nodes().length === 0) {
      ctx.restore()
      return
    }

    const bounds = this._getGraphBounds()
    const scaleX = w / bounds.w
    const scaleY = h / bounds.h
    const scale = Math.min(scaleX, scaleY)

    const offsetX = (w - bounds.w * scale) / 2
    const offsetY = (h - bounds.h * scale) / 2

    // 绘制边
    ctx.strokeStyle = '#ccc'
    ctx.lineWidth = 0.5
    this.cy.edges().forEach((e) => {
      const src = e.source().position()
      const tgt = e.target().position()
      ctx.beginPath()
      ctx.moveTo((src.x - bounds.x) * scale + offsetX, (src.y - bounds.y) * scale + offsetY)
      ctx.lineTo((tgt.x - bounds.x) * scale + offsetX, (tgt.y - bounds.y) * scale + offsetY)
      ctx.stroke()
    })

    // 绘制节点
    this.cy.nodes().forEach((n) => {
      if (n.isParent()) {
        // 父节点：从子节点边界 + 自身 padding 计算图空间矩形
        const children = n.children()
        const pos = n.position()
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity
        if (children.length > 0) {
          children.forEach((c) => {
            const p = c.position()
            const bb = c.renderedBoundingBox()
            // 用 renderedBoundingBox 在 1:1 zoom 下的尺寸估算
            const hw = bb.w / (this.cy.zoom() || 1) / 2
            const hh = bb.h / (this.cy.zoom() || 1) / 2
            minX = Math.min(minX, p.x - hw)
            minY = Math.min(minY, p.y - hh)
            maxX = Math.max(maxX, p.x + hw)
            maxY = Math.max(maxY, p.y + hh)
          })
        } else {
          minX = pos.x - 30
          minY = pos.y - 20
          maxX = pos.x + 30
          maxY = pos.y + 20
        }
        const pad = 24
        minX -= pad
        minY -= pad
        maxX += pad
        maxY += pad

        const x = (minX - bounds.x) * scale + offsetX
        const y = (minY - bounds.y) * scale + offsetY
        const w = (maxX - minX) * scale
        const h = (maxY - minY) * scale

        ctx.fillStyle = 'rgba(139, 115, 85, 0.15)'
        ctx.strokeStyle = '#b0a090'
        ctx.lineWidth = 0.8
        ctx.beginPath()
        const rx = 3
        const ry = 3
        ctx.moveTo(x + rx, y)
        ctx.lineTo(x + w - rx, y)
        ctx.quadraticCurveTo(x + w, y, x + w, y + ry)
        ctx.lineTo(x + w, y + h - ry)
        ctx.quadraticCurveTo(x + w, y + h, x + w - rx, y + h)
        ctx.lineTo(x + rx, y + h)
        ctx.quadraticCurveTo(x, y + h, x, y + h - ry)
        ctx.lineTo(x, y + ry)
        ctx.quadraticCurveTo(x, y, x + rx, y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      } else {
        // 普通节点画为圆点
        const pos = n.position()
        const x = (pos.x - bounds.x) * scale + offsetX
        const y = (pos.y - bounds.y) * scale + offsetY
        const r = 2

        ctx.fillStyle = n.hasClass('selected')
          ? '#27ae60'
          : n.hasClass('highlighted')
            ? '#e74c3c'
            : '#999'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    // 绘制视口框
    const vp = this._getViewportRect(bounds, scale, offsetX, offsetY)
    ctx.strokeStyle = '#4a90e2'
    ctx.lineWidth = 1.5
    ctx.fillStyle = 'rgba(74, 144, 226, 0.1)'
    ctx.fillRect(vp.x, vp.y, vp.w, vp.h)
    ctx.strokeRect(vp.x, vp.y, vp.w, vp.h)

    // 绘制缩放倍率
    const zoom = this.cy.zoom()
    ctx.fillStyle = '#666'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(Math.round(zoom * 100) + '%', w - 4, h - 4)

    ctx.restore()
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
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
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
      // 父节点始终可拖拽（按住空格移动位置，不按空格时由 mousedown 拦截为平移画布）
      if (n.isParent()) return
      try { n[this.spacePressed ? 'unlock' : 'lock']() } catch {}
      try { n[this.spacePressed ? 'grabify' : 'ungrabify']() } catch {}
    })
  }

  // === 事件 ===

  _initEvents() {
    // 父节点（家族/区域）拖拽 → 平移画布，点击 → 选中
    this._panningParent = null
    this._panStartMouse = null
    this._panStartViewport = null

    // 用 Cytoscape 事件识别父节点（比 DOM 事件可靠）
    this.cy.on('mousedown', 'node:parent', (evt) => {
      if (this.spacePressed) return
      if (this._panningParent) return // 正在拖拽中，忽略

      this._panningParent = evt.target.id()
      this._panStartMouse = { x: evt.originalEvent.clientX, y: evt.originalEvent.clientY }
      this._panStartViewport = { x: this.cy.pan().x, y: this.cy.pan().y }
      this.cy.userPanningEnabled(false)
      evt.originalEvent.preventDefault()
    })

    this.container.addEventListener('mousemove', (e) => {
      if (!this._panningParent) return
      const dx = e.clientX - this._panStartMouse.x
      const dy = e.clientY - this._panStartMouse.y
      this.cy.pan({
        x: this._panStartViewport.x + dx,
        y: this._panStartViewport.y + dy,
        rendered: true,
      })
    })

    this.container.addEventListener('mouseup', (e) => {
      if (!this._panningParent) return
      const dx = Math.abs(e.clientX - this._panStartMouse.x)
      const dy = Math.abs(e.clientY - this._panStartMouse.y)
      const nodeId = this._panningParent
      this._panningParent = null
      this._panStartMouse = null
      this._panStartViewport = null
      this.cy.userPanningEnabled(true)
      // 移动很小 → 视为点击
      if (dx + dy < 3) {
        this._onSelect?.({
          type: 'node',
          id: nodeId,
          shiftKey: !!e.shiftKey,
        })
      }
    })

    this.cy.on('tap', 'node, edge', (evt) => {
      const el = evt.target
      this._onSelect?.({
        type: el.isNode() ? 'node' : 'edge',
        id: el.id(),
        shiftKey: !!evt.originalEvent?.shiftKey,
      })
    })

    this.cy.on('tap', (evt) => {
      if (evt.target === this.cy) {
        this._onSelect?.(null)
      }
    })
  }

  // === 同步数据 ===

  sync(elements, { layout = false } = {}) {
    const positions = {}
    this.cy.nodes().forEach((n) => {
      positions[n.id()] = { ...n.position() }
    })

    this.cy.elements().remove()
    this.cy.add(elements)

    this.cy.nodes().forEach((n) => {
      const saved = positions[n.id()]
      if (saved) n.position(saved)
    })

    // 新增元素按当前模式设置拖拽能力
    this._applyNodeDragMode()
    // 同步后更新小地图
    this._drawMinimap()

    if (layout) {
      this.runLayout()
    }
  }

  // === 布局 ===

  runLayout() {
    // 布局前临时解锁，让 fcose 能正常排布节点
    this.cy.nodes().forEach((n) => {
      try { n.unlock() } catch {}
      try { n.grabify() } catch {}
    })

    const layout = this.cy.layout(this.layoutOptions)
    layout.run()
    layout.on('layoutstop', () => {
      this._applyNodeDragMode()
    })
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

  clearHighlight() {
    this.cy.elements().removeClass('highlighted dimmed')
  }

  setSelected(id) {
    this.cy.elements().removeClass('selected')
    if (id) this.cy.getElementById(id).addClass('selected')
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

  showRelated(nodeId) {
    const center = this.cy.getElementById(nodeId)
    if (center.empty()) return

    // 先恢复全量
    this.resetView()

    const visible = new Set([nodeId])
    this.cy.edges().forEach((e) => {
      const s = e.source().id()
      const t = e.target().id()
      if (s === nodeId || t === nodeId) {
        visible.add(s)
        visible.add(t)
      }
    })

    this._setVisibleNodeSet(visible)
  }

  resetView() {
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
    return {
      x: bb.x1 + bb.w / 2,
      y: bb.y1 + bb.h / 2,
      w: Math.max(bb.w, 60),
      h: bb.h,
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

    const siblings = parent.outgoers('node')
    const index = siblings.length - 1
    const pos = parent.position()
    const angle = -Math.PI / 3 + index * (Math.PI / 6)

    child.position({
      x: pos.x + 120 * Math.cos(angle),
      y: pos.y + 100 + index * 40,
    })
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

const STYLES = [
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
    selector: 'node[important]',
    style: { color: '#c0392b' },
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
    },
  },
  {
    selector: 'edge',
    style: {
      width: 1,
      'line-color': '#bbbbbb',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#bbbbbb',
      'arrow-scale': 0.7,
      'curve-style': 'bezier',
      label: 'data(type)',
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
    selector: 'node.node-editing',
    style: { 'text-opacity': 0 },
  },
  {
    selector: '.kg-hidden',
    style: { display: 'none' },
  },
]
