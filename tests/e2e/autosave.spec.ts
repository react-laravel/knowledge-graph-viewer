import { test, expect, type Page } from '@playwright/test'
import { authenticatePage } from './auth'

type MockKnowledgeGraphApiOptions = {
  failDeleteStatus?: number
  failList?: boolean
}

async function mockKnowledgeGraphApi(page: Page, options: MockKnowledgeGraphApiOptions = {}) {
  let nextId = 2
  const state = {
    deleteCount: 0,
    postCount: 0,
    updateCount: 0,
    putPayloads: [] as Array<Record<string, any>>,
    putRequests: [] as Array<{ id: number; body: Record<string, any> }>,
  }
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
      if (options.failList) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: '图谱列表暂时不可用' }),
        })
        return
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(serverGraphs) })
      return
    }

    if (method === 'POST' && pathname.endsWith('/api/knowledge-graphs')) {
      state.postCount += 1
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

    if (method === 'DELETE') {
      state.deleteCount += 1
      if (options.failDeleteStatus) {
        await route.fulfill({
          status: options.failDeleteStatus,
          contentType: 'application/json',
          body: JSON.stringify({ message: '删除图谱失败' }),
        })
        return
      }

      const id = Number(pathname.split('/').pop())
      const index = serverGraphs.findIndex((item) => item.id === id)
      if (index === -1) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
        return
      }
      serverGraphs.splice(index, 1)
      await route.fulfill({ status: 204 })
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
      state.updateCount += 1
      state.putPayloads.push(body)
      state.putRequests.push({ id, body })
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ message: '图谱更新成功', graph }),
      })
      return
    }

    await route.abort()
  })

  return { serverGraphs, state }
}

test('新图谱新增节点后应自动保存并在刷新后恢复', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })
  const { serverGraphs, state } = await mockKnowledgeGraphApi(page)

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)

  await page.click('#btn-app-menu')
  await expect(page.locator('#app-menu')).toBeVisible()
  page.once('dialog', async (dialog) => dialog.accept('技术'))
  await page.click('#btn-new-graph')
  await expect(page.locator('#graph-select')).toHaveValue('2')
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(1)

  await page.keyboard.press('Tab')
  const editor = page.locator('.node-editor.editing textarea')
  await editor.fill('新节点我')
  await page.locator('#sidebar').click({ position: { x: 20, y: 20 } })

  await expect.poll(() => state.updateCount).toBeGreaterThan(0)
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

test('未命名草稿超过自动保存时间后仍不应进入 API', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })
  const { serverGraphs, state } = await mockKnowledgeGraphApi(page)

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)

  await page.click('#btn-app-menu')
  page.once('dialog', async (dialog) => dialog.accept('技术'))
  await page.click('#btn-new-graph')
  await expect(page.locator('#graph-select')).toHaveValue('2')
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(1)

  // 等待新图谱创建后的初始自动保存完成，再单独观察草稿。
  await page.waitForTimeout(1200)
  const baselinePutCount = state.putPayloads.length

  await page.keyboard.press('Tab')
  const editor = page.locator('.node-editor.editing textarea')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('新节点')
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(2)

  // 超过 1 秒防抖时间后，服务端仍只应收到中心主题。
  await page.waitForTimeout(1200)
  expect(serverGraphs[0].data.nodes.map((node) => node.label)).toEqual(['技术'])
  expect(
    state.putPayloads
      .slice(baselinePutCount)
      .every((payload) => payload.data.nodes.length === 1 && payload.data.nodes[0].label === '技术')
  ).toBe(true)

  await editor.press('Escape')
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(1)
  await expect.poll(() => page.evaluate(() => window.cy?.edges().length ?? 0)).toBe(0)

  await page.waitForTimeout(1200)
  await page.reload()
  await page.waitForFunction(() => window.kgStore && window.cy)
  await expect.poll(() => page.evaluate(() => window.cy?.nodes().length ?? 0)).toBe(1)
  await expect
    .poll(() => page.evaluate(() => window.cy?.nodes().map((node) => node.data('label')) ?? []))
    .toEqual(['技术'])
  expect(serverGraphs[0].data.nodes.map((node) => node.label)).toEqual(['技术'])
})

test('旧图改名后立即切图仍应把旧图快照保存到对应 API', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })
  const { serverGraphs, state } = await mockKnowledgeGraphApi(page)
  serverGraphs.push({
    id: 99,
    name: '另一图谱',
    description: '',
    data: { nodes: [{ id: '另一节点', label: '另一节点', group: '' }], edges: [] },
    updated_at: '2026-07-17T00:00:00.000Z',
  })

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)
  await expect(page.locator('#graph-select')).toHaveValue('1')

  await page.evaluate(() => window.kgStore.editNode('原节点'))
  const editor = page.locator('.node-editor.editing textarea')
  await expect(editor).toBeFocused()
  await editor.fill('旧图已更新')
  await page.click('#btn-app-menu')
  await page.locator('#graph-select').selectOption('99')
  await expect(page.locator('#graph-select')).toHaveValue('99')

  await expect.poll(() => (
    serverGraphs.find((graph) => graph.id === 1)?.data.nodes.find((node) => node.id === '原节点')?.label
  )).toBe('旧图已更新')
  await expect.poll(() => state.putRequests.some(({ id, body }) => (
    id === 1 && body.data.nodes.some((node) => node.id === '原节点' && node.label === '旧图已更新')
  ))).toBe(true)
})

