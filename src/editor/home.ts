/* ============ Nova Engine — Home screen (launch first) ============
   Create Project + your project library + quick actions.
   Honest content only — no canned templates: projects are real user saves. */

import { modal } from './ui'
import { listProjects, entityCount, createProject as storeCreate, renameProject, duplicateProject, deleteProject, type NovaProject } from './projects'
import { loadAISettings, aiConfigured, normalizeSettings } from './ai/providers'

export const NOVA_VERSION = '0.2.0'

export interface HomeCallbacks {
  createProject: (mode: '2d' | '3d', name: string) => void
  openProject: (id: string) => void
  continueAutosave: () => void
  importFile: () => void
  openAI: () => void
  openAgents?: () => void
  openDocs: () => void
  openShortcuts: () => void
  openAbout: () => void
}

function el(tag: string, cls?: string, parent?: HTMLElement): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (parent) parent.appendChild(d)
  return d
}

function relTime(ts: number): string {
  const d = Date.now() - (ts || 0)
  if (d < 60000) return 'just now'
  const m = Math.floor(d / 60000)
  if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ago'
  const days = Math.floor(h / 24)
  if (days < 30) return days + 'd ago'
  return new Date(ts).toLocaleDateString()
}

export interface Home {
  show(): void
  hide(): void
  refresh(): void
  root: HTMLElement
}

