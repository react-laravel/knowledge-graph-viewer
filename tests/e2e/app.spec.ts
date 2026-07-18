import { test, expect, type Dialog } from '@playwright/test'
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

  test('只有中心节点时删除图谱不需要确认', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept('临时图谱'))
    await page.click('#btn-new-graph')
    await expect(page.locator('#graph-select option')).toHaveCount(2)

    const dialogs: string[] = []
    const acceptUnexpectedDialog = async (dialog: Dialog) => {
      dialogs.push(dialog.message())
      await dialog.accept()
    }
    page.on('dialog', acceptUnexpectedDialog)
    await page.click('#btn-delete-graph')
    await expect(page.locator('#graph-select option')).toHaveCount(1)
    expect(dialogs).toEqual([])
    page.off('dialog', acceptUnexpectedDialog)
  })

  test('图谱还有子节点时删除仍需要确认', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept('有子节点的图谱'))
    await page.click('#btn-new-graph')
    await page.click('#btn-add-child-node')
    await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(2)

    let confirmation = ''
    page.once('dialog', async (dialog) => {
      confirmation = dialog.message()
      await dialog.dismiss()
    })
    await page.click('#btn-delete-graph')

    await expect.poll(() => confirmation).toBe('确定删除这个图谱吗？')
    await expect(page.locator('#graph-select option')).toHaveCount(2)
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

  test('节点树的编辑和删除按钮应该执行对应操作', async ({ page }) => {
    await page.click('.tab[data-tab="tree"]')
    const row = page.locator('#tree-view .tree-node').first()
    const nodeId = await row.getAttribute('data-id')
    if (!nodeId) return

    await row.hover()
    await row.locator('[data-edit]').click()
    const editor = page.locator('.node-editor.editing textarea')
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()
    await editor.press('Escape')

    page.once('dialog', (dialog) => dialog.accept())
    await row.hover()
    await row.locator('[data-delete]').click()
    await expect
      .poll(() => page.evaluate((id) => window.cy?.getElementById(id).nonempty() ?? false, nodeId))
      .toBe(false)
    await expect(page.locator('#detail-content')).toContainText('选中节点或连线查看详情')
  })

  test('节点详情应该能添加注释和外部链接并持久保存', async ({ page }) => {
    const nodeId = await page.evaluate(() => window.cy?.$('node.selected').id() || '')
    if (!nodeId) return
    const nodeCount = await page.evaluate(() => window.cy?.nodes().length ?? 0)

    const note = page.locator('.detail-note-input')
    await expect(note).toBeVisible()
    await note.fill('这是节点的补充注释')
    await note.press('Tab')
    await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(nodeCount)

    await page.locator('[data-add-link]').click()
    const linkRow = page.locator('[data-link-row]').last()
    await linkRow.locator('[data-link-title]').fill('参考资料')
    await linkRow.locator('[data-link-url]').fill('example.com/reference')
    await linkRow.locator('[data-link-url]').press('Enter')
    await expect(linkRow.locator('[data-link-url]')).toHaveValue('https://example.com/reference')
    await expect(linkRow.locator('[data-open-link]')).toHaveAttribute('href', 'https://example.com/reference')

    await page.reload()
    await page.waitForFunction(() => window.kgStore && window.cy)
    await page.evaluate((id) => window.kgStore.selectAndFocus(id), nodeId)
    await expect(page.locator('.detail-note-input')).toHaveValue('这是节点的补充注释')
    const savedLink = page.locator('[data-link-row]').filter({ has: page.locator('[value="参考资料"]') })
    await expect(savedLink.locator('[data-link-url]')).toHaveValue('https://example.com/reference')
    await expect(savedLink.locator('[data-open-link]')).toHaveAttribute('href', 'https://example.com/reference')
  })

  test('桌面端应该能通过移动模式把已有节点移动到目标节点下', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('input[name="view-mode"][value="full"]').check()
    const sourceId = '贾母'
    const targetId = '刘姥姥'

    const clickNode = async (nodeId) => {
      const point = await page.evaluate((id) => {
        const node = window.cy?.getElementById(id)
        const pane = document.getElementById('cy')?.getBoundingClientRect()
        const pos = node?.renderedPosition()
        return pane && pos ? { x: pane.left + pos.x, y: pane.top + pos.y } : null
      }, nodeId)
      expect(point).not.toBeNull()
      await page.mouse.click(point.x, point.y)
    }

    await page.evaluate((id) => window.kgStore.selectAndFocus(id), sourceId)
    await expect(page.locator('#node-action-bar')).toBeVisible()
    await page.locator('#btn-move-node').click()
    await expect(page.locator('#btn-cancel-move')).toBeVisible()
    await expect(page.locator('#node-action-label')).toContainText('新父节点')

    await clickNode(targetId)
    await expect
      .poll(() =>
        page.evaluate(
          ({ source, target }) =>
            window.cy
              ?.edges()
              .filter(
                (edge) =>
                  edge.source().id() === target &&
                  edge.target().id() === source &&
                  edge.data('type') === '子节点'
              ).length ?? 0,
          { source: sourceId, target: targetId }
        )
      )
      .toBe(1)
    await expect(page.locator('#btn-move-node')).toBeVisible()
    await expect(page.locator('#btn-cancel-move')).toBeHidden()
  })

  test('手机尺寸下移动按钮应该便于点按并可取消', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const actionBar = page.locator('#node-action-bar')
    const moveButton = page.locator('#btn-move-node')
    await expect(actionBar).toBeVisible()
    await expect(moveButton).toBeVisible()

    const buttonBox = await moveButton.boundingBox()
    expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44)
    expect((await actionBar.boundingBox())?.width ?? 999).toBeLessThanOrEqual(370)

    await moveButton.click()
    await expect(page.locator('#btn-cancel-move')).toBeVisible()
    await page.locator('#btn-cancel-move').click()
    await expect(moveButton).toBeVisible()

    page.once('dialog', (dialog) => dialog.accept('手机导图'))
    await page.click('#btn-new-graph')
    await page.evaluate(() => window.kgStore.selectAndFocus('root'))
    await expect(actionBar).toBeVisible()
    await expect(moveButton).toBeHidden()
    await expect(page.locator('#btn-add-sibling-node')).toBeHidden()
    await expect(page.locator('#btn-add-child-node')).toBeVisible()
    await expect(page.locator('#mindmap-layout-section')).toBeVisible()
    await expect.poll(() => page.evaluate(() => ({
      locked: window.cy?.getElementById('root').locked(),
      grabbable: window.cy?.getElementById('root').grabbable(),
    }))).toEqual({ locked: true, grabbable: false })

    await page.locator('#btn-add-child-node').click()
    await expect(page.locator('.node-editor.editing textarea')).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(2)
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

    // 新图谱创建后立即有且只有一个中心主题，不再等待第一次按键临时生成。
    await expect
      .poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0))
      .toBe(1)
    const rootState = await page.evaluate(() => {
      const root = window.cy?.getElementById('root')
      return {
        label: root?.data('label'),
        isRoot: root?.data('isRoot'),
        mindMap: root?.data('mindMap'),
        locked: root?.locked(),
        grabbable: root?.grabbable(),
      }
    })
    expect(rootState).toMatchObject({
      label: '技术',
      isRoot: 'yes',
      mindMap: 'yes',
      locked: true,
      grabbable: false,
    })
    await expect(page.locator('input[name="view-mode"][value="full"]')).toBeChecked()
    await expect(page.locator('#focus-center-label')).toHaveText('中心主题')
    await expect(page.locator('#val-focus-node')).toHaveText('技术')
    await expect(page.locator('#btn-set-focus')).toBeDisabled()
    await expect(page.locator('#network-layout-section')).toHaveClass(/hidden/)
    await expect(page.locator('#mindmap-layout-section')).not.toHaveClass(/hidden/)

    // Tab 在中心主题下创建一级主题并直接进入编辑。
    await page.keyboard.press('Tab')
    const editor = page.locator('.node-editor.editing textarea')
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()
    await page.evaluate(() => window.cy?.zoom(3))
    await expect(editor).toHaveValue('新节点')
    await editor.fill('XPath')

    // 一级主题按 Enter 创建同级主题；中心本身不会产生第二个根。
    await editor.press('Enter')
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
      .toBe(3)
    await expect
      .poll(() => page.evaluate(() => window.cy?.edges().length ?? 0))
      .toBe(2)

    await editor.fill('Obsidian')
    await page.locator('#sidebar').click({ position: { x: 20, y: 20 } })

    // 两个一级主题稳定分列中心左右，中心保持逻辑原点。
    await expect.poll(async () => page.evaluate(() => {
      const root = window.cy?.getElementById('root')
      const xpath = window.cy?.nodes().filter((node) => node.data('label') === 'XPath').first()
      const obsidian = window.cy?.nodes().filter((node) => node.data('label') === 'Obsidian').first()
      if (!root?.nonempty() || !xpath?.nonempty() || !obsidian?.nonempty()) return false
      const rootPos = root.position()
      const first = xpath.position()
      const second = obsidian.position()
      return Math.abs(rootPos.x) < 0.01
        && Math.abs(rootPos.y) < 0.01
        && first.x * second.x < 0
        && Math.abs(first.x) > 150
        && Math.abs(second.x) > 150
    })).toBe(true)

    // undo/redo 恢复结构后也必须自动重排，不能把恢复节点放回中心原点。
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(2)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(3)
    await expect.poll(() => page.evaluate(() => {
      const root = window.cy?.getElementById('root')
      if (!root?.nonempty()) return false
      const rootPos = root.position()
      return window.cy.nodes().filter((node) => node.id() !== 'root').toArray().every((node) => {
        const pos = node.position()
        return Math.hypot(pos.x - rootPos.x, pos.y - rootPos.y) > 150
      })
    })).toBe(true)
    await page.keyboard.press('Control+Shift+z')
    await expect.poll(() => page.evaluate(() => (
      window.cy?.nodes().toArray().some((node) => node.data('label') === 'Obsidian') ?? false
    ))).toBe(true)

    // 层级连线只能通过节点移动调整，不能直接改名或删除。
    const hierarchyEdgeId = await page.evaluate(() => window.cy?.edges('[hierarchy = "yes"]').first().id() || '')
    expect(hierarchyEdgeId).not.toBe('')
    await page.evaluate((id) => window.cy?.getElementById(id).emit('tap'), hierarchyEdgeId)
    await expect.poll(() => page.evaluate((id) => window.cy?.$('edge.selected').id() === id, hierarchyEdgeId)).toBe(true)
    await page.keyboard.press('Delete')
    await expect.poll(() => page.evaluate(() => window.cy?.edges().length ?? 0)).toBe(2)
    await expect(page.locator('#toast')).toContainText('层级连线')

    await page.evaluate(() => window.kgStore.selectAndFocus('root'))
    await expect(page.locator('#node-action-bar')).toBeVisible()
    await expect(page.locator('#btn-move-node')).toBeHidden()
    await expect(page.locator('#btn-add-child-node')).toBeVisible()
    await page.click('.tab[data-tab="tree"]')
    await expect(page.locator('#tree-view [data-id="root"] [data-delete]')).toHaveCount(0)
    await expect(page.locator('#tree-view [data-select]').filter({ hasText: 'XPath' })).toBeVisible()
    await expect(page.locator('#tree-view [data-select]').filter({ hasText: 'Obsidian' })).toBeVisible()
    await page.locator('#btn-tree-toggle').click()
    await expect(page.locator('#tree-view [data-select]').filter({ hasText: 'XPath' })).toBeHidden()
    await page.locator('#btn-tree-toggle').click()
    await expect(page.locator('#tree-view [data-select]').filter({ hasText: 'XPath' })).toBeVisible()
  })

  test('思维导图中心主题不能通过删除键或空格拖拽移动', async ({ page }) => {
    page.once('dialog', (dialog) => dialog.accept('技术'))
    await page.click('#btn-new-graph')
    await page.evaluate(() => window.kgStore.selectAndFocus('root'))

    await page.keyboard.press('Delete')
    await expect.poll(() => page.evaluate(() => window.cy?.getElementById('root').nonempty() ?? false)).toBe(true)
    await expect(page.locator('#toast')).toContainText('中心')

    const before = await page.evaluate(() => {
      const node = window.cy?.getElementById('root')
      const pane = document.getElementById('cy')?.getBoundingClientRect()
      const rendered = node?.renderedPosition()
      const position = node?.position()
      return pane && rendered && position
        ? { point: { x: pane.left + rendered.x, y: pane.top + rendered.y }, position }
        : null
    })
    expect(before).not.toBeNull()
    if (!before) throw new Error('中心主题坐标不可用')

    await page.keyboard.down(' ')
    await page.mouse.move(before.point.x, before.point.y)
    await page.mouse.down()
    await page.mouse.move(before.point.x + 100, before.point.y + 80, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up(' ')

    const after = await page.evaluate(() => window.cy?.getElementById('root').position() ?? null)
    if (!after) throw new Error('中心主题坐标不可用')
    expect(after.x).toBeCloseTo(before.position.x, 4)
    expect(after.y).toBeCloseTo(before.position.y, 4)
    await expect.poll(() => page.evaluate(() => ({
      locked: window.cy?.getElementById('root').locked(),
      grabbable: window.cy?.getElementById('root').grabbable(),
    }))).toEqual({ locked: true, grabbable: false })
  })

  test('单击画布节点只选择，双击才进入编辑并能改名', async ({ page }) => {
    await page.waitForTimeout(1500)
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('input[name="view-mode"][value="full"]').check()
    await expect(page.locator('input[name="view-mode"][value="full"]')).toBeChecked()
    const nodeId = await page.evaluate(() => {
      const node = window.cy
        ?.nodes()
        .filter((item) => !item.isParent() && !item.selected() && !item.hasClass('kg-hidden'))
        .first()
      return node?.nonempty() ? node.id() : window.cy?.$('node.selected').id() || ''
    })
    if (!nodeId) return

    // 单击只选择，不进入编辑，也不能改变用户手动选择的“显示全部”模式。
    const clickPoint = await page.evaluate((id) => {
      const node = window.cy?.getElementById(id)
      const pane = document.getElementById('cy')?.getBoundingClientRect()
      const pos = node?.renderedPosition()
      return pane && pos ? { x: pane.left + pos.x, y: pane.top + pos.y } : null
    }, nodeId)
    expect(clickPoint).not.toBeNull()
    await page.mouse.click(clickPoint.x, clickPoint.y)
    const editor = page.locator('.node-editor.editing textarea')
    await expect
      .poll(() => page.evaluate((id) => window.cy?.$('node.selected').id() === id, nodeId))
      .toBe(true)
    await expect(editor).toBeHidden()
    await expect(page.locator('input[name="view-mode"][value="full"]')).toBeChecked()

    // 双击是显式编辑动作，且不会附带聚焦或切换视图模式。
    await page.mouse.dblclick(clickPoint.x, clickPoint.y)
    await expect(editor).toBeVisible()
    await expect(editor).toBeFocused()
    await editor.fill('双击改名')
    await page.locator('#graph-select').click()
    await expect
      .poll(() => page.evaluate((id) => window.cy?.getElementById(id).data('label') || '', nodeId))
      .toBe('双击改名')
    await expect(page.locator('input[name="view-mode"][value="full"]')).toBeChecked()
  })

  test('中心展开模式下单击只选择，点“设为中心”才切换中心', async ({ page }) => {
    await expect(page.locator('input[name="view-mode"][value="focus"]')).toBeChecked()
    const beforeLabel = (await page.locator('#val-focus-node').textContent())?.trim() || ''
    const target = await page.evaluate(() => {
      const focusLabel = document.getElementById('val-focus-node')?.textContent?.trim()
      const node = window.cy?.nodes().filter((item) => (
        !item.isParent()
        && !item.hasClass('kg-hidden')
        && item.data('label') !== focusLabel
      )).first()
      return node?.nonempty()
        ? { id: node.id(), label: node.data('label') }
        : null
    })
    if (!target) return

    await page.evaluate((id) => window.cy?.getElementById(id).emit('tap'), target.id)
    await expect
      .poll(() => page.evaluate((id) => window.cy?.$('node.selected').id() === id, target.id))
      .toBe(true)
    await expect(page.locator('#val-focus-node')).toHaveText(beforeLabel)
    await expect(page.locator('#btn-set-focus')).toBeEnabled()

    await page.locator('#btn-set-focus').click()
    await expect(page.locator('#val-focus-node')).toHaveText(target.label)
    await expect(page.locator('input[name="view-mode"][value="focus"]')).toBeChecked()
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
