/**
 * Knowledge Graph API service
 * 与后端 dogeow-api 通信
 */

const API_BASE = (import.meta as Record<string, { env: Record<string, string | undefined> }>)?.env?.VITE_KNOWLEDGE_API_URL
  ?? 'http://localhost:8000'

function getToken(): string | null {
  try {
    // 从 localStorage 读取登录 token（与 dogeow 主项目共享）
    return localStorage.getItem('auth_token')
  } catch {
    return null
  }
}

async function request<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(opts.headers as Record<string, string>),
  }

  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  })

  if (res.status === 401) {
    // token 失效，清除本地状态
    try { localStorage.removeItem('auth_token') } catch {}
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = `请求失败 (${res.status})`
    try {
      const json = JSON.parse(text)
      message = json.message || message
    } catch {}
    throw new Error(message)
  }

  if (res.status === 204) return {} as T
  return res.json()
}

export const knowledgeApi = {
  /** 获取当前用户所有图谱列表 */
  list() {
    return request<Array<{ id: number; name: string; description: string; updated_at: string; created_at: string }>>(
      '/api/knowledge-graphs'
    )
  },

  /** 创建新图谱 */
  create(name: string, description = '', data: { nodes: unknown[]; edges: unknown[] } | null = null) {
    return request<{ id: number; name: string; description: string; data: unknown; updated_at: string; created_at: string }>(
      '/api/knowledge-graphs',
      {
        method: 'POST',
        body: JSON.stringify({ name, description, data }),
      }
    )
  },

  /** 获取单个图谱完整数据 */
  show(id: number) {
    return request<{ id: number; name: string; description: string; data: { nodes: unknown[]; edges: unknown[] }; updated_at: string; created_at: string }>(
      `/api/knowledge-graphs/${id}`
    )
  },

  /** 更新图谱 */
  update(id: number, data: { name?: string; description?: string; data?: { nodes: unknown[]; edges: unknown[] } }) {
    return request<{ id: number; name: string }>(`/api/knowledge-graphs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /** 删除图谱 */
  delete(id: number) {
    return request<{ message: string }>(`/api/knowledge-graphs/${id}`, {
      method: 'DELETE',
    })
  },
}
