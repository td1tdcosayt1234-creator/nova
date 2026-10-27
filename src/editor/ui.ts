/* ============ Nova Engine — UI construction (menus, panels, modals) ============ */

import { PROVIDER_INFO, loadAISettings, saveAISettings, testConnection, type AISettings, type ProviderKind } from './ai/providers'

export interface MenuItem { label?: string; hint?: string; sep?: boolean; action?: () => void }

export interface UIRefs {
  topbar: HTMLElement
  vpWrap: HTMLElement
  vp2d: HTMLCanvasElement
  vp3d: HTMLElement
  hintEl: HTMLElement
  hierarchyList: HTMLElement
  hierarchyAdd: HTMLButtonElement
  assetGrid: HTMLElement
  assetShuffle: HTMLButtonElement
  inspector: HTMLElement
  tabBtns: Record<'builder' | 'assistant' | 'console', HTMLButtonElement>
  tabBodies: Record<'builder' | 'assistant' | 'console', HTMLElement>
  builder: { prompt: HTMLTextAreaElement; gen: HTMLButtonElement; blog: HTMLElement; chips: HTMLElement }
  assistant: { logEl: HTMLElement; input: HTMLInputElement; send: HTMLButtonElement }
  console: { logEl: HTMLElement; clear: HTMLButtonElement }
  status: { state: HTMLElement; fps: HTMLElement; count: HTMLElement; ai: HTMLElement; sel: HTMLElement }
  playBtn: HTMLButtonElement
  pauseBtn: HTMLButtonElement
  stopBtn: HTMLButtonElement
  seg2d: HTMLButtonElement
  seg3d: HTMLButtonElement
}

function el(tag: string, cls?: string, parent?: HTMLElement): HTMLElement {
  const d = document.createElement(tag)
  if (cls) d.className = cls
  if (parent) parent.appendChild(d)
  return d
}

