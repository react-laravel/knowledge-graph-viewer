/** XMind 风格内联编辑：点击节点直接输入，Tab 子节点，Enter 同级节点 */

export class InlineEditor {
  constructor(store, graph) {
    this.store = store
    this.graph = graph

    this.container = document.getElementById('cy')
    this.overlayRoot = document.getElementById('editor-layer') ?? this.container

    // 状态
    this.selectedNodeId = null
    this.selectedEdgeId = null
    this.editingNodeId = null
    this.editingEdgeId = null
    this.linkSourceId = null
    this.isComposing = false
    this.editStartLabel = ''
    this.textHistory = []
    this.textHistoryIndex = -1

    // DOM
    this._initOverlays()
    this._initEvents()
  }

  // === DOM 初始化 ===

  _initOverlays() {
    const overlay = document.createElement('div')
    overlay.className = 'inline-editor node-editor'
    overlay.innerHTML = '<textarea rows="1" spellcheck="false" autocomplete="off"></textarea>'
    this.overlayRoot.appendChild(overlay)

    const edgeOverlay = document.createElement('div')
    edgeOverlay.className = 'inline-editor edge-editor'
    edgeOverlay.innerHTML = '<input type="text" spellcheck="false" autocomplete="off" placeholder="关系类型" />'
    this.overlayRoot.appendChild(edgeOverlay)

    this.overlay = overlay
    this.edgeOverlay = edgeOverlay
    this.nodeInput = overlay.querySelector('textarea')
    this.edgeInput = edgeOverlay.querySelector('input')
  }

  // === 事件绑定 ===

  _initEvents() {
    // Edge input 事件
    this.edgeInput.addEventListener('mousedown', (e) => {
      if (!this.editingEdgeId && this.selectedEdgeId) {
        e.preventDefault()
        this.startEdgeEdit(this.selectedEdgeId)
      }
    })

    this.edgeInput.addEventListener('keydown', (e) => {
      if (this.isComposing) return
      if (this._isUndoShortcut(e)) return

      if (e.key === 'Enter') {
        e.preventDefault()
        this.commitEdgeEdit()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        const edge = this.selectedEdgeId ? this.store.getEdge(this.selectedEdgeId) : null
        if (edge) this.edgeInput.value = edge.type
        this.editingEdgeId = null
        this.edgeInput.readOnly = true
        this.edgeOverlay.classList.remove('editing')
        this.edgeInput.blur()
      }
    })

    this.edgeInput.addEventListener('blur', () => {
      if (this.editingEdgeId) this.commitEdgeEdit()
      this.editingEdgeId = null
    })

    // Node input 事件
    this.nodeInput.addEventListener('input', () => {
      if (this.editingNodeId) this._recordTextState()
    })

    this.nodeInput.addEventListener('compositionstart', () => {
      this.isComposing = true
    })

    this.nodeInput.addEventListener('compositionend', () => {
      this.isComposing = false
      if (this.editingNodeId) this._recordTextState()
    })

    this.nodeInput.addEventListener('keydown', (e) => {
      if (this.isComposing) return

      if (this._isUndoShortcut(e)) {
        e.preventDefault()
        if (e.shiftKey) this.handleRedo()
        else this.handleUndo()
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        this.createChild()
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (this.commitEdit()) this.createSibling()
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        this.nodeInput.value = this.editStartLabel
        this._resetTextHistory(this.editStartLabel)
        this.stopEdit()
        return
      }
    })

    this.nodeInput.addEventListener('blur', () => {
      if (this.editingNodeId) this.commitEdit()
      this.editingNodeId = null
    })

    // 全局键盘事件
    document.addEventListener('keydown', (e) => {
      if (this._isBlockedTarget(e.target)) return
      if (this.isComposing) return

      if (this._isUndoShortcut(e)) {
        if (this._isInputFocused() && this.editingNodeId) return
        e.preventDefault()
        if (e.shiftKey) this.handleRedo()
        else this.handleUndo()
        return
      }

      if (e.key === 'l' || e.key === 'L') {
        if (!this._isInputFocused()) {
          e.preventDefault()
          this.startLinkMode()
        }
        return
      }

      if (e.key === 'Escape' && !this._isInputFocused()) {
        if (this.linkSourceId) {
          e.preventDefault()
          this.cancelLinkMode()
          InlineEditor.showToast('已取消关联')
          return
        }
        // 没有 link mode 时，取消当前选中
        e.preventDefault()
        this.onCanvasDeselect()
        this.onDeselect?.()
        return
      }

      if (e.key === 'Tab' && !this._isInputFocused()) {
        e.preventDefault()
        if (!this.selectedNodeId) {
          const nodes = this.store.getAllNodes()
          if (nodes.length === 0) {
            const id = this.store.addChildNode(null, '新节点')
            this.selectNode(id)
            this.startEdit(id)
          } else {
            this.selectNode(nodes[0].id)
            this.createChild(nodes[0].id)
          }
        } else {
          this.createChild()
        }
        return
      }

      if (e.key === 'Enter' && !this._isInputFocused()) {
        e.preventDefault()
        if (this.selectedEdgeId) this.startEdgeEdit()
        else if (this.selectedNodeId) this.startEdit()
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && !this._isInputFocused()) {
        e.preventDefault()
        this.deleteSelected()
        return
      }

      if (
        this.selectedNodeId &&
        !this.editingNodeId &&
        !this._isInputFocused() &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        this.startEdit()
        this.nodeInput.value = e.key
        this._resetTextHistory(e.key)
        this.nodeInput.setSelectionRange(1, 1)
      }
    })

    // Cytoscape 双击：累加展开（单击聚焦由视图管理器处理）
    this.graph.cy.on('dbltap', 'node', (evt) => {
      const id = evt.target.id()
      if (this.onNodeExpand) {
        this.onNodeExpand(id)
        return
      }
      this.startEdit(id)
    })

    this.graph.cy.on('dbltap', 'edge', (evt) => {
      this.onEdgeSelect(evt.target.id())
      this.startEdgeEdit(evt.target.id())
    })

    // 平移/缩放时更新编辑器位置
    this.graph.cy.on('pan zoom resize', () => {
      if (this.editingNodeId && this.overlay.classList.contains('visible')) {
        this._updateOverlayPosition(this.editingNodeId)
      }
      if (this.selectedEdgeId && this.edgeOverlay.classList.contains('visible')) {
        this._updateEdgeOverlayPosition(this.selectedEdgeId)
      }
    })
  }

