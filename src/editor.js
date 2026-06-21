/** XMind 风格内联编辑：点击节点直接输入，Tab 子节点，Enter 同级节点 */

export function createInlineEditor(store, graph) {
  const container = document.getElementById('cy')
  const overlayRoot = document.getElementById('editor-layer') ?? container
  let selectedNodeId = null
  let selectedEdgeId = null
  let editingNodeId = null
  let editingEdgeId = null
  let linkSourceId = null
  let isComposing = false
  let editStartLabel = ''
  const textHistory = []
  let textHistoryIndex = -1

  const overlay = document.createElement('div')
  overlay.className = 'inline-editor node-editor'
  overlay.innerHTML = '<textarea rows="1" spellcheck="false" autocomplete="off"></textarea>'
  overlayRoot.appendChild(overlay)

  const edgeOverlay = document.createElement('div')
  edgeOverlay.className = 'inline-editor edge-editor'
  edgeOverlay.innerHTML = '<input type="text" spellcheck="false" autocomplete="off" placeholder="关系类型" />'
  overlayRoot.appendChild(edgeOverlay)

  const nodeInput = overlay.querySelector('textarea')
  const edgeInput = edgeOverlay.querySelector('input')

  function isInputFocused() {
    return document.activeElement === nodeInput || document.activeElement === edgeInput
  }

  function isBlockedTarget(el) {
    return el?.closest('#sidebar input, #sidebar select, #sidebar textarea, #sidebar button')
  }

  function isUndoShortcut(e) {
    return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'
  }

  function recordTextState() {
    const value = nodeInput.value
    if (textHistory[textHistoryIndex] === value) return
    textHistory.splice(textHistoryIndex + 1)
    textHistory.push(value)
    textHistoryIndex = textHistory.length - 1
  }

  function resetTextHistory(value) {
    textHistory.length = 0
    textHistory.push(value)
    textHistoryIndex = 0
  }

  function undoText() {
    if (textHistoryIndex <= 0) return false
    textHistoryIndex -= 1
    nodeInput.value = textHistory[textHistoryIndex]
    return true
  }

  function redoText() {
    if (textHistoryIndex >= textHistory.length - 1) return false
    textHistoryIndex += 1
    nodeInput.value = textHistory[textHistoryIndex]
    return true
  }

  function updateOverlayPosition(nodeId) {
    const pos = graph.getNodeScreenPosition(nodeId)
    if (!pos) {
      hideOverlay()
      return false
    }
    overlay.style.left = `${pos.x}px`
    overlay.style.top = `${pos.y}px`
    overlay.style.width = `${pos.w}px`
    overlay.style.height = `${pos.h}px`
    return true
  }

  function focusNodeInputAtEnd() {
    nodeInput.focus()
    const len = nodeInput.value.length
    nodeInput.setSelectionRange(len, len)
  }

  function selectNode(id) {
    selectedNodeId = id
    graph.setSelected(id)
  }

  function deselect() {
    selectedNodeId = null
    stopEdit()
    clearEdgeSelection()
    cancelLinkMode()
    graph.setSelected(null)
    hideOverlay()
  }

  function hideEdgeOverlay() {
    edgeOverlay.classList.remove('visible', 'editing')
  }

  function applyNodeEditorClasses(node) {
    overlay.classList.toggle('important-node', node?.important === 'yes')
    overlay.classList.toggle('male-node', node?.gender === 'm')
    overlay.classList.toggle('female-node', node?.gender === 'f')
  }

  function hideOverlay() {
    overlay.classList.remove('visible', 'editing', 'important-node', 'male-node', 'female-node')
    graph.setNodeEditing(null, false)
  }

  function showNodeEditor(nodeId) {
    const node = store.getNode(nodeId)
    if (!node || !updateOverlayPosition(nodeId)) return

    nodeInput.value = node.label
    resetTextHistory(node.label)
    applyNodeEditorClasses(node)
    overlay.classList.add('visible', 'editing')
    graph.setNodeEditing(nodeId, true)
  }

  function clearEdgeSelection() {
    selectedEdgeId = null
    editingEdgeId = null
    hideEdgeOverlay()
  }

  function cancelLinkMode() {
    linkSourceId = null
    graph.clearLinkSource()
    container.classList.remove('link-mode')
  }

  function startLinkMode() {
    if (!selectedNodeId) {
      showToast('请先选中源节点', true)
      return
    }
    if (editingNodeId) commitEdit()
    clearEdgeSelection()
    linkSourceId = selectedNodeId
    graph.setLinkSource(linkSourceId)
    container.classList.add('link-mode')
    showToast('点击目标节点建立关系')
  }

  function linkNodes(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return false
    if (editingNodeId) commitEdit()

    try {
      const edgeId = store.addEdge({ source: sourceId, target: targetId, type: '关联' })
      cancelLinkMode()
      clearEdgeSelection()
      selectedNodeId = null
      hideOverlay()
      selectedEdgeId = edgeId
      graph.setSelected(edgeId)
      showEdgeEditor(edgeId, { focus: true })
      showToast('已建立关系')
      return true
    } catch (e) {
      showToast(e.message, true)
      return false
    }
  }

  function updateEdgeOverlayPosition(edgeId) {
    const pos = graph.getEdgeScreenPosition(edgeId)
    if (!pos) {
      hideEdgeOverlay()
      return false
    }
    edgeOverlay.style.left = `${pos.x}px`
    edgeOverlay.style.top = `${pos.y}px`
    edgeOverlay.style.width = `${pos.w}px`
    return true
  }

  function showEdgeEditor(edgeId, { focus = false } = {}) {
    const edge = store.getEdge(edgeId)
    if (!edge) return

    hideOverlay()
    selectedEdgeId = edgeId
    if (!updateEdgeOverlayPosition(edgeId)) return

    edgeInput.value = edge.type
    edgeInput.readOnly = !focus
    edgeOverlay.classList.toggle('editing', focus)
    edgeOverlay.classList.add('visible')
    if (focus) {
      editingEdgeId = edgeId
      edgeInput.focus()
      edgeInput.select()
    }
  }

  function startEdgeEdit(edgeId = selectedEdgeId) {
    if (!edgeId) return
    editingEdgeId = edgeId
    showEdgeEditor(edgeId, { focus: true })
  }

  function commitEdgeEdit() {
    if (!editingEdgeId) return true
    const type = edgeInput.value.trim()
    if (!type) {
      showToast('关系类型不能为空', true)
      edgeInput.focus()
      return false
    }
    try {
      store.updateEdge(editingEdgeId, { type })
      editingEdgeId = null
      edgeInput.readOnly = true
      edgeOverlay.classList.remove('editing')
      return true
    } catch (e) {
      showToast(e.message, true)
      return false
    }
  }

  function deleteSelectedEdge() {
    if (!selectedEdgeId) return
    store.deleteEdge(selectedEdgeId)
    clearEdgeSelection()
    graph.setSelected(null)
  }

  function startEdit(nodeId = selectedNodeId) {
    if (!nodeId) return
    const node = store.getNode(nodeId)
    if (!node) return

    editingNodeId = nodeId
    selectedNodeId = nodeId
    editStartLabel = node.label
    graph.setSelected(nodeId)
    showNodeEditor(nodeId)
    nodeInput.readOnly = false
    requestAnimationFrame(() => focusNodeInputAtEnd())
  }

  function stopEdit() {
    editingNodeId = null
    graph.setNodeEditing(null, false)
    nodeInput.readOnly = true
    overlay.classList.remove('editing')
    nodeInput.blur()
    hideOverlay()
  }

  function commitEdit() {
    if (!editingNodeId) return true
    const label = nodeInput.value.trim()
    if (!label) {
      showToast('节点名称不能为空', true)
      nodeInput.focus()
      return false
    }
    try {
      store.updateNode(editingNodeId, { label })
      graph.setNodeEditing(null, false)
      editingNodeId = null
      hideOverlay()
      return true
    } catch (e) {
      showToast(e.message, true)
      return false
    }
  }

  function applyGraphHistory(action) {
    const keepNodeId = selectedNodeId
    const wasEditing = !!editingNodeId
    editingNodeId = null

    const ok = action()
    if (!ok) return false

    if (keepNodeId && store.getNode(keepNodeId)) {
      selectedNodeId = keepNodeId
      graph.setSelected(keepNodeId)
      if (wasEditing) startEdit(keepNodeId)
      else hideOverlay()
      return true
    }

    const nodes = store.getAllNodes()
    if (nodes.length > 0) {
      selectedNodeId = nodes[0].id
      graph.setSelected(selectedNodeId)
      hideOverlay()
    } else {
      selectedNodeId = null
      hideOverlay()
      graph.setSelected(null)
    }
    return true
  }

  function handleUndo() {
    if (editingNodeId) {
      if (undoText()) return
      applyGraphHistory(() => store.undo())
      return
    }
    applyGraphHistory(() => store.undo())
  }

  function handleRedo() {
    if (editingNodeId) {
      if (redoText()) return
      applyGraphHistory(() => store.redo())
      return
    }
    applyGraphHistory(() => store.redo())
  }

  function beginEditNode(nodeId) {
    selectNode(nodeId)
    startEdit(nodeId)
    requestAnimationFrame(() => {
      if (editingNodeId === nodeId) updateOverlayPosition(nodeId)
    })
  }

  function resolveNodePosition(nodeId) {
    let stored = store.getStoredNodePosition(nodeId)
    if (!stored) {
      stored = graph.getViewportCenter()
      store.setNodePosition(nodeId, stored.x, stored.y, { silent: true })
    }
    graph.applyNodePosition(nodeId, stored, { silent: true })
    return stored
  }

  function createChild(fromId = selectedNodeId) {
    if (!fromId) return null
    if (!commitEdit()) return null

    const parentPos = resolveNodePosition(fromId)
    store.setNodePosition(fromId, parentPos.x, parentPos.y, { silent: true })
    const childIndex = graph.getOutgoingChildCount(fromId)
    const position = graph.computeChildPositionAt(parentPos, childIndex)
    if (!position) return null

    const childId = store.addChildNode(fromId, '新节点', (id) => {
      graph.applyNodePosition(id, position, { silent: true })
    })
    graph.panToNodeIfNeeded(childId)
    beginEditNode(childId)
    return childId
  }

  function createSibling(fromId = selectedNodeId) {
    if (!fromId) return null
    if (!commitEdit()) return null

    const parentId = store.getParentId(fromId) ?? fromId
    const parentPos = resolveNodePosition(parentId)
    const siblingIndex = graph.getOutgoingChildCount(parentId)
    const position = graph.computeChildPositionAt(parentPos, siblingIndex)
    store.setNodePosition(parentId, parentPos.x, parentPos.y, { silent: true })
    if (!position) return null

    const siblingId = store.addSiblingNode(fromId, '新节点', (id) => {
      graph.applyNodePosition(id, position, { silent: true })
    })
    graph.panToNodeIfNeeded(siblingId)
    beginEditNode(siblingId)
    return siblingId
  }

  function deleteSelected() {
    if (selectedEdgeId && !isInputFocused()) {
      deleteSelectedEdge()
      return
    }
    if (!selectedNodeId || isInputFocused()) return
    const node = store.getNode(selectedNodeId)
    if (!node) return

    store.deleteNode(selectedNodeId)
    selectedNodeId = null
    hideOverlay()
    graph.setSelected(null)
  }

  function onNodeSelect(nodeId, { shiftLink = false } = {}) {
    if (linkSourceId) {
      if (linkSourceId === nodeId) {
        cancelLinkMode()
        showToast('已取消关联')
        return
      }
      linkNodes(linkSourceId, nodeId)
      return
    }

    if (shiftLink && selectedNodeId && selectedNodeId !== nodeId) {
      linkNodes(selectedNodeId, nodeId)
      return
    }

    if (editingNodeId && editingNodeId !== nodeId) {
      if (!commitEdit()) {
        nodeInput.value = editStartLabel
        stopEdit()
      }
    }
    if (editingEdgeId) commitEdgeEdit()

    clearEdgeSelection()
    cancelLinkMode()
    selectedNodeId = nodeId
    graph.setSelected(nodeId)
    hideOverlay()
  }

  function onEdgeSelect(edgeId) {
    if (editingNodeId) commitEdit()
    cancelLinkMode()

    selectedNodeId = null
    hideOverlay()
    selectedEdgeId = edgeId
    graph.setSelected(edgeId)
    showEdgeEditor(edgeId)
  }

  function onCanvasDeselect() {
    if (editingNodeId) commitEdit()
    if (editingEdgeId) commitEdgeEdit()
    cancelLinkMode()
    selectedNodeId = null
    clearEdgeSelection()
    hideOverlay()
    graph.setSelected(null)
  }

  function onStoreUpdate() {
    if (selectedNodeId && !store.getNode(selectedNodeId)) {
      selectedNodeId = null
      editingNodeId = null
      hideOverlay()
    }
    if (selectedEdgeId && !store.getEdge(selectedEdgeId)) {
      clearEdgeSelection()
    }
    if (linkSourceId && !store.getNode(linkSourceId)) {
      cancelLinkMode()
    }
    if (editingEdgeId && document.activeElement === edgeInput) {
      updateEdgeOverlayPosition(editingEdgeId)
      return
    }
    if (editingNodeId && document.activeElement === nodeInput) {
      updateOverlayPosition(editingNodeId)
      return
    }
    if (selectedEdgeId) showEdgeEditor(selectedEdgeId)
  }

  edgeInput.addEventListener('mousedown', (e) => {
    if (!editingEdgeId && selectedEdgeId) {
      e.preventDefault()
      startEdgeEdit(selectedEdgeId)
    }
  })

  edgeInput.addEventListener('keydown', (e) => {
    if (isComposing) return
    if (isUndoShortcut(e)) return

    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdgeEdit()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      const edge = selectedEdgeId ? store.getEdge(selectedEdgeId) : null
      if (edge) edgeInput.value = edge.type
      editingEdgeId = null
      edgeInput.readOnly = true
      edgeOverlay.classList.remove('editing')
      edgeInput.blur()
    }
  })

  edgeInput.addEventListener('blur', () => {
    if (editingEdgeId) commitEdgeEdit()
    editingEdgeId = null
  })

  nodeInput.addEventListener('input', () => {
    if (editingNodeId) recordTextState()
  })

  nodeInput.addEventListener('compositionstart', () => {
    isComposing = true
  })
  nodeInput.addEventListener('compositionend', () => {
    isComposing = false
    if (editingNodeId) recordTextState()
  })

  nodeInput.addEventListener('keydown', (e) => {
    if (isComposing) return

    if (isUndoShortcut(e)) {
      e.preventDefault()
      if (e.shiftKey) handleRedo()
      else handleUndo()
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      createChild()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (commitEdit()) createSibling()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      nodeInput.value = editStartLabel
      resetTextHistory(editStartLabel)
      stopEdit()
      return
    }
  })

  nodeInput.addEventListener('blur', () => {
    if (editingNodeId) commitEdit()
    editingNodeId = null
  })

  document.addEventListener('keydown', (e) => {
    if (isBlockedTarget(e.target)) return
    if (isComposing) return

    if (isUndoShortcut(e)) {
      if (isInputFocused() && editingNodeId) return
      e.preventDefault()
      if (e.shiftKey) handleRedo()
      else handleUndo()
      return
    }

    if (e.key === 'l' || e.key === 'L') {
      if (!isInputFocused()) {
        e.preventDefault()
        startLinkMode()
      }
      return
    }

    if (e.key === 'Escape' && !isInputFocused()) {
      if (linkSourceId) {
        e.preventDefault()
        cancelLinkMode()
        showToast('已取消关联')
        return
      }
    }

    if (e.key === 'Tab' && !isInputFocused()) {
      e.preventDefault()
      if (!selectedNodeId) {
        const nodes = store.getAllNodes()
        if (nodes.length === 0) {
          const id = store.addChildNode(null, '新节点', (nodeId) => {
            graph.applyViewportCenterPosition(nodeId, { silent: true })
          })
          beginEditNode(id)
        } else {
          selectNode(nodes[0].id)
          createChild(nodes[0].id)
        }
      } else {
        createChild()
      }
      return
    }

    if ((e.key === 'Enter' || e.key === 'F2') && !isInputFocused()) {
      e.preventDefault()
      if (selectedEdgeId) startEdgeEdit()
      else if (selectedNodeId) startEdit()
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused()) {
      e.preventDefault()
      deleteSelected()
      return
    }

    if (
      selectedNodeId &&
      !editingNodeId &&
      !isInputFocused() &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      e.preventDefault()
      startEdit()
      nodeInput.value = e.key
      resetTextHistory(e.key)
      nodeInput.setSelectionRange(1, 1)
    }
  })

  graph.cy.on('dbltap', 'node', (evt) => {
    startEdit(evt.target.id())
  })

  graph.cy.on('dbltap', 'edge', (evt) => {
    onEdgeSelect(evt.target.id())
    startEdgeEdit(evt.target.id())
  })

  graph.cy.on('pan zoom resize', () => {
    if (editingNodeId && overlay.classList.contains('visible')) {
      updateOverlayPosition(editingNodeId)
    }
    if (selectedEdgeId && edgeOverlay.classList.contains('visible')) {
      updateEdgeOverlayPosition(selectedEdgeId)
    }
  })

  return { onNodeSelect, onEdgeSelect, onCanvasDeselect, onStoreUpdate, selectNode, deselect }
}

function showToast(message, isError = false) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.className = `toast show${isError ? ' error' : ''}`
  clearTimeout(showToast._timer)
  showToast._timer = setTimeout(() => {
    toast.className = 'toast'
  }, 2500)
}
