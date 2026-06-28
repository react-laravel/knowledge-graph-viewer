/**
 * 通用关系分类：边上可显式设置 category，否则按 type 关键词推断
 */

export const RELATION_CATEGORIES = {
  family: { id: 'family', label: '亲属', color: '#4a90e2', defaultOn: true },
  spouse: { id: 'spouse', label: '婚姻', color: '#e74c3c', defaultOn: true },
  master: { id: 'master', label: '主从', color: '#27ae60', defaultOn: true },
  sibling: { id: 'sibling', label: '兄弟姐妹', color: '#9b59b6', defaultOn: true },
  romance: { id: 'romance', label: '情感', color: '#e91e8c', defaultOn: false },
  social: { id: 'social', label: '社交', color: '#95a5a6', defaultOn: true },
  org: { id: 'org', label: '组织', color: '#8b7355', defaultOn: true },
  conflict: { id: 'conflict', label: '冲突', color: '#c0392b', defaultOn: false },
  other: { id: 'other', label: '其它', color: '#bbbbbb', defaultOn: true },
}

const RULES = [
  { cat: 'family', re: /父|母|子|女|祖|孙|侄|舅|姨|姑|叔|甥|婆媳|翁婿|父女|母子|父子|母女|兄弟|兄妹|姐弟|姐妹|兄弟|堂|表|异母|同母|同父|血缘|亲子/ },
  { cat: 'spouse', re: /夫妻|妻|夫|妾|偷娶|未婚夫妻|婚/ },
  { cat: 'master', re: /主仆|丫鬟|陪房|管家|总管家|侍奉|老奴|仆|奴|贴身/ },
  { cat: 'sibling', re: /兄弟|姐妹|兄妹|姐弟|堂兄弟|堂姐妹|表姐妹|表兄弟/ },
  { cat: 'romance', re: /恋|情|盟|缘|仰慕|知己|殉情|归宿|偷娶|木石|金玉/ },
  { cat: 'social', re: /拜访|求助|认识|师生|恩人|提携|寄居|结交|引荐/ },
  { cat: 'org', re: /家族|下辖|归属|隶属|成员/ },
  { cat: 'conflict', re: /迫害|戏弄|仇敌|冲突|对立/ },
]

/** @returns {keyof typeof RELATION_CATEGORIES} */
export function inferRelationCategory(type = '', explicit = '') {
  const cat = (explicit || '').trim()
  if (cat && RELATION_CATEGORIES[cat]) return cat
  const t = (type || '').trim()
  if (!t) return 'other'
  for (const { cat: c, re } of RULES) {
    if (re.test(t)) return c
  }
  return 'other'
}

export function getCategoryMeta(categoryId) {
  return RELATION_CATEGORIES[categoryId] ?? RELATION_CATEGORIES.other
}

export function getCategoryColor(categoryId) {
  return getCategoryMeta(categoryId).color
}

export function defaultActiveCategories() {
  return Object.values(RELATION_CATEGORIES)
    .filter((c) => c.defaultOn)
    .map((c) => c.id)
}

export function enrichEdge(edge) {
  const category = inferRelationCategory(edge.type, edge.category)
  return { ...edge, category }
}

export function enrichEdges(edges) {
  return edges.map(enrichEdge)
}