  // === 辅助方法 ===

  _isInputFocused() {
    return document.activeElement === this.nodeInput || document.activeElement === this.edgeInput
  }

  _isBlockedTarget(el) {
    return el?.closest('#sidebar input, #sidebar select, #sidebar textarea, #sidebar button')
  }

  _isUndoShortcut(e) {
    return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z'
  }

  _recordTextState() {
    const value = this.nodeInput.value
    if (this.textHistory[this.textHistoryIndex] === value) return
    this.textHistory.splice(this.textHistoryIndex + 1)
    this.textHistory.push(value)
    this.textHistoryIndex = this.textHistory.length - 1
  }

  _resetTextHistory(value) {
    this.textHistory.length = 0
    this.textHistory.push(value)
    this.textHistoryIndex = 0
  }

  _undoText() {
    if (this.textHistoryIndex <= 0) return false
    this.textHistoryIndex -= 1
    this.nodeInput.value = this.textHistory[this.textHistoryIndex]
    return true
  }

  _redoText() {
    if (this.textHistoryIndex >= this.textHistory.length - 1) return false
    this.textHistoryIndex += 1
    this.nodeInput.value = this.textHistory[this.textHistoryIndex]
    return true
  }

  _updateOverlayPosition(nodeId) {
    const pos = this.graph.getNodeScreenPosition(nodeId)
    if (!pos) {
      this.hideOverlay()
      return false
    }
    this.overlay.style.left = `${pos.x}px`
    this.overlay.style.top = `${pos.y}px`
    this.overlay.style.width = `${pos.w}px`
    this.overlay.style.height = `${pos.h}px`
    if (pos.fontSize) this.nodeInput.style.fontSize = `${pos.fontSize}px`
    if (pos.fontFamily) this.nodeInput.style.fontFamily = pos.fontFamily
    if (pos.fontWeight) this.nodeInput.style.fontWeight = pos.fontWeight
    if (pos.color) {
      this.nodeInput.style.color = pos.color
      this.nodeInput.style.caretColor = pos.color
    }
    return true
  }

