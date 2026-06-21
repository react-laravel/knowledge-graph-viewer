import cytoscape from 'cytoscape'
import fcose from 'cytoscape-fcose'

cytoscape.use(fcose)

const LAYOUT_OPTIONS = {
  name: 'fcose',
  animate: true,
  fit: true,
  padding: 100,
  quality: 'proof',
  nodeDimensionsIncludeLabels: true,
  packComponents: true,
  nodeRepulsion: 18000,
  idealEdgeLength: 220,
  edgeElasticity: 0.35,
  nestingFactor: 0.08,
  gravity: 0.15,
  gravityCompound: 0.5,
  gravityRangeCompound: 2.5,
  numIter: 3500,
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
    style: {
      'background-color': '#fff9e6',
      'border-color': '#d9c9a3',
    },
  },
  {
    selector: 'node[gender = "f"]',
    style: {
      'background-color': '#ffffff',
      'border-color': '#dddddd',
    },
  },
  {
    selector: 'node[important = "yes"]',
    style: {
      color: '#c0392b',
      'font-size': 18,
      'font-weight': 'bold',
      padding: '16px',
      'text-max-width': 160,
      'border-width': 2,
      'border-color': '#aaaaaa',
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
    selector: 'node:parent.pan-pass-through',
    style: {
      events: 'no',
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
      'border-width': 2,
      'border-color': '#e74c3c',
      'line-color': '#e74c3c',
      'target-arrow-color': '#e74c3c',
      'z-index': 10,
    },
  },
  {
    selector: 'node.search-match',
    style: {
      opacity: 1,
      'border-width': 3,
      'border-color': '#e74c3c',
      'background-color': '#fff1f0',
      color: '#c0392b',
      'font-weight': 'bold',
      'z-index': 999,
    },
  },
  {
    selector: 'edge.search-match',
    style: {
      opacity: 1,
      width: 3,
      'line-color': '#e74c3c',
      'target-arrow-color': '#e74c3c',
      color: '#c0392b',
      'font-size': 11,
      'font-weight': 'bold',
      'z-index': 998,
    },
  },
  {
    selector: 'node.search-context',
    style: {
      opacity: 1,
      'z-index': 50,
    },
  },
  {
    selector: 'edge.search-context',
    style: {
      opacity: 1,
      'z-index': 40,
    },
  },
  {
    selector: 'edge.highlighted',
    style: {
      width: 2,
      opacity: 1,
      'line-color': '#e74c3c',
      'target-arrow-color': '#e74c3c',
      color: '#c0392b',
    },
  },
  {
    selector: '.dimmed',
    style: {
      opacity: 0.28,
    },
  },
  {
    selector: 'node.selected',
    style: {
      'border-width': 2,
      'border-color': '#27ae60',
      'z-index': 999,
    },
  },
  {
    selector: '.selected',
    style: {
      'border-width': 2,
      'border-color': '#27ae60',
    },
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
    style: {
      'border-width': 2,
      'border-color': '#9b59b6',
    },
  },
  {
    selector: 'node.node-editing',
    style: {
      'text-opacity': 0,
    },
  },
  {
    selector: '.kg-hidden',
    style: {
      display: 'none',
    },
  },
]

