import { test, expect, type Page } from '@playwright/test'
import { authenticatePage } from './auth'

async function openWorkspace(page: Page, theme: 'light' | 'dark' = 'light') {
  await authenticatePage(page)
  await page.addInitScript((theme) => {
    localStorage.setItem('kg-viewer-theme', theme)
    localStorage.setItem('kg-viewer-data', JSON.stringify({
      graphs: [{ id: 'workspace', name: '画布工具测试' }, { id: 'secondary', name: '单节点图谱' }],
      currentGraphId: 'workspace',
      dataMap: {
        workspace: {
          mode: 'mindmap',
          rootNodeId: '贾宝玉',
          nodes: [
            { id: '贾宝玉', label: '贾宝玉', isRoot: true, chapter: 1 },
            { id: '林黛玉', label: '林黛玉', branchSide: 'left', chapter: 1 },
            { id: '薛宝钗', label: '薛宝钗', branchSide: 'right', chapter: 5 },
            { id: '王熙凤', label: '王熙凤', branchSide: 'right', chapter: 7 },
          ],
          edges: [
            { id: 'child-lin', source: '贾宝玉', target: '林黛玉', type: '子节点', hierarchy: true },
            { id: 'child-xue', source: '贾宝玉', target: '薛宝钗', type: '子节点', hierarchy: true },
            { id: 'child-wang', source: '贾宝玉', target: '王熙凤', type: '子节点', hierarchy: true },
            { id: 'social', source: '林黛玉', target: '薛宝钗', type: '朋友', category: 'social', chapter: 5 },
          ],
        },
        secondary: {
          mode: 'mindmap',
          rootNodeId: 'single',
          nodes: [{ id: 'single', label: '单节点图谱', isRoot: true }],
          edges: [],
        },
      },
    }))
    localStorage.setItem('kg-viewer-view', JSON.stringify({
      workspace: { viewMode: 'full', focusNodeId: '贾宝玉', edgeDisplayMode: 'all' },
      secondary: { viewMode: 'full', focusNodeId: 'single' },
    }))
  }, theme)
  await page.goto('/')
  await page.waitForFunction(() => window.cy && window.kgStore)
  await expect(page.locator('#btn-zoom-in')).toBeVisible()
  await expect(page.locator('#canvas-stats')).toHaveText('4 节点 · 4 关系')
}

async function readViewport(page: Page) {
  return page.evaluate(() => {
    const cy = window.cy
    const pan = cy.pan()
    const zoom = cy.zoom()
    return {
      zoom,
      center: { x: (cy.width() / 2 - pan.x) / zoom, y: (cy.height() / 2 - pan.y) / zoom },
    }
  })
}

async function expectCenteredZoom(page: Page, zoom: number, center: { x: number; y: number }) {
  await expect.poll(async () => (await readViewport(page)).zoom).toBeCloseTo(zoom, 5)
  const viewport = await readViewport(page)
  expect(viewport.center.x).toBeCloseTo(center.x, 5)
  expect(viewport.center.y).toBeCloseTo(center.y, 5)
}

async function switchGraph(page: Page, id: string) {
  await page.locator('#btn-app-menu').click()
  await expect(page.locator('#graph-select')).toBeVisible()
  await page.locator('#graph-select').selectOption(id)
  await expect(page.locator('#app-menu')).not.toHaveClass(/app-menu-open/)
}

