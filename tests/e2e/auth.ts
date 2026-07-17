import type { Page } from '@playwright/test'

export async function authenticatePage(page: Page) {
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
}
