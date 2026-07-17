/**
 * Knowledge Graph API service
 * 与后端 dogeow-api 通信
 */

const DEFAULT_API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : 'https://next-api.dogeow.com'
const API_BASE = import.meta.env.VITE_KNOWLEDGE_API_URL || DEFAULT_API_BASE
const TOKEN_KEY = 'knowledge-graph-auth-token'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}
}

async function request(path, opts) {
  opts = opts || {}
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...opts.headers,
  }

  const token = getToken()
  if (token) {
    headers.Authorization = 'Bearer ' + token
  }

  const res = await fetch(API_BASE + path, {
    ...opts,
    headers,
  })

  if (res.status === 401) {
    setToken(null)
  }

  if (!res.ok) {
    const text = await res.text().catch(function () { return '' })
    let message = '请求失败 (' + res.status + ')'
    try {
      const json = JSON.parse(text)
      message = json.message || message
    } catch {}
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return {}
  const json = await res.json()

  // dogeow-api 的通用响应使用 { success, data, message }，知识图谱旧接口则
  // 直接返回业务对象；这里同时兼容两种响应形状。
  if (json && typeof json === 'object' && typeof json.success === 'boolean' && 'data' in json) {
    return json.data
  }

  return json
}

export const authApi = {
  currentUser() {
    return request('/api/user')
  },

  exchangeTicket(ticket, codeVerifier) {
    return request('/api/auth/sso/exchange', {
      method: 'POST',
      body: JSON.stringify({
        client: 'knowledge-graph',
        ticket,
        code_verifier: codeVerifier,
      }),
    })
  },

  logout() {
    return request('/api/logout', { method: 'POST' })
  },
}

export const knowledgeApi = {
  list() {
    return request('/api/knowledge-graphs')
  },

  async create(name, description, data) {
    const response = await request('/api/knowledge-graphs', {
      method: 'POST',
      body: JSON.stringify({ name, description, data }),
    })
    return response.graph ?? response
  },

  show(id) {
    return request('/api/knowledge-graphs/' + id)
  },

  async update(id, data) {
    const response = await request('/api/knowledge-graphs/' + id, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    return response.graph ?? response
  },

  delete(id) {
    return request('/api/knowledge-graphs/' + id, {
      method: 'DELETE',
    })
  },
}