test.describe('画布工具', () => {
  test('缩放、还原 100% 保留画布中心，极限缩放禁用对应按钮', async ({ page }) => {
    await openWorkspace(page)
    await page.evaluate(() => {
      window.cy.stop()
      window.cy.zoom(0.8)
      window.cy.pan({ x: 87, y: -43 })
    })
    const { center } = await readViewport(page)

    await page.locator('#btn-zoom-in').click()
    await expectCenteredZoom(page, 1, center)
    await expect(page.locator('#btn-reset-zoom')).toHaveText('100%')
    await page.locator('#btn-zoom-out').click()
    await expectCenteredZoom(page, 0.8, center)
    await expect(page.locator('#btn-reset-zoom')).toHaveText('80%')
    await page.locator('#btn-reset-zoom').click()
    await expectCenteredZoom(page, 1, center)

    const limits = await page.evaluate(() => ({ min: window.cy.minZoom(), max: window.cy.maxZoom() }))
    await page.evaluate(() => window.cy.zoom(window.cy.maxZoom()))
    await expect(page.locator('#btn-zoom-in')).toBeDisabled()
    await expect(page.locator('#btn-zoom-out')).toBeEnabled()
    await page.locator('#btn-zoom-out').click()
    await expect.poll(async () => (await readViewport(page)).zoom).toBeCloseTo(limits.max / 1.25, 5)
    await expect(page.locator('#btn-zoom-in')).toBeEnabled()

    await page.evaluate(() => window.cy.zoom(window.cy.minZoom()))
    await expect(page.locator('#btn-zoom-out')).toBeDisabled()
    await expect(page.locator('#btn-zoom-in')).toBeEnabled()
    await page.locator('#btn-zoom-in').click()
    await expect.poll(async () => (await readViewport(page)).zoom).toBeCloseTo(limits.min * 1.25, 5)
    await expect(page.locator('#btn-zoom-out')).toBeEnabled()
  })

  test('适应图谱只按可见节点取景，远处隐藏节点不会撑大画布', async ({ page }) => {
    await openWorkspace(page)
    await page.locator('#opt-timeline').check()
    await expect(page.locator('#canvas-stats')).toHaveText('2 节点 · 1 关系')

    const expected = await page.evaluate(() => {
      const cy = window.cy
      cy.nodes().unlock()
      cy.getElementById('贾宝玉').position({ x: 0, y: 0 })
      cy.getElementById('林黛玉').position({ x: 220, y: 80 })
      cy.getElementById('薛宝钗').position({ x: 1000000, y: 1000000 })
      cy.getElementById('王熙凤').position({ x: -1000000, y: -1000000 })
      const bounds = cy.nodes(':visible').boundingBox()
      const zoom = Math.max(cy.minZoom(), Math.min(
        (cy.width() - 120) / bounds.w,
        (cy.height() - 120) / bounds.h,
        cy.maxZoom()
      ))
      cy.zoom(cy.minZoom())
      cy.pan({ x: -500, y: 400 })
      return { zoom, center: { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 } }
    })

    await page.locator('#btn-fit-view').click()
    await expectCenteredZoom(page, expected.zoom, expected.center)
    expect(await page.evaluate(() => window.cy.getElementById('薛宝钗').hasClass('kg-hidden'))).toBe(true)
    expect((await readViewport(page)).zoom).toBeGreaterThan(0.5)
  })

  test('撤销、重做按钮恢复真实节点和关系，并同步可用状态及统计', async ({ page }) => {
    await openWorkspace(page)
    await expect(page.locator('#btn-undo')).toBeDisabled()
    await expect(page.locator('#btn-redo')).toBeDisabled()

    await page.evaluate(() => window.kgStore.selectAndFocus('薛宝钗'))
    await page.locator('#cy').focus()
    await page.keyboard.press('Delete')
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('薛宝钗').length)).toBe(0)
    await expect(page.locator('#canvas-stats')).toHaveText('3 节点 · 2 关系')
    await expect(page.locator('#btn-undo')).toBeEnabled()
    await expect(page.locator('#btn-redo')).toBeDisabled()

    await page.locator('#btn-undo').click()
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('薛宝钗').data('label'))).toBe('薛宝钗')
    await expect(page.locator('#canvas-stats')).toHaveText('4 节点 · 4 关系')
    await expect(page.locator('#btn-undo')).toBeDisabled()
    await expect(page.locator('#btn-redo')).toBeEnabled()

    await page.locator('#btn-redo').click()
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('薛宝钗').length)).toBe(0)
    await expect(page.locator('#canvas-stats')).toHaveText('3 节点 · 2 关系')
    await expect(page.locator('#btn-undo')).toBeEnabled()
    await expect(page.locator('#btn-redo')).toBeDisabled()
  })

  test('可见统计随关系筛选、章节过滤和图谱切换更新', async ({ page }) => {
    await openWorkspace(page)
    await page.locator('[data-category="social"]').uncheck()
    await expect(page.locator('#canvas-stats')).toHaveText('4 节点 · 3 关系')
    await page.locator('#opt-timeline').check()
    await expect(page.locator('#canvas-stats')).toHaveText('2 节点 · 1 关系')
    expect(await page.evaluate(() => window.cy.nodes().length)).toBe(4)

    await switchGraph(page, 'secondary')
    await expect(page.locator('#canvas-stats')).toHaveText('1 节点 · 0 关系')
    await switchGraph(page, 'workspace')
    await expect(page.locator('#canvas-stats')).toHaveText('2 节点 · 1 关系')
    await expect(page.locator('[data-category="social"]')).not.toBeChecked()
    await expect(page.locator('#opt-timeline')).toBeChecked()
  })
})

for (const device of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${device.name} ${theme} 画布工具有完整触控区域且不与小地图、节点操作重叠`, async ({ page }) => {
      await page.setViewportSize({ width: device.width, height: device.height })
      await openWorkspace(page, theme)
      await expect(page.locator('body')).toHaveClass(theme === 'dark' ? /theme-dark/ : /^(?!.*theme-dark)/)

      const layout = await page.evaluate(() => {
        const pane = document.getElementById('graph-pane')!.getBoundingClientRect()
        const controls = [...document.querySelectorAll<HTMLButtonElement>('.canvas-control')].map((button) => {
          const rect = button.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          return {
            id: button.id,
            width: rect.width,
            height: rect.height,
            insidePane: rect.left >= pane.left && rect.top >= pane.top && rect.right <= pane.right && rect.bottom <= pane.bottom,
            receivesPointer: Boolean(hit && button.contains(hit)),
          }
        })
        const rectangles = ['.workspace-history', '.workspace-viewport', '#minimap', '#node-action-bar']
          .map((selector) => document.querySelector<HTMLElement>(selector)!)
          .filter((element) => getComputedStyle(element).display !== 'none')
          .map((element) => ({ id: element.id || element.className, rect: element.getBoundingClientRect() }))
        const overlaps: string[] = []
        rectangles.forEach((a, index) => rectangles.slice(index + 1).forEach((b) => {
          if (a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top) {
            overlaps.push(`${a.id} / ${b.id}`)
          }
        }))
        return { controls, overlaps, overflow: document.documentElement.scrollWidth > window.innerWidth }
      })

      expect(layout.controls).toHaveLength(6)
      for (const control of layout.controls) {
        expect(control.width, control.id).toBeGreaterThanOrEqual(44)
        expect(control.height, control.id).toBeGreaterThanOrEqual(44)
        expect(control.insidePane, control.id).toBe(true)
        expect(control.receivesPointer, control.id).toBe(true)
      }
      expect(layout.overlaps).toEqual([])
      expect(layout.overflow).toBe(false)
      await page.locator('#btn-reset-zoom').focus()
      await expect(page.locator('#btn-reset-zoom')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.locator('#btn-reset-zoom')).toHaveText('100%')
      await page.screenshot({ path: `output/playwright/workspace-${device.name}-${theme}.png`, fullPage: true })
    })
  }
}