export function buildUI(app: HTMLElement): UIRefs {
  app.innerHTML = ''

  /* topbar */
  const topbar = el('div', 'topbar', app)
  const logo = el('div', 'logo', topbar)
  logo.innerHTML = 'NOVA <small>ENGINE</small>'

  const menuHost = el('div', '', topbar)
  menuHost.style.display = 'flex'
  menuHost.style.gap = '2px'

  el('div', 'spacer', topbar)

  const playgroup = el('div', 'playgroup', topbar)
  const playBtn = el('button', 'pbtn play', playgroup) as HTMLButtonElement
  playBtn.innerHTML = '▶ Play'
  const pauseBtn = el('button', 'pbtn pause', playgroup) as HTMLButtonElement
  pauseBtn.innerHTML = '⏸ Pause'
  const stopBtn = el('button', 'pbtn stop', playgroup) as HTMLButtonElement
  stopBtn.innerHTML = '⏹ Stop'

  el('div', 'spacer', topbar)

  const seg = el('div', 'seg', topbar)
  const seg2d = el('button', 'sbtn', seg) as HTMLButtonElement
  seg2d.textContent = '2D'
  const seg3d = el('button', 'sbtn', seg) as HTMLButtonElement
  seg3d.textContent = '3D'

  /* main grid */
  const main = el('div', 'main', app)

  // left column
  const left = el('div', 'panel left', main)
  const leftcol = el('div', 'leftcol', left)

  const hierPanel = el('div', 'panel', leftcol)
  const hierHead = el('div', 'panel-header', hierPanel)
  hierHead.innerHTML = '🌐 Hierarchy'
  const hierarchyAdd = el('button', 'btn small icon hbtn', hierHead) as HTMLButtonElement
  hierarchyAdd.textContent = '＋'
  hierarchyAdd.title = 'Add empty entity'
  const hierarchyList = el('div', 'hlist', hierPanel)

  const assetPanel = el('div', 'panel', leftcol)
  const assetHead = el('div', 'panel-header', assetPanel)
  assetHead.innerHTML = '🎨 Pixel Art (AI)'
  const assetShuffle = el('button', 'btn small icon hbtn', assetHead) as HTMLButtonElement
  assetShuffle.textContent = '🎲'
  assetShuffle.title = 'Randomize seed of selected entity + gallery'
  const assetGrid = el('div', 'assetgrid', assetPanel)

  // center column
  const center = el('div', 'center', main)

  const vpWrap = el('div', 'viewport-wrap', center)
  const vpStack = el('div', 'viewport-stack', vpWrap)
  const vp3d = el('div', '', vpStack)
  vp3d.id = 'viewport3d'
  const vp2d = el('canvas', '', vpStack) as HTMLCanvasElement
  vp2d.id = 'viewport2d'
  const hintEl = el('div', 'vp-hint', vpWrap)
  const vpOverlay = el('div', 'vp-overlay', vpWrap)
  vpOverlay.textContent = 'Nova Engine'

  // bottom tabs
  const bottom = el('div', 'bottompanel', center)
  const btabs = el('div', 'btabs', bottom)
  const tabBtns: any = {}
  const tabBodies: any = {}
  const mkTab = (id: 'builder' | 'assistant' | 'console', label: string, badge?: string) => {
    const b = el('button', 'tabbtn', btabs) as HTMLButtonElement
    b.innerHTML = label + (badge ? `<span class="btab-badge">${badge}</span>` : '')
    tabBtns[id] = b
    const body = el('div', 'tabbody', bottom)
    tabBodies[id] = body
    b.addEventListener('click', () => activateTab(id))
    return body
  }
  mkTab('builder', '⌁ AI Builder')
  mkTab('assistant', '💬 AI Assistant')
  mkTab('console', '🖥️ Console')

  // builder body
  const builder = el('div', 'builder', tabBodies.builder)
  const chips = el('div', 'chips', builder)
  const prompt = el('textarea', '', builder) as HTMLTextAreaElement
  prompt.placeholder = 'Describe your game... e.g. "ekta space shooter jekhane ami alien der shoot kori, score barbe, 3 life thakbe"\n\n(Empty = random platformer. LLM key thakle full AI generation hobe, na thakle built-in NovaAI offline generator.)'
  const brow = el('div', 'row', builder)
  const gen = el('button', 'btn primary', brow) as HTMLButtonElement
  gen.textContent = '✨ Generate Game'
  const blog = el('div', 'blog', builder)
  blog.textContent = ''

  // assistant body
  const chatlog = el('div', 'chatlog', tabBodies.assistant)
  const chatinput = el('div', 'chatinput', tabBodies.assistant)
  const ainput = el('input', '', chatinput) as HTMLInputElement
  ainput.placeholder = 'Ask NovaAI anything... (offline commands: "add 5 coins", "make background red")'
  const asend = el('button', 'btn primary', chatinput) as HTMLButtonElement
  asend.textContent = 'Send ➤'

  // console body
  const conslog = el('div', 'conslog', tabBodies.console)
  const consoleHead = el('div', '', tabBodies.console)
  consoleHead.style.display = 'none'
  const consFoot = el('div', 'chatinput', tabBodies.console)
  const cclear = el('button', 'btn small', consFoot) as HTMLButtonElement
  cclear.textContent = 'Clear console'
  void consoleHead

  // right column (inspector)
  const right = el('div', 'panel right', main)
  const insHead = el('div', 'panel-header', right)
  insHead.innerHTML = '🔎 Inspector'
  const inspector = el('div', 'inspector', right)

  /* statusbar */
  const statusbar = el('div', 'statusbar', app)
  const stState = el('span', '', statusbar)
  stState.innerHTML = '<span class="dot stopped"></span> Editor'
  const stFps = el('span', '', statusbar); stFps.textContent = '0 fps'
  const stCount = el('span', '', statusbar); stCount.textContent = '0 entities'
  const stSel = el('span', '', statusbar); stSel.textContent = '—'
  el('div', 'spacer', statusbar)
  const stAi = el('span', '', statusbar)

  activateTab('builder')

  return {
    topbar, vpWrap, vp2d, vp3d, hintEl,
    hierarchyList, hierarchyAdd, assetGrid, assetShuffle,
    inspector,
    tabBtns, tabBodies,
    builder: { prompt, gen, blog, chips },
    assistant: { logEl: chatlog, input: ainput, send: asend },
    console: { logEl: conslog, clear: cclear },
    status: { state: stState, fps: stFps, count: stCount, ai: stAi, sel: stSel },
    playBtn, pauseBtn, stopBtn, seg2d, seg3d
  }
}

