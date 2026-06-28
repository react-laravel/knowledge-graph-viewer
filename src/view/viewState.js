import { defaultActiveCategories } from './relationCategories.js'

const STORAGE_KEY = 'kg-viewer-view'

export const VIEW_MODES = {
  focus: { id: 'focus', label: '中心展开', desc: '以焦点节点为中心，只显示 N 跳关系' },
  expand: { id: 'expand', label: '渐进展开', desc: '单击替换焦点，双击累加展开' },
  full: { id: 'full', label: '显示全部', desc: '显示所有节点（可能很乱）' },
}

export function createDefaultViewState(overrides = {}) {
  return {
    viewMode: 'focus',
    focusNodeId: null,
    focusDepth: 1,
    expandedNodeIds: [],
    activeCategories: defaultActiveCategories(),
    showEdgeLabels: false,
    hoverHighlight: true,
    collapsedOrgIds: [],
    collapsedAggregateKeys: [],
    timelineMax: null,
    timelineEnabled: false,
    ...overrides,
  }
}

export function loadViewState(graphId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultViewState()
    const all = JSON.parse(raw)
    const saved = all[graphId]
    if (!saved) return createDefaultViewState()
    return createDefaultViewState({
      ...saved,
      expandedNodeIds: saved.expandedNodeIds ?? [],
      activeCategories: saved.activeCategories ?? defaultActiveCategories(),
      collapsedOrgIds: saved.collapsedOrgIds ?? [],
      collapsedAggregateKeys: saved.collapsedAggregateKeys ?? [],
    })
  } catch {
    return createDefaultViewState()
  }
}

export function saveViewState(graphId, state) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? JSON.parse(raw) : {}
    all[graphId] = {
      viewMode: state.viewMode,
      focusNodeId: state.focusNodeId,
      focusDepth: state.focusDepth,
      expandedNodeIds: state.expandedNodeIds,
      activeCategories: state.activeCategories,
      showEdgeLabels: state.showEdgeLabels,
      hoverHighlight: state.hoverHighlight,
      collapsedOrgIds: state.collapsedOrgIds,
      collapsedAggregateKeys: state.collapsedAggregateKeys,
      timelineMax: state.timelineMax,
      timelineEnabled: state.timelineEnabled,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}
