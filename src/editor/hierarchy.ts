/* ============ Nova Engine — Hierarchy panel ============ */

import { getComp } from '../engine/core'
import { addSpecToScene } from '../engine/spec'
import { entityIcon, type Editor, type LogLevel } from './state'
import { showDropdown, type MenuItem } from './ui'
import { presetList, presetSpec } from './blank'

let filter = ''

export function initHierarchy(ed: Editor, listEl: HTMLElement, addBtn: HTMLButtonElement) {
  /* toolbar row: search + add presets */
  const parent = listEl.parentElement
  if (parent) {
    const bar = document.createElement('div')
    bar.className = 'htool'
    const search = document.createElement('input')
    search.className = 'hsearch'
    search.placeholder = '🔎 Filter entities…'
    search.addEventListener('input', () => {
      filter = search.value.toLowerCase()
      renderHierarchy(ed, listEl)
    })
    search.addEventListener('keydown', ev => ev.stopPropagation())
    bar.appendChild(search)
    parent.insertBefore(bar, listEl)
  }

  /* ＋ button → preset dropdown */
  addBtn.title = 'Add entity (presets)'
  addBtn.addEventListener('click', () => {
    const mode = ed.scene.meta.mode
    const items: MenuItem[] = presetList(mode).map(p => ({
      label: `${p.icon} ${p.label}`,
      hint: '',
      action: () => {
        const spec = presetSpec(p.key, mode)
        const e = addSpecToScene(ed.scene, spec)
        e.name = uniqueName(ed, e.name)
        ed.selection = e.id
        ed.refreshAll()
        ed.log('ok' as LogLevel, `Added ${p.label}`)
      }
    }))
    const empty: MenuItem = {
      label: '▪️ Empty Entity',
      hint: '',
      action: () => {
        const e = ed.scene.createEntity(uniqueName(ed, 'Entity'), [
          { type: 'sprite2d', sprite: 'none', color: '#7c5cff', w: 60, h: 60, seed: 7, screen: false }
        ], { pos: { x: 0, y: 0, z: 0 } })
        ed.selection = e.id
        ed.refreshAll()
        ed.log('ok' as LogLevel, 'Created empty entity')
      }
    }
    showDropdown(addBtn, [empty, { sep: true } as MenuItem, ...items])
  })

  renderHierarchy(ed, listEl)
}

function uniqueName(ed: Editor, base: string): string {
  let n = base
  let i = 2
  while (ed.scene.byName(n)) n = `${base} ${i++}`
  return n
}

export function renderHierarchy(ed: Editor, listEl: HTMLElement) {
  listEl.innerHTML = ''
  const ents = ed.scene.entities.filter(e => {
    if (!filter) return true
    return e.name.toLowerCase().includes(filter) || e.tags.some(t => t.toLowerCase().includes(filter))
  })

  for (const e of ents) {
    const div = document.createElement('div')
    div.className = 'hitem' + (ed.selection === e.id ? ' sel' : '') + (e.visible ? '' : ' hidden-ent')

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

    const vis = document.createElement('button')
    vis.className = 'hvis'
    vis.textContent = e.visible ? '👁' : '🚫'
    vis.title = e.visible ? 'Hide entity' : 'Show entity'
    vis.addEventListener('click', ev => {
      ev.stopPropagation()
      e.visible = !e.visible
      ed.refreshAll()
    })

    const del = document.createElement('button')
    del.className = 'hdel'
    del.textContent = '✕'
    del.title = 'Delete entity (Del)'
    del.addEventListener('click', ev => {
      ev.stopPropagation()
      ed.scene.remove(e.id)
      if (ed.selection === e.id) ed.selection = null
      ed.refreshAll()
      ed.log('warn' as LogLevel, `Deleted "${e.name}"`)
    })

    div.append(dot, icon, name, extra, vis, del)

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
  } else if (!ents.length) {
    const empty = document.createElement('div')
    empty.className = 'empty-note'
    empty.textContent = 'Search e kono entity match hoy nai.'
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

/* used by gizmo delete / keyboard flows */
export function hasPhysics(e: import('../engine/core').Entity): boolean {
  return !!getComp(e, 'body2d') || !!getComp(e, 'rigid3d')
}
