import { enrichEdge } from './relationCategories.js'
import {
  applyTimelineFilter,
  getTimelineRange,
  resolveFocusInTimeline,
} from './chapterUtils.js'

const AGG_PREFIX = '__agg__'

/** 聚合节点 ID */
export function makeAggregateId(parentId, tag) {
  return `${AGG_PREFIX}${parentId}::${tag}`
}

export function isAggregateId(id) {
  return String(id).startsWith(AGG_PREFIX)
}

export function parseAggregateId(id) {
  const body = String(id).slice(AGG_PREFIX.length)
  const [parentId, tag] = body.split('::')
  return { parentId, tag }
}

/**
 * 计算当前应显示的节点/边，以及需要注入的聚合节点
 * @returns {{ visibleNodeIds: Set<string>, visibleEdgeIds: Set<string>, aggregateNodes: Array, hiddenByAggregate: Set<string> }}
 */
export function computeVisibility({ nodes, edges }, viewState) {
  const enrichedEdges = edges.map(enrichEdge)
  const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]))

  const activeCats = new Set(viewState.activeCategories ?? [])
  let filteredEdges = enrichedEdges.filter((e) => activeCats.has(e.category))

  const timelineOn = viewState.timelineEnabled && viewState.timelineMax != null
  const { allowedNodes: timelineNodes, edges: timelineEdges } = applyTimelineFilter(
    nodes,
    filteredEdges,
    viewState.timelineMax,
    timelineOn
  )
  filteredEdges = timelineEdges

  const adj = buildAdjacency(filteredEdges)

  let visibleNodeIds

  // 显示全部：章节过滤只限制出场范围；中心/渐进模式始终按 N 跳展开（章节先收窄可选节点与边）
  if (viewState.viewMode === 'full') {
    visibleNodeIds = timelineOn
      ? new Set([...timelineNodes])
      : new Set(nodes.map((n) => n.id))
  } else {
    const focusId = timelineOn
      ? resolveFocusInTimeline(nodes, viewState.focusNodeId, timelineNodes)
      : resolveFocusNodeId(nodes, viewState.focusNodeId)
    if (!focusId) {
      visibleNodeIds = new Set()
    } else {
      const depth = Math.max(viewState.focusDepth, 1)
      const seeds = new Set(
        [focusId, ...(viewState.expandedNodeIds ?? [])].filter((id) =>
          !timelineOn || timelineNodes.has(id)
        )
      )
      visibleNodeIds = bfsMultiSeed(seeds, depth, adj)
      if (timelineOn) {
        for (const id of [...visibleNodeIds]) {
          if (!timelineNodes.has(id)) visibleNodeIds.delete(id)
        }
      }
    }
  }

  // 折叠的组织节点：隐藏其子孙（保留组织节点自身）
  const collapsedOrgs = new Set(viewState.collapsedOrgIds ?? [])
  for (const orgId of collapsedOrgs) {
    hideDescendants(orgId, nodes, visibleNodeIds)
  }

  const preAggregateVisibleNodeIds = new Set(visibleNodeIds)

  // 标签聚合
  const { aggregateNodes, hiddenByAggregate } = buildAggregates(nodes, viewState, visibleNodeIds)
  for (const id of hiddenByAggregate) visibleNodeIds.delete(id)
  for (const agg of aggregateNodes) visibleNodeIds.add(agg.id)

  // compound 父链（时间轴下不拉入尚未出场的组织）
  for (const id of [...visibleNodeIds]) {
    let pid = nodeById[id]?.parent
    while (pid && nodeById[pid]) {
      if (!timelineOn || timelineNodes.has(pid)) visibleNodeIds.add(pid)
      pid = nodeById[pid].parent
    }
  }

  const visibleEdgeIds = new Set()
  for (const e of filteredEdges) {
    if (visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)) {
      if (!hiddenByAggregate.has(e.source) && !hiddenByAggregate.has(e.target)) {
        visibleEdgeIds.add(e.id)
      }
    }
  }

  return { visibleNodeIds, visibleEdgeIds, aggregateNodes, hiddenByAggregate, preAggregateVisibleNodeIds }
}

