export class DetailPanel {
  constructor(container, viewManager, onNavigate) {
    this.el = container
    this.viewManager = viewManager
    this.onNavigate = onNavigate
  }

  renderEmpty() {
    this.el.innerHTML = `
      <div class="detail-empty">
        <p>选中节点或连线查看详情</p>
        <p class="hint">单击节点聚焦 · 双击累加展开 · Hover 高亮相邻</p>
      </div>
    `
  }

  renderNode(nodeId, store) {
    const node = store.getNode(nodeId)
    if (!node) {
      this.renderEmpty()
      return
    }

    const groups = this.viewManager.getNodeRelationGroups(nodeId)
    const desc = node.description ?? node.bio ?? node.summary ?? ''
    const chapter = node.chapter ?? node.time ?? node.appearAt
    const tags = Array.isArray(node.tags) ? node.tags : node.tag ? [node.tag] : []

    const relHtml = groups.length
      ? groups
          .map(
            (g) => `
        <section class="detail-group">
          <h4><span class="cat-dot" style="background:${g.color}"></span>${escapeHtml(g.label)}</h4>
          <ul class="detail-rel-list">
            ${g.items
              .map(
                (it) => `
              <li>
                <button type="button" class="detail-link" data-node="${escapeHtml(it.otherId)}">
                  ${escapeHtml(it.otherLabel)}
                </button>
                <span class="detail-rel-type">${escapeHtml(it.type)}</span>
              </li>`
              )
              .join('')}
          </ul>
        </section>`
          )
          .join('')
      : '<p class="hint">暂无关系数据</p>'

    const tagHtml = tags.length
      ? `<div class="detail-tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : ''

    this.el.innerHTML = `
      <div class="detail-header">
        <h3>${escapeHtml(node.label)}</h3>
        <span class="detail-id">${escapeHtml(node.id)}</span>
      </div>
      ${tagHtml}
      ${chapter != null && chapter !== '' ? `<p class="detail-meta">出现：第 ${escapeHtml(String(chapter))} 回</p>` : ''}
      ${desc ? `<p class="detail-desc">${escapeHtml(desc)}</p>` : ''}
      <div class="detail-relations">${relHtml}</div>
    `

    this.el.querySelectorAll('[data-node]').forEach((btn) => {
      btn.addEventListener('click', () => this.onNavigate?.(btn.dataset.node))
    })
  }

  renderEdge(edgeId) {
    const detail = this.viewManager.getEdgeDetail(edgeId)
    if (!detail) {
      this.renderEmpty()
      return
    }
    const meta = this.viewManager.getCategoryList().find((c) => c.id === detail.category)
    const chapter = detail.chapter ?? detail.time ?? detail.appearAt
    const note = detail.note ?? detail.description ?? ''

    this.el.innerHTML = `
      <div class="detail-header">
        <h3>关系详情</h3>
      </div>
      <dl class="detail-dl">
        <dt>类型</dt><dd>${escapeHtml(detail.type)}</dd>
        <dt>分类</dt><dd><span class="cat-dot" style="background:${meta?.color ?? '#bbb'}"></span>${escapeHtml(meta?.label ?? detail.category)}</dd>
        <dt>起点</dt><dd><button type="button" class="detail-link" data-node="${escapeHtml(detail.source)}">${escapeHtml(detail.sourceLabel)}</button></dd>
        <dt>终点</dt><dd><button type="button" class="detail-link" data-node="${escapeHtml(detail.target)}">${escapeHtml(detail.targetLabel)}</button></dd>
        ${chapter != null && chapter !== '' ? `<dt>出现</dt><dd>第 ${escapeHtml(String(chapter))} 回</dd>` : ''}
        ${note ? `<dt>说明</dt><dd>${escapeHtml(note)}</dd>` : ''}
      </dl>
    `

    this.el.querySelectorAll('[data-node]').forEach((btn) => {
      btn.addEventListener('click', () => this.onNavigate?.(btn.dataset.node))
    })
  }

  update(selection, store) {
    if (!selection) {
      this.renderEmpty()
      return
    }
    if (selection.type === 'node') this.renderNode(selection.id, store)
    else this.renderEdge(selection.id)
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
