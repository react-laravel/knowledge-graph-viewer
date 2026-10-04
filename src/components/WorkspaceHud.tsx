import { useEffect, useState } from 'react'

interface WorkspaceState {
  zoom: number
  minZoom: number
  maxZoom: number
  nodes: number
  edges: number
  canUndo: boolean
  canRedo: boolean
}

/** Command boundary: React never owns or operates a Cytoscape instance. */
export interface WorkspaceController {
  getState(): WorkspaceState
  subscribe(listener: () => void): () => void
  undo(): void
  redo(): void
  zoomBy(factor: number): void
  resetZoom(): void
  fit(): void
}

function ControlIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export function WorkspaceHud({ controller }: { controller: WorkspaceController | null }) {
  const [state, setState] = useState<WorkspaceState | null>(null)

  useEffect(() => {
    if (!controller) return
    const update = () => setState(controller.getState())
    const unsubscribe = controller.subscribe(update)
    update()
    return () => {
      unsubscribe()
    }
  }, [controller])

  if (!controller || !state) return null

  return (
    <>
      <div className="workspace-history" data-ui-chrome="">
        <div className="canvas-control-group" role="group" aria-label="图谱历史">
          <button type="button" id="btn-undo" className="canvas-control" aria-label="撤销" title="撤销图谱修改" disabled={!state.canUndo} onPointerDown={(event) => event.preventDefault()} onClick={() => controller.undo()}>
            <ControlIcon path="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 6 6v3" />
          </button>
          <button type="button" id="btn-redo" className="canvas-control" aria-label="重做" title="重做图谱修改" disabled={!state.canRedo} onPointerDown={(event) => event.preventDefault()} onClick={() => controller.redo()}>
            <ControlIcon path="m15 5 5 5-5 5M20 10H10a6 6 0 0 0-6 6v3" />
          </button>
        </div>
        <span id="canvas-stats" className="canvas-stats" role="status" aria-live="polite" aria-atomic="true">
          {state.nodes} 节点 · {state.edges} 关系
        </span>
      </div>
      <div className="canvas-control-group workspace-viewport" role="group" aria-label="画布视图" data-ui-chrome="">
        <button type="button" id="btn-zoom-in" className="canvas-control" aria-label="放大画布" title="放大画布" disabled={state.zoom >= state.maxZoom} onClick={() => controller.zoomBy(1.25)}>
          <ControlIcon path="M12 5v14M5 12h14" />
        </button>
        <button type="button" id="btn-reset-zoom" className="canvas-control canvas-zoom-value" aria-label={`当前缩放 ${Math.round(state.zoom * 100)}%，恢复 100%`} title="恢复 100%" onClick={() => controller.resetZoom()}>
          {Math.round(state.zoom * 100)}%
        </button>
        <button type="button" id="btn-zoom-out" className="canvas-control" aria-label="缩小画布" title="缩小画布" disabled={state.zoom <= state.minZoom} onClick={() => controller.zoomBy(0.8)}>
          <ControlIcon path="M5 12h14" />
        </button>
        <button type="button" id="btn-fit-view" className="canvas-control canvas-fit-control" aria-label="适应当前可见图谱" title="适应当前可见图谱" disabled={state.nodes === 0} onClick={() => controller.fit()}>
          <ControlIcon path="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5M9 9h6v6H9z" />
        </button>
      </div>
    </>
  )
}