export function activateTab(id: 'builder' | 'assistant' | 'console') {
  document.querySelectorAll('.tabbtn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tabbody').forEach(b => b.classList.remove('active'))
  const btns = document.querySelectorAll('.tabbtn')
  const bodies = document.querySelectorAll('.tabbody')
  const order = ['builder', 'assistant', 'console']
  const idx = order.indexOf(id)
  if (btns[idx]) btns[idx].classList.add('active')
  if (bodies[idx]) bodies[idx].classList.add('active')
}

/* ---------- dropdown menus ---------- */

let openDrop: HTMLElement | null = null
document.addEventListener('mousedown', ev => {
  if (openDrop && !openDrop.contains(ev.target as Node) && !(ev.target as HTMLElement).classList?.contains('menubtn')) {
    openDrop.remove()
    openDrop = null
    document.querySelectorAll('.menubtn.open').forEach(b => b.classList.remove('open'))
  }
})

export function showDropdown(anchor: HTMLElement, items: MenuItem[]) {
  if (openDrop) { openDrop.remove(); openDrop = null }
  document.querySelectorAll('.menubtn.open').forEach(b => b.classList.remove('open'))
  const dd = el('div', 'dropdown', document.body)
  const r = anchor.getBoundingClientRect()
  dd.style.left = r.left + 'px'
  dd.style.top = r.bottom + 4 + 'px'
  for (const it of items) {
    if (it.sep) { el('div', 'dsep', dd); continue }
    const d = el('div', 'ditem', dd)
    d.innerHTML = `<span>${it.label}</span>${it.hint ? `<span class="key">${it.hint}</span>` : ''}`
    d.addEventListener('click', () => {
      dd.remove(); openDrop = null
      anchor.classList.remove('open')
      it.action?.()
    })
  }
  anchor.classList.add('open')
  openDrop = dd
}

export function menubarButton(topbar: HTMLElement, label: string, items: MenuItem[]): HTMLElement {
  const b = el('button', 'menubtn', topbar)
  b.textContent = label
  b.addEventListener('click', ev => {
    ev.stopPropagation()
    if (openDrop) { openDrop.remove(); openDrop = null; b.classList.remove('open'); return }
    showDropdown(b, items)
  })
  return b
}

/* ---------- modals ---------- */

export function modal(title: string, sub?: string): { body: HTMLElement; close: () => void } {
  closeAllModals()
  const back = el('div', 'modal-back', document.body)
  const m = el('div', 'modal', back)
  el('h2', '', m).textContent = title
  if (sub) el('div', 'sub', m).textContent = sub
  const body = el('div', '', m)
  const foot = el('div', 'mfoot', m)
  const closeBtn = el('button', 'btn', foot)
  closeBtn.textContent = 'Close'
  const close = () => back.remove()
  closeBtn.addEventListener('click', close)
  back.addEventListener('mousedown', ev => { if (ev.target === back) close() })
  return { body, close }
}

export function closeAllModals() {
  document.querySelectorAll('.modal-back').forEach(m => m.remove())
}

/* ---------- AI settings modal ---------- */

