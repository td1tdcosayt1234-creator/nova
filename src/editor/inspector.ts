/* ============ Nova Engine — Inspector panel ============ */

import { getComp, type Entity } from '../engine/core'
import { COMP_DEFS, type FieldDef } from '../engine/components'
import { selectedEntity, type Editor } from './state'

export function initInspector(ed: Editor, root: HTMLElement) {
  renderInspector(ed, root)
}

export function renderInspector(ed: Editor, root: HTMLElement) {
  root.innerHTML = ''
  const sel = selectedEntity(ed)
  if (sel) renderEntity(ed, root, sel)
  else renderSceneSettings(ed, root)
}

/* ---------- Scene settings (no selection) ---------- */

function renderSceneSettings(ed: Editor, root: HTMLElement) {
  const m = ed.scene.meta

  const card = document.createElement('div')
  card.className = 'card'
  card.innerHTML = `<div class="card-h">🌍 Scene Settings</div>`
  const body = document.createElement('div')
  body.className = 'card-b'
  card.appendChild(body)

  body.appendChild(rowText('Name', m.name, v => { m.name = v; ed.dirty = true }))
  body.appendChild(rowSelect('Mode', m.mode, ['2d', '3d'], v => {
    m.mode = v as '2d' | '3d'
    ed.applyMode()
  }))
  body.appendChild(rowCheck('Gradient BG', m.useGradient, v => { m.useGradient = v }))
  body.appendChild(rowColor('BG Top', m.bgTop, v => { m.bgTop = v; if (!m.useGradient) m.bg = v }))
  body.appendChild(rowColor('BG Bottom', m.bgBottom, v => { m.bgBottom = v; if (!m.useGradient) m.bg = v }))
  body.appendChild(rowNum('Gravity 2D', m.gravity2d, 50, v => { m.gravity2d = v }))
  body.appendChild(rowNum('Gravity 3D', m.gravity3d, 0.5, v => { m.gravity3d = v }))

  const cam2 = subCard('📷 Camera 2D')
  cam2.appendChild(rowNum('Zoom', m.camera2d.zoom, 0.05, v => { m.camera2d.zoom = v }))
  cam2.appendChild(rowText('Follow (name)', m.camera2d.follow, v => { m.camera2d.follow = v }))
  body.appendChild(cam2)

  const cam3 = subCard('📷 Camera 3D')
  cam3.appendChild(rowSelect('Mode', m.camera3d.mode, ['orbit', 'first', 'third', 'top'], v => { m.camera3d.mode = v as any }))
  cam3.appendChild(rowText('Follow (name)', m.camera3d.follow, v => { m.camera3d.follow = v }))
  cam3.appendChild(rowNum('FOV', m.camera3d.fov, 1, v => { m.camera3d.fov = v }))
  cam3.appendChild(rowNum('Distance', m.camera3d.dist, 0.5, v => { m.camera3d.dist = v }))
  cam3.appendChild(rowNum('Height', m.camera3d.height, 0.25, v => { m.camera3d.height = v }))
  body.appendChild(cam3)

  root.appendChild(card)

  const note = document.createElement('div')
  note.className = 'empty-note'
  note.innerHTML = 'Kono entity select koro nai.<br>Viewport e click kore select koro,<br>ba AI Builder theke game generate koro.'
  root.appendChild(note)
}

/* ---------- Entity inspector ---------- */

