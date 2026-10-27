/* ============ Nova Engine — Hierarchy panel ============ */

import { entityIcon, type Editor } from './state'

export function initHierarchy(ed: Editor, listEl: HTMLElement, addBtn: HTMLButtonElement) {
  addBtn.addEventListener('click', () => {
    const e = ed.scene.createEntity('Entity ' + (ed.scene.entities.length + 1), [
      { type: 'sprite2d', sprite: 'none', color: '#7c5cff', w: 60, h: 60, seed: 7, screen: false }
    ], { pos: { x: 0, y: 0, z: 0 } })
    ed.selection = e.id
    ed.refreshAll()
    ed.log('ok', `Created "${e.name}"`)
  })
  renderHierarchy(ed, listEl)
}

export function renderHierarchy(ed: Editor, listEl: HTMLElement) {
  listEl.innerHTML = ''
  for (const e of ed.scene.entities) {
    const div = document.createElement('div')
    div.className = 'hitem' + (ed.selection === e.id ? ' sel' : '')

    const dot = document.createElement('span')
    dot.className = 'tagdot'
    dot.style.background = tagColor(e)

    const icon = document.createElement('span')
    icon.textContent = entityIcon(e)

    const name = document.createElement('span')
    name.className = 'hname'
    name.textContent = e.name

    const extra = document.createElement('span')
    extra.className = 'hscript'
    extra.textContent = e.comps.some(c => c.type === 'script') ? 'ƒ' : ''

    div.append(dot, icon, name, extra)

    div.addEventListener('click', () => {
      ed.selection = e.id
      ed.refreshHierarchy()
      ed.refreshInspector()
    })
    div.addEventListener('dblclick', () => inlineRename(ed, div, name, e))

    listEl.appendChild(div)
  }
  if (!ed.scene.entities.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-note'
    empty.textContent = 'No entities. Use ＋ above or ask the AI Builder!'
    listEl.appendChild(empty)
  }
}

function tagColor(e: { tags: string[]; comps: Array<{ type: string }> }): string {
  if (e.tags.includes('player')) return '#34d399'
  if (e.tags.includes('enemy')) return '#f87171'
  if (e.tags.includes('coin')) return '#fbbf24'
  if (e.tags.includes('ground')) return '#64748b'
  if (e.comps.some(c => c.type === 'light3d')) return '#fde047'
  return '#4b5675'
}

function inlineRename(ed: Editor, row: HTMLElement, nameSpan: HTMLElement, e: import('../engine/core').Entity) {
  const input = document.createElement('input')
  input.value = e.name
  input.style.width = '120px'
  nameSpan.replaceWith(input)
  input.focus()
  input.select()
  const commit = () => {
    e.name = input.value.trim() || e.name
    ed.refreshAll()
  }
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') commit()
    if (ev.key === 'Escape') ed.refreshAll()
    ev.stopPropagation()
  })
  input.addEventListener('blur', commit)
}
