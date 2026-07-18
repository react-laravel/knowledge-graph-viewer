import { describe, it, expect } from 'vitest'
import { inferRelationCategory, enrichEdge, defaultActiveCategories } from '../src/view/relationCategories.js'
import { computeVisibility, makeAggregateId, isTagCollapsed, getAggregatableTags } from '../src/view/viewController.js'
import { createDefaultViewState } from '../src/view/viewState.js'
import { ViewManager } from '../src/view/viewManager.js'
import { defaultGraph } from '../src/data/defaultGraph.js'
import { applyTimelineFilter } from '../src/view/chapterUtils.js'

describe('relationCategories', () => {
  it('按关键词推断亲属', () => {
    expect(inferRelationCategory('父子')).toBe('family')
    expect(inferRelationCategory('母女')).toBe('family')
  })

  it('显式 category 优先', () => {
    expect(inferRelationCategory('任意', 'romance')).toBe('romance')
  })

  it('enrichEdge 写入 category', () => {
    const e = enrichEdge({ id: 'e1', source: 'a', target: 'b', type: '夫妻' })
    expect(e.category).toBe('spouse')
  })
})

describe('viewController', () => {
  const nodes = [
    { id: 'a', label: 'A', important: 'yes' },
    { id: 'b', label: 'B' },
    { id: 'c', label: 'C' },
    { id: 'org', label: 'Org', group: 'org' },
  ]
  const edges = [
    { id: 'e1', source: 'a', target: 'b', type: '链接' },
    { id: 'e2', source: 'b', target: 'c', type: '关联' },
  ]

  it('中心模式只显示 N 跳', () => {
    const state = createDefaultViewState({
      viewMode: 'focus',
      focusNodeId: 'a',
      focusDepth: 1,
      activeCategories: defaultActiveCategories(),
    })
    const { visibleNodeIds } = computeVisibility({ nodes, edges }, state)
    expect(visibleNodeIds.has('a')).toBe(true)
    expect(visibleNodeIds.has('b')).toBe(true)
    expect(visibleNodeIds.has('c')).toBe(false)
  })

  it('聚合节点 ID 可解析', () => {
    const id = makeAggregateId('org', '侍女')
    expect(id).toContain('侍女')
  })

  it('_root::标签 全局折叠匹配各组织下同名标签', () => {
    expect(isTagCollapsed(['_root::侍女'], '荣国府', '侍女')).toBe(true)
    expect(isTagCollapsed(['荣国府::侍女'], '荣国府', '侍女')).toBe(true)
    expect(isTagCollapsed(['荣国府::侍女'], '林家', '侍女')).toBe(false)
  })

  it('全局侍女折叠后各府人数之和正确', () => {
    const state = createDefaultViewState({
      viewMode: 'full',
      collapsedAggregateKeys: ['_root::侍女'],
      activeCategories: defaultActiveCategories(),
    })
    const { aggregateNodes } = computeVisibility(defaultGraph, state)
    const maidAggs = aggregateNodes.filter((a) => a.label.startsWith('侍女'))
    const total = maidAggs.reduce((sum, a) => sum + a.memberIds.length, 0)
    expect(total).toBe(20)
    expect(maidAggs.some((a) => a.label === '侍女（14）')).toBe(true)
  })

  it('聚合折叠后侧栏仍列出可操作的标签', () => {
    const state = createDefaultViewState({
      viewMode: 'focus',
      focusNodeId: '贾宝玉',
      focusDepth: 1,
      collapsedAggregateKeys: ['_root::侍女'],
      activeCategories: defaultActiveCategories(),
    })
    const tags = getAggregatableTags(defaultGraph, state)
    const maid = tags.find((t) => t.tag === '侍女')
    expect(maid).toBeTruthy()
    expect(maid.count).toBeGreaterThanOrEqual(2)
    expect(maid.collapsed).toBe(true)
  })

  it('时间轴第 1 回仅显示已出场人物', () => {
    const state = createDefaultViewState({
      viewMode: 'full',
      timelineEnabled: true,
      timelineMax: 1,
      activeCategories: defaultActiveCategories(),
    })
    const { visibleNodeIds } = computeVisibility(defaultGraph, state)
    expect(visibleNodeIds.has('贾宝玉')).toBe(false)
    expect(visibleNodeIds.has('林黛玉')).toBe(false)
    expect(visibleNodeIds.has('甄士隐')).toBe(true)
    expect(visibleNodeIds.has('贾雨村')).toBe(true)
    expect(visibleNodeIds.has('香菱')).toBe(true)
  })

  it('时间轴第 2 回中心模式仍遵守跳数', () => {
    const state = createDefaultViewState({
      viewMode: 'focus',
      focusNodeId: '林黛玉',
      focusDepth: 1,
      timelineEnabled: true,
      timelineMax: 2,
      activeCategories: defaultActiveCategories(),
    })
    const { visibleNodeIds } = computeVisibility(defaultGraph, state)
    expect(visibleNodeIds.has('林黛玉')).toBe(true)
    expect(visibleNodeIds.has('林如海')).toBe(true)
    expect(visibleNodeIds.has('甄士隐')).toBe(false)
  })

  it('章节过滤下跳数仍生效', () => {
    const state = createDefaultViewState({
      viewMode: 'focus',
      focusNodeId: '甄士隐',
      focusDepth: 1,
      timelineEnabled: true,
      timelineMax: 1,
      activeCategories: defaultActiveCategories(),
    })
    const { visibleNodeIds } = computeVisibility(defaultGraph, state)
    expect(visibleNodeIds.has('甄士隐')).toBe(true)
    expect(visibleNodeIds.has('贾雨村')).toBe(true)
    expect(visibleNodeIds.has('贾宝玉')).toBe(false)
  })

  it('第 1 回默认显示贾雨村与甄士隐的社交关系', () => {
    const state = createDefaultViewState({
      viewMode: 'focus',
      focusNodeId: '甄士隐',
      focusDepth: 1,
      timelineEnabled: true,
      timelineMax: 1,
      activeCategories: defaultActiveCategories(),
    })
    const { visibleEdgeIds } = computeVisibility(defaultGraph, state)
    expect(visibleEdgeIds.has('e86')).toBe(true)
  })

  it('无 chapter 的节点在时间轴开启时不显示', () => {
    const nodes = [
      { id: 'a', label: 'A', chapter: 1 },
      { id: 'b', label: 'B' },
    ]
    const edges = [{ id: 'e1', source: 'a', target: 'b', type: '链接' }]
    const { allowedNodes } = applyTimelineFilter(nodes, edges, 1, true)
    expect(allowedNodes.has('a')).toBe(true)
    expect(allowedNodes.has('b')).toBe(false)
  })
})

describe('ViewManager 视图模式', () => {
  it('点击节点更新焦点时不应从显示全部切换到中心展开', () => {
    const manager = new ViewManager(null, null)
    manager.state = createDefaultViewState({ viewMode: 'full', focusNodeId: 'a' })
    manager.applyView = () => {}

    manager.setFocusNode('b')

    expect(manager.getState().viewMode).toBe('full')
    expect(manager.getState().focusNodeId).toBe('b')
  })

  it('双击展开节点时不应从中心展开切换到渐进展开', () => {
    const manager = new ViewManager(null, null)
    manager.state = createDefaultViewState({ viewMode: 'focus', focusNodeId: 'a' })
    manager.applyView = () => {}

    manager.expandFromNode('b')

    expect(manager.getState().viewMode).toBe('focus')
    expect(manager.getState().expandedNodeIds).toContain('b')
  })
})