  _updateEdgeOverlayPosition(edgeId) {
    const pos = this.graph.getEdgeScreenPosition(edgeId)
    if (!pos) {
      this.hideEdgeOverlay()
      return false
    }
    this.edgeOverlay.style.left = `${pos.x}px`
    this.edgeOverlay.style.top = `${pos.y}px`
    this.edgeOverlay.style.width = `${pos.w}px`
    return true
  }

  static showToast(message, isError = false) {
    const toast = document.getElementById('toast')
    toast.textContent = message
    toast.className = `toast show${isError ? ' error' : ''}`
    clearTimeout(InlineEditor._toastTimer)
    InlineEditor._toastTimer = setTimeout(() => {
      toast.className = 'toast'
    }, 2500)
  }

  // === 公开 API ===

  selectNode(id) {
    this.selectedNodeId = id
    this.graph.setSelected(id)
  }

  deselect() {
    this.selectedNodeId = null
    this.stopEdit()
    this.clearEdgeSelection()
    this.cancelLinkMode()
    this.graph.setSelected(null)
    this.hideOverlay()
  }

  hideOverlay() {
    this.overlay.classList.remove('visible', 'editing', 'important-node', 'male-node', 'female-node')
    this.graph.setNodeEditing(null, false)
  }

  hideEdgeOverlay() {
    this.edgeOverlay.classList.remove('visible', 'editing')
  }

  showNodeEditor(nodeId) {
    const node = this.store.getNode(nodeId)
    if (!node || !this._updateOverlayPosition(nodeId)) return

    this.nodeInput.value = node.label
    this._resetTextHistory(node.label)
    // 先清除所有状态类再添加当前需要的
    this.overlay.classList.remove('important-node', 'male-node', 'female-node')
    if (node.important === 'yes') this.overlay.classList.add('important-node')
    if (node.gender === 'm') this.overlay.classList.add('male-node')
    if (node.gender === 'f') this.overlay.classList.add('female-node')
    this.overlay.classList.add('visible', 'editing')
    this.graph.setNodeEditing(nodeId, true)
  }

  clearEdgeSelection() {
    this.selectedEdgeId = null
    this.editingEdgeId = null
    this.hideEdgeOverlay()
  }

  cancelLinkMode() {
    this.linkSourceId = null
    this.graph.clearLinkSource()
    this.container.classList.remove('link-mode')
  }

  startLinkMode() {
    if (!this.selectedNodeId) {
      InlineEditor.showToast('请先选中源节点', true)
      return
    }
    if (this.editingNodeId) this.commitEdit()
    this.clearEdgeSelection()
    this.linkSourceId = this.selectedNodeId
    this.graph.setLinkSource(this.linkSourceId)
    this.container.classList.add('link-mode')
    InlineEditor.showToast('点击目标节点建立关系')
  }

  linkNodes(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return false
    if (this.editingNodeId) this.commitEdit()

    try {
      const edgeId = this.store.addEdge({ source: sourceId, target: targetId, type: '关联' })
      this.cancelLinkMode()
      this.clearEdgeSelection()
      this.selectedNodeId = null
      this.hideOverlay()
      this.selectedEdgeId = edgeId
      this.graph.setSelected(edgeId)
      this.showEdgeEditor(edgeId, { focus: true })
      InlineEditor.showToast('已建立关系')
      return true
    } catch (e) {
      InlineEditor.showToast(e.message, true)
      return false
    }
  }

  showEdgeEditor(edgeId, { focus = false } = {}) {
    const edge = this.store.getEdge(edgeId)
    if (!edge) return

    this.hideOverlay()
    this.selectedEdgeId = edgeId
    if (!this._updateEdgeOverlayPosition(edgeId)) return

    this.edgeInput.value = edge.type
    this.edgeInput.readOnly = !focus
    this.edgeOverlay.classList.toggle('editing', focus)
    this.edgeOverlay.classList.add('visible')
    if (focus) {
      this.editingEdgeId = edgeId
      this.edgeInput.focus()
      this.edgeInput.select()
    }
  }

  startEdgeEdit(edgeId) {
    if (!edgeId) return
    this.editingEdgeId = edgeId
    this.showEdgeEditor(edgeId, { focus: true })
  }

