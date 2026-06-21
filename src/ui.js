import { exportJson, importJson, clearStorage } from './storage.js'

function showToast(message, isError = false) {
  const toast = document.getElementById('toast')
  toast.textContent = message
  toast.className = `toast show${isError ? ' error' : ''}`
  clearTimeout(showToast._timer)
  showToast._timer = setTimeout(() => {
    toast.className = 'toast'
  }, 2500)
}

export function createUI(store, graph, editor) {
  let searchQuery = ''
  let currentSelection = null

  const tabs = document.querySelectorAll('.tab')
  const panels = document.querySelectorAll('.tab-panel')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      panels.forEach((p) => p.classList.remove('active'))
      tab.classList.add('active')
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active')
    })
  })

  const searchInput = document.getElementById('search-input')
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value
    if (!searchQuery.trim()) {
      graph.clearHighlight()
      return
    }
    const { nodeIds, edgeIds } = store.search(searchQuery)
    graph.setHighlight([...nodeIds, ...edgeIds])
  })

  document.getElementById('btn-clear-search').addEventListener('click', () => {
    searchInput.value = ''
    searchQuery = ''
    graph.clearHighlight()
  })

  document.getElementById('btn-export').addEventListener('click', () => {
    exportJson(store.exportData())
    showToast('已导出 JSON')
  })

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('file-import').click()
  })

  document.getElementById('file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const data = await importJson(file)
      store.loadFromData(data)
      editor.deselect()
      graph.runLayout()
      showToast('导入成功')
    } catch (err) {
      showToast(err.message, true)
    }
    e.target.value = ''
  })

  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('恢复默认示例数据？当前修改将丢失。')) return
    clearStorage()
    store.resetToDefault()
    searchInput.value = ''
    graph.clearHighlight()
    editor.deselect()
    graph.runLayout()
    showToast('已恢复默认数据')
  })

  document.getElementById('btn-layout').addEventListener('click', () => {
    graph.runLayout()
  })

  document.getElementById('btn-related-view').addEventListener('click', () => {
    if (!currentSelection || currentSelection.type !== 'node') {
      showToast('请先选中一个节点', true)
      return
    }
    graph.showRelated(currentSelection.id)
  })

  document.getElementById('btn-reset-view').addEventListener('click', () => {
    graph.resetView()
  })

  store.subscribe(() => {
    if (searchQuery.trim()) {
      const { nodeIds, edgeIds } = store.search(searchQuery)
      graph.setHighlight([...nodeIds, ...edgeIds])
    }
  })

  function onSelect(selection) {
    if (!selection) {
      currentSelection = null
      editor.onCanvasDeselect()
      return
    }
    currentSelection = selection
    if (selection.type === 'node') {
      editor.onNodeSelect(selection.id, { shiftLink: selection.shiftKey })
    } else {
      editor.onEdgeSelect(selection.id)
    }
  }

  return { onSelect }
}
