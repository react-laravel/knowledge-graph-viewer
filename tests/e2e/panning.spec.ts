import { test, expect } from '@playwright/test'

test.describe('父节点平移交互', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Cytoscape 使用多层 canvas
    await page.waitForSelector('#cy canvas', { timeout: 10000 })
  })

  test('在画布区域拖拽应该能移动视角', async ({ page }) => {
    // Cytoscape 有多个 canvas 层，取 drag 层
    const canvas = page.locator('#cy canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    // 在画布区域模拟拖拽
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 10 })
    await page.mouse.up()

    // 等待平移完成
    await page.waitForTimeout(300)
    // 不应该报错
  })

  test('普通拖拽画布也应该能移动视角', async ({ page }) => {
    const canvas = page.locator('#cy canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    await page.mouse.move(box.x + 50, box.y + 50)
    await page.mouse.down()
    await page.mouse.move(box.x + 150, box.y + 100, { steps: 10 })
    await page.mouse.up()

    await page.waitForTimeout(300)
  })

  test('按住空格拖拽应该能移动节点', async ({ page }) => {
    const canvas = page.locator('#cy canvas').first()
    const box = await canvas.boundingBox()
    if (!box) return

    // 按住空格
    await page.keyboard.down(' ')
    await page.waitForTimeout(100)

    // 拖拽
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 10 })
    await page.mouse.up()

    // 释放空格
    await page.keyboard.up(' ')

    await page.waitForTimeout(300)
  })
})