/** 侧栏聚合按钮：按聚合前可见节点统计同标签人数（≥2 才可折叠） */
export function getAggregatableTags({ nodes, edges }, viewState) {
  const { preAggregateVisibleNodeIds } = computeVisibility({ nodes, edges: edges ?? [] }, viewState)
  const collapsed = new Set(viewState.collapsedAggregateKeys ?? [])
  const tags = new Map()

  for (const n of nodes ?? []) {
    if (!preAggregateVisibleNodeIds.has(n.id) || n.group === 'org') continue
    const list = normalizeTags(n)
    for (const t of list) {
      tags.set(t, (tags.get(t) ?? 0) + 1)
    }
  }

  return [...tags.entries()]
    .filter(([, count]) => count >= 2)
    .map(([tag, count]) => ({
      tag,
      count,
      collapsed: collapsed.has(`_root::${tag}`),
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag, 'zh-CN'))
}

function buildAdjacency(edges) {
  const adj = new Map()
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set())
    adj.get(a).add(b)
  }
  for (const e of edges) {
    add(e.source, e.target)
    add(e.target, e.source)
  }
  return adj
}

function bfsMultiSeed(seeds, depth, adj) {
  const visible = new Set()
  const queue = []
  for (const s of seeds) {
    if (!s) continue
    queue.push({ id: s, d: 0 })
  }
  while (queue.length) {
    const { id, d } = queue.shift()
    if (!id || visible.has(id)) continue
    visible.add(id)
    if (d >= depth) continue
    for (const nb of adj.get(id) ?? []) {
      if (!visible.has(nb)) queue.push({ id: nb, d: d + 1 })
    }
  }
  return visible
}

function hideDescendants(orgId, nodes, visibleSet) {
  const children = nodes.filter((n) => n.parent === orgId)
  for (const c of children) {
    visibleSet.delete(c.id)
    if (c.group === 'org') hideDescendants(c.id, nodes, visibleSet)
    else hideDescendantsByParent(c.id, nodes, visibleSet)
  }
}

function hideDescendantsByParent(parentId, nodes, visibleSet) {
  for (const n of nodes) {
    if (n.parent === parentId) {
      visibleSet.delete(n.id)
      hideDescendantsByParent(n.id, nodes, visibleSet)
    }
  }
}

function normalizeTags(node) {
  if (Array.isArray(node.tags) && node.tags.length) return node.tags.filter(Boolean)
  if (node.tag) return [node.tag]
  if (node.role) return [node.role]
  return []
}

/** 侧栏用 _root::标签 表示全局折叠，需匹配各组织下的同名标签 */
export function isTagCollapsed(collapsedKeys, parentId, tag) {
  const set = collapsedKeys instanceof Set ? collapsedKeys : new Set(collapsedKeys ?? [])
  const pid = parentId || '_root'
  return set.has(`${pid}::${tag}`) || set.has(`_root::${tag}`)
}

function buildAggregates(nodes, viewState, visibleNodeIds) {
  const collapsedKeys = new Set(viewState.collapsedAggregateKeys ?? [])
  const hiddenByAggregate = new Set()
  const aggregateNodes = []

  const groups = new Map()
  for (const n of nodes) {
    if (!visibleNodeIds.has(n.id) || n.group === 'org') continue
    const tags = normalizeTags(n)
    if (!tags.length) continue
    const parentId = n.parent || '_root'
    for (const tag of tags) {
      const key = `${parentId}::${tag}`
      if (!isTagCollapsed(collapsedKeys, parentId, tag)) continue
      if (!groups.has(key)) groups.set(key, { parentId, tag, members: [] })
      groups.get(key).members.push(n)
    }
  }

  for (const [key, { parentId, tag, members }] of groups) {
    if (members.length < 2) continue
    for (const m of members) hiddenByAggregate.add(m.id)
    aggregateNodes.push({
      id: makeAggregateId(parentId === '_root' ? '' : parentId, tag),
      label: `${tag}（${members.length}）`,
      group: 'aggregate',
      parent: parentId === '_root' ? '' : parentId,
      aggregateKey: key,
      memberIds: members.map((m) => m.id),
      important: '',
      gender: '',
    })
  }

  return { aggregateNodes, hiddenByAggregate }
}

/** 自动选择焦点：important > 最高度数 > 第一个非 org */
export function resolveFocusNodeId(nodes, preferred) {
  if (preferred && nodes.some((n) => n.id === preferred)) return preferred
  const persons = nodes.filter((n) => n.group !== 'org' && n.group !== 'aggregate')
  const important = persons.find((n) => n.important === 'yes' || n.important === true)
  if (important) return important.id
  if (persons.length) {
    const degrees = new Map()
    // degree computed externally if needed; fallback first
    return persons[0].id
  }
  return nodes[0]?.id ?? null
}

export { getTimelineRange } from './chapterUtils.js'
