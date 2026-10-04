import { WorkspaceHud, type WorkspaceController } from './WorkspaceHud'

export function GraphWorkspace({ controller }: { controller: WorkspaceController | null }) {
  return (
    <div id="graph-pane" className="graph-pane">
      <div id="cy" tabIndex={0} aria-label="知识图谱画布" />
      <WorkspaceHud controller={controller} />
      <div id="minimap" className="minimap">
        <div className="minimap-viewport" />
      </div>
      <div id="editor-layer" className="editor-layer" />
      <div id="node-action-bar" className="node-action-bar hidden" aria-live="polite">
        <span id="node-action-label" className="node-action-label" />
        <button type="button" className="node-action-btn tertiary" id="btn-add-child-node">子主题</button>
        <button type="button" className="node-action-btn tertiary" id="btn-add-sibling-node">同级</button>
        <button type="button" className="node-action-btn tertiary" id="btn-edit-selected-node">编辑</button>
        <button type="button" className="node-action-btn" id="btn-move-node">移动到…</button>
        <button type="button" className="node-action-btn secondary" id="btn-cancel-move" hidden>取消</button>
      </div>
    </div>
  )
}
