import { ApiError, authApi, getToken, setToken } from './api.js'

const SSO_CLIENT = 'knowledge-graph'
const PKCE_VERIFIER_KEY = 'knowledge-graph-sso-verifier'
const ACCOUNT_URL = (import.meta?.env?.VITE_DOGEOW_URL || 'https://next.dogeow.com').replace(/\/$/, '')

function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function cleanSsoUrl(url) {
  const clean = new URL(url)
  clean.searchParams.delete('ticket')
  clean.searchParams.delete('return_to')
  return clean
}

export function safeReturnUrl(returnTo, origin) {
  try {
    const target = new URL(returnTo || '/', origin)
    return target.origin === origin ? target : new URL('/', origin)
  } catch {
    return new URL('/', origin)
  }
}

async function createPkcePair() {
  if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
    throw new Error('当前浏览器不支持安全登录所需的加密能力')
  }

  const verifier = base64Url(globalThis.crypto.getRandomValues(new Uint8Array(48)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

function setAuthScreen(status, options = {}) {
  const screen = document.getElementById('auth-screen')
  const statusNode = document.getElementById('auth-status')
  const retry = document.getElementById('btn-auth-retry')
  if (statusNode) statusNode.textContent = status
  if (retry) retry.hidden = !options.retry
  if (screen) screen.hidden = Boolean(options.hidden)
  document.body.classList.toggle('auth-pending', !options.hidden)
}

let retryBound = false

function bindAuthRetry() {
  if (retryBound) return
  retryBound = true
  document.getElementById('btn-auth-retry')?.addEventListener('click', () => {
    void beginSsoLogin().catch((error) => setAuthScreen(error.message, { retry: true }))
  })
}

function readVerifier() {
  try {
    return sessionStorage.getItem(PKCE_VERIFIER_KEY)
  } catch {
    return null
  }
}

function clearVerifier() {
  try {
    sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  } catch {}
}

export async function beginSsoLogin() {
  setAuthScreen('正在前往 DogeOW 登录…')
  const { verifier, challenge } = await createPkcePair()
  try {
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  } catch {
    throw new Error('浏览器无法保存临时登录状态，请允许会话存储后重试')
  }

  const returnTo = cleanSsoUrl(window.location.href).href
  const loginUrl = new URL(`${ACCOUNT_URL}/auth/sso/${SSO_CLIENT}`)
  loginUrl.searchParams.set('return_to', returnTo)
  loginUrl.searchParams.set('code_challenge', challenge)
  window.location.replace(loginUrl.href)
}

async function exchangeCallback(ticket, returnTo) {
  const verifier = readVerifier()
  if (!verifier) throw new Error('登录校验信息已丢失，请重新登录')

  try {
    const result = await authApi.exchangeTicket(ticket, verifier)
    if (!result?.token || !result?.user) throw new Error('登录服务返回的数据不完整')
    setToken(result.token)

    const target = safeReturnUrl(returnTo, window.location.origin)
    window.history.replaceState({}, '', `${target.pathname}${target.search}${target.hash}`)
    return result.user
  } finally {
    clearVerifier()
  }
}

export async function requireSso() {
  bindAuthRetry()
  setAuthScreen('正在确认 DogeOW 登录状态…')
  const params = new URLSearchParams(window.location.search)
  const ticket = params.get('ticket')

  try {
    let user = null
    if (ticket) {
      setAuthScreen('正在完成统一登录…')
      user = await exchangeCallback(ticket, params.get('return_to'))
    } else if (getToken()) {
      user = await authApi.currentUser()
    } else {
      await beginSsoLogin()
      return null
    }

    setAuthScreen('', { hidden: true })
    return user
  } catch (error) {
    setToken(null)
    const message = error instanceof Error ? error.message : '统一登录失败'
    const prefix = error instanceof ApiError && error.status === 401 ? '登录票据无效或已过期' : message
    setAuthScreen(prefix, { retry: true })
    return null
  }
}

export function initAuthUi(user) {
  const name = document.getElementById('auth-user-name')
  if (name) name.textContent = user?.name || user?.email || 'DogeOW 用户'

  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    setAuthScreen('正在退出…')
    try {
      await authApi.logout()
    } catch {
      // 即使服务端令牌已失效，也继续清理本地登录态。
    } finally {
      setToken(null)
      await beginSsoLogin().catch((error) => setAuthScreen(error.message, { retry: true }))
    }
  })
}
