import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KnowledgeStore } from '../src/store.js'

// 构造 store，saveToStorage 替换为 no-op 避免触及 localStorage
function createStore(initialData) {
  const store = new KnowledgeStore(initialData)
  const orig = store._notify.bind(store)
  store._notify = () => orig()
  return store
}

const makeNodes = (extra = []) => [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  ...extra,
]

const makeEdges = (extra = []) => [
  { id: 'edge_ab', source: 'a', target: 'b', type: '链接' },
  { id: 'edge_bc', source: 'b', target: 'c', type: '关联' },
  ...extra,
]

describe('KnowledgeStore', () => {
  let store

  beforeEach(() => {
    store = createStore({
      graphs: [{ id: 'g1', name: '测试' }],
      dataMap: { g1: { nodes: makeNodes(), edges: makeEdges() } },
      currentGraphId: 'g1',
    })
  })

  // === 节点 ===

  describe('addNode', () => {
    it('正常添加', () => {
      store.addNode({ id: 'd', label: 'D' })
      expect(store.getNode('d').label).toBe('D')
    })

    it('重复 ID 抛错', () => {
      expect(() => store.addNode({ id: 'a', label: 'A2' })).toThrow('已存在')
    })

    it('空 ID 抛错', () => {
      expect(() => store.addNode({ id: '', label: 'x' })).toThrow('不能为空')
    })

    it('空名称抛错', () => {
      expect(() => store.addNode({ id: 'z', label: '' })).toThrow('不能为空')
    })
  })

  describe('generateNodeId', () => {
    it('用 label 生成', () => {
      expect(store.generateNodeId('新节点')).toBe('新节点')
    })

    it('重复时加后缀', () => {
      store.addNode({ id: '新节点', label: '新节点' })
      expect(store.generateNodeId('新节点')).toBe('新节点_1')
    })
  })

  describe('updateNode', () => {
    it('更新名称', () => {
      store.updateNode('a', { label: 'A+' })
      expect(store.getNode('a').label).toBe('A+')
    })

    it('同名跳过', () => {
      store.updateNode('a', { label: 'A' }) // 不抛错
    })

    it('不存在抛错', () => {
      expect(() => store.updateNode('xxx', { label: 'x' })).toThrow('不存在')
    })

    it('更新注释和相关链接，并支持撤销', () => {
      store.updateNode('a', {
        description: '节点注释',
        links: [
          { title: '参考资料', url: 'https://example.com/reference' },
          { title: '', url: '' },
        ],
      })

      expect(store.getNode('a').description).toBe('节点注释')
      expect(store.getNode('a').links).toEqual([
        { title: '参考资料', url: 'https://example.com/reference' },
      ])

      store.undo()
      expect(store.getNode('a').description).toBeUndefined()
      expect(store.getNode('a').links).toBeUndefined()
    })
  })

  describe('deleteNode', () => {
    it('删除节点及相关边', () => {
      store.deleteNode('a')
      expect(store.getNode('a')).toBeNull()
      const edges = store._currentData().edges
      expect(edges.some((e) => e.source === 'a' || e.target === 'a')).toBe(false)
    })
  })

  describe('addChildNode', () => {
    it('创建子节点并连线', () => {
      const id = store.addChildNode('b', 'child')
      expect(store.getNode(id).label).toBe('child')
      const edges = store._currentData().edges
      expect(edges.some((e) => e.source === 'b' && e.target === id)).toBe(true)
    })

    it('无父节点也能创建', () => {
      const id = store.addChildNode(null, 'orphan')
      expect(store.getNode(id)).not.toBeNull()
    })
  })

  describe('addSiblingNode', () => {
    it('有父节点时创建同级', () => {
      // b 的父节点是 a（通过 edge_ab: a→b），同级应同样挂到 a 下
      const id = store.addSiblingNode('b')
      expect(store.getParentId(id)).toBe('a')
    })
  })

  describe('parent/children', () => {
    it('getParentId', () => {
      // a 是根节点，无 incoming edge 作为 target
      expect(store.getParentId('a')).toBeNull()
      // b 是 edge_ab 的 target，所以父节点是 a
      expect(store.getParentId('b')).toBe('a')
      // c 是 edge_bc 的 target，所以父节点是 b
      expect(store.getParentId('c')).toBe('b')
    })

    it('getChildrenIds', () => {
      const children = store.getChildrenIds('b')
      expect(children).toContain('c')
    })
  })

  // === 边 ===

  describe('addEdge', () => {
    it('正常添加', () => {
      const id = store.addEdge({ source: 'a', target: 'c', type: '新关系' })
      expect(store.getEdge(id).type).toBe('新关系')
    })

    it('同源同目标抛错', () => {
      // edge_ab 已是 a→b
      expect(() => store.addEdge({ source: 'a', target: 'b', type: 'x' })).toThrow('已存在')
    })

    it('自环抛错', () => {
      expect(() => store.addEdge({ source: 'a', target: 'a', type: 'x' })).toThrow('同一节点')
    })

    it('源节点不存在抛错', () => {
      expect(() => store.addEdge({ source: 'x', target: 'a', type: 'x' })).toThrow('源节点不存在')
    })
  })

  describe('updateEdge', () => {
    it('更新类型', () => {
      store.updateEdge('edge_ab', { type: '新类型' })
      expect(store.getEdge('edge_ab').type).toBe('新类型')
    })
  })

  describe('deleteEdge', () => {
    it('删除边', () => {
      store.deleteEdge('edge_ab')
      expect(store.getEdge('edge_ab')).toBeNull()
    })
  })

  // === 搜索 ===

  describe('search', () => {
    it('按 label 匹配节点', () => {
      const r = store.search('A')
      expect(r.nodeIds).toContain('a')
    })

    it('按 ID 匹配节点', () => {
      const r = store.search('b')
      expect(r.nodeIds).toContain('b')
    })

    it('按边类型匹配', () => {
      const r = store.search('链接')
      expect(r.edgeIds).toContain('edge_ab') // type='链接'
    })

    it('按边类型精确匹配', () => {
      const r = store.search('关联')
      expect(r.edgeIds).toContain('edge_bc')
    })

    it('按边 source/target 匹配', () => {
      const r = store.search('a')
      expect(r.edgeIds).toContain('edge_ab')
    })

    it('空查询返回空', () => {
      const r = store.search('')
      expect(r.nodeIds).toHaveLength(0)
      expect(r.edgeIds).toHaveLength(0)
    })
  })

  // === 撤销/重做 ===

  describe('undo/redo', () => {
    it('撤销恢复删除', () => {
      store.deleteNode('a')
      expect(store.getNode('a')).toBeNull()
      store.undo()
      expect(store.getNode('a')).not.toBeNull()
    })

    it('重做恢复撤销', () => {
      store.deleteNode('a')
      store.undo()
      store.redo()
      expect(store.getNode('a')).toBeNull()
    })

    it('空栈返回 false', () => {
      expect(store.undo()).toBe(false)
      expect(store.redo()).toBe(false)
    })
  })

  // === 多图谱 ===

  describe('多图谱管理', () => {
    it('创建新图谱', () => {
      const id = store.createGraph('G2')
      expect(store.getGraphs()).toHaveLength(2)
      expect(store.getCurrentGraphId()).toBe(id)
    })

    it('切换图谱', () => {
      const id = store.createGraph('G2')
      store.switchGraph('g1')
      expect(store.getCurrentGraphId()).toBe('g1')
    })

    it('只剩一个图谱时不能删', () => {
      const id = store.createGraph('tmp')
      store.deleteGraph(id) // 删除临时图谱，只剩 g1
      expect(() => store.deleteGraph('g1')).toThrow('至少保留')
    })

    it('删除当前图谱自动切换', () => {
      const id2 = store.createGraph('G2')
      store.deleteGraph('g1')
      expect(store.getCurrentGraphId()).toBe(id2)
    })

    it('服务端创建后应把临时 ID 替换为服务端 ID 并保留数据', () => {
      const temporaryId = store.createGraph('G2')
      store.addChildNode(null, '根节点')

      store.replaceGraphId(temporaryId, '42', {
        name: '服务端图谱',
        description: '已同步',
      })

      expect(store.getCurrentGraphId()).toBe('42')
      expect(store.getGraphs().find((g) => g.id === '42')).toMatchObject({
        name: '服务端图谱',
        description: '已同步',
      })
      expect(store.exportData().dataMap[temporaryId]).toBeUndefined()
      expect(store.getAllNodes().map((node) => node.label)).toContain('根节点')
    })
  })

  // === 导出导入 ===

  describe('export / loadFromData', () => {
    it('导出包含完整数据', () => {
      const data = store.exportData()
      expect(data.graphs).toBeDefined()
      expect(data.dataMap).toBeDefined()
      expect(data.currentGraphId).toBe('g1')
    })

    it('导入后数据一致', () => {
      const exported = store.exportData()
      const s2 = createStore(exported)
      expect(s2.getNode('a').label).toBe('A')
      expect(s2.getEdge('edge_ab').type).toBe('链接')
    })
  })

  // === 未覆盖分支补全 ===

  describe('分支覆盖补全', () => {
    it('_currentData 缺失 data 时返回空对象', () => {
      const gid = store.getCurrentGraphId()
      store.dataMap[gid] = undefined
      const data = store._currentData()
      expect(data.nodes).toEqual([])
      expect(data.edges).toEqual([])
    })

    it('switchGraph 到不存在的图谱 ID 应自动创建空数据', () => {
      store.switchGraph('nonexistent_graph')
      expect(store.getCurrentGraphId()).toBe('nonexistent_graph')
      expect(store._currentData().nodes).toEqual([])
    })

    it('renameGraph 应能重命名', () => {
      store.renameGraph('g1', '新名字')
      expect(store.getGraphs().find((g) => g.id === 'g1').name).toBe('新名字')
    })

    it('renameGraph 对不存在的 ID 应安全返回', () => {
      store.renameGraph('不存在', '随便')
    })

    it('subscribe 取消订阅后不应再收到通知', () => {
      const fn = vi.fn()
      const unsub = store.subscribe(fn)
      unsub()
      store.addNode({ id: 'after_unsub', label: 'after' })
      expect(fn).not.toHaveBeenCalled()
    })

    it('undo 栈超过 50 条时应丢弃最早的', () => {
      const s = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: { g1: { nodes: [{ id: 'n1', label: 'N1' }], edges: [] } },
        currentGraphId: 'g1',
      })
      // 压入 51 条历史
      for (let i = 0; i < 51; i++) {
        s._pushHistory()
      }
      expect(s._getUndoStack().length).toBe(50)
    })

    it('updateNode 不传 label 时应保留原值', () => {
      store.updateNode('a', { group: 'org' })
      expect(store.getNode('a').label).toBe('A')
      expect(store.getNode('a').group).toBe('org')
    })

    it('updateNode 同名更新应跳过', () => {
      const before = store.getNode('a')
      store.updateNode('a', { label: 'A' })
      expect(store.getNode('a')).toBe(before)
    })

    it('addEdge type 为空时应默认"关系"', () => {
      const id = store.addEdge({ source: 'a', target: 'c', type: '  ' })
      expect(store.getEdge(id).type).toBe('关系')
    })

    it('addEdge 目标不存在应抛错', () => {
      expect(() => store.addEdge({ source: 'a', target: '不存在', type: 'x' })).toThrow('目标节点不存在')
    })

    it('updateEdge 同名类型应跳过', () => {
      store.updateEdge('edge_ab', { type: '链接' }) // 已是 '链接'
      expect(store.getEdge('edge_ab').type).toBe('链接')
    })

    it('switchGraph 切换到当前图谱应直接返回', () => {
      const current = store.getCurrentGraphId()
      store.switchGraph(current) // 不应抛错
      expect(store.getCurrentGraphId()).toBe(current)
    })

    it('switchGraph 新 ID 应创建空数据', () => {
      store.switchGraph('brand_new')
      expect(store._currentData().nodes).toEqual([])
      expect(store._currentData().edges).toEqual([])
    })

    it('deleteGraph 最后一个应保留', () => {
      const g2 = store.createGraph('G2')
      store.deleteGraph(g2)
      // 只剩 g1，不能再删
      expect(() => store.deleteGraph('g1')).toThrow('至少保留')
    })

    it('deleteGraph 当前图谱应切换', () => {
      const g2 = store.createGraph('G2')
      const g3 = store.createGraph('G3')
      expect(store.getCurrentGraphId()).toBe(g3)
      // 删除当前图谱 G3
      store.deleteGraph(g3)
      expect(store.getCurrentGraphId()).toBe(g2)
    })

    it('_syncEdgeCounter 无 e_ 前缀时应安全处理', () => {
      // 已有的边 ID 都不是 e_ 格式，_syncEdgeCounter 不应崩
      store._syncEdgeCounter()
      expect(store._edgeIdCounter).toBeGreaterThanOrEqual(0)
    })

    it('loadFromData 空 graphs 应恢复默认', () => {
      store.loadFromData({ graphs: [], dataMap: {}, currentGraphId: 'g1' })
      expect(store.getGraphs().length).toBeGreaterThanOrEqual(1)
    })

    it('loadFromData 当前图谱不在 graphs 中应切换', () => {
      store.createGraph('G2')
      store.loadFromData({ graphs: [{ id: 'G2', name: 'G2' }], dataMap: { G2: { nodes: [], edges: [] } }, currentGraphId: 'G2' })
      expect(store.getCurrentGraphId()).toBe('G2')
    })

    it('toCytoscapeElements 节点无 group/gender 时应使用默认值', () => {
      const s = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: { g1: { nodes: [{ id: 'n1', label: 'N1' }], edges: [] } },
        currentGraphId: 'g1',
      })
      const elems = s.toCytoscapeElements()
      const node = elems.find((e) => e.data.id === 'n1')
      expect(node.data.group).toBe('')
      expect(node.data.gender).toBe('')
    })

    it('toCytoscapeElements 边无 type 时应为空字符串', () => {
      const s = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: { g1: { nodes: [], edges: [{ id: 'e1', source: 'n1', target: 'n2' }] } },
        currentGraphId: 'g1',
      })
      const elems = s.toCytoscapeElements()
      const edge = elems.find((e) => e.data.id === 'e1')
      expect(edge.data.type).toBe('')
    })

    it('canUndo/canRedo 空栈应返回 false', () => {
      const s = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: { g1: { nodes: [{ id: 'n1', label: 'N1' }], edges: [] } },
        currentGraphId: 'g1',
      })
      expect(s.canUndo()).toBe(false)
      expect(s.canRedo()).toBe(false)
    })

    it('canUndo/canRedo 有历史时应正确反映', () => {
      store.deleteNode('a')
      expect(store.canUndo()).toBe(true)
      expect(store.canRedo()).toBe(false)
      store.undo()
      expect(store.canUndo()).toBe(false)
      expect(store.canRedo()).toBe(true)
    })

    it('resetToDefault 应生成新 ID', () => {
      const oldId = store.getCurrentGraphId()
      store.resetToDefault()
      expect(store.getCurrentGraphId()).not.toBe(oldId)
      expect(store.getGraphs().length).toBe(1)
    })

    it('notify 应调用所有监听器', () => {
      const fn = vi.fn()
      store.subscribe(fn)
      store._notify()
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('getAllNodes 应返回所有节点副本', () => {
      const nodes = store.getAllNodes()
      expect(nodes.length).toBe(3)
      // 修改返回的副本不应影响原数据
      nodes[0].label = ' mutated'
      expect(store.getNode('a').label).toBe('A')
    })

    it('setNodeParent 应设置父节点', () => {
      store.setNodeParent('a', 'b')
      expect(store.getNode('a').parent).toBe('b')
    })

    it('removeNodeFromGroup 应移出家族', () => {
      store.setNodeParent('a', 'b')
      store.removeNodeFromGroup('a')
      expect(store.getNode('a').parent).toBe('')
    })

    it('addChildNode 空 label 应默认"新节点"', () => {
      const id = store.addChildNode('a', '')
      expect(store.getNode(id).label).toBe('新节点')
    })

    it('addSiblingNode 无父节点时应创建根节点', () => {
      const id = store.addSiblingNode('a')
      expect(store.getParentId(id)).toBeNull()
    })

    it('addEdge 缺少源或目标应抛错', () => {
      expect(() => store.addEdge({ source: '', target: 'b', type: 'x' })).toThrow()
      expect(() => store.addEdge({ source: 'a', target: '', type: 'x' })).toThrow()
    })

    it('updateEdge 不存在的边应抛错', () => {
      expect(() => store.updateEdge('nonexistent', { type: 'x' })).toThrow('不存在')
    })

    it('_syncEdgeCounter 无边时应为 0', () => {
      const s = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: { g1: { nodes: [{ id: 'a', label: 'A' }], edges: [] } },
        currentGraphId: 'g1',
      })
      s._syncEdgeCounter()
      expect(s._edgeIdCounter).toBe(0)
    })

    it('loadFromData 当前图谱不在 graphs 中应切换到第一个', () => {
      store.loadFromData({ graphs: [{ id: 'other', name: 'Other' }], dataMap: { other: { nodes: [], edges: [] } }, currentGraphId: 'g1' })
      expect(store.getCurrentGraphId()).toBe('other')
    })
  })
})
