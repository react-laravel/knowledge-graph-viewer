/**
 * Knowledge Graph API service
 * 与后端 dogeow-api 通信
 */

const API_BASE = (import.meta?.env?.VITE_KNOWLEDGE_API_URL) || 'http://localhost:8000'

function getToken() {
  try {
    return localStorage.getItem('auth_token')
  } catch {
    return null
  }
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
    try { localStorage.removeItem('auth_token') } catch {}
  }

  if (!res.ok) {
    const text = await res.text().catch(function () { return '' })
    let message = '请求失败 (' + res.status + ')'
    try {
      const json = JSON.parse(text)
      message = json.message || message
    } catch {}
    throw new Error(message)
  }

  if (res.status === 204) return {}
  return res.json()
}

export const knowledgeApi = {
  list() {
    return request('/api/knowledge-graphs')
  },

  create(name, description, data) {
    return request('/api/knowledge-graphs', {
      method: 'POST',
      body: JSON.stringify({ name, description, data }),
    })
  },

  show(id) {
    return request('/api/knowledge-graphs/' + id)
  },

  update(id, data) {
    return request('/api/knowledge-graphs/' + id, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  delete(id) {
    return request('/api/knowledge-graphs/' + id, {
      method: 'DELETE',
    })
  },
}
