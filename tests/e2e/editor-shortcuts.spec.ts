import { test, expect, type Page } from '@playwright/test'
import { authenticatePage } from './auth'

async function selectRelation(page: Page, id = 'relation') {
  await page.evaluate((edgeId) => {
    window.cy.getElementById(edgeId).emit('tap')
  }, id)
  await expect.poll(() => page.evaluate(() => window.cy.$('edge.selected').id())).toBe(id)
  await page.locator('#cy').focus()
}

async function renameAlpha(page: Page, label: string) {
  await page.evaluate(() => window.kgStore.editNode('alpha'))
  const input = page.locator('.node-editor.editing textarea')
  await expect(input).toBeFocused()
  await input.fill(label)
  await page.locator('#cy').focus()
  await expect.poll(() => page.evaluate(() => window.cy.getElementById('alpha').data('label')))
    .toBe(label)
}

test.describe('画布编辑快捷键', () => {
  test.beforeEach(async ({ page }) => {
    await authenticatePage(page)
    await page.addInitScript(() => {
      window.localStorage.setItem('kg-viewer-data', JSON.stringify({
        graphs: [{ id: 'keyboard', name: '快捷键测试', description: '' }],
        currentGraphId: 'keyboard',
        dataMap: {
          keyboard: {
            mode: 'mindmap',
            rootNodeId: 'root',
            nodes: [
              { id: 'root', label: '快捷键测试', group: '', isRoot: true },
              { id: 'alpha', label: 'Alpha', group: '', parent: 'root', branchSide: 'left' },
              { id: 'beta', label: 'Beta', group: '', parent: 'root', branchSide: 'right' },
            ],
            edges: [
              { id: 'child-alpha', source: 'root', target: 'alpha', type: '子节点', hierarchy: true },
              { id: 'child-beta', source: 'root', target: 'beta', type: '子节点', hierarchy: true },
              { id: 'relation', source: 'alpha', target: 'beta', type: '关联' },
              { id: 'relation-b', source: 'beta', target: 'root', type: '师友' },
            ],
          },
        },
      }))
      window.localStorage.setItem('kg-viewer-view', JSON.stringify({
        keyboard: { viewMode: 'full', focusNodeId: 'root' },
      }))
    })
    await page.goto('/')
    await page.waitForFunction(() => window.kgStore && window.cy)
    await expect(page.locator('#cy canvas').first()).toBeVisible()
  })

  test('选中节点后 Enter 和 F2 应直接进入编辑，Escape 保留名称', async ({ page }) => {
    const input = page.locator('.node-editor.editing textarea')
    for (const key of ['Enter', 'F2']) {
      await page.evaluate(() => window.kgStore.selectAndFocus('alpha'))
      await page.locator('#cy').focus()
      await page.keyboard.press(key)
      await expect(input).toBeVisible()
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('Alpha')
      await input.fill('取消这次改名')
      await input.press('Escape')
      await expect(input).toBeHidden()
      expect(await page.evaluate(() => window.cy.getElementById('alpha').data('label'))).toBe('Alpha')
    }
  })

  test('选中关系后 Enter 和 F2 应直接进入关系编辑', async ({ page }) => {
    const input = page.locator('.edge-editor.editing input')
    for (const key of ['Enter', 'F2']) {
      await selectRelation(page)
      await page.keyboard.press(key)
      await expect(input).toBeVisible()
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('关联')
      await input.fill('取消这次关系改名')
      await input.press('Escape')
      await expect(input).toBeHidden()
      expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('关联')
    }
  })

  test('关系文本撤销和重做应保留图谱历史', async ({ page }) => {
    // 先留下真正可撤销的节点修改，避免图谱 undo 无事可做时的假阳性。
    await renameAlpha(page, 'Alpha 已改名')

    await selectRelation(page)
    await page.keyboard.press('F2')
    const input = page.locator('.edge-editor.editing input')
    await expect(input).toBeFocused()
    await page.keyboard.insertText('朋友')
    await expect(input).toHaveValue('朋友')

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await input.press(`${modifier}+z`)
    await expect(input).toHaveValue('关联')
    await input.press(`${modifier}+Shift+z`)
    await expect(input).toHaveValue('朋友')
    expect(await page.evaluate(() => window.cy.getElementById('alpha').data('label'))).toBe('Alpha 已改名')
    expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('关联')

    await input.press('Enter')
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('relation').data('type')))
      .toBe('朋友')
  })

  test('关系输入法确认候选时 Enter 不应提前提交', async ({ page }) => {
    await selectRelation(page)
    await page.keyboard.press('F2')
    const input = page.locator('.edge-editor.editing input')
    await expect(input).toBeFocused()
    await input.dispatchEvent('compositionstart')
    await input.fill('师友')
    await input.press('Enter')
    await expect(input).toBeFocused()
    await expect(input).toBeVisible()
    expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('关联')

    await input.dispatchEvent('compositionend')
    // 有的浏览器在 compositionend 后仍以 isComposing 标记最后一个 Enter。
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
    await expect(input).toBeVisible()
    expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('关联')

    await input.press('Enter')
    await expect(input).toBeHidden()
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('relation').data('type')))
      .toBe('师友')
  })

  test('工具栏撤销未命名草稿不应同时撤销之前的有效修改', async ({ page }) => {
    await renameAlpha(page, 'Alpha 已改名')
    await page.keyboard.press('Tab')
    const input = page.locator('.node-editor.editing textarea')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('新节点')
    expect(await page.evaluate(() => window.cy.nodes().length)).toBe(4)

    await page.locator('#btn-undo').click()
    await expect(input).toBeHidden()
    expect(await page.evaluate(() => window.cy.nodes().length)).toBe(3)
    expect(await page.evaluate(() => window.cy.getElementById('alpha').data('label'))).toBe('Alpha 已改名')
    await expect(page.locator('#btn-undo')).toBeEnabled()

    await page.locator('#btn-undo').click()
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('alpha').data('label')))
      .toBe('Alpha')
  })

  test('关系名称无效时工具栏撤销和重做不应修改图谱历史', async ({ page }) => {
    await renameAlpha(page, 'Alpha 第一次改名')
    await renameAlpha(page, 'Alpha 第二次改名')
    await page.locator('#btn-undo').click()
    await expect.poll(() => page.evaluate(() => window.cy.getElementById('alpha').data('label')))
      .toBe('Alpha 第一次改名')
    await expect(page.locator('#btn-undo')).toBeEnabled()
    await expect(page.locator('#btn-redo')).toBeEnabled()

    await selectRelation(page)
    await page.keyboard.press('F2')
    const input = page.locator('.edge-editor.editing input')
    await expect(input).toBeFocused()
    await input.fill('')

    for (const id of ['btn-undo', 'btn-redo']) {
      await page.locator(`#${id}`).click()
      await expect(input).toBeFocused()
      await expect(input).toBeVisible()
      await expect(page.locator('#toast')).toContainText('关系类型不能为空')
      expect(await page.evaluate(() => window.cy.getElementById('alpha').data('label'))).toBe('Alpha 第一次改名')
      expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('关联')
      await expect(page.locator('#btn-undo')).toBeEnabled()
      await expect(page.locator('#btn-redo')).toBeEnabled()
    }
  })

  test('空关系名称失焦后选择另一关系不应把名称写到旧关系', async ({ page }) => {
    await renameAlpha(page, 'Alpha 已改名')
    await selectRelation(page)
    await page.keyboard.press('F2')
    const input = page.locator('.edge-editor.editing input')
    await expect(input).toBeFocused()
    await input.dispatchEvent('compositionstart')
    await input.fill('')
    await page.locator('#cy').focus()
    await expect(input).toBeHidden()
    await expect(page.locator('.edge-editor input')).toHaveValue('关联')

    await selectRelation(page, 'relation-b')
    await page.keyboard.press('F2')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('师友')
    await input.press('Enter')
    await page.locator('#btn-undo').click()
    expect(await page.evaluate(() => window.cy.getElementById('alpha').data('label'))).toBe('Alpha')
    expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('关联')
    expect(await page.evaluate(() => window.cy.getElementById('relation-b').data('type'))).toBe('师友')
  })

  test('节点输入法编辑失焦后画布编辑快捷键仍应可用', async ({ page }) => {
    await page.evaluate(() => window.kgStore.editNode('alpha'))
    const input = page.locator('.node-editor.editing textarea')
    await expect(input).toBeFocused()
    await input.dispatchEvent('compositionstart')
    await input.fill('Alpha 输入法改名')
    await page.locator('#cy').focus()

    await page.evaluate(() => window.kgStore.selectAndFocus('beta'))
    await page.keyboard.press('F2')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Beta')
    expect(await page.evaluate(() => window.cy.getElementById('alpha').data('label'))).toBe('Alpha 输入法改名')
  })

  test('程序触发另一关系选择时应先验证旧关系，并保持详情和名称身份', async ({ page }) => {
    await selectRelation(page)
    await page.keyboard.press('F2')
    const input = page.locator('.edge-editor.editing input')
    await expect(input).toBeFocused()
    await input.fill('')

    for (const event of ['tap', 'onetap', 'dbltap']) {
      await page.evaluate((type) => {
        window.cy.getElementById('relation-b').emit(type)
      }, event)
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('')
      expect(await page.evaluate(() => window.cy.$('edge.selected').id())).toBe('relation')
      await expect(page.locator('#detail-content .detail-dl dd').first()).toHaveText('关联')
    }

    await input.fill('新关系')
    await page.evaluate(() => {
      window.cy.getElementById('relation-b').emit('tap')
    })
    expect(await page.evaluate(() => window.cy.$('edge.selected').id())).toBe('relation-b')
    await expect(page.locator('.edge-editor input')).toHaveValue('师友')
    expect(await page.evaluate(() => window.cy.getElementById('relation').data('type'))).toBe('新关系')
    expect(await page.evaluate(() => window.cy.getElementById('relation-b').data('type'))).toBe('师友')
    await expect(page.locator('#detail-content .detail-dl dd').first()).toHaveText('师友')
  })

  for (const interruption of ['blur', 'hidden'] as const) {
    test(`空格移动节点在 ${interruption} 后应恢复画布平移`, async ({ page }) => {
      await page.locator('#cy').focus()
      await page.keyboard.down(' ')
      await expect(page.locator('#cy')).not.toHaveClass(/space-panning/)
      expect(await page.evaluate(() => window.cy.getElementById('alpha').grabbable())).toBe(true)

      await page.evaluate((event) => {
        if (event === 'blur') {
          window.dispatchEvent(new Event('blur'))
        } else {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true })
          document.dispatchEvent(new Event('visibilitychange'))
          Reflect.deleteProperty(document, 'hidden')
        }
      }, interruption)

      await expect(page.locator('#cy')).toHaveClass(/space-panning/)
      expect(await page.evaluate(() => ({
        locked: window.cy.getElementById('alpha').locked(),
        grabbable: window.cy.getElementById('alpha').grabbable(),
        rootLocked: window.cy.getElementById('root').locked(),
      }))).toEqual({ locked: true, grabbable: false, rootLocked: true })
      await page.keyboard.up(' ')
    })
  }
})
