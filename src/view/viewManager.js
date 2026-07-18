import { RELATION_CATEGORIES, getCategoryMeta, enrichEdge } from './relationCategories.js'
import { createDefaultViewState, loadViewState, saveViewState } from './viewState.js'
import {
  computeVisibility,
  getTimelineRange,
  isAggregateId,
  parseAggregateId,
  makeAggregateId,
} from './viewController.js'
import { applyTimelineFilter, resolveFocusInTimeline } from './chapterUtils.js'

export class ViewManager {
  constructor(store, graph) {
    this.store = store
    this.graph = graph
    this.state = createDefaultViewState()
    this.listeners = new Set()
    this._aggregateMembers = new Map()
  }

  init() {
    this.loadForGraph(this.store.getCurrentGraphId())
    this.graph.setShowEdgeLabels(this.state.showEdgeLabels)
    this.graph.setHoverHighlight(this.state.hoverHighlight)
    this._initHover()
    this.applyView({ layout: true })
  }

  resetForGraph(graphId) {
    this.state = createDefaultViewState({
      focusNodeId: this.store.pickDefaultFocusNodeId(),
    })
    saveViewState(graphId, this.state)
  }

  loadForGraph(graphId) {
    this.state = loadViewState(graphId)
    if (!this.state.focusNodeId || !this.store.getNode(this.state.focusNodeId)) {
      this.state.focusNodeId = this.store.pickDefaultFocusNodeId()
    }
  }