  commitEdgeEdit() {
    if (!this.editingEdgeId) return true
    const type = this.edgeInput.value.trim()
    if (!type) {
      InlineEditor.showToast('关系类型不能为空', true)
      this.edgeInput.focus()
      return false
    }
    try {
      this.store.updateEdge(this.editingEdgeId, { type })
      this.editingEdgeId = null
      this.edgeInput.readOnly = true
      this.edgeOverlay.classList.remove('editing')
      return true
    } catch (e) {
      InlineEditor.showToast(e.message, true)
      return false
    }
  }

  startEdit(nodeId) {
    if (!nodeId) return
    const node = this.store.getNode(nodeId)
    if (!node) return

    this.editingNodeId = nodeId
    this.selectedNodeId = nodeId
    this.editStartLabel = node.label
    this.graph.setSelected(nodeId)
    this.showNodeEditor(nodeId)
    this.nodeInput.readOnly = false
    requestAnimationFrame(() => {
      this.nodeInput.focus()
      const len = this.nodeInput.value.length
      this.nodeInput.setSelectionRange(len, len)
    })
  }

  stopEdit() {
    this.editingNodeId = null
    this.graph.setNodeEditing(null, false)
    this.nodeInput.readOnly = true
    this.overlay.classList.remove('editing')
    this.nodeInput.blur()
    this.hideOverlay()
  }

  commitEdit() {
    if (!this.editingNodeId) return true
    const label = this.nodeInput.value.trim()
    if (!label) {
      InlineEditor.showToast('节点名称不能为空', true)
      this.nodeInput.focus()
      return false
    }
    try {
      this.store.updateNode(this.editingNodeId, { label })
      this.graph.setNodeEditing(null, false)
      this.editingNodeId = null
      this.hideOverlay()
      return true
    } catch (e) {
      InlineEditor.showToast(e.message, true)
      return false
    }
  }

  handleUndo() {
    if (this.editingNodeId) {
      if (this._undoText()) return
      this._applyGraphHistory(() => this.store.undo())
      return
    }
    this._applyGraphHistory(() => this.store.undo())
  }

  handleRedo() {
    if (this.editingNodeId) {
      if (this._redoText()) return
      this._applyGraphHistory(() => this.store.redo())
      return
    }
    this._applyGraphHistory(() => this.store.redo())
  }

  createChild(fromId = this.selectedNodeId) {
    if (!fromId) return null
    if (!this.commitEdit()) return null

    const childId = this.store.addChildNode(fromId)
    this.graph.positionNearParent(fromId, childId)
    this.selectNode(childId)
    this.startEdit(childId)
    return childId
  }

  createSibling(fromId = this.selectedNodeId) {
    if (!fromId) return null
    if (!this.commitEdit()) return null

    const siblingId = this.store.addSiblingNode(fromId)
    const parentId = this.store.getParentId(fromId)
    if (parentId) this.graph.positionNearParent(parentId, siblingId)
    this.selectNode(siblingId)
    this.startEdit(siblingId)
    return siblingId
  }

  deleteSelected() {
    if (this.selectedEdgeId && !this._isInputFocused()) {
      this.store.deleteEdge(this.selectedEdgeId)
      this.clearEdgeSelection()
      this.graph.setSelected(null)
      return
    }
    if (!this.selectedNodeId || this._isInputFocused()) return
    const node = this.store.getNode(this.selectedNodeId)
    if (!node) return

    this.store.deleteNode(this.selectedNodeId)
    this.selectedNodeId = null
    this.hideOverlay()
    this.graph.setSelected(null)
  }

  deleteNodeById(nodeId) {
    const node = this.store.getNode(nodeId)
    if (!node) return
    if (!confirm(`确定删除节点「${node.label}」吗？`)) return
    this.store.deleteNode(nodeId)
    if (this.selectedNodeId === nodeId) {
      this.selectedNodeId = null
      this.hideOverlay()
      this.graph.setSelected(null)
    }
  }