test('旧图新增节点后立即创建新图仍应先保存旧图最新快照', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })
  const { serverGraphs, state } = await mockKnowledgeGraphApi(page)

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)
  await page.evaluate(() => window.kgStore.selectAndFocus('原节点'))
  await page.keyboard.press('Tab')

  const editor = page.locator('.node-editor.editing textarea')
  await expect(editor).toBeFocused()
  await editor.fill('旧图新增节点')

  // 打开菜单会让节点编辑器失焦并提交；紧接着创建新图，旧图保存任务仍须固定到 ID=1。
  await page.click('#btn-app-menu')
  page.once('dialog', async (dialog) => dialog.accept('新图谱'))
  await page.click('#btn-new-graph')

  await expect.poll(() => (
    serverGraphs.find((graph) => graph.id === 1)?.data.nodes.some((node) => node.label === '旧图新增节点')
  )).toBe(true)
  await expect.poll(() => state.putRequests.some(({ id, body }) => (
    id === 1 && body.data.nodes.some((node) => node.label === '旧图新增节点')
  ))).toBe(true)
  await expect(page.locator('#graph-select')).not.toHaveValue('1')
})

test('DELETE 失败时应保留图谱并且之后仍可保存', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })
  const { serverGraphs, state } = await mockKnowledgeGraphApi(page, { failDeleteStatus: 500 })
  serverGraphs.push({
    id: 99,
    name: '另一图谱',
    description: '',
    data: { nodes: [{ id: '另一节点', label: '另一节点', group: '' }], edges: [] },
    updated_at: '2026-07-17T00:00:00.000Z',
  })

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)
  await page.click('#btn-app-menu')
  page.once('dialog', (dialog) => dialog.accept())
  await page.click('#btn-delete-graph')

  await expect.poll(() => state.deleteCount).toBe(1)
  await expect(page.locator('#graph-select')).toHaveValue('1')
  await expect(page.locator('#graph-select option[value="1"]')).toHaveCount(1)
  await expect(page.locator('#toast')).toContainText('删除图谱失败')

  await page.click('#btn-app-menu-close')
  await page.evaluate(() => window.kgStore.editNode('原节点'))
  const editor = page.locator('.node-editor.editing textarea')
  await editor.fill('删除失败后仍可保存')
  await page.locator('#cy').click({ position: { x: 10, y: 10 } })

  await expect.poll(() => state.putRequests.some(({ id, body }) => (
    id === 1 && body.data.nodes.some((node) => node.label === '删除失败后仍可保存')
  ))).toBe(true)
})

test('列表 GET 失败时数字图谱 ID 只能 PUT 不能 POST', async ({ page }) => {
  await authenticatePage(page, { blockKnowledgeGraphApi: false })
  await page.addInitScript(() => {
    window.localStorage.setItem('kg-viewer-data', JSON.stringify({
      graphs: [{ id: '42', name: '离线缓存图谱', description: '' }],
      dataMap: {
        42: {
          nodes: [{ id: '缓存节点', label: '缓存节点', group: '' }],
          edges: [],
        },
      },
      currentGraphId: '42',
    }))
  })
  const { serverGraphs, state } = await mockKnowledgeGraphApi(page, { failList: true })
  serverGraphs[0] = {
    id: 42,
    name: '离线缓存图谱',
    description: '',
    data: { nodes: [{ id: '缓存节点', label: '缓存节点', group: '' }], edges: [] },
    updated_at: '2026-07-17T00:00:00.000Z',
  }

  await page.goto('/')
  await page.waitForFunction(() => window.kgStore && window.cy)
  await expect.poll(() => page.evaluate(() => window.kgStore.getCurrentGraphId())).toBe('42')

  await page.evaluate(() => window.kgStore.editNode('缓存节点'))
  const editor = page.locator('.node-editor.editing textarea')
  await editor.fill('数字 ID 仍更新原图')
  await page.locator('#cy').click({ position: { x: 10, y: 10 } })

  await expect.poll(() => state.putRequests.some(({ id, body }) => (
    id === 42 && body.data.nodes.some((node) => node.label === '数字 ID 仍更新原图')
  ))).toBe(true)
  expect(state.postCount).toBe(0)
})
