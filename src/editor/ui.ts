/* ============ Nova Engine — UI construction (menus, panels, modals) ============ */

import { PROVIDER_INFO, loadAISettings, saveAISettings, testConnection, type AISettings, type ProviderKind } from './ai/providers'

export interface MenuItem { label?: string; hint?: string; sep?: boolean; action?: () => void }

export interface UIRefs {
  topbar: HTMLElement
  homeBtn: HTMLButtonElement
  saveBtn: HTMLButtonElement
  titleEl: HTMLElement
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
  status: { state: HTMLElement; fps: HTMLElement; count: HTMLElement; ai: HTMLElement; sel: HTMLElement; saved: HTMLElement }
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
  const homeBtn = el('button', 'tbtn', topbar) as HTMLButtonElement
  homeBtn.textContent = '🏠 Home'
  homeBtn.title = 'Back to Home (project list)'

  const titleEl = el('div', 'project-title', topbar)
  titleEl.textContent = '—'

  const menuHost = el('div', '', topbar)
  menuHost.style.display = 'flex'
  menuHost.style.gap = '2px'

  el('div', 'spacer', topbar)

  const saveBtn = el('button', 'tbtn save', topbar) as HTMLButtonElement
  saveBtn.textContent = '💾 Save'
  saveBtn.title = 'Save project to disk / project library (Ctrl+S)'

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
  prompt.placeholder = 'Describe your game... e.g. "ekta space shooter jekhane ami alien der shoot kori, score barbe, 3 life thakbe"\n\n(Generation runs on your connected LLM — add a key in AI Settings. No key? Ekhono 2D/3D blank scenes + offline editing commands cholbe.)'
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
  const stSaved = el('span', '', statusbar)
  const stAi = el('span', '', statusbar)

  activateTab('builder')