function renderEntity(ed: Editor, root: HTMLElement, e: Entity) {
  // identity card
  const idCard = document.createElement('div')
  idCard.className = 'card'
  idCard.innerHTML = `<div class="card-h">🏷️ Entity</div>`
  const ib = document.createElement('div')
  ib.className = 'card-b'
  idCard.appendChild(ib)
  ib.appendChild(rowText('Name', e.name, v => { e.name = v; ed.refreshHierarchy() }))
  ib.appendChild(rowText('Tags', e.tags.join(', '), v => { e.tags = v.split(',').map(s => s.trim()).filter(Boolean) }))
  ib.appendChild(rowCheck('Visible', e.visible, v => { e.visible = v }))
  ib.appendChild(rowVec3('Position', e.transform.pos, ed))
  ib.appendChild(rowVec3('Rotation°', e.transform.rot, ed))
  ib.appendChild(rowVec3('Scale', e.transform.scale, ed))
  root.appendChild(idCard)

  // components
  for (const c of [...e.comps]) {
    const def = COMP_DEFS[c.type]
    if (!def) continue
    const card = document.createElement('div')
    card.className = 'card'
    const h = document.createElement('div')
    h.className = 'card-h'
    h.innerHTML = `<span>${def.icon}</span><span>${def.label}</span>`
    const rm = document.createElement('button')
    rm.className = 'rm'
    rm.textContent = '✕'
    rm.title = 'Remove component'
    rm.addEventListener('click', () => {
      e.comps = e.comps.filter(x => x !== c)
      renderInspector(ed, root)
      ed.log('info', `Removed ${def.label} from "${e.name}"`)
    })
    h.appendChild(rm)
    card.appendChild(h)
    const body = document.createElement('div')
    body.className = 'card-b'
    for (const f of def.fields) body.appendChild(fieldRowFor(ed, e, c, f, root))
    card.appendChild(body)
    root.appendChild(card)
  }

  // add component
  const addCard = document.createElement('div')
  addCard.className = 'card'
  const ab = document.createElement('div')
  ab.className = 'card-b'
  const wrap = document.createElement('div')
  wrap.className = 'compadd'
  const sel = document.createElement('select')
  const available = Object.entries(COMP_DEFS).filter(([k]) => !getComp(e, k))
  for (const [k, def] of available) {
    const o = document.createElement('option')
    o.value = k
    o.textContent = `${def.icon} ${def.label}`
    sel.appendChild(o)
  }
  const addBtn = document.createElement('button')
  addBtn.className = 'btn small primary'
  addBtn.textContent = 'Add'
  addBtn.disabled = !available.length
  addBtn.addEventListener('click', () => {
    const type = sel.value
    e.comps.push(COMP_DEFS[type].defaults())
    renderInspector(ed, root)
    ed.log('ok', `Added ${COMP_DEFS[type].label} to "${e.name}"`)
  })
  wrap.append(sel, addBtn)
  ab.appendChild(wrap)
  addCard.appendChild(ab)
  root.appendChild(addCard)

  // actions
  const act = document.createElement('div')
  act.style.display = 'flex'
  act.style.gap = '8px'
  const dup = document.createElement('button')
  dup.className = 'btn'
  dup.style.flex = '1'
  dup.textContent = '⧉ Duplicate'
  dup.addEventListener('click', () => {
    const c = ed.scene.cloneEntity(e)
    ed.selection = c.id
    ed.refreshAll()
  })
  const foc = document.createElement('button')
  foc.className = 'btn'
  foc.style.flex = '1'
  foc.textContent = '🎯 Focus'
  foc.title = 'Center the camera on this entity (shortcut: F)'
  foc.addEventListener('click', () => ed.focusSelection())
  const del = document.createElement('button')
  del.className = 'btn danger'
  del.style.flex = '1'
  del.textContent = '🗑 Delete'
  del.addEventListener('click', () => {
    ed.scene.remove(e.id)
    ed.selection = null
    ed.refreshAll()
    ed.log('warn', `Deleted "${e.name}"`)
  })
  act.append(dup, foc, del)
  root.appendChild(act)
}

/* ---------- field widgets ---------- */

function fieldRowFor(ed: Editor, e: Entity, c: any, f: FieldDef, root: HTMLElement): HTMLElement {
  switch (f.type) {
    case 'number': {
      const row = rowNum(f.label, c[f.key], f.step || 0.1, v => { c[f.key] = v })
      return row
    }
    case 'text':
      return rowText(f.label, String(c[f.key] ?? ''), v => { c[f.key] = v })
    case 'color':
      return rowColor(f.label, c[f.key] || '#ffffff', v => { c[f.key] = v })
    case 'select':
      return rowSelect(f.label, String(c[f.key]), f.options || [], v => {
        c[f.key] = v
        if (c.type === 'mesh3d' && v === 'plane') { /* keep */ }
        renderInspector(ed, root)
      })
    case 'check':
      return rowCheck(f.label, !!c[f.key], v => { c[f.key] = v })
    case 'code':
      return rowCode(f.label, String(c[f.key] ?? ''), v => {
        c[f.key] = v
        ed.host.drop(e.id)
      })
    default:
      return document.createElement('div')
  }
}