  persist() {
    saveViewState(this.store.getCurrentGraphId(), this.state)
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  _notify() {
    this.persist()
    this.listeners.forEach((fn) => fn(this.state))
  }

  getState() {
    return { ...this.state }
  }

  getTimelineRange() {
    const data = this.store.exportData().dataMap[this.store.getCurrentGraphId()]
    return getTimelineRange(data?.nodes ?? [], data?.edges ?? [])
  }

  /** 构建含聚合节点的 Cytoscape 元素并应用可见性 */
  applyView({ layout = false } = {}) {
    const graphId = this.store.getCurrentGraphId()
    const data = this.store.exportData().dataMap[graphId] ?? { nodes: [], edges: [] }
    const nodes = data.nodes ?? []
    const edges = data.edges ?? []

    const timelineOn = this.state.timelineEnabled && this.state.timelineMax != null
    if (timelineOn) {
      const { allowedNodes } = applyTimelineFilter(
        nodes,
        edges,
        this.state.timelineMax,
        true
      )
      const resolved = resolveFocusInTimeline(nodes, this.state.focusNodeId, allowedNodes)
      if (resolved !== this.state.focusNodeId) this.state.focusNodeId = resolved
    } else if (!this.state.focusNodeId || !nodes.some((n) => n.id === this.state.focusNodeId)) {
      this.state.focusNodeId = this.store.pickDefaultFocusNodeId()
    }

    const { visibleNodeIds, visibleEdgeIds, aggregateNodes } = computeVisibility(
      { nodes, edges },
      this.state
    )

    this._aggregateMembers.clear()
    for (const agg of aggregateNodes) {
      this._aggregateMembers.set(agg.id, agg.memberIds)
    }

    const elements = this.store.toCytoscapeElements({ aggregateNodes })
    this.graph.sync(elements, { layout, applyVisibility: false })
    this.graph.applyVisibility(visibleNodeIds, visibleEdgeIds)
    this.graph.setShowEdgeLabels(this.state.showEdgeLabels)
    if (!layout) {
      this.graph.fitToVisibleNodes(visibleNodeIds)
    }

    this._notify()
  }

  setViewMode(mode) {
    if (mode === 'full') {
      if (!confirm('显示全部节点和关系可能非常混乱，确定继续？')) return
    }
    this.state.viewMode = mode
    this.applyView()
  }

  setFocusNode(nodeId, { replace = true, layout = false } = {}) {
    if (!nodeId) return
    this.state.focusNodeId = nodeId
    if (replace) {
      this.state.expandedNodeIds = []
      if (this.state.viewMode !== 'full') this.state.focusDepth = 1
    }
    this.applyView({ layout })
  }

  /** 解析当前图谱的默认中心（考虑章节过滤） */
  resolveDefaultFocusNodeId() {
    const graphId = this.store.getCurrentGraphId()
    const nodes = this.store.exportData().dataMap[graphId]?.nodes ?? []
    let id = this.store.pickDefaultFocusNodeId()
    const timelineOn = this.state.timelineEnabled && this.state.timelineMax != null
    if (timelineOn) {
      const { allowedNodes } = applyTimelineFilter(
        nodes,
        [],
        this.state.timelineMax,
        true
      )
      id = resolveFocusInTimeline(nodes, id, allowedNodes) ?? id
    }
    return id
  }

  resetFocusToDefault({ layout = false } = {}) {
    const id = this.resolveDefaultFocusNodeId()
    if (!id) return
    this.setFocusNode(id, { replace: true, layout })
  }

  expandFromNode(nodeId) {
    if (!nodeId) return
    if (!this.state.expandedNodeIds.includes(nodeId)) {
      this.state.expandedNodeIds.push(nodeId)
    }
    this.state.focusDepth = Math.min(this.state.focusDepth + 1, 5)
    this.applyView()
  }

  toggleCategory(categoryId) {
    const set = new Set(this.state.activeCategories)
    if (set.has(categoryId)) set.delete(categoryId)
    else set.add(categoryId)
    this.state.activeCategories = [...set]
    this.applyView()
  }

  setFocusDepth(depth) {
    this.state.focusDepth = Math.max(1, Math.min(5, depth))
    this.applyView()
  }

  toggleEdgeLabels(show) {
    this.state.showEdgeLabels = show
    this.graph.setShowEdgeLabels(show)
    this._notify()
  }

  toggleHoverHighlight(on) {
    this.state.hoverHighlight = on
    this.graph.setHoverHighlight(on)
    if (!on) this.graph.clearHoverDim()
    this._notify()
  }

  toggleOrgCollapse(orgId) {
    const set = new Set(this.state.collapsedOrgIds)
    if (set.has(orgId)) set.delete(orgId)
    else set.add(orgId)
    this.state.collapsedOrgIds = [...set]
    this.applyView()
  }

  toggleAggregate(parentId, tag) {
    const key = `${parentId || '_root'}::${tag}`
    const set = new Set(this.state.collapsedAggregateKeys)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    this.state.collapsedAggregateKeys = [...set]
    this.applyView()
  }

  expandAggregate(aggregateId) {
    if (!isAggregateId(aggregateId)) return
    const { parentId, tag } = parseAggregateId(aggregateId)
    const graphId = this.store.getCurrentGraphId()
    const nodes = this.store.exportData().dataMap[graphId]?.nodes ?? []
    const thisKey = `${parentId || '_root'}::${tag}`
    const rootKey = `_root::${tag}`
    const set = new Set(this.state.collapsedAggregateKeys)

    if (set.has(rootKey)) {
      set.delete(rootKey)
      for (const n of nodes) {
        const tags = Array.isArray(n.tags) ? n.tags : n.tag ? [n.tag] : []
        if (!tags.includes(tag)) continue
        const pid = n.parent || '_root'
        const key = `${pid}::${tag}`
        if (key !== thisKey) set.add(key)
      }
    } else {
      set.delete(thisKey)
    }
    this.state.collapsedAggregateKeys = [...set]
    this.applyView()
  }

  setTimelineEnabled(on) {
    this.state.timelineEnabled = on
    if (on) {
      const range = this.getTimelineRange()
      if (!range.hasData) {
        this.state.timelineEnabled = false
        return { ok: false, reason: 'no-chapter-data' }
      }
      if (this.state.timelineMax == null) {
        this.state.timelineMax = range.min
      }
    }
    this.applyView()
    return { ok: true }
  }

  setTimelineMax(value) {
    this.state.timelineMax = value
    if (this.state.timelineEnabled) this.applyView()
  }

  /** 节点关系列表（供详情面板） */
  getNodeRelationGroups(nodeId) {
    const graphId = this.store.getCurrentGraphId()
    const data = this.store.exportData().dataMap[graphId] ?? { nodes: [], edges: [] }
    const nodeById = Object.fromEntries(data.nodes.map((n) => [n.id, n]))
    const groups = {}

    for (const e of data.edges) {
      if (e.source !== nodeId && e.target !== nodeId) continue
      const otherId = e.source === nodeId ? e.target : e.source
      const enriched = enrichEdge(e)
      const cat = enriched.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push({
        edgeId: e.id,
        type: e.type,
        category: cat,
        direction: e.source === nodeId ? 'out' : 'in',
        otherId,
        otherLabel: nodeById[otherId]?.label ?? otherId,
        chapter: e.chapter ?? e.time ?? e.appearAt ?? null,
        note: e.note ?? e.description ?? '',
      })
    }

    return Object.entries(groups)
      .map(([category, items]) => ({
        category,
        label: getCategoryMeta(category).label,
        color: getCategoryMeta(category).color,
        items,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'zh'))
  }

  getEdgeDetail(edgeId) {
    const edge = this.store.getEdge(edgeId)
    if (!edge) return null
    const enriched = enrichEdge(edge)
    const src = this.store.getNode(edge.source)
    const tgt = this.store.getNode(edge.target)
    return {
      ...enriched,
      sourceLabel: src?.label ?? edge.source,
      targetLabel: tgt?.label ?? edge.target,
    }
  }

  getCategoryList() {
    return Object.values(RELATION_CATEGORIES)
  }

  isAggregateNode(nodeId) {
    return isAggregateId(nodeId)
  }

  _initHover() {
    this.graph.cy.on('mouseover', 'node', (evt) => {
      if (!this.state.hoverHighlight) return
      if (evt.target.data('group') === 'aggregate') return
      this.graph.setHoverFocus(evt.target.id())
    })
    this.graph.cy.on('mouseout', 'node', () => {
      if (!this.state.hoverHighlight) return
      this.graph.clearHoverDim()
    })
  }
}

export { makeAggregateId, isAggregateId }
