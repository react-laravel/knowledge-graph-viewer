const STORAGE_KEY = 'kg-viewer-data'

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)

    // 新格式：多图谱
    if (data?.graphs && data?.dataMap) {
      return data
    }

    // 旧格式：单图谱 → 升级为多图谱
    if (data?.nodes && data?.edges) {
      return {
        graphs: [{ id: 'default', name: '示例图谱', description: '', updatedAt: new Date().toISOString() }],
        dataMap: { default: { nodes: data.nodes, edges: data.edges } },
        currentGraphId: 'default',
      }
    }

    return null
  } catch {
    return null
  }
}

export function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // storage full or unavailable
  }
}

export function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

export function exportJson(data) {
  // 导出为兼容旧格式的单一图谱数据（当前图谱）
  const currentId = data.currentGraphId ?? 'default'
  const current = data.dataMap?.[currentId] ?? { nodes: data.nodes ?? [], edges: data.edges ?? [] }
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `knowledge-graph-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        // 兼容旧格式导入：单个 {nodes, edges}
        if (data?.nodes && data?.edges) {
          resolve({
            graphs: [{ id: 'default', name: '导入的图谱', description: '', updatedAt: new Date().toISOString() }],
            dataMap: { default: { nodes: data.nodes, edges: data.edges } },
            currentGraphId: 'default',
          })
          return
        }
        // 新格式导入
        if (data?.graphs && data?.dataMap) {
          resolve(data)
          return
        }
        reject(new Error('无效的图谱数据格式'))
      } catch {
        reject(new Error('JSON 解析失败'))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}
