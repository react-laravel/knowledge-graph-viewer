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
        <p class="hint">单击选择 · 双击编辑 · Hover 高亮相邻</p>
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
    const links = getNodeLinks(node)

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
      <section class="detail-edit-section">
        <label class="detail-field-label" for="detail-node-note">注释</label>
        <textarea id="detail-node-note" class="detail-note-input" rows="4" placeholder="补充说明、背景或备注…">${escapeHtml(desc)}</textarea>
        <div class="detail-links-heading">
          <span class="detail-field-label">相关链接</span>
          <button type="button" class="detail-add-link" data-add-link>+ 添加</button>
        </div>
        <div class="detail-links-editor" data-links-editor>
          ${links.map((link) => renderLinkRow(link)).join('')}
        </div>
        <p class="detail-save-hint">离开输入框后自动保存</p>
      </section>
      <div class="detail-relations">${relHtml}</div>
    `

    this.el.querySelectorAll('[data-node]').forEach((btn) => {
      btn.addEventListener('click', () => this.onNavigate?.(btn.dataset.node))
    })
    this._bindNodeEditor(nodeId, store)
  }

  _bindNodeEditor(nodeId, store) {
    const noteInput = this.el.querySelector('.detail-note-input')
    const linksEditor = this.el.querySelector('[data-links-editor]')
    const addLinkButton = this.el.querySelector('[data-add-link]')
    if (!noteInput || !linksEditor || !addLinkButton) return

    noteInput.addEventListener('change', () => {
      store.updateNode(nodeId, { description: noteInput.value })
    })

    addLinkButton.addEventListener('click', () => {
      linksEditor.insertAdjacentHTML('beforeend', renderLinkRow({ title: '', url: '' }))
      linksEditor.querySelector('[data-link-row]:last-child [data-link-url]')?.focus()
    })

    linksEditor.addEventListener('click', (event) => {
      const removeButton = event.target.closest('[data-remove-link]')
      if (!removeButton) return
      removeButton.closest('[data-link-row]')?.remove()
      this._commitNodeLinks(nodeId, store, linksEditor)
    })

    linksEditor.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target.matches('[data-link-title], [data-link-url]')) return
      event.preventDefault()
      event.target.blur()
    })

    linksEditor.addEventListener('change', (event) => {
      if (!event.target.matches('[data-link-title], [data-link-url]')) return
      this._commitNodeLinks(nodeId, store, linksEditor)
    })
  }

  _commitNodeLinks(nodeId, store, linksEditor) {
    const links = []
    for (const row of linksEditor.querySelectorAll('[data-link-row]')) {
      const titleInput = row.querySelector('[data-link-title]')
      const urlInput = row.querySelector('[data-link-url]')
      const rawUrl = urlInput.value.trim()
      urlInput.setCustomValidity('')
      if (!rawUrl) {
        updateOpenLink(row, '')
        continue
      }

      const url = normalizeHttpUrl(rawUrl)
      if (!url) {
        urlInput.setCustomValidity('请输入有效的 http 或 https 链接')
        urlInput.reportValidity()
        return false
      }

      urlInput.value = url
      const title = titleInput.value.trim() || url
      titleInput.value = title
      links.push({ title, url })
      updateOpenLink(row, url, title)
    }

    store.updateNode(nodeId, { links })
    return true
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

function getNodeLinks(node) {
  if (Array.isArray(node.links)) return node.links
  if (node.url) return [{ title: node.linkTitle ?? node.url, url: node.url }]
  return []
}

function renderLinkRow(link) {
  const title = String(link?.title ?? '')
  const url = String(link?.url ?? '')
  const safeUrl = normalizeHttpUrl(url)
  return `
    <div class="detail-link-row" data-link-row>
      <input type="text" class="detail-link-title-input" data-link-title value="${escapeHtml(title)}" placeholder="链接标题" aria-label="链接标题" />
      <div class="detail-link-url-row">
        <input type="url" class="detail-link-url-input" data-link-url value="${escapeHtml(url)}" placeholder="https://…" aria-label="链接地址" />
        <a class="detail-open-link" data-open-link href="${escapeHtml(safeUrl ?? '')}" target="_blank" rel="noopener noreferrer" title="打开链接" ${safeUrl ? '' : 'hidden'}>↗</a>
        <button type="button" class="detail-remove-link" data-remove-link title="删除链接" aria-label="删除链接">×</button>
      </div>
    </div>
  `
}

function normalizeHttpUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

function updateOpenLink(row, url, title = '') {
  const anchor = row.querySelector('[data-open-link]')
  if (!anchor) return
  if (!url) {
    anchor.hidden = true
    anchor.removeAttribute('href')
    return
  }
  anchor.href = url
  anchor.title = title ? `打开「${title}」` : '打开链接'
  anchor.hidden = false
}