  return {
    topbar, homeBtn, saveBtn, titleEl, vpWrap, vp2d, vp3d, hintEl,
    hierarchyList, hierarchyAdd, assetGrid, assetShuffle,
    inspector,
    tabBtns, tabBodies,
    builder: { prompt, gen, blog, chips },
    assistant: { logEl: chatlog, input: ainput, send: asend },
    console: { logEl: conslog, clear: cclear },
    status: { state: stState, fps: stFps, count: stCount, ai: stAi, sel: stSel, saved: stSaved },
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
  const { body, close } = modal('⚙️ AI Settings', 'Jekono LLM provider connect koro — builder ar assistant full power paye jabe.')
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
    <p>2D: <b>Planck.js (Box2D)</b> — real rigid bodies, rotation (keepUpright diye lock koro), friction, bounce, dynamic–dynamic collisions, sensors. Landing hole <code>self.onGround = true</code>. Jump: <code>self.vel.y = 620</code>. 3D: <b>Rapier (Rust/WASM)</b> — box/sphere/capsule colliders mesh theke, contact events, CCD. Ground plane = real static collider.</p>
    <h4>AI Builder</h4>
    <p>Prompt likhe Generate chapo — apnar connected LLM (AI Settings) diye full game generate hoy. Canned offline synth ar nei; without key offline assistant commands diye real scene edit (add coins, clear, colors...) cholbe. IDEA chips gulo prompt idea fill kore generate trigger kore.</p>
    <h4>Shortcuts</h4>
    <p><code>Del</code> delete entity · <code>Ctrl+D</code> duplicate · <code>Ctrl+S</code> save · RMB drag = orbit/pan · Wheel = zoom</p>
  </div>`
}

/* ---------- Shortcuts modal ---------- */

export function openShortcutsModal() {
  const { body } = modal('⌨ Keyboard Shortcuts')
  body.innerHTML = `
  <div class="doc">
    <h4>Editor</h4>
    <p><code>Del</code> delete entity · <code>Ctrl+D</code> duplicate · <code>Ctrl+S</code> save project<br>
    <code>F</code> focus selected entity (camera center) · <code>G</code> toggle grid · <code>Esc</code> deselect</p>
    <h4>Viewport</h4>
    <p>2D: RMB drag = pan · Wheel = zoom · LMB click = select · LMB drag = move<br>
    3D: RMB drag = orbit · Wheel = zoom · LMB click = select · LMB drag = move XZ</p>
    <h4>Play mode</h4>
    <p><code>WASD</code>/<code>Arrows</code> move · <code>Space</code> jump · <code>Mouse</code> camera look (3D first/third) · <code>Esc</code> = <b>Stop</b> back to editor</p>
  </div>`
}

/* ---------- AI Agents / Bridge modal ---------- */

const AGENT_TARGETS: Array<{ key: string; label: string; where: string; http?: (mcpUrl: string) => string; stdio?: (proxyPath: string) => string; note: string }> = [
  {
    key: 'opencode',
    label: 'OpenCode',
    where: 'project root er opencode.json — "mcp" section add koro',
    http: u => `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nova-engine": {
      "type": "remote",
      "url": "${u}",
      "enabled": true
    }
  }
}`,
    note: 'OpenCode chalu korle nova-engine tools autopai — "get scene amake dekho" etc. directly bolte parba.'
  },
  {
    key: 'kiro',
    label: 'Kiro',
    where: '<workspace>/.kiro/settings/mcp.json banao (kothao na hoile file e auto suggestion dey)',
    http: u => `{
  "mcpServers": {
    "nova-engine": {
      "url": "${u}",
      "disabled": false,
      "autoApprove": ["get_scene", "list_entities", "read_console", "play_state", "run_scene", "stop_scene", "set_scene"]
    }
  }
}`,
    note: 'Kiro reload korle Agent panel e mcp__nova-engine__get_scene tools dekhabe.'
  },
  {
    key: 'kilo',
    label: 'Kilo IDE',
    where: 'Kilo MCP settings (VSCode settings → MCP Servers → edit config JSON)',
    http: u => `{
  "mcpServers": {
    "nova-engine": {
      "url": "${u}",
      "disabled": false
    }
  }
}`,
    note: 'Streamable HTTP MCP try koro; na challenge hole stdio config use koro (niche Claude Desktop style).'
  },
  {
    key: 'antigravity',
    label: 'Antigravity',
    where: 'MCP settings (Agent panel → MCP → Add Server → Streamable HTTP)',
    http: u => `{
  "mcpServers": {
    "nova-engine": {
      "url": "${u}"
    }
  }
}`,
    note: 'URL field e http://127.0.0.1:8748/mcp diye save koro — agent puro engine control korte parbe.'
  },
  {
    key: 'cliproxy',
    label: 'Claude Desktop / Cursor / Kilo (stdio)',
    where: 'claude_desktop_config.json / Cursor mcp.json (stdio MCP)',
    stdio: proxy => `{
  "mcpServers": {
    "nova-engine": {
      "command": "node",
      "args": ["${proxy}"]
    }
  }
}`,
    note: 'Nova Engine chalu + mcp-server chalu thakte hobe — stdio proxy oitar HTTP Bricdge ke forward kore.'
  }
]

export function openAgentsModal() {
  const { body } = modal('🔗 AI Agents — Connect external AI tools', 'Nova Bridge e ai tools connect koro. Engine khola thakte hobe.')
  const nova = (window as any).nova

  const status = document.createElement('div')
  status.className = 'doc'
  body.appendChild(status)

  let port = 8748
  const portRow = document.createElement('div')
  portRow.className = 'formrow'
  portRow.innerHTML = '<label>Bridge Port</label>'
  const portIn = document.createElement('input')
  portIn.style.width = '110px'
  portRow.appendChild(portIn)
  const restartBtn = document.createElement('button')
  restartBtn.className = 'btn small'
  restartBtn.textContent = '↻ Restart'
  restartBtn.addEventListener('click', async () => {
    restartBtn.disabled = true
    const r = await nova.setBridgePort(Number(portIn.value) || 8748)
    restartBtn.disabled = false
    statusLine.textContent = r.ok ? `✅ Bridge restarted on port ${r.port}` : `❌ ${r.error}`
    refresh()
  })
  portRow.appendChild(restartBtn)
  body.appendChild(portRow)

  const statusLine = document.createElement('div')
  statusLine.style.cssText = 'font-size:12px;margin:8px 0 4px;color:var(--muted)'
  body.appendChild(statusLine)

  const mkH4 = (t: string, parent: HTMLElement) => {
    const h = document.createElement('h4'); h.textContent = t; parent.appendChild(h); return h
  }
  mkH4('MCP Setup — kon IDE te kibhabe connect korben', body)

  const selRow = document.createElement('div')
  selRow.className = 'formrow'
  selRow.innerHTML = '<label>Target tool</label>'
  const sel = document.createElement('select')
  for (const t of AGENT_TARGETS) {
    const o = document.createElement('option'); o.value = t.key; o.textContent = t.label; sel.appendChild(o)
  }
  selRow.appendChild(sel)
  body.appendChild(selRow)

  const whereEl = document.createElement('div')
  whereEl.style.cssText = 'font-size:11.5px;color:var(--warn);margin:8px 0 6px'
  body.appendChild(whereEl)

  const pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre'
  body.appendChild(pre)

  const copyBtn = document.createElement('button')
  copyBtn.className = 'btn small'
  copyBtn.textContent = '📋 Copy config'
  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pre.textContent || '') ; copyBtn.textContent = '✅ Copied' } catch { copyBtn.textContent = '❌ Copy failed' }
    setTimeout(() => { copyBtn.textContent = '📋 Copy config' }, 1400)
  })
  body.appendChild(copyBtn)

  const noteEl = document.createElement('div')
  noteEl.style.cssText = 'font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.6'
  body.appendChild(noteEl)

  mkH4('REST (MCP na thakle curl diye-o chale)', body).style.fontSize = '12.5px'
  const restPre = document.createElement('pre')
  restPre.style.whiteSpace = 'pre-wrap'
  body.appendChild(restPre)

  function renderTarget() {
    const t = AGENT_TARGETS.find(x => x.key === sel.value)!
    whereEl.textContent = '📍 ' + t.where
    if (t.http) pre.textContent = t.http(`http://127.0.0.1:${port}/mcp`)
    else if (t.stdio) pre.textContent = t.stdio(proxyPath)
    noteEl.textContent = t.note
    restPre.textContent =
      `# engine health / state\ncurl http://127.0.0.1:${port}/health\ncurl http://127.0.0.1:${port}/state\n\n` +
      `# current scene\ncurl http://127.0.0.1:${port}/scene\n\n` +
      `# press play / stop\ncurl -X POST http://127.0.0.1:${port}/run\ncurl -X POST http://127.0.0.1:${port}/stop\n\n` +
      `# replace scene with a Nova SceneSpec\ncurl -X POST http://127.0.0.1:${port}/scene -H "content-type: application/json" -d @myspec.json`
  }

  let proxyPath = '<nova-install-path>\\electron\\stdio-proxy.js'
  let mcpUrl = 'http://127.0.0.1:8748/mcp'

  async function refresh() {
    if (!document.body.contains(body)) { clearInterval(iv); return }
    if (!nova?.bridgeInfo) {
      statusLine.textContent = '(Browser mode — Nova Bridge shudhu desktop app e chole)'
      return
    }
    const info = await nova.bridgeInfo()
    port = info.port || 8748
    mcpUrl = info.mcpUrl || mcpUrl
    proxyPath = `${(info.appPath || '').replace(/\\/g, '\\\\')}\\electron\\stdio-proxy.js`
    portIn.value = String(port)
    statusLine.textContent = info.running
      ? `✅ Bridge chalu — MCP: ${mcpUrl} (127.0.0.1 only, local machine)`
      : '⛔ Bridge off — app restart dao'
    renderTarget()
  }

  sel.addEventListener('change', renderTarget)
  const iv = setInterval(refresh, 2000)
  refresh()
}
