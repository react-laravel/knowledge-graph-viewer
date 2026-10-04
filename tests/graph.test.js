import { describe, expect, it, vi } from 'vitest'
import cytoscape from 'cytoscape'
import { getMinimapNodeRadius, GraphManager } from '../src/graph.js'

describe('minimap node radius', () => {
  it('密集图中的普通节点应该明显缩小', () => {
    expect(getMinimapNodeRadius(100)).toBe(1.25)
    expect(getMinimapNodeRadius(60)).toBe(1.5)
    expect(getMinimapNodeRadius(30)).toBe(1.75)
  })

  it('少量节点保持可见且高亮节点更醒目', () => {
    expect(getMinimapNodeRadius(10)).toBe(2)
    expect(getMinimapNodeRadius(100, true)).toBe(2.15)
    expect(getMinimapNodeRadius(10, true)).toBe(2.5)
  })
})

describe('canvas visibility state', () => {
  it('统计和适应图谱按可见性类别读取，不依赖渲染器的样式可见缓存', () => {
    const cy = cytoscape({
      headless: true,
      styleEnabled: false,
      elements: [
        { data: { id: 'root' } },
        { data: { id: 'visible' } },
        { data: { id: 'hidden' } },
        { data: { id: 'shown-edge', source: 'root', target: 'visible' } },
        { data: { id: 'hidden-edge', source: 'root', target: 'hidden' } },
      ],
    })
    const graph = Object.create(GraphManager.prototype)
    graph.cy = cy
    graph._scheduleMinimapDraw = vi.fn()
    graph.applyVisibility(new Set(['root', 'visible']), new Set(['shown-edge']))

    // 无样式的渲染器仍把三个节点视为 visible；领域可见集合只有两个。
    expect(cy.nodes(':visible')).toHaveLength(3)
    expect(graph.getViewportState()).toMatchObject({ nodes: 2, edges: 1 })
    const fit = vi.spyOn(graph, 'fitToVisibleNodes').mockImplementation(() => {})
    graph.fitVisibleGraph()
    expect(fit).toHaveBeenCalledExactlyOnceWith(new Set(['root', 'visible']))
    cy.destroy()
  })
})
