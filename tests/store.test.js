import { describe, it, expect, beforeEach } from 'vitest'
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
})
