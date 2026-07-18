import { test, expect } from '@playwright/test'
import { authenticatePage } from './auth'

test('新图谱新增节点后应自动保存并在刷新后恢复', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })

  let nextId = 2
  let updateCount = 0
  const serverGraphs = [
    {
      id: 1,
      name: '原图谱',
      description: '',
      data: { nodes: [{ id: '原节点', label: '原节点', group: '' }], edges: [] },
      updated_at: '2026-07-17T00:00:00.000Z',
    },
  ]

  await page.route('**/api/knowledge-graphs**', async (route) => {
    const request = route.request()
    const method = request.method()
    const pathname = new URL(request.url()).pathname

    if (method === 'GET' && pathname.endsWith('/api/knowledge-graphs')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(serverGraphs) })
      return
    }

    if (method === 'POST' && pathname.endsWith('/api/knowledge-graphs')) {
      const body = request.postDataJSON()
      const created = {
        id: nextId++,
        name: body.name,
        description: body.description ?? '',
        data: body.data,
        updated_at: new Date().toISOString(),
      }
      serverGraphs.unshift(created)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: '图谱创建成功', graph: created }),
      })
      return
    }

    if (method === 'PUT') {
      const id = Number(pathname.split('/').pop())
      const graph = serverGraphs.find((item) => item.id === id)
      const body = request.postDataJSON()
      if (!graph || !body.name) {
        await route.fulfill({ status: 422, contentType: 'application/json', body: '{}' })
        return
      }
      Object.assign(graph, body, { updated_at: new Date().toISOString() })
      updateCount += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ message: '图谱更新成功', graph }),
      })
      return
    }

    await route.abort()
  })

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)

  page.once('dialog', async (dialog) => dialog.accept('技术'))
  await page.click('#btn-new-graph')
  await expect(page.locator('#graph-select')).toHaveValue('2')
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(1)

  await page.keyboard.press('Tab')
  const editor = page.locator('.node-editor.editing textarea')
  await editor.fill('新节点我')
  await page.locator('#sidebar').click({ position: { x: 20, y: 20 } })

  await expect.poll(() => updateCount).toBeGreaterThan(0)
  await expect
    .poll(() => serverGraphs[0].data.nodes.map((node) => node.label))
    .toEqual(expect.arrayContaining(['技术', '新节点我']))

  await page.reload()
  await page.waitForFunction(() => window.kgStore && window.cy)
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(2)
  await expect
    .poll(() => page.evaluate(() => window.cy?.nodes().map((node) => node.data('label')).sort() ?? []))
    .toEqual(['技术', '新节点我'].sort())
})
