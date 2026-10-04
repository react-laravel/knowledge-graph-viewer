import { describe, expect, it, vi } from 'vitest'
import { GraphSyncService } from '../src/application/GraphSyncService.js'

function createStore(initial = {}) {
  const state = {
    graphs: initial.graphs ?? [],
    currentGraphId: initial.currentGraphId ?? initial.graphs?.[0]?.id ?? 'local-1',
    dataMap: initial.dataMap ?? {},
  }

  return {
    state,
    loadFromData: vi.fn((data) => Object.assign(state, data)),
    getCurrentGraphId: vi.fn(() => state.currentGraphId),
    getGraphs: vi.fn(() => state.graphs),
    replaceGraphId: vi.fn((oldId, newId, metadata) => {
      state.graphs = state.graphs.map((graph) => (
        graph.id === oldId ? { ...graph, ...metadata, id: newId } : graph
      ))
      state.dataMap[newId] = state.dataMap[oldId]
      delete state.dataMap[oldId]
      if (state.currentGraphId === oldId) state.currentGraphId = newId
    }),
    exportPersistedData: vi.fn(() => ({
      graphs: state.graphs,
      currentGraphId: state.currentGraphId,
      dataMap: state.dataMap,
    })),
    exportData: vi.fn(() => ({
      graphs: state.graphs,
      currentGraphId: state.currentGraphId,
      dataMap: state.dataMap,
    })),
  }
}

function createApi(overrides = {}) {
  return {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({ id: 101, name: '新图谱', data: {} })),
    update: vi.fn(async (_id, payload) => payload),
    delete: vi.fn(async () => ({})),
    ...overrides,
  }
}

describe('GraphSyncService', () => {
  it('loads and clones server graph collections before handing them to the store', async () => {
    const remoteGraph = {
      id: 8,
      name: '技术',
      description: '示例',
      updated_at: '2026-07-31T00:00:00Z',
      data: {
        nodes: [{ id: 'root', label: '技术' }],
        edges: [{ id: 'e1', source: 'root', target: 'child' }],
      },
    }
    const store = createStore()
    const service = new GraphSyncService(store, {
      api: createApi({ list: vi.fn(async () => [remoteGraph]) }),
    })

    await service.loadGraphs()

    expect(store.loadFromData).toHaveBeenCalledOnce()
    const payload = store.loadFromData.mock.calls[0][0]
    expect(payload.currentGraphId).toBe('8')
    expect(payload.dataMap['8'].nodes).toEqual(remoteGraph.data.nodes)
    expect(payload.dataMap['8'].nodes).not.toBe(remoteGraph.data.nodes)
    expect(payload.dataMap['8'].edges).not.toBe(remoteGraph.data.edges)
  })

  it('preserves the selected graph when refreshing a reordered server catalog', async () => {
    const store = createStore({
      graphs: [{ id: '8', name: '选中图谱' }, { id: '9', name: '另一图谱' }],
      currentGraphId: '8',
    })
    const service = new GraphSyncService(store, {
      api: createApi({ list: vi.fn(async () => [{ id: 9, name: '另一图谱' }, { id: 8, name: '选中图谱' }]) }),
    })

    await service.loadGraphs()

    expect(store.loadFromData.mock.calls[0][0].currentGraphId).toBe('8')
    expect(store.getCurrentGraphId()).toBe('8')
  })

  it('selects the first remote graph when the previous selection no longer exists', async () => {
    const store = createStore({ currentGraphId: 'removed' })
    const service = new GraphSyncService(store, {
      api: createApi({ list: vi.fn(async () => [{ id: 9, name: '首个' }, { id: 8, name: '另一个' }]) }),
    })

    await service.loadGraphs()

    expect(store.loadFromData.mock.calls[0][0].currentGraphId).toBe('9')
    expect(store.getCurrentGraphId()).toBe('9')
  })

  it('updates numeric graph IDs even when the remote catalog was unavailable', async () => {
    const store = createStore({
      graphs: [{ id: '42', name: '技术', description: '' }],
      currentGraphId: '42',
      dataMap: { 42: { nodes: [{ id: 'root' }], edges: [] } },
    })
    const api = createApi()
    const service = new GraphSyncService(store, { api })

    await service.saveNow('42')

    expect(api.update).toHaveBeenCalledWith(42, {
      name: '技术',
      description: '',
      data: store.state.dataMap['42'],
    })
    expect(api.create).not.toHaveBeenCalled()
  })

  it('replaces a temporary graph ID after the first successful create', async () => {
    const store = createStore({
      graphs: [{ id: 'local-1', name: '技术', description: '' }],
      currentGraphId: 'local-1',
      dataMap: { 'local-1': { nodes: [{ id: 'root' }], edges: [] } },
    })
    const onCatalogChange = vi.fn()
    const api = createApi({
      create: vi.fn(async () => ({
        id: 77,
        name: '技术',
        description: '',
        updated_at: '2026-07-31T00:00:00Z',
      })),
    })
    const service = new GraphSyncService(store, { api, onCatalogChange })

    await service.saveNow('local-1')

    expect(store.replaceGraphId).toHaveBeenCalledWith('local-1', '77', {
      name: '技术',
      description: '',
      updatedAt: '2026-07-31T00:00:00Z',
    })
    expect(onCatalogChange).toHaveBeenCalledOnce()
  })

  it('does not resurrect a temporary graph deleted while its create is in flight', async () => {
    let finishCreate
    const createPromise = new Promise((resolve) => {
      finishCreate = resolve
    })
    const store = createStore({
      graphs: [{ id: 'local-1', name: '技术', description: '' }],
      currentGraphId: 'local-1',
      dataMap: { 'local-1': { nodes: [{ id: 'root' }], edges: [] } },
    })
    const api = createApi({ create: vi.fn(() => createPromise) })
    const service = new GraphSyncService(store, { api })

    const saving = service.saveNow('local-1')
    await Promise.resolve()
    await service.deleteGraph('local-1')
    finishCreate({ id: 88, name: '技术', description: '' })
    await saving

    expect(api.delete).toHaveBeenCalledWith(88)
    expect(store.replaceGraphId).not.toHaveBeenCalled()
  })

  it('restores saving when a remote deletion fails', async () => {
    vi.useFakeTimers()
    const error = Object.assign(new Error('服务不可用'), { status: 503 })
    const store = createStore({
      graphs: [{ id: '9', name: '技术', description: '' }],
      currentGraphId: '9',
      dataMap: { 9: { nodes: [{ id: 'root' }], edges: [] } },
    })
    const service = new GraphSyncService(store, {
      api: createApi({ delete: vi.fn(async () => { throw error }) }),
    })

    await expect(service.deleteGraph('9')).rejects.toBe(error)

    expect(service.deletedGraphIds.has('9')).toBe(false)
    expect(service.saveTimers.has('9')).toBe(true)
    vi.clearAllTimers()
    vi.useRealTimers()
  })
})