export function createGraph(container, { onSelect, onPositionChange } = {}) {
  let spacePressed = false

  function isValidPosition(pos) {
    return (
      pos &&
      typeof pos.x === 'number' &&
      typeof pos.y === 'number' &&
      Number.isFinite(pos.x) &&
      Number.isFinite(pos.y) &&
      (pos.x !== 0 || pos.y !== 0)
    )
  }

  function getValidSavedPosition(nodeId) {
    const pos = savedPositions.get(nodeId)
    return isValidPosition(pos) ? { ...pos } : null
  }

  const cy = cytoscape({
    container,
    style: STYLES,
    minZoom: 0.2,
    maxZoom: 3,
    wheelSensitivity: 0.3,
  })

  // 默认不可拖拽，按住空格后才允许拖动节点/家族
  cy.autolock(false)
  cy.autoungrabify(true)
  cy.userPanningEnabled(true)
  cy.boxSelectionEnabled(false)

  function persistNodePosition(nodeId) {
    const node = cy.getElementById(nodeId)
    if (node.empty()) return
    const pos = node.position()
    if (!isValidPosition(pos)) return
    savedPositions.set(nodeId, { ...pos })
    onPositionChange?.(nodeId, pos, { silent: true })
  }

  function persistAllNodePositions() {
    cy.nodes().forEach((n) => persistNodePosition(n.id()))
  }

  // 默认锁定节点，普通拖拽 = 移动视角；按住空格后解锁，可拖拽节点和家族
  function applyNodeDragMode() {
    // autoungrabify(true) 会覆盖单节点 grabify()，空格模式下必须先关闭
    cy.autoungrabify(!spacePressed)
    cy.userPanningEnabled(true)

    cy.nodes().forEach((n) => {
      try {
        if (spacePressed) {
          n.removeClass('pan-pass-through')
          n.unlock()
          n.grabify()
        } else {
          if (n.isParent()) n.addClass('pan-pass-through')
          else n.removeClass('pan-pass-through')
          n.lock()
          n.ungrabify()
        }
      } catch {}
    })
  }

  applyNodeDragMode()
  container.classList.toggle('space-panning', !spacePressed)

  function isSpaceKey(e) {
    return e.code === 'Space' || e.key === ' '
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
    if (isSpaceKey(e) && !spacePressed) {
      e.preventDefault()
      spacePressed = true
      applyNodeDragMode()
      container.classList.toggle('space-panning', false)
    }
  })

  document.addEventListener('keyup', (e) => {
    if (isSpaceKey(e) && spacePressed) {
      spacePressed = false
      applyNodeDragMode()
      container.classList.toggle('space-panning', true)
    }
  })

  window.addEventListener('blur', () => {
    if (!spacePressed) return
    spacePressed = false
    applyNodeDragMode()
    container.classList.toggle('space-panning', true)
  })

  cy.on('tap', 'node, edge', (evt) => {
    const el = evt.target
    onSelect?.({
      type: el.isNode() ? 'node' : 'edge',
      id: el.id(),
      shiftKey: !!evt.originalEvent?.shiftKey,
    })
  })

  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      onSelect?.(null)
    }
  })

  cy.on('grab', 'node', (evt) => {
    if (!spacePressed) {
      evt.target.ungrabify()
    }
  })

  cy.on('dragfree', 'node', (evt) => {
    if (!spacePressed) return
    persistNodePosition(evt.target.id())
  })

  const pendingPositions = new Map()
  const savedPositions = new Map()

  function clearSavedPositions() {
    savedPositions.clear()
    pendingPositions.clear()
  }

  function elementHasValidPosition(element) {
    return isValidPosition(element?.position) || isValidPosition(getValidSavedPosition(element?.data?.id))
  }

  function ensureTreeLayout(elements) {
    const nodeElems = elements.filter((e) => e.data?.id && !e.data.source)
    const edgeElems = elements.filter((e) => e.data?.source)
    if (!nodeElems.length) return

    const incoming = new Map()
    edgeElems.forEach((e) => {
      incoming.set(e.data.target, e.data.source)
    })

    const roots = nodeElems.filter((n) => !incoming.has(n.data.id))
    const layoutRoots = roots.length ? roots : [nodeElems[0]]
    const center = computeViewportCenter()

    layoutRoots.forEach((root, i) => {
      const id = root.data.id
      if (elementHasValidPosition(root) || getValidSavedPosition(id)) return
      const node = cy.getElementById(id)
      if (node.empty()) return
      applyNodePosition(id, { x: center.x, y: center.y + i * 100 }, { silent: true })
    })

    const queue = [...layoutRoots.map((r) => r.data.id)]
    const seen = new Set()

    while (queue.length) {
      const parentId = queue.shift()
      if (seen.has(parentId)) continue
      seen.add(parentId)

      const parent = cy.getElementById(parentId)
      if (parent.empty()) continue

      const parentElem = nodeElems.find((n) => n.data.id === parentId)
      const parentPos =
        getValidSavedPosition(parentId) ??
        (isValidPosition(parentElem?.position) ? parentElem.position : null) ??
        (isValidPosition(parent.position()) ? parent.position() : null)

      if (!isValidPosition(parentPos)) continue

      const childIds = edgeElems
        .filter((e) => e.data.source === parentId)
        .map((e) => e.data.target)

      childIds.forEach((childId, index) => {
        const childElem = nodeElems.find((n) => n.data.id === childId)
        if (elementHasValidPosition(childElem) || getValidSavedPosition(childId)) {
          queue.push(childId)
          return
        }
        const child = cy.getElementById(childId)
        if (!child.empty()) {
          applyNodePosition(childId, computeChildPositionAt(parentPos, index), { silent: true })
        }
        queue.push(childId)
      })
    }
  }

  function sync(elements, { layout = false } = {}) {
    const elementPositions = new Map()
    elements.forEach((el) => {
      if (el.data?.id && !el.data.source && isValidPosition(el.position)) {
        elementPositions.set(el.data.id, { ...el.position })
      }
    })

    cy.elements().remove()
    cy.add(elements)

    cy.nodes().forEach((n) => {
      const id = n.id()
      const pending = pendingPositions.get(id)
      const fromStore = elementPositions.get(id)
      const cached = getValidSavedPosition(id)
      const saved = pending ?? fromStore ?? cached
      if (saved) {
        n.position(saved)
        savedPositions.set(id, { ...saved })
        pendingPositions.delete(id)
        onPositionChange?.(id, saved, { silent: true })
      }
    })

    ensureTreeLayout(elements)

    applyNodeDragMode()

    if (layout) {
      runLayout()
    }
  }

  function getNodeScreenPosition(nodeId) {
    const node = cy.getElementById(nodeId)
    if (node.empty()) return null

    const bb = node.renderedBoundingBox()
    return {
      x: bb.x1 + bb.w / 2,
      y: bb.y1 + bb.h / 2,
      w: Math.max(bb.w, 60),
      h: bb.h,
    }
  }

  function getEdgeScreenPosition(edgeId) {
    const edge = cy.getElementById(edgeId)
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

  function setLinkSource(nodeId) {
    cy.nodes().removeClass('link-source')
    if (nodeId) cy.getElementById(nodeId).addClass('link-source')
  }

  function clearLinkSource() {
    cy.nodes().removeClass('link-source')
  }

  function setNodeEditing(nodeId, editing) {
    cy.nodes().removeClass('node-editing')
    if (editing && nodeId) {
      cy.getElementById(nodeId).addClass('node-editing')
    }
  }

  function getNodePosition(nodeId) {
    const cached = getValidSavedPosition(nodeId)
    if (cached) return cached

    const node = cy.getElementById(nodeId)
    if (node.empty()) return null
    const pos = node.position()
    return isValidPosition(pos) ? { x: pos.x, y: pos.y } : null
  }

  function ensureNodePosition(nodeId) {
    const cached = getValidSavedPosition(nodeId)
    if (cached) return cached

    const pos = getNodePosition(nodeId)
    if (pos) {
      savedPositions.set(nodeId, { ...pos })
      onPositionChange?.(nodeId, pos, { silent: true })
      return pos
    }

    applyViewportCenterPosition(nodeId, { silent: true })
    return getValidSavedPosition(nodeId) ?? computeViewportCenter()
  }

  function getOutgoingChildCount(parentId) {
    const parent = cy.getElementById(parentId)
    if (parent.empty()) return 0
    return parent.outgoers('node').length
  }

  function computeChildPositionAt(parentPos, childIndex) {
    if (!isValidPosition(parentPos)) {
      return null
    }

    const total = childIndex + 1
    const radius = 180
    const startAngle = -Math.PI / 8
    const angleStep = Math.min(Math.PI / 5, (Math.PI * 1.1) / Math.max(total, 1))
    const angle = startAngle + childIndex * angleStep

    return {
      x: parentPos.x + radius * Math.cos(angle),
      y: parentPos.y + radius * Math.sin(angle),
    }
  }

  function computeChildPosition(parentId, childIndex) {
    return computeChildPositionAt(getNodePosition(parentId), childIndex)
  }

  function computeNearNodePosition(refPos, offsetX = 180) {
    if (!refPos) {
      const center = computeViewportCenter()
      return { x: center.x + offsetX, y: center.y + 48 }
    }
    return { x: refPos.x + offsetX, y: refPos.y + 48 }
  }

  function computeNearNodePositionFromId(refId, offsetX = 180) {
    return computeNearNodePosition(getNodePosition(refId), offsetX)
  }

  function computeViewportCenter() {
    const w = cy.width()
    const h = cy.height()
    const pan = cy.pan()
    const zoom = cy.zoom() || 1
    if (w <= 0 || h <= 0) {
      return { x: 400, y: 300 }
    }
    return {
      x: (w / 2 - pan.x) / zoom,
      y: (h / 2 - pan.y) / zoom,
    }
  }

  function applyNodePosition(nodeId, position, { silent = false } = {}) {
    if (!isValidPosition(position)) return false
    savedPositions.set(nodeId, { ...position })
    pendingPositions.set(nodeId, { ...position })
    onPositionChange?.(nodeId, position, { silent })
    const node = cy.getElementById(nodeId)
    if (node.empty()) return true
    node.position(position)
    pendingPositions.delete(nodeId)
    return true
  }

  function applyChildPosition(parentId, childId, childIndex) {
    return applyNodePosition(childId, computeChildPosition(parentId, childIndex))
  }

  function applyNearNodePosition(refId, nodeId) {
    return applyNodePosition(nodeId, computeNearNodePositionFromId(refId))
  }

  function applyViewportCenterPosition(nodeId, options) {
    return applyNodePosition(nodeId, computeViewportCenter(), options)
  }

  /** 将视口对准节点，只缩小过大缩放，不强行放大以免裁切其他节点 */
  function focusOnNode(nodeId, { padding = 80, maxZoom = 2.5 } = {}) {
    const node = cy.getElementById(nodeId)
    if (node.empty()) return false
    cy.fit(node, padding)
    if (cy.zoom() > maxZoom) cy.zoom(maxZoom)
    cy.center(node)
    return true
  }

  function focusOnNodes(nodeIds, options) {
    if (!nodeIds?.length) return false
    let collection = cy.collection()
    nodeIds.forEach((id) => {
      const node = cy.getElementById(id)
      if (node.nonempty()) collection = collection.union(node)
    })
    if (collection.empty()) return false
    if (collection.length === 1) return focusOnNode(collection[0].id(), options)
    cy.fit(collection, options?.padding ?? 80)
    if (cy.zoom() > (options?.maxZoom ?? 2.5)) cy.zoom(options?.maxZoom ?? 2.5)
    return true
  }

  function fitGraph(padding = 80) {
    if (cy.nodes().empty()) return
    cy.fit(cy.nodes(), padding)
  }

  /** 若节点不在视口内则平移（不放大），避免 Tab 新建时把其他节点挤出屏幕 */
  function panToNodeIfNeeded(nodeId) {
    const node = cy.getElementById(nodeId)
    if (node.empty()) return false

    const zoom = cy.zoom()
    const pan = cy.pan()
    const w = cy.width()
    const h = cy.height()
    if (w <= 0 || h <= 0) return false

    const bb = node.renderedBoundingBox()
    const pad = 48
    const inView =
      bb.x1 >= pad &&
      bb.y1 >= pad &&
      bb.x2 <= w - pad &&
      bb.y2 <= h - pad
    if (inView) return true

    const cx = (bb.x1 + bb.x2) / 2
    const cyPx = (bb.y1 + bb.y2) / 2
    cy.pan({
      x: pan.x + w / 2 - cx,
      y: pan.y + h / 2 - cyPx,
    })
    cy.zoom(zoom)
    return true
  }
  /** 调整视口以包含指定节点；节点较多时 fit 全部，避免只放大局部导致其他节点「消失」 */
  function revealNodes(nodeIds, { padding = 100, maxZoom = 1.25 } = {}) {
    if (!nodeIds?.length) return false

    const totalNodes = cy.nodes().length
    if (totalNodes > nodeIds.length) {
      cy.fit(cy.nodes(), padding)
      if (cy.zoom() > maxZoom) cy.zoom(maxZoom)
      return true
    }

    let collection = cy.collection()
    nodeIds.forEach((id) => {
      const node = cy.getElementById(id)
      if (node.nonempty()) collection = collection.union(node)
    })
    if (collection.empty()) return false
    cy.fit(collection, padding)
    if (cy.zoom() > maxZoom) cy.zoom(maxZoom)
    cy.center(collection)
    return true
  }

  /** 新建图谱后把中心节点锚定到视口中心（只写坐标，不缩放视口） */
  function anchorRootNode(rootNodeId) {
    const center = computeViewportCenter()
    applyNodePosition(rootNodeId, center, { silent: true })
    return center
  }

  function positionNearParent(parentId, childId) {
    const parent = cy.getElementById(parentId)
    if (parent.empty()) return false
    const childIndex = Math.max(0, parent.outgoers('node').length - 1)
    return applyChildPosition(parentId, childId, childIndex)
  }

  function positionNearNode(refId, nodeId, offsetX = 180) {
    return applyNodePosition(nodeId, computeNearNodePositionFromId(refId, offsetX))
  }

  function positionAtViewportCenter(nodeId) {
    return applyViewportCenterPosition(nodeId)
  }

  function setHighlight(ids) {
    cy.elements().removeClass('highlighted dimmed search-match search-context')
    if (!ids.length) return

    let primary = cy.collection()
    ids.forEach((id) => {
      const el = cy.getElementById(id)
      if (el.nonempty()) primary = primary.union(el)
    })

    if (primary.empty()) return

    // 命中项 + 1 跳邻居 + compound 父节点，便于看清箭头两端
    let visible = primary
    primary.nodes().forEach((node) => {
      visible = visible
        .union(node.connectedEdges())
        .union(node.neighborhood('node'))
        .union(node.ancestors())
    })
    primary.edges().forEach((edge) => {
      visible = visible
        .union(edge.source())
        .union(edge.target())
        .union(edge.source().ancestors())
        .union(edge.target().ancestors())
    })

    cy.elements().addClass('dimmed')
    visible.removeClass('dimmed').addClass('search-context')
    primary.removeClass('search-context dimmed').addClass('search-match')

    cy.animate({ fit: { eles: visible, padding: 80 }, duration: 300 })
  }

  function clearHighlight() {
    cy.elements().removeClass('highlighted dimmed search-match search-context')
  }

  function setSelected(id) {
    cy.elements().removeClass('selected')
    if (id) cy.getElementById(id).addClass('selected')
  }

  function runLayout() {
    cy.nodes().forEach((n) => {
      try { n.unlock() } catch {}
      try { n.grabify() } catch {}
    })

    const layout = cy.layout(LAYOUT_OPTIONS)
    layout.run()
    layout.on('layoutstop', () => {
      persistAllNodePositions()
      applyNodeDragMode()
    })
  }

  function setVisibleNodeSet(visibleNodeIds) {
    const allowed = new Set(visibleNodeIds)

    // 若节点在 compound 分组里，父节点也必须可见，否则子节点会一起消失
    Array.from(allowed).forEach((id) => {
      const node = cy.getElementById(id)
      if (node.nonempty()) {
        node.ancestors().forEach((a) => allowed.add(a.id()))
      }
    })

    cy.nodes().forEach((n) => {
      if (allowed.has(n.id())) n.removeClass('kg-hidden')
      else n.addClass('kg-hidden')
    })

    cy.edges().forEach((e) => {
      const s = e.source().id()
      const t = e.target().id()
      if (allowed.has(s) && allowed.has(t)) e.removeClass('kg-hidden')
      else e.addClass('kg-hidden')
    })
  }

  function resetView() {
    cy.elements().removeClass('kg-hidden')
  }

  function showRelated(nodeId) {
    const center = cy.getElementById(nodeId)
    if (center.empty()) return

    // 先恢复全量，避免“隐藏状态”影响邻居计算
    resetView()

    const visible = new Set([nodeId])

    // 遍历全量边，精确取入/出边两端点（1跳）
    cy.edges().forEach((e) => {
      const s = e.source().id()
      const t = e.target().id()
      if (s === nodeId || t === nodeId) {
        visible.add(s)
        visible.add(t)
      }
    })

    setVisibleNodeSet(visible)
  }

  return {
    cy,
    sync,
    setHighlight,
    clearHighlight,
    setSelected,
    runLayout,
    getNodeScreenPosition,
    getEdgeScreenPosition,
    getNodePosition,
    ensureNodePosition,
    clearSavedPositions,
    getOutgoingChildCount,
    computeChildPositionAt,
    computeNearNodePosition,
    applyNodePosition,
    applyChildPosition,
    applyNearNodePosition,
    applyViewportCenterPosition,
    getViewportCenter: computeViewportCenter,
    focusOnNode,
    focusOnNodes,
    fitGraph,
    revealNodes,
    panToNodeIfNeeded,
    anchorRootNode,
    positionNearParent,
    positionNearNode,
    positionAtViewportCenter,
    setLinkSource,
    clearLinkSource,
    setNodeEditing,
    showRelated,
    resetView,
  }
}