export function buildHome(parent: HTMLElement, cb: HomeCallbacks): Home {
  const root = el('div', 'home', parent)

  let search = ''

  /* ---------- top bar ---------- */
  const top = el('div', 'nh-top', root)
  const brand = el('div', 'nh-brand', top)
  brand.innerHTML = `<span class="nh-logo">NOVA</span><small class="nh-engine">ENGINE</small><span class="nh-ver">v${NOVA_VERSION}</span>`
  const topright = el('div', 'nh-topright', top)
  const mkTopBtn = (label: string, title: string, fn: () => void) => {
    const b = el('button', 'nh-pill', topright) as HTMLButtonElement
    b.innerHTML = label
    b.title = title
    b.addEventListener('click', fn)
    return b
  }
  mkTopBtn('⚙ AI Settings', 'Connect your LLM', cb.openAI)
  if (cb.openAgents) mkTopBtn('🔗 Agents', 'Connect OpenCode / Kilo / Kiro / Cursor / ChatGPT-style agents', cb.openAgents)
  mkTopBtn('📘 Docs', 'Scripting & AI guide', cb.openDocs)
  mkTopBtn('⌨ Shortcuts', 'Keyboard shortcuts', cb.openShortcuts)
  mkTopBtn('ℹ About', 'About Nova Engine', cb.openAbout)

  /* ---------- main column ---------- */
  const main = el('div', 'nh-main', root)

  /* hero */
  const hero = el('div', 'nh-hero', main)
  const hTitle = el('div', 'nh-title', hero)
  hTitle.textContent = 'Create something legendary.'
  const hSub = el('div', 'nh-sub', hero)
  hSub.innerHTML = 'AI-first 2D &amp; 3D game engine with <b>real physics</b> — Planck.js (Box2D) for 2D, Rapier for 3D.'

  const heroActions = el('div', 'nh-heroactions', hero)
  const btn2d = el('button', 'nh-cta primary', heroActions) as HTMLButtonElement
  btn2d.innerHTML = '<span class="nh-ctaicon">⬜</span><span><b>New 2D Game</b><small>Platformer physics ready</small></span>'
  btn2d.addEventListener('click', () => newProjectModal('2d'))
  const btn3d = el('button', 'nh-cta primary', heroActions) as HTMLButtonElement
  btn3d.innerHTML = '<span class="nh-ctaicon">🔲</span><span><b>New 3D Game</b><small>Rapier 3D physics</small></span>'
  btn3d.addEventListener('click', () => newProjectModal('3d'))
  const btnImp = el('button', 'nh-cta', heroActions) as HTMLButtonElement
  btnImp.innerHTML = '<span class="nh-ctaicon">📂</span><span><b>Import .nova</b><small>Open a project file</small></span>'
  btnImp.addEventListener('click', cb.importFile)

  const badgeRow = el('div', 'nh-badges', hero)
  badgeRow.innerHTML =
    '<span class="badge">🧱 Box2D 2D Physics</span><span class="badge">🦀 Rapier 3D Physics</span>' +
    '<span class="badge">🤖 AI Builder</span><span class="badge">🖥️ Visual Editor</span><span class="badge">📜 Per-entity Scripts</span>'

  /* autosave continue banner */
  const autosaveRow = el('div', '', main)
  autosaveRow.style.width = '100%'

  /* projects section */
  const sec = el('div', 'nh-section', main)
  const secHead = el('div', 'nh-sechead', sec)
  const secTitle = el('div', 'nh-sectitle', secHead)
  secTitle.innerHTML = '📁 Your Projects'
  const secCount = el('span', 'nh-seccount', secTitle)
  const spacer = el('div', 'nh-spacer', secHead)
  const searchIn = el('input', 'nh-search', secHead) as HTMLInputElement
  searchIn.placeholder = '🔎 Search projects...'
  searchIn.addEventListener('input', () => { search = searchIn.value.toLowerCase(); renderList() })

  const grid = el('div', 'nh-grid', sec)

  /* tips section */
  const tips = el('div', 'nh-tips', main)
  const mkTip = (icon: string, title: string, desc: string, fn: () => void) => {
    const c = el('button', 'nh-tip', tips) as HTMLButtonElement
    c.innerHTML = `<span class="nh-tipicon">${icon}</span><span><span class="nh-tiptitle">${title}</span><br><span class="nh-tipdesc">${desc}</span></span>`
    c.addEventListener('click', fn)
    return c
  }
  mkTip('🤖', 'LLM Providers', 'ChatGPT · Claude · Gemini · Groq · OpenRouter keys', cb.openAI)
  mkTip('🔗', 'AI Agents', 'OpenCode · Kilo · Kiro · Cursor e engine connect koro', () => cb.openAgents?.())
  mkTip('🧠', 'Physics guide', 'Friction, bounce & rotation tips', cb.openDocs)
  mkTip('⌨', 'Shortcuts', 'Delete, duplicate, save, orbit', cb.openShortcuts)
  mkTip('🚀', 'What\'s new', 'Real physics: Box2D + Rapier', cb.openAbout)

  /* footer */
  const foot = el('div', 'nh-foot', root)
  foot.innerHTML = `Nova Engine v${NOVA_VERSION} — Planck.js · three.js · Rapier WASM · esbuild · Electron`

  /* AI status pill in topbar */
  refreshAIStatus()

  function refreshAIStatus() {
    let existing = topright.querySelector('.nh-aipill')
    if (existing) existing.remove()
    const s = loadAISettings()
    const pill = el('button', 'nh-pill nh-aipill', topright) as HTMLButtonElement
    if (aiConfigured(s)) {
      const n = normalizeSettings(s)
      pill.innerHTML = `🤖 ${n.provider}/${n.model}`
      pill.title = 'AI connected — change in AI Settings'
    } else {
      pill.innerHTML = '🤖 AI not connected'
      pill.title = 'Add an API key in AI Settings'
    }
    pill.addEventListener('click', cb.openAI)
    topright.insertBefore(pill, topright.firstChild)
  }

  /* ---------- new project modal ---------- */
  function newProjectModal(mode: '2d' | '3d') {
    const { body, close } = modal('🆕 New ' + (mode === '2d' ? '2D' : '3D') + ' Project', 'Ekta naam dao (porhe poriborton korte parba SketchInspector theke)')
    const row = document.createElement('div')
    row.className = 'formrow'
    const lbl = document.createElement('label'); lbl.textContent = 'Project name'
    const inp = document.createElement('input')
    inp.value = mode === '2d' ? 'Untitled 2D' : 'Untitled 3D'
    row.append(lbl, inp)
    body.appendChild(row)
    const foot = document.createElement('div')
    foot.className = 'mfoot'
    const hint = document.createElement('div')
    hint.style.marginRight = 'auto'
    hint.style.color = 'var(--muted)'
    hint.style.fontSize = '11.5px'
    hint.textContent = mode === '2d' ? 'Player + ground + crates + HUD — Box2D ready' : 'Ground + capsule player + props — Rapier ready'
    const ok = document.createElement('button')
    ok.className = 'btn primary'
    ok.textContent = '✨ Create Project'
    ok.addEventListener('click', () => {
      close()
      cb.createProject(mode, inp.value.trim() || (mode === '2d' ? 'Untitled 2D' : 'Untitled 3D'))
    })
    foot.append(hint, ok)
    body.appendChild(foot)
    setTimeout(() => inp.focus(), 30)
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') ok.click() })
  }

  /* ---------- project cards ---------- */
  function renderList() {
    const all = listProjects()
    const filtered = search
      ? all.filter(p => p.name.toLowerCase().includes(search))
      : all
    secCount.textContent = ` — ${all.length}`
    grid.innerHTML = ''

    if (!filtered.length) {
      const empty = el('div', 'nh-empty', grid)
      empty.innerHTML = all.length
        ? '🔍 Kono match hoy nai — search box thik niroekshon korun.'
        : '📭 Ekhono kono project nei — upore <b>New 2D</b> / <b>New 3D</b> diya shuru koro!'
      return
    }

    for (const p of filtered.slice(0, 24)) card(p)
  }

  /* refresh = re-render list (used by card actions) */
  function refresh() {
    renderList()
  }

  function card(p: NovaProject) {
    const c = el('div', 'nh-card', grid)
    const head = el('div', 'nh-cardhead', c)
    const icon = el('div', 'nh-cardicon ' + (p.mode === '3d' ? 'is3d' : ''), head)
    icon.textContent = p.mode === '3d' ? '🔲' : '⬜'
    const meta = el('div', 'nh-cardmeta', head)
    const nameEl = el('div', 'nh-cardname', meta)
    nameEl.textContent = p.name
    nameEl.title = p.name
    const sub = el('div', 'nh-cardsub', meta)
    sub.innerHTML = `<span class="nh-mode ${p.mode === '3d' ? 'is3d' : ''}">${p.mode.toUpperCase()}</span> · ${entityCount(p.scene)} entities · ${relTime(p.updated)}`

    const actions = el('div', 'nh-cardactions', c)
    const openBtn = el('button', 'btn primary small', actions) as HTMLButtonElement
    openBtn.textContent = '▶ Open'
    openBtn.addEventListener('click', () => cb.openProject(p.id))
    const mkAct = (icon: string, title: string, fn: () => void) => {
      const b = el('button', 'btn small icon', actions) as HTMLButtonElement
      b.textContent = icon
      b.title = title
      b.addEventListener('click', ev => { ev.stopPropagation(); fn() })
      return b
    }
    mkAct('✏ Rename', 'Rename project', () => renameModal(p))
    mkAct('⧉', 'Duplicate project', () => { duplicateProject(p.id); refresh() })
    mkAct('🗑', 'Delete project', () => {
      if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
        deleteProject(p.id)
        refresh()
      }
    })

    c.addEventListener('dblclick', () => cb.openProject(p.id))
  }

  function renameModal(p: NovaProject) {
    const { body, close } = modal('✏ Rename Project', p.name)
    const row = document.createElement('div')
    row.className = 'formrow'
    const lbl = document.createElement('label'); lbl.textContent = 'New name'
    const inp = document.createElement('input')
    inp.value = p.name
    row.append(lbl, inp)
    body.appendChild(row)
    const foot = document.createElement('div')
    foot.className = 'mfoot'
    const ok = document.createElement('button')
    ok.className = 'btn primary'
    ok.textContent = 'Save'
    ok.addEventListener('click', () => { renameProject(p.id, inp.value.trim() || p.name); close(); refresh() })
    foot.appendChild(ok)
    body.appendChild(foot)
    setTimeout(() => { inp.focus(); inp.select() }, 30)
    inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') ok.click() })
  }

  /* autosave banner state */
  let hasAutosave = !!localStorage.getItem('nova.autosave')
  function renderAutosave() {
    autosaveRow.innerHTML = ''
    if (!hasAutosave) return
    const saveBtn = el('button', 'nh-autosave', autosaveRow) as HTMLButtonElement
    saveBtn.innerHTML = '💾 <b>Last autosave ache</b> — Continue where you left off'
    saveBtn.addEventListener('click', () => cb.continueAutosave())
  }
  renderAutosave()

  renderList()

  return {
    root,
    show() {
      hasAutosave = !!localStorage.getItem('nova.autosave')
      renderAutosave()
      renderList()
      refreshAIStatus()
      root.style.display = 'flex'
    },
    hide() { root.style.display = 'none' },
    refresh() { renderList() }
  }
}
