import { describe, it, expect, beforeEach, vi } from 'vitest'
import { KnowledgeStore } from '../src/store.js'

// 构造 store，saveToStorage 替换为 no-op 避免触及 localStorage
function createStore(initialData) {
  const store = new KnowledgeStore(initialData)
  const orig = store._notify.bind(store)
  store._notify = (...args) => orig(...args)
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

    it('思维导图中心节点不能删除', () => {
      store.createGraph('技术')
      expect(() => store.deleteNode('root')).toThrow('中心节点不能删除')
      expect(() => store.setNodeParent('root', 'some-group')).toThrow('中心节点不能移动')
      expect(store.getNode('root')).not.toBeNull()
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

    it('中心节点创建“同级”时实际创建一级主题', () => {
      store.createGraph('技术')
      const id = store.addSiblingNode('root', '一级主题')
      expect(store.getHierarchyParentId(id)).toBe('root')
      expect(store.getNode(id).branchSide).toBe('right')
    })
  })

  describe('draft nodes', () => {
    it('草稿子节点应拒绝不存在的父节点，且不留下数据或历史', () => {
      store.createGraph('技术')
      const graphId = store.getCurrentGraphId()
      const before = store.exportData().dataMap[graphId]
      const historyLength = store._getUndoStack().length

      expect(() => store.addDraftChildNode('missing-parent')).toThrow('父节点不存在')

      const after = store.exportData().dataMap[graphId]
      expect(after.nodes).toEqual(before.nodes)
      expect(after.edges).toEqual(before.edges)
      expect(store._getUndoStack()).toHaveLength(historyLength)
    })

    it('草稿同级节点应拒绝不存在的源节点，不得创建孤儿节点', () => {
      store.createGraph('技术')
      const graphId = store.getCurrentGraphId()
      const before = store.exportData().dataMap[graphId]
      const historyLength = store._getUndoStack().length

      expect(() => store.addDraftSiblingNode('missing-source')).toThrow('节点不存在')

      const after = store.exportData().dataMap[graphId]
      expect(after.nodes).toEqual(before.nodes)
      expect(after.edges).toEqual(before.edges)
      expect(store._getUndoStack()).toHaveLength(historyLength)
    })

    it('草稿子节点只存在于工作数据，持久化快照应排除草稿及连线', () => {
      store.createGraph('技术')
      const listener = vi.fn()
      store.subscribe(listener)

      const id = store.addDraftChildNode('root')

      expect(store.isDraftNode(id)).toBe(true)
      expect(store.getHierarchyParentId(id)).toBe('root')
      expect(store.exportData().dataMap[store.getCurrentGraphId()].nodes.some((node) => node.id === id)).toBe(true)
      const persisted = store.exportPersistedData().dataMap[store.getCurrentGraphId()]
      expect(persisted.nodes.some((node) => node.id === id)).toBe(false)
      expect(persisted.edges.some((edge) => edge.source === id || edge.target === id)).toBe(false)
      expect(listener).toHaveBeenLastCalledWith(expect.any(Object), { transient: true })
    })

    it('确认草稿不新增历史，一次 undo 应删除整个新节点', () => {
      store.createGraph('技术')
      const listener = vi.fn()
      store.subscribe(listener)
      const id = store.addDraftChildNode('root')
      const historyLength = store._getUndoStack().length

      expect(store.finalizeDraftNode(id, '  AI  ')).toBe(true)

      expect(store.getNode(id)).toMatchObject({ id, label: 'AI' })
      expect(store.getNode(id).draft).toBeUndefined()
      expect(store._getUndoStack()).toHaveLength(historyLength)
      expect(store.exportPersistedData().dataMap[store.getCurrentGraphId()].nodes.some((node) => node.id === id)).toBe(true)
      expect(listener).toHaveBeenLastCalledWith(expect.any(Object), { transient: false })

      expect(store.undo()).toBe(true)
      expect(store.getNode(id)).toBeNull()
      expect(store._currentData().edges.some((edge) => edge.source === id || edge.target === id)).toBe(false)
    })

    it('丢弃草稿应移除对应历史，之后 undo 不能复活', () => {
      store.createGraph('技术')
      const id = store.addDraftChildNode('root')
      expect(store.canUndo()).toBe(true)

      expect(store.discardDraftNode(id)).toBe(true)

      expect(store.getNode(id)).toBeNull()
      expect(store.canUndo()).toBe(false)
      expect(store.undo()).toBe(false)
    })

    it('草稿复用已删除节点 ID 时，丢弃草稿不能破坏更早的撤销记录', () => {
      store.createGraph('技术')
      const originalId = store.addChildNode('root', '新节点')
      store.deleteNode(originalId)

      const draftId = store.addDraftChildNode('root')
      expect(draftId).toBe(originalId)
      expect(store.discardDraftNode(draftId)).toBe(true)

      expect(store.undo()).toBe(true)
      expect(store.getNode(originalId)).toMatchObject({ id: originalId, label: '新节点' })
      expect(store.isDraftNode(originalId)).toBe(false)
      expect(store.getHierarchyParentId(originalId)).toBe('root')
    })

    it('只允许丢弃明确草稿，旧的同名节点不能被当作草稿删除', () => {
      const legacyId = store.addChildNode('a', '新节点')

      expect(store.isDraftNode(legacyId)).toBe(false)
      expect(store.finalizeDraftNode(legacyId, '正式名称')).toBe(false)
      expect(store.discardDraftNode(legacyId)).toBe(false)
      expect(store.getNode(legacyId)).not.toBeNull()
    })

    it('草稿同级节点应沿用原节点父级，中心节点的同级仍创建为子级', () => {
      store.createGraph('技术')
      const branchId = store.addChildNode('root', 'XPath')
      const siblingId = store.addDraftSiblingNode(branchId)
      expect(store.getHierarchyParentId(siblingId)).toBe('root')
      expect(store.isDraftNode(siblingId)).toBe(true)
      store.discardDraftNode(siblingId)

      const rootSiblingId = store.addDraftSiblingNode('root')
      expect(store.getHierarchyParentId(rootSiblingId)).toBe('root')
      expect(store.isDraftNode(rootSiblingId)).toBe(true)
    })

    it('多个草稿交错丢弃后，历史快照也不能复活已丢弃节点', () => {
      store.createGraph('技术')
      const first = store.addDraftChildNode('root')
      const second = store.addDraftChildNode('root')

      expect(store.discardDraftNode(first)).toBe(true)
      expect(store.finalizeDraftNode(second, '保留')).toBe(true)
      expect(store.undo()).toBe(true)

      expect(store.getNode(first)).toBeNull()
      expect(store.getNode(second)).toBeNull()
    })
  })

  describe('legacy placeholder cleanup', () => {
    function createLegacyStore() {
      return createStore({
        graphs: [{ id: 'mindmap', name: '技术' }],
        dataMap: {
          mindmap: {
            mode: 'mindmap',
            rootNodeId: 'root',
            nodes: [
              { id: 'root', label: '技术', group: '', isRoot: true },
              { id: 'AI', label: 'AI', group: '' },
              { id: 'other-parent', label: '其他', group: '' },
              { id: '新节点', label: '新节点', group: '' },
              { id: '新节点_1', label: '新节点', group: '' },
              { id: '新节点_2', label: 'AI', group: '' },
              { id: '新节点_3', label: '新节点', group: '', description: '已写注释' },
              { id: '新节点_4', label: '新节点', group: '', links: [{ title: '文档', url: 'https://example.com' }] },
              { id: '新节点_5', label: '新节点', group: '', tags: ['保留'] },
              { id: '新节点_6', label: '新节点', group: '' },
              { id: '新节点_7', label: '新节点', group: '' },
              { id: '新节点_8', label: '新节点', group: '', draft: true },
              { id: 'custom-placeholder', label: '新节点', group: '' },
            ],
            edges: [
              { id: 'h-ai', source: 'root', target: 'AI', type: '子节点', hierarchy: true },
              { id: 'h-other', source: 'root', target: 'other-parent', type: '子节点', hierarchy: true },
              { id: 'h-0', source: 'AI', target: '新节点', type: '子节点', hierarchy: true },
              { id: 'h-1', source: 'other-parent', target: '新节点_1', type: '子节点', hierarchy: true },
              { id: 'h-2', source: 'AI', target: '新节点_2', type: '子节点', hierarchy: true },
              { id: 'h-3', source: 'AI', target: '新节点_3', type: '子节点', hierarchy: true },
              { id: 'h-4', source: 'AI', target: '新节点_4', type: '子节点', hierarchy: true },
              { id: 'h-5', source: 'AI', target: '新节点_5', type: '子节点', hierarchy: true },
              { id: 'h-6', source: 'AI', target: '新节点_6', type: '子节点', hierarchy: true },
              { id: 'h-7', source: '新节点_6', target: '新节点_7', type: '子节点', hierarchy: true },
              { id: 'h-8', source: 'AI', target: '新节点_8', type: '子节点', hierarchy: true },
              { id: 'h-custom', source: 'AI', target: 'custom-placeholder', type: '子节点', hierarchy: true },
              { id: 'business', source: '新节点_1', target: 'AI', type: '参考' },
            ],
          },
        },
        currentGraphId: 'mindmap',
      })
    }

    it('只识别无语义数据且仅有一条入向层级边的旧叶子占位节点', () => {
      const legacyStore = createLegacyStore()

      expect(legacyStore.findLegacyPlaceholderNodeIds()).toEqual(['新节点', '新节点_7'])
      expect(legacyStore.findLegacyPlaceholderNodeIds({ parentId: 'AI' })).toEqual(['新节点'])
      expect(legacyStore.findLegacyPlaceholderNodeIds({ parentId: '新节点_6' })).toEqual(['新节点_7'])
    })

    it('旧占位节点不会被自动排除出持久化数据', () => {
      const legacyStore = createLegacyStore()
      const persisted = legacyStore.exportPersistedData().dataMap.mindmap

      expect(persisted.nodes.some((node) => node.id === '新节点')).toBe(true)
      expect(persisted.nodes.some((node) => node.id === '新节点_8')).toBe(false)
    })

    it('清理时应重新校验候选，一次 undo 恢复本次实际删除的节点和边', () => {
      const legacyStore = createLegacyStore()

      const removed = legacyStore.cleanupLegacyPlaceholderNodes(['新节点', '新节点_2', '新节点_3'])

      expect(removed).toEqual(['新节点'])
      expect(legacyStore.getNode('新节点')).toBeNull()
      expect(legacyStore.getNode('新节点_2')).not.toBeNull()
      expect(legacyStore.getNode('新节点_3')).not.toBeNull()
      expect(legacyStore.undo()).toBe(true)
      expect(legacyStore.getNode('新节点')).not.toBeNull()
      expect(legacyStore.getEdge('h-0')).not.toBeNull()
    })

    it('未指定 IDs 时只清理当前严格候选，并在确实无候选时不增加历史', () => {
      const legacyStore = createLegacyStore()
      expect(legacyStore.cleanupLegacyPlaceholderNodes()).toEqual(['新节点', '新节点_7'])
      expect(legacyStore.getNode('新节点')).toBeNull()
      expect(legacyStore.getNode('新节点_7')).toBeNull()
      expect(legacyStore.getNode('新节点_6')).not.toBeNull()

      // 原本有子节点的占位节点只会在下一次显式清理时成为严格叶子候选。
      expect(legacyStore.cleanupLegacyPlaceholderNodes()).toEqual(['新节点_6'])

      const historyLength = legacyStore._getUndoStack().length
      expect(legacyStore.cleanupLegacyPlaceholderNodes()).toEqual([])
      expect(legacyStore._getUndoStack()).toHaveLength(historyLength)
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

  describe('moveNodeUnder', () => {
    it('移动已有节点时只替换层级父节点，并支持撤销', () => {
      const root = store.addChildNode(null, '根节点')
      const firstParent = store.addChildNode(root, '原父节点')
      const nextParent = store.addChildNode(root, '新父节点')
      const child = store.addChildNode(firstParent, '待移动')
      store.addEdge({ source: firstParent, target: nextParent, type: '业务关系' })

      expect(store.moveNodeUnder(child, nextParent)).toBe(true)
      expect(store.getHierarchyParentId(child)).toBe(nextParent)
      expect(store._currentData().edges.some((edge) => edge.type === '业务关系')).toBe(true)

      store.undo()
      expect(store.getHierarchyParentId(child)).toBe(firstParent)
    })

    it('禁止移动到自己或自己的层级子节点下面', () => {
      const root = store.addChildNode(null, '根节点')
      const child = store.addChildNode(root, '子节点')
      const grandchild = store.addChildNode(child, '孙节点')

      expect(() => store.moveNodeUnder(root, root)).toThrow('自己')
      expect(() => store.moveNodeUnder(root, grandchild)).toThrow('自己的子节点')
    })

    it('中心节点不能移动，一级分支移出和移回时维护方向', () => {
      store.createGraph('技术')
      const first = store.addChildNode('root', 'XPath')
      const second = store.addChildNode('root', 'Obsidian')

      expect(() => store.moveNodeUnder('root', first)).toThrow('中心节点不能移动')
      expect(store.getNode(first).branchSide).toBe('right')
      expect(store.getNode(second).branchSide).toBe('left')

      expect(store.moveNodeUnder(first, second)).toBe(true)
      expect(store.getNode(first).branchSide).toBeUndefined()
      expect(store.moveNodeUnder(first, 'root')).toBe(true)
      expect(store.getNode(first).branchSide).toBe('right')
    })
  })

  describe('思维导图中心节点与层级结构', () => {
    it('普通关系图不会被误判为思维导图', () => {
      expect(store.getMindMapRootId()).toBeNull()
      expect(store.getMindMapStructure()).toBeNull()
      expect(store.isRootNode('a')).toBe(false)
    })

    it('优先识别显式中心节点', () => {
      const explicit = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: {
          g1: {
            nodes: [
              { id: 'center', label: '中心', isRoot: true },
              { id: 'other', label: '其他', important: 'yes' },
            ],
            edges: [],
          },
        },
        currentGraphId: 'g1',
      })

      expect(explicit.getMindMapRootId()).toBe('center')
      expect(explicit.pickDefaultFocusNodeId()).toBe('center')
    })

    it('仅当旧层级数据覆盖所有普通节点且构成单棵树时推断根节点', () => {
      const tree = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: {
          g1: {
            nodes: makeNodes(),
            edges: [
              { id: 'h1', source: 'a', target: 'b', type: '子节点', hierarchy: true },
              { id: 'h2', source: 'a', target: 'c', type: '子节点', hierarchy: true },
            ],
          },
        },
        currentGraphId: 'g1',
      })
      const partialTree = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: {
          g1: {
            nodes: makeNodes([{ id: 'd', label: 'D' }]),
            edges: [
              { id: 'h1', source: 'a', target: 'b', type: '子节点', hierarchy: true },
              { id: 'h2', source: 'b', target: 'c', type: '子节点', hierarchy: true },
            ],
          },
        },
        currentGraphId: 'g1',
      })
      const compoundNetwork = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: {
          g1: {
            nodes: [
              { id: 'org', label: '组织', group: 'org' },
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
            ],
            edges: [{ id: 'h1', source: 'a', target: 'b', type: '子节点', hierarchy: true }],
          },
        },
        currentGraphId: 'g1',
      })

      expect(tree.getMindMapRootId()).toBe('a')
      expect(partialTree.getMindMapRootId()).toBeNull()
      expect(compoundNetwork.getMindMapRootId()).toBeNull()
    })

    it('结构只使用层级边，并为旧数据补齐稳定的左右分支', () => {
      const mindMap = createStore({
        graphs: [{ id: 'g1', name: 't' }],
        dataMap: {
          g1: {
            mode: 'mindmap',
            rootNodeId: 'root',
            nodes: [
              { id: 'root', label: '中心', isRoot: true },
              { id: 'one', label: '分支 1' },
              { id: 'two', label: '分支 2' },
              { id: 'leaf', label: '子节点' },
            ],
            edges: [
              { id: 'h1', source: 'root', target: 'one', type: '子节点', hierarchy: true },
              { id: 'h2', source: 'root', target: 'two', type: '子节点', hierarchy: true },
              { id: 'h3', source: 'one', target: 'leaf', type: '子节点', hierarchy: true },
              { id: 'r1', source: 'two', target: 'leaf', type: '参考' },
            ],
          },
        },
        currentGraphId: 'g1',
      })

      expect(mindMap.getMindMapStructure()).toEqual({
        rootId: 'root',
        parentById: { one: 'root', two: 'root', leaf: 'one' },
        childrenById: {
          root: ['one', 'two'],
          one: ['leaf'],
          two: [],
          leaf: [],
        },
        branchSideById: { one: 'right', two: 'left' },
      })
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

    it('层级连线不能作为普通关系改名', () => {
      const root = store.addChildNode(null, '根节点')
      const child = store.addChildNode(root, '子节点')
      const edge = store._currentData().edges.find((item) => item.target === child)
      expect(store.isHierarchyEdge(edge.id)).toBe(true)
      expect(() => store.updateEdge(edge.id, { type: '普通关系' })).toThrow('不能直接编辑')
    })
  })

  describe('deleteEdge', () => {
    it('删除边', () => {
      store.deleteEdge('edge_ab')
      expect(store.getEdge('edge_ab')).toBeNull()
    })

    it('层级连线不能直接删除', () => {
      const root = store.addChildNode(null, '根节点')
      const child = store.addChildNode(root, '子节点')
      const edge = store._currentData().edges.find((item) => item.target === child)
      expect(() => store.deleteEdge(edge.id)).toThrow('不能直接删除')
      expect(store.getHierarchyParentId(child)).toBe(root)
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
    it('创建新图谱时自动创建以图谱名命名的中心节点', () => {
      const id = store.createGraph('  G2  ')
      expect(store.getGraphs()).toHaveLength(2)
      expect(store.getCurrentGraphId()).toBe(id)
      expect(store.getGraphs()[0].name).toBe('G2')
      expect(store.getAllNodes()).toEqual([
        { id: 'root', label: 'G2', group: '', isRoot: true },
      ])
      expect(store.getMindMapRootId()).toBe('root')
      expect(store._currentData()).toMatchObject({ mode: 'mindmap', rootNodeId: 'root' })
    })

    it('新图谱名为空时使用默认名称', () => {
      store.createGraph('   ')
      expect(store.getGraphs()[0].name).toBe('新图谱')
      expect(store.getNode('root').label).toBe('新图谱')
    })

    it('中心节点的一级分支按右左交替平衡', () => {
      store.createGraph('技术')
      const first = store.addChildNode('root', 'A')
      const second = store.addChildNode('root', 'B')
      const third = store.addChildNode('root', 'C')

      expect(store.getNode(first).branchSide).toBe('right')
      expect(store.getNode(second).branchSide).toBe('left')
      expect(store.getNode(third).branchSide).toBe('right')
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
      expect(store._currentData()).toMatchObject({ mode: 'mindmap', rootNodeId: 'root' })
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

    it('导出和撤销不会丢失思维导图元数据', () => {
      const graphId = store.createGraph('技术')
      store.addChildNode('root', 'JavaScript')
      store.undo()

      expect(store._currentData()).toMatchObject({ mode: 'mindmap', rootNodeId: 'root' })
      expect(store.exportData().dataMap[graphId]).toMatchObject({
        mode: 'mindmap',
        rootNodeId: 'root',
      })
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
      expect(node.data.isRoot).toBe('no')
      expect(node.data.mindMap).toBe('no')
    })

    it('toCytoscapeElements 应暴露思维导图中心、分支方向和层级边元数据', () => {
      store.createGraph('技术')
      const childId = store.addChildNode('root', 'XPath')
      store.addEdge({ source: childId, target: 'root', type: '参考' })

      const elems = store.toCytoscapeElements()
      const root = elems.find((element) => element.data.id === 'root')
      const child = elems.find((element) => element.data.id === childId)
      const hierarchyEdge = elems.find((element) => element.data.target === childId)
      const relationEdge = elems.find((element) => element.data.source === childId && element.data.target === 'root')

      expect(root.data).toMatchObject({ isRoot: 'yes', mindMap: 'yes', branchSide: '' })
      expect(child.data).toMatchObject({ isRoot: 'no', mindMap: 'yes', branchSide: 'right' })
      expect(hierarchyEdge.data.hierarchy).toBe('yes')
      expect(relationEdge.data.hierarchy).toBe('no')
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