export function openSettingsModal(onChanged: () => void) {
  const info = PROVIDER_INFO
  const { body, close } = modal('⚙️ AI Settings', 'NovaAI offline generator sarai jekono LLM provider connect koro — builder ar assistant full power paye jabe.')
  const s = loadAISettings()

  const mkRow = (label: string) => {
    const r = document.createElement('div')
    r.className = 'formrow'
    const l = document.createElement('label'); l.textContent = label
    r.appendChild(l)
    body.appendChild(r)
    return r
  }

  const provRow = mkRow('Provider')
  const provSel = document.createElement('select')
  for (const k of Object.keys(info) as ProviderKind[]) {
    const o = document.createElement('option')
    o.value = k; o.textContent = info[k].label
    if (s.provider === k) o.selected = true
    provSel.appendChild(o)
  }
  provRow.appendChild(provSel)

  const baseRow = mkRow('Base URL')
  const baseIn = document.createElement('input')
  baseIn.value = s.baseUrl
  baseRow.appendChild(baseIn)

  const keyRow = mkRow('API Key')
  const keyIn = document.createElement('input')
  keyIn.type = 'password'
  keyIn.value = s.apiKey
  keyIn.placeholder = 'sk-...'
  keyRow.appendChild(keyIn)

  const modelRow = mkRow('Model')
  const modelIn = document.createElement('input')
  modelIn.value = s.model
  modelIn.setAttribute('list', 'nova-models')
  const dl = document.createElement('datalist')
  dl.id = 'nova-models'
  modelRow.appendChild(modelIn)
  body.appendChild(dl)

  const noteRow = document.createElement('div')
  noteRow.className = 'formrow'
  noteRow.innerHTML = `<label>Key Store</label><div style="font-size:11.5px;color:var(--muted)">Key shudhu tomar machine er localStorage e save hoy. Desktop app e request gulo main process diye jay (CORS-free).</div>`

  const status = document.createElement('div')
  status.style.fontSize = '12px'
  status.style.marginTop = '6px'

  const fill = () => {
    const kind = provSel.value as ProviderKind
    baseIn.placeholder = info[kind].defaultBase
    modelIn.placeholder = info[kind].defaultModel
    dl.innerHTML = ''
    for (const m of info[kind].models) {
      const o = document.createElement('option'); o.value = m; dl.appendChild(o)
    }
  }
  fill()
  provSel.addEventListener('change', fill)

  const testBtn = document.createElement('button')
  testBtn.className = 'btn'
  testBtn.textContent = '🔌 Test Connection'
  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true
    status.textContent = 'Testing...'
    try {
      const cur: AISettings = { provider: provSel.value as ProviderKind, baseUrl: baseIn.value, apiKey: keyIn.value, model: modelIn.value }
      const reply = await testConnection(cur)
      status.innerHTML = `<span style="color:var(--ok)">✔ Connected — "${reply}"</span>`
    } catch (err) {
      status.innerHTML = `<span style="color:var(--err)">✖ ${String(err).slice(0, 220)}</span>`
    }
    testBtn.disabled = false
  })

  const saveBtn = document.createElement('button')
  saveBtn.className = 'btn primary'
  saveBtn.textContent = '💾 Save'
  saveBtn.addEventListener('click', () => {
    saveAISettings({ provider: provSel.value as ProviderKind, baseUrl: baseIn.value, apiKey: keyIn.value, model: modelIn.value })
    onChanged()
    close()
  })

  body.appendChild(noteRow)
  body.appendChild(testBtn)
  const footRow = body.querySelector('.mfoot')
  void footRow
  const foot2 = document.createElement('div')
  foot2.className = 'mfoot'
  foot2.append(saveBtn)
  body.appendChild(foot2)
  body.appendChild(status)
}

/* ---------- Docs modal ---------- */

