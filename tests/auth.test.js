import { describe, expect, it } from 'vitest'
import { cleanSsoUrl, safeReturnUrl } from '../src/auth.js'

describe('SSO URL helpers', () => {
  it('removes callback credentials without changing other query parameters', () => {
    const url = cleanSsoUrl(
      'https://mind.dogeow.com/?ticket=secret&return_to=https%3A%2F%2Fmind.dogeow.com%2F%3Fview%3D1&view=1#node'
    )

    expect(url.href).toBe('https://mind.dogeow.com/?view=1#node')
  })

  it('accepts only same-origin return URLs', () => {
    expect(safeReturnUrl('/?graph=2', 'https://mind.dogeow.com').href).toBe(
      'https://mind.dogeow.com/?graph=2'
    )
    expect(safeReturnUrl('https://evil.example/phish', 'https://mind.dogeow.com').href).toBe(
      'https://mind.dogeow.com/'
    )
  })
})
