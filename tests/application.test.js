import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KnowledgeGraphApplication } from '../src/application/KnowledgeGraphApplication.js'
import { GraphSyncService } from '../src/application/GraphSyncService.js'
import { KnowledgeStore } from '../src/store.js'
import { ViewManager } from '../src/view/viewManager.js'

describe('应用级视图同步', () => {
  let application
  let stored
  let stopStore

  beforeEach(() => {
    stored = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    })
    localStorage.setItem('kg-viewer-view', JSON.stringify({
      first: {
        viewMode: 'full',
        focusNodeId: 'root',
        timelineEnabled: true,
        timelineMax: 1,
        activeCategories: ['family'],
      },
      second: {
        viewMode: 'full',
        focusNodeId: 'single',
        timelineEnabled: false,
        edgeDisplayMode: 'all',
        activeCategories: ['social'],
      },
    }))
    application = new KnowledgeGraphApplication()
    application.store = new KnowledgeStore({
      graphs: [{ id: 'first', name: '首个' }, { id: 'second', name: '第二个' }],
      currentGraphId: 'first',
      dataMap: {
        first: {
          nodes: [{ id: 'root', label: '中心', chapter: 1 }, { id: 'later', label: '后出场', chapter: 5 }],
          edges: [{ id: 'relation', source: 'root', target: 'later', type: '父子' }],
        },
        second: { nodes: [{ id: 'single', label: '独立节点' }], edges: [] },
      },
    })
    application.graph = {
      sync: vi.fn(),
      applyVisibility: vi.fn(),
      setEdgeDisplayMode: vi.fn(),
      setShowEdgeLabels: vi.fn(),
      fitToVisibleNodes: vi.fn(),
    }
    application.editor = { onStoreUpdate: vi.fn() }
    application._updateGraphSelector = vi.fn()
    application.viewManager = new ViewManager(application.store, application.graph)
    application.syncService = new GraphSyncService(application.store)
    vi.spyOn(application.syncService, 'scheduleSave').mockImplementation(() => {})
    vi.spyOn(application.viewManager, 'loadForGraph')
    vi.spyOn(application.viewManager, 'applyView')
    stopStore = application._subscribeToStore()
  })

  afterEach(() => {
    stopStore?.()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('切换前加载目标图谱视图，一次变更只同步一次并保留两边的筛选', () => {
    application.store.switchGraph('second')

    expect(application.viewManager.getState()).toMatchObject({
      focusNodeId: 'single', timelineEnabled: false, activeCategories: ['social'], edgeDisplayMode: 'all',
    })
    expect(application.viewManager.applyView).toHaveBeenCalledExactlyOnceWith({ layout: true })
    expect(JSON.parse(stored.get('kg-viewer-view')).first).toMatchObject({
      timelineEnabled: true, timelineMax: 1, activeCategories: ['family'],
    })

    application.store.switchGraph('first')

    expect(application.viewManager.getState()).toMatchObject({
      focusNodeId: 'root', timelineEnabled: true, timelineMax: 1, activeCategories: ['family'],
    })
    expect(application.viewManager.applyView).toHaveBeenCalledTimes(2)
    expect(application.graph.applyVisibility).toHaveBeenLastCalledWith(new Set(['root']), new Set())
    expect(JSON.parse(stored.get('kg-viewer-view')).second).toMatchObject({
      timelineEnabled: false, activeCategories: ['social'], edgeDisplayMode: 'all',
    })
  })

  it('同图谱的服务器 ID 替换应保留当前视图并在新 ID 下持久化', () => {
    const before = application.viewManager.getState()
    application.syncService.graphIdAliases.set('first', '123')
    application.store.replaceGraphId('first', '123')

    expect(application.viewManager.getState()).toEqual(before)
    expect(application.viewManager.loadForGraph).toHaveBeenCalledExactlyOnceWith('first')
    expect(application.viewManager.applyView).toHaveBeenCalledExactlyOnceWith({ layout: false })
    expect(JSON.parse(stored.get('kg-viewer-view'))['123']).toMatchObject({
      focusNodeId: 'root', timelineEnabled: true, timelineMax: 1, activeCategories: ['family'],
    })
  })

  it('首次普通编辑前读取已保存视图，避免默认状态覆盖章节过滤', () => {
    application.store.updateNode('root', { label: '改名中心' })

    expect(application.viewManager.loadForGraph).toHaveBeenCalledExactlyOnceWith('first')
    expect(application.viewManager.applyView).toHaveBeenCalledExactlyOnceWith({ layout: false })
    expect(application.graph.applyVisibility).toHaveBeenLastCalledWith(new Set(['root']), new Set())
    expect(JSON.parse(stored.get('kg-viewer-view')).first).toMatchObject({ timelineEnabled: true, timelineMax: 1 })
  })
})