export function openDocsModal() {
  const { body } = modal('📘 Nova Scripting & AI Guide')
  body.innerHTML = `
  <div class="doc">
    <h4>Scripting</h4>
    <p>Protita Script component er code <b>prottek frame</b> e chole. Duita free variable pao:</p>
    <pre>self.pos.x += engine.dt * 40   // move right</pre>
    <h4>self</h4>
    <p><code>pos</code> <code>vel</code> <code>rot</code> (degrees) <code>scale</code> <code>color</code> <code>visible</code> <code>onGround</code> <code>mem</code> (persistent object) <code>tags</code> <code>has(tag)</code> <code>setText(t)</code> <code>burst(n)</code> <code>onCollide(cb)</code></p>
    <h4>engine</h4>
    <p><code>dt</code> <code>time</code> <code>score</code> <code>log()</code> <code>random(a,b)</code> <code>chance(p)</code> <code>pick(arr)</code> <code>find("Name")</code> <code>findAll(tag)</code> <code>spawn(EntitySpec)</code> <code>destroy(api)</code> <code>win(msg)</code> <code>gameOver(msg)</code> <code>reload()</code> <code>camera.shake(a,t)</code> <code>camera.yaw</code> (3D) <code>input.down("KeyA")</code> <code>input.pressed("Space")</code> <code>input.mouse</code></p>
    <h4>Example — collectible coin</h4>
    <pre>self.rot.z += engine.dt * 90
self.onCollide(function (other) {
  if (other.has("player")) {
    engine.score += 1
    engine.destroy(self)
  }
})</pre>
    <h4>Physics</h4>
    <p>2D: AABB, y-up. Movers vs statics resolve hoy; landing hole <code>self.onGround = true</code>. Jump: <code>self.vel.y = 620</code>. Sensor bodies shudhu event dey, push kore na. 3D: ground plane y=0 always solid; sphere approx collisions.</p>
    <h4>AI Builder</h4>
    <p>Prompt likhe Generate chapo. LLM configured thakle full AI generation hoy, na thakle built-in <b>NovaAI offline</b> procedural generator chole — prompt theke intent (genre · theme · difficulty · counts) parse kore seed-varied notun game synthesize kore. Kono canned template nei — same prompt-o protibar alada game banay. IDEA chips gulo prompt idea fill kore generate trigger kore.</p>
    <h4>Shortcuts</h4>
    <p><code>Del</code> delete entity · <code>Ctrl+D</code> duplicate · <code>Ctrl+S</code> save · RMB drag = orbit/pan · Wheel = zoom</p>
  </div>`
}

/* ---------- Welcome overlay ---------- */

export function showWelcome(hasAutosave: boolean, onPick: (key: string) => void) {
  const w = el('div', 'welcome', document.body)

  const logo = el('div', 'wlogo', w)
  logo.textContent = 'NOVA'
  const sub = el('div', 'wsub', w)
  sub.innerHTML = 'The AI-first 2D &amp; 3D game engine — describe a game, play it instantly.'
  const badgeRow = el('div', '', w)
  badgeRow.style.display = 'flex'
  badgeRow.style.gap = '8px'
  badgeRow.innerHTML = '<span class="badge">AI Builder</span><span class="badge">2D + 3D</span><span class="badge">Visual Editor</span><span class="badge">ECS + Scripts</span>'

  const cards = el('div', '', w)
  cards.style.display = 'flex'
  cards.style.gap = '12px'
  cards.style.flexWrap = 'wrap'
  cards.style.justifyContent = 'center'
  cards.style.maxWidth = '760px'

  const addCard = (icon: string, title: string, desc: string, key: string) => {
    const c = el('div', 'wcard', cards)
    c.innerHTML = `<span class="wi">${icon}</span><span><span class="wt">${title}</span><br><span class="wd">${desc}</span></span>`
    c.addEventListener('click', () => { w.remove(); onPick(key) })
  }

  addCard('🤖', 'AI Builder', 'Describe a game in your own words', 'builder')
  if (hasAutosave) addCard('💾', 'Continue', 'Load your last autosaved scene', 'continue')
  addCard('⬜', 'Blank 2D', 'Start from scratch in 2D', 'blank2d')
  addCard('🔲', 'Blank 3D', 'Blank 3D scene', 'blank3d')

  const foot = el('div', 'wfoot', w)
  foot.textContent = '100% procedural NovaAI — kono canned template nei, prompt theke notun game synthesize hoy'
}