function rowText(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'frow'
  const l = document.createElement('label'); l.textContent = label
  const i = document.createElement('input'); i.value = value
  i.addEventListener('change', () => onChange(i.value))
  row.append(l, i)
  return row
}

function rowNum(label: string, value: number, step: number, onChange: (v: number) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'frow'
  const l = document.createElement('label'); l.textContent = label
  const i = document.createElement('input')
  i.type = 'number'
  i.step = String(step)
  i.value = String(round(value))
  i.addEventListener('change', () => {
    const n = parseFloat(i.value)
    if (Number.isFinite(n)) onChange(n)
  })
  row.append(l, i)
  return row
}

function rowColor(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'frow'
  const l = document.createElement('label'); l.textContent = label
  const i = document.createElement('input')
  i.type = 'color'
  i.value = value
  i.addEventListener('input', () => onChange(i.value))
  row.append(l, i)
  return row
}

function rowSelect(label: string, value: string, options: string[], onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'frow'
  const l = document.createElement('label'); l.textContent = label
  const i = document.createElement('select')
  for (const o of options) {
    const opt = document.createElement('option')
    opt.value = o
    opt.textContent = o
    if (o === value) opt.selected = true
    i.appendChild(opt)
  }
  i.addEventListener('change', () => onChange(i.value))
  row.append(l, i)
  return row
}

function rowCheck(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'frow'
  const l = document.createElement('label'); l.textContent = label
  const i = document.createElement('input')
  i.type = 'checkbox'
  i.checked = !!value
  i.addEventListener('change', () => onChange(i.checked))
  row.append(l, i)
  return row
}

function rowVec3(label: string, v: { x: number; y: number; z: number }, ed: Editor): HTMLElement {
  const row = document.createElement('div')
  row.className = 'frow'
  row.dataset.vec = label
  const l = document.createElement('label'); l.textContent = label
  const grid = document.createElement('div')
  grid.className = 'vec3'
  for (const key of ['x', 'y', 'z'] as const) {
    const i = document.createElement('input')
    i.type = 'number'
    i.step = '0.5'
    i.value = String(round(v[key]))
    i.dataset.axis = `${label}.${key}`
    i.dataset.getter = label === 'Position' ? 'pos' : label === 'Rotation°' ? 'rot' : 'scale'
    i.dataset.axis2 = key
    i.addEventListener('change', () => {
      const n = parseFloat(i.value)
      if (Number.isFinite(n)) v[key] = n
    })
    grid.appendChild(i)
  }
  row.append(l, grid)
  return row
}

function subCard(title: string): HTMLElement {
  const c = document.createElement('div')
  c.style.border = '1px solid var(--border)'
  c.style.borderRadius = '8px'
  c.style.padding = '8px'
  c.style.display = 'flex'
  c.style.flexDirection = 'column'
  c.style.gap = '7px'
  const h = document.createElement('div')
  h.style.fontSize = '11px'
  h.style.color = 'var(--muted)'
  h.textContent = title
  c.appendChild(h)
  return c
}

function rowCode(label: string, value: string, onChange: (v: string) => void): HTMLElement {
  const row = document.createElement('div')
  row.style.display = 'flex'
  row.style.flexDirection = 'column'
  row.style.gap = '4px'
  const l = document.createElement('label')
  l.textContent = label
  l.style.fontSize = '11.5px'
  l.style.color = 'var(--muted)'
  const i = document.createElement('textarea')
  i.className = 'codeedit'
  i.spellcheck = false
  i.value = value
  i.addEventListener('change', () => onChange(i.value))
  i.addEventListener('keydown', ev => {
    ev.stopPropagation()
    if (ev.key === 'Tab') {
      ev.preventDefault()
      const s = i.selectionStart ?? i.value.length
      const e = i.selectionEnd ?? s
      i.value = i.value.slice(0, s) + '  ' + i.value.slice(e)
      i.selectionStart = i.selectionEnd = s + 2
      onChange(i.value)
    } else if (ev.key === 'Escape') {
      i.blur()
    }
  })
  row.append(l, i)
  return row
}

function round(x: number) { return Math.round(x * 100) / 100 }
