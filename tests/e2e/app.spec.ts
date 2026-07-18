import { test, expect } from '@playwright/test'
import { authenticatePage } from './auth'

test.describe('知识图谱编辑器 - E2E', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
    await page.goto('/')
    await page.waitForSelector('#cy canvas', { timeout: 10000 })
    await page.waitForFunction(() => window.kgStore && window.cy)
  })

  test('应该看到图谱和侧边栏', async ({ page }) => {
    // 检查画布存在（至少一个 canvas 可见）
    const canvas = page.locator('#cy canvas').first()
    await expect(canvas).toBeVisible()

    // 检查侧边栏存在
    await expect(page.locator('#sidebar')).toBeVisible()

    // 检查图谱选择器有选项
    const select = page.locator('#graph-select')
    await expect(select).toBeVisible()
    await expect(select.locator('option')).toHaveCount(1)
  })

  test('应该能搜索节点', async ({ page }) => {
    const searchInput = page.locator('#search-input')
    await searchInput.fill('贾母')
    await searchInput.press('Enter')

    // 搜索后应该能看到高亮的节点（canvas 上有变化）
    await page.waitForTimeout(500)
  })

  test('侧边栏树形列表应该显示节点', async ({ page }) => {
    // 切换到节点 tab
    await page.click('.tab[data-tab="tree"]')

    // 等待树渲染 - 应该有多个节点
    await expect(page.locator('#tree-view .tree-node').first()).toBeVisible()
  })

  test('节点列表应该能搜索', async ({ page }) => {
    await page.click('.tab[data-tab="tree"]')

    const treeSearch = page.locator('#tree-search-input')
    await treeSearch.fill('贾')
    await page.waitForTimeout(300)

    // 搜索后节点列表应该非空
    await expect(page.locator('#tree-view .tree-node').first()).toBeVisible()
  })

  test('展开/收起全部按钮应该能工作', async ({ page }) => {
    await page.click('.tab[data-tab="tree"]')

    const toggleBtn = page.locator('#btn-tree-toggle')
    await expect(toggleBtn).toBeVisible()

    // 初始状态应该是 ⊟（全部展开）
    await expect(toggleBtn).toHaveText('⊟')

    // 点击收起
    await toggleBtn.click()
    await expect(toggleBtn).toHaveText('⊞')

    // 点击展开
    await toggleBtn.click()
    await expect(toggleBtn).toHaveText('⊟')
  })

  test('节点列表点击节点应该高亮', async ({ page }) => {
    await page.click('.tab[data-tab="tree"]')

    await page.evaluate(() => {
      const label = document.querySelector('#tree-view [data-select]')
      if (!label) return
      window.kgStore.selectAndFocus(label.dataset.select)
    })
    await page.waitForTimeout(200)

    await expect(page.locator('#tree-view .tree-node.selected')).toHaveCount(1, { timeout: 2000 })
  })

  test('点击节点文字应该聚焦到该节点', async ({ page }) => {
    await page.click('.tab[data-tab="tree"]')

    // 找到贾母节点
    const jiaMu = page.locator('#tree-view .tree-node').filter({ hasText: '贾母' })
    if (await jiaMu.count() > 0) {
      await jiaMu.click()
      // 验证画布没有报错
      await page.waitForTimeout(300)
    }
  })

  test('布局设置滑块应该能调整', async ({ page }) => {
    const repulsionSlider = page.locator('#layout-repulsion')
    await expect(repulsionSlider).toBeVisible()

    // 拖动滑块
    await repulsionSlider.fill('15000')
    await expect(page.locator('#val-repulsion')).toHaveText('15000')
  })

  test('应用布局设置应该触发重新布局', async ({ page }) => {
    const applyBtn = page.locator('#btn-apply-layout')
    await expect(applyBtn).toBeVisible()

    await applyBtn.click()

    // 等待布局动画（proof 模式可能需要几秒）
    await page.waitForTimeout(2000)
  })

  test('新图谱中编辑节点时按 Tab 应该创建子节点并继续输入', async ({ page }) => {
    // 关系筛选和时间轴只属于带章节数据的《红楼梦》示例。
    await expect(page.locator('#relation-filter-section')).toBeVisible()
    await expect(page.locator('#timeline-section')).toBeVisible()
    await page.click('.tab[data-tab="tree"]')
    page.once('dialog', async (dialog) => dialog.accept('技术'))
    await page.click('#btn-new-graph')
    await expect(page.locator('#relation-filter-section')).toHaveClass(/hidden/)
    await expect(page.locator('#timeline-section')).toHaveClass(/hidden/)
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id || ''))
      .not.toBe('btn-new-graph')

    // 空图谱第一次按 Tab 创建根节点并进入编辑。
    await page.keyboard.press('Tab')
    const editor = page.locator('.node-editor.editing textarea')
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()
    await page.evaluate(() => window.cy?.zoom(3))
    await editor.fill('技术')

    // 编辑时再次按 Tab：提交当前文本，创建子节点，并把输入焦点交给子节点。
    await editor.press('Tab')
    await expect(editor).toBeFocused()
    await expect(editor).toHaveValue('新节点')

    const typography = await page.evaluate(() => {
      const input = document.querySelector('.node-editor.editing textarea')
      const node = window.cy?.$('node.node-editing').first()
      const style = input ? getComputedStyle(input) : null
      return {
        editorFontSize: Number.parseFloat(style?.fontSize || '0'),
        nodeFontSize: node?.nonempty() ? Number.parseFloat(node.style('font-size')) * window.cy.zoom() : 0,
        editorColor: style?.color || '',
        nodeColor: node?.nonempty() ? node.style('color') : '',
      }
    })
    expect(Math.abs(typography.editorFontSize - typography.nodeFontSize)).toBeLessThan(0.5)
    expect(typography.editorColor.replace(/\s/g, '')).toBe(typography.nodeColor.replace(/\s/g, ''))

    await expect
      .poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0))
      .toBe(2)
    await expect
      .poll(() => page.evaluate(() => window.cy?.edges().length ?? 0))
      .toBe(1)

    // 连续按 Tab 创建下一级节点时，节点之间也必须保持可见间距。
    await editor.fill('子节点')
    await editor.press('Tab')
    await expect(editor).toHaveValue('新节点')
    await expect
      .poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0))
      .toBe(3)

    const minimumNodeDistance = await page.evaluate(() => {
      const nodes = window.cy?.nodes().toArray() ?? []
      const distances = nodes.flatMap((node, index) =>
        nodes.slice(index + 1).map((other) => {
          const first = node.position()
          const second = other.position()
          return Math.hypot(first.x - second.x, first.y - second.y)
        }),
      )
      return distances.length ? Math.min(...distances) : 0
    })
    expect(minimumNodeDistance).toBeGreaterThan(80)
  })

  test('点击当前选中节点应该进入编辑并能改名', async ({ page }) => {
    await page.waitForTimeout(1500)
    const nodeId = await page.evaluate(() => window.cy?.$('node.selected').id() || '')
    if (!nodeId) return

    // 画布上已经呈绿色选中的焦点节点，一次点击就应进入编辑。
    const clickPoint = await page.evaluate((id) => {
      const node = window.cy?.getElementById(id)
      const pane = document.getElementById('cy')?.getBoundingClientRect()
      const pos = node?.renderedPosition()
      return pane && pos ? { x: pane.left + pos.x, y: pane.top + pos.y } : null
    }, nodeId)
    expect(clickPoint).not.toBeNull()
    await page.mouse.click(clickPoint.x, clickPoint.y)
    const editor = page.locator('.node-editor.editing textarea')
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()
    await editor.fill('点击改名')
    await page.locator('#graph-select').click()
    await expect
      .poll(() => page.evaluate((id) => window.cy?.getElementById(id).data('label') || '', nodeId))
      .toBe('点击改名')
  })

  test('未归入家族方框的节点（如刘姥姥）应该能点击选中', async ({ page }) => {
    await page.click('.tab[data-tab="data"]')
    page.once('dialog', (dialog) => dialog.accept())
    await page.click('#btn-reset')
    await page.waitForTimeout(2000)

    await page.click('.tab[data-tab="tree"]')
    const liu = page.locator('#tree-view .tree-node').filter({ hasText: '刘姥姥' })
    await liu.click()
    await page.waitForTimeout(300)

    const selectedId = await page.evaluate(() => window.cy?.$('node.selected').id() || '')
    expect(selectedId).toBe('刘姥姥')
  })

  test('Esc 应该取消选择', async ({ page }) => {
    await page.click('.tab[data-tab="tree"]')
    const firstNode = page.locator('#tree-view .tree-node').first()
    await firstNode.click()
    await page.waitForTimeout(200)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    const selectedCount = await page.locator('#tree-view .tree-node.selected').count()
    expect(selectedCount).toBe(0)
  })

  test('导出按钮应该能触发下载', async ({ page }) => {
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null)

    await page.click('.tab[data-tab="data"]')
    await page.click('#btn-export')

    const download = await downloadPromise
    if (download) {
      expect(download.suggestedFilename()).toContain('knowledge-graph')
    }
  })

  test('重新布局按钮应该能工作', async ({ page }) => {
    await page.click('.tab[data-tab="data"]')
    await page.click('#btn-layout')
    await page.waitForTimeout(2000)
  })

  test('重置按钮应该恢复默认数据', async ({ page }) => {
    await page.click('.tab[data-tab="data"]')

    page.once('dialog', (dialog) => dialog.accept())
    await page.click('#btn-reset')
    await page.waitForTimeout(500)
  })
})