  _moveIntoGroup(nodeId, groupNodeId) {
    const node = this.store.getNode(nodeId)
    const groupNode = this.store.getNode(groupNodeId)
    if (!node || !groupNode) return

    // 不能把家族节点移入另一家族
    if (node.group === 'org') {
      InlineEditor.showToast('无法将家族移入另一家族', true)
      return
    }

    // 如果已在同一家族中 → 移出家族
    if (node.parent === groupNodeId) {
      this.store.removeNodeFromGroup(nodeId)
      this.selectedNodeId = nodeId
      this.graph.setSelected(nodeId)
      InlineEditor.showToast(`已将「${node.label}」移出「${groupNode.label}」`)
      return
    }

    this.store.setNodeParent(nodeId, groupNodeId)
    this.selectedNodeId = nodeId
    this.graph.setSelected(nodeId)
    InlineEditor.showToast(`已将「${node.label}」归入「${groupNode.label}」`)
  }

  onNodeSelect(nodeId, { shiftLink = false } = {}) {
    if (this.linkSourceId) {
      if (this.linkSourceId === nodeId) {
        this.cancelLinkMode()
        InlineEditor.showToast('已取消关联')
        return
      }
      this.linkNodes(this.linkSourceId, nodeId)
      return
    }

    // 选中家族节点后 Shift+点击目标节点 → 将目标归入该家族
    if (shiftLink && this.selectedNodeId && this.selectedNodeId !== nodeId) {
      const selectedNode = this.store.getNode(this.selectedNodeId)
      if (selectedNode && selectedNode.group === 'org') {
        this._moveIntoGroup(nodeId, this.selectedNodeId)
        return
      }
      this.linkNodes(this.selectedNodeId, nodeId)
      return
    }

    if (this.editingNodeId && this.editingNodeId !== nodeId) {
      if (!this.commitEdit()) {
        this.nodeInput.value = this.editStartLabel
        this.stopEdit()
      }
    }
    if (this.editingEdgeId) this.commitEdgeEdit()

    this.clearEdgeSelection()
    this.cancelLinkMode()
    this.selectedNodeId = nodeId
    this.graph.setSelected(nodeId)
    this.hideOverlay()
  }

  onEdgeSelect(edgeId) {
    if (this.editingNodeId) this.commitEdit()
    this.cancelLinkMode()

    this.selectedNodeId = null
    this.hideOverlay()
    this.selectedEdgeId = edgeId
    this.graph.setSelected(edgeId)
    this.showEdgeEditor(edgeId)
  }

  onCanvasDeselect() {
    if (this.editingNodeId) this.commitEdit()
    if (this.editingEdgeId) this.commitEdgeEdit()
    this.cancelLinkMode()
    this.selectedNodeId = null
    this.clearEdgeSelection()
    this.hideOverlay()
    this.graph.setSelected(null)
  }

  onStoreUpdate() {
    if (this.selectedNodeId && !this.store.getNode(this.selectedNodeId)) {
      this.selectedNodeId = null
      this.editingNodeId = null
      this.hideOverlay()
    }
    if (this.selectedEdgeId && !this.store.getEdge(this.selectedEdgeId)) {
      this.clearEdgeSelection()
    }
    if (this.linkSourceId && !this.store.getNode(this.linkSourceId)) {
      this.cancelLinkMode()
    }
    if (this.editingEdgeId && document.activeElement === this.edgeInput) {
      this._updateEdgeOverlayPosition(this.editingEdgeId)
      return
    }
    if (this.editingNodeId && document.activeElement === this.nodeInput) {
      this._updateOverlayPosition(this.editingNodeId)
      return
    }
    if (this.selectedEdgeId) this.showEdgeEditor(this.selectedEdgeId)
  }

  // === 私有方法 ===

  _applyGraphHistory(action) {
    const keepNodeId = this.selectedNodeId
    const wasEditing = !!this.editingNodeId
    this.editingNodeId = null

    const ok = action()
    if (!ok) return false

    if (keepNodeId && this.store.getNode(keepNodeId)) {
      this.selectedNodeId = keepNodeId
      this.graph.setSelected(keepNodeId)
      if (wasEditing) this.startEdit(keepNodeId)
      else this.hideOverlay()
      return true
    }

    const nodes = this.store.getAllNodes()
    if (nodes.length > 0) {
      this.selectedNodeId = nodes[0].id
      this.graph.setSelected(this.selectedNodeId)
      this.hideOverlay()
    } else {
      this.selectedNodeId = null
      this.hideOverlay()
      this.graph.setSelected(null)
    }
    return true
  }
}
