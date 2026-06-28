/** 解析节点/边上的章节或时间字段 */
export function parseChapterField(obj) {
  if (!obj) return null
  const t = obj.chapter ?? obj.time ?? obj.appearAt
  if (t == null || t === '') return null
  const n = Number(t)
  return Number.isNaN(n) ? null : n
}

/**
 * 时间轴过滤（严格模式）：
 * - 开启后，无 chapter 的节点/边不显示
 * - 仅保留 chapter <= max 的节点；边需两端节点均可见，且边自身 chapter <= max（若有）
 */
export function applyTimelineFilter(nodes, edges, max, enabled) {
  if (!enabled || max == null) {
    return {
      allowedNodes: new Set(nodes.map((n) => n.id)),
      edges,
    }
  }

  const allowedNodes = new Set()
  for (const n of nodes) {
    const ch = parseChapterField(n)
    if (ch != null && ch <= max) allowedNodes.add(n.id)
  }

  const filteredEdges = edges.filter((e) => {
    const ec = parseChapterField(e)
    if (!allowedNodes.has(e.source) || !allowedNodes.has(e.target)) return false
    if (ec != null) return ec <= max
    return true
  })

  return { allowedNodes, edges: filteredEdges }
}

export function getTimelineRange(nodes, edges) {
  const values = []
  for (const o of [...nodes, ...edges]) {
    const ch = parseChapterField(o)
    if (ch != null) values.push(ch)
  }
  if (!values.length) return { min: 1, max: 120, hasData: false }
  return { min: Math.min(...values), max: Math.max(...values), hasData: true }
}

/** 在允许集合内选择焦点：优先 important，其次章节最早 */
export function resolveFocusInTimeline(nodes, preferredId, allowedNodes) {
  const pool = nodes.filter(
    (n) =>
      allowedNodes.has(n.id) &&
      n.group !== 'org' &&
      n.group !== 'aggregate'
  )
  if (!pool.length) return null
  if (preferredId && allowedNodes.has(preferredId)) return preferredId
  const important = pool.find((n) => n.important === 'yes' || n.important === true)
  if (important) return important.id
  pool.sort((a, b) => (parseChapterField(a) ?? 999) - (parseChapterField(b) ?? 999))
  return pool[0].id
}
