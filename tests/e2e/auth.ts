import type { Page } from '@playwright/test'

type AuthOptions = {
  blockKnowledgeGraphApi?: boolean
}

export async function authenticatePage(page: Page, { blockKnowledgeGraphApi = true }: AuthOptions = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('knowledge-graph-auth-token', 'e2e-token')
  })

  await page.route('**/api/user', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 1,
          name: 'E2E User',
          email: 'e2e@example.com',
        },
      }),
    })
  })

  if (blockKnowledgeGraphApi) {
    // 普通 E2E 只验证本地画布交互，阻止生产构建访问真实用户图谱 API。
    await page.route('**/api/knowledge-graphs**', async (route) => {
      await route.abort()
    })
  }
}
