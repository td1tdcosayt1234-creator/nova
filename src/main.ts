/* ============ Nova Engine — Editor entry point & runtime ============ */

import { Scene, deserializeScene, serializeScene, getComp, type Entity } from './engine/core'
import { Renderer2D, type Cam2D } from './engine/renderer2d'
import { Renderer3D } from './engine/renderer3d'
import { Input } from './engine/input'
import { ScriptHost, type EngineAPI } from './engine/script'
import { Physics2D } from './engine/physics2d'
import { Physics3D, rapierReady } from './engine/physics3d'
import { applySceneSpec, specToEntity, type SceneSpec, type EntitySpec } from './engine/spec'
import { blank2D, blank3D } from './editor/blank'
import { buildGame, aiAssistant, localAssistant, loadAISettings, aiConfigured, normalizeSettings, type ChatMsg } from './editor/ai/builder'
import { buildUI, menubarButton, modal, closeAllModals, openSettingsModal, openAgentsModal, openDocsModal, openShortcutsModal, activateTab, type MenuItem, type UIRefs } from './editor/ui'
import { initHierarchy, renderHierarchy } from './editor/hierarchy'
import { initInspector, renderInspector } from './editor/inspector'
import { initConsole, type ConsolePanel } from './editor/console'
import { initGizmo } from './editor/gizmo'
import { buildHome, NOVA_VERSION, type Home } from './editor/home'
import { createProject as storeCreate, getProject, saveProjectEntry, deleteProject as storeDelete, type NovaProject } from './editor/projects'
import type { Editor, LogLevel } from './editor/state'

/* ---------- boot ---------- */

const ui = buildUI(document.getElementById('app')!)

const editor: Editor = {
  scene: new Scene(),
  selection: null,
  playing: false,
  paused: false,
  ended: false,
  cam2dEdit: { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 },
  cam2dPlay: { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 },
  orbit: { theta: 0.7, phi: 0.95, dist: 24, target: { x: 0, y: 0, z: 0 } as any },
  playCam: { yaw: 0, pitch: -0.1 },
  r2d: null as any,
  r3d: null as any,
  input: new Input(),
  host: new ScriptHost(),
  shake: { amount: 0, time: 0 },
  dirty: false,
  refreshHierarchy: () => renderHierarchy(editor, ui.hierarchyList),
  refreshInspector: () => renderInspector(editor, ui.inspector),
  refreshAll() { this.refreshHierarchy(); this.refreshInspector() },
  applyMode: () => applyMode(),
  log: (l, m) => cons.log(l, m),
  resetCameras: () => resetCameras(),
  focusSelection: () => focusSelection()
}

const r2d = new Renderer2D(ui.vp2d)
editor.r2d = r2d
const r3d = new Renderer3D(ui.vp3d)
editor.r3d = r3d
editor.input.attach(ui.vpWrap)

let cons: ConsolePanel
let engineAPI: EngineAPI | null = null
let snapshot = ''
let chatHistory: ChatMsg[] = []

/* real physics worlds — built on Play, torn down on Stop */
let phys2: Physics2D | null = null
let phys3: Physics3D | null = null

/* ---------- engine API (script runtime) ---------- */

function makeEngineAPI(): EngineAPI {
  const ed = editor
  const api: EngineAPI = {
    dt: 0,
    time: 0,
    score: 0,
    input: {
      down: c => ed.input.isDown(c),
      pressed: c => ed.input.isPressed(c),
      mouse: ed.input.mouse as any
    },
    log: (...a: any[]) => console.log('[game]', ...a),
    random: (a: number, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a)),
    chance: p => Math.random() < p,
    pick: (arr: any[]) => arr[Math.floor(Math.random() * arr.length)],
    find: (name: string) => {
      const e = ed.scene.byName(name)
      return e ? ed.host.api(e, api) : null
    },
    findAll: (tag: string) => ed.scene.byTag(tag).map(e => ed.host.api(e, api)),
    spawn: (spec: any) => {
      const e = addSpecEntity(ed.scene, spec)
      if (ed.scene.meta.mode === '3d') phys3?.add(e)
      else phys2?.add(e)
      return ed.host.api(e, api)
    },
    destroy: (target: any) => {
      const e = resolveTarget(target)
      if (e) (e as any).__dead = true
    },
    camera: {
      shake: (a = 8, t = 0.3) => { ed.shake.amount = a; ed.shake.time = t },
      follow: (name: string) => { ed.scene.meta.camera2d.follow = name; ed.scene.meta.camera3d.follow = name },
      zoom: (z: number) => { ed.scene.meta.camera2d.zoom = Math.max(0.1, Math.min(6, z)) },
      get yaw() { return ed.playCam.yaw }
    },
    win: (msg = 'You Win!') => endOverlay(msg, true),
    gameOver: (msg = 'Game Over') => endOverlay(msg, false),
    reload: () => restartPlay(),
    burstAt: (target: any, n = 10) => {
      const e = resolveTarget(target)
      if (!e) return
      const spr = getComp(e, 'sprite2d')
      const mesh = getComp(e, 'mesh3d')
      const color = spr?.color || mesh?.color || '#fbbf24'
      r2d.burstAt(e.transform.pos.x, e.transform.pos.y, color, (spr?.w || 20) * 0.35, n)
    }
  }
  return api
}

function resolveTarget(t: any): Entity | null {
  if (typeof t === 'string') return editor.scene.byName(t)
  const ent = (t as any)?.entityRef
  if (ent) return editor.scene.entities.find(e => e.id === ent.id) || null
  return null
}

function addSpecEntity(scene: Scene, spec: any): Entity {
  const e = specToEntity(spec as EntitySpec)
  scene.entities.push(e)
  return e
}

/* burst hook: scripts calling self.burst(n) */
editor.host.hooks.burst = (entityId, n) => {
  const e = editor.scene.entities.find(x => x.id === entityId)
  if (!e) return
  const spr = getComp(e, 'sprite2d')
  const mesh = getComp(e, 'mesh3d')
  const color = spr?.color || mesh?.color || '#fbbf24'
  r2d.burstAt(e.transform.pos.x, e.transform.pos.y, color, (spr?.w || 20) * 0.35, n || 10)
}

/* ---------- console ---------- */
cons = initConsole(editor, ui.console.logEl, ui.console.clear)

/* ---------- Nova Bridge (external AI agents) ---------- */

const bridgeConsole: Array<{ t: string; level: LogLevel; msg: string }> = []
const baseEditorLog = editor.log.bind(editor)
editor.log = (l, m) => {
  baseEditorLog(l, m)
  bridgeConsole.push({ t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), level: l, msg: m })
  if (bridgeConsole.length > 200) bridgeConsole.splice(0, bridgeConsole.length - 200)
}

let bridgePushT: ReturnType<typeof setTimeout> | null = null

function bridgePush() {
  const nova = (window as any).nova
  if (!nova?.pushBridgeState) return
  try {
    const ents = editor.scene.entities.map(e => ({
      id: e.id,
      name: e.name,
      tags: e.tags,
      visible: e.visible,
      pos: { x: Math.round(e.transform.pos.x * 10) / 10, y: Math.round(e.transform.pos.y * 10) / 10, z: Math.round(e.transform.pos.z * 10) / 10 },
      comps: e.comps.map(c => ({ type: c.type })),
      scripted: e.comps.some(c => c.type === 'script')
    }))
    void nova.pushBridgeState({
      inHome: appEl.classList.contains('editorhidden'),
      playing: editor.playing,
      paused: editor.paused,
      scene: JSON.parse(serializeScene(editor.scene)),
      entities: ents,
      selection: editor.selection
        ? (editor.scene.entities.find(e2 => e2.id === editor.selection)?.name ?? null)
        : null,
      console: bridgeConsole
    })
  } catch { /* quota / serialize fail — bridge state stale theke jabe */ }
}

function scheduleBridgePush() {
  if (bridgePushT) return
  bridgePushT = setTimeout(() => { bridgePushT = null; bridgePush() }, 400)
}

const baseRefreshAll = editor.refreshAll.bind(editor)
editor.refreshAll = () => { baseRefreshAll(); scheduleBridgePush() }

const bridgeApi = (window as any).nova
if (bridgeApi?.onBridgeCommand) {
  bridgeApi.onBridgeCommand((cmd: { type: string; spec?: SceneSpec }) => {
    try {
      if (cmd.type === 'run') {
        if (appEl.classList.contains('editorhidden')) { editor.log('warn', '🔗 Bridge: engine Home e ache — age project khulte hobe'); return }
        if (!editor.playing) void startPlay()
      } else if (cmd.type === 'stop') {
        stopPlay()
      } else if (cmd.type === 'set_scene') {
        if (editor.playing) { editor.log('warn', '🔗 Bridge: play cholche — age stop_scene dao'); return }
        if (!cmd.spec || typeof cmd.spec !== 'object') throw new Error('valid SceneSpec deya hoyni')
        loadScene(applySceneSpec(cmd.spec as SceneSpec), 'AI agent (bridge)')
        editor.log('ok', `🔗 Bridge: scene set — ${(cmd.spec as any).entities?.length || 0} entities`)
      }
      scheduleBridgePush()
    } catch (err) {
      editor.log('err', `🔗 Bridge command "${cmd.type}" failed: ${String(err)}`)
    }
  })
  setInterval(scheduleBridgePush, 4000)
}

/* ---------- project session ---------- */

let currentProjectId: string | null = null
const appEl = document.getElementById('app')!
let home: Home | null = null

function updateTitle() {
  ui.titleEl.textContent = `— ${editor.scene.meta.name} (${editor.scene.meta.mode.toUpperCase()})`
}

function setSaved(text: string) {
  ui.status.saved.textContent = text
}

/** sync the open scene into the project store */
function flushProject(uiFeedback = true) {
  if (!currentProjectId) return
  const m = editor.scene.meta
  saveProjectEntry(currentProjectId, m.name, m.mode, serializeScene(editor.scene))
  if (uiFeedback) setSaved(`Saved ✓ ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
}

function enterEditor() {
  appEl.classList.remove('editorhidden')
  home?.hide()
  closeAllModals()
  editor.refreshAll()
  editor.applyMode()
  editor.resetCameras()
  updateTitle()
  setSaved('⏳ autosaving every 15s')
}

function returnHome() {
  if (editor.playing) stopPlay()
  editor.selection = null
  flushProject()
  appEl.classList.add('editorhidden')
  home?.show()
}

function newProject(mode: '2d' | '3d', name: string) {
  const spec = mode === '2d' ? blank2D() : blank3D()
  const scene = applySceneSpec(spec)
  scene.meta.name = name
  editor.scene = scene
  editor.selection = null
  const entry = storeCreate(name, mode, serializeScene(scene))
  currentProjectId = entry.id
  enterEditor()
  editor.log('ok', `🆕 New ${mode.toUpperCase()} project "${name}" — physics: ${mode === '2d' ? 'Planck (Box2D)' : 'Rapier'}`)
}

function openProjectEntry(p: NovaProject) {
  try {
    const scene = deserializeScene(p.scene)
    editor.scene = scene
    editor.selection = null
    currentProjectId = p.id
    enterEditor()
    editor.log('ok', `📂 Project "${p.name}" khola holo (${scene.entities.length} entities, ${scene.meta.mode.toUpperCase()})`)
    statusAI()
  } catch (err) {
    editor.log('err', 'Project load failed: ' + String(err))
  }
}

function continueAutosave() {
  const saved = localStorage.getItem(AUTO)
  if (!saved) return
  try {
    const scene = deserializeScene(saved)
    editor.scene = scene
    editor.selection = null
    const meta = scene.meta
    const entry = storeCreate(meta.name, meta.mode, saved)
    currentProjectId = entry.id
    enterEditor()
    editor.log('ok', `💾 Autosave theke "${meta.name}" khola holo`)
  } catch (err) {
    editor.log('err', 'Autosave load failed: ' + String(err))
  }
}

async function importFile() {
  const nova = (window as any).nova
  if (nova?.open) {
    const res = await nova.open()
    if (!res) { editor.log('info', 'Open cancelled'); return }
    if (res.error) { editor.log('err', 'Open failed: ' + res.error); return }
    importSceneText(res.content, res.name)
  } else {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.nova,.json'
    inp.onchange = () => {
      const f = inp.files?.[0]
      if (!f) return
      f.text().then(t => importSceneText(t, f.name))
    }
    inp.click()
  }
}

/** load a .nova/.json file into the editor as a fresh project */
function importSceneText(text: string, name: string) {
  try {
    const scene = deserializeScene(text)
    editor.scene = scene
    editor.selection = null
    const entry = storeCreate(scene.meta.name || name.replace(/\.nova$/i, ''), scene.meta.mode, serializeScene(scene))
    currentProjectId = entry.id
    enterEditor()
    editor.log('ok', `📂 Imported "${entry.name}" (${scene.entities.length} entities)`)
  } catch (err) {
    editor.log('err', 'Import failed: ' + String(err))
  }
}

/* ---------- play / pause / stop ---------- */

async function startPlay() {
  if (editor.playing) return
  snapshot = serializeScene(editor.scene)
  editor.playing = true
  editor.paused = false
  editor.ended = false
  editor.host.reset()
  engineAPI = makeEngineAPI()
  editor.input.setEnabled(true)
  const m = editor.scene.meta
  if (m.mode === '2d') {
    editor.cam2dPlay = { x: 0, y: 0, zoom: m.camera2d.zoom, shakeX: 0, shakeY: 0 }
    if (m.camera2d.follow) {
      const f = editor.scene.byName(m.camera2d.follow)
      if (f) { editor.cam2dPlay.x = f.transform.pos.x; editor.cam2dPlay.y = f.transform.pos.y }
    }
  } else {
    editor.playCam = { yaw: 0, pitch: -0.12 }
  }
  // real physics worlds (3D needs the Rapier WASM module)
  await rapierReady
  if (!editor.playing) return   // user pressed Stop while waiting
  const sink = (a: Entity, b: Entity) => {
    editor.host.dispatchCollide(a.id, b, engineAPI!)
    editor.host.dispatchCollide(b.id, a, engineAPI!)
  }
  if (m.mode === '3d') phys3 = new Physics3D(editor.scene, sink)
  else phys2 = new Physics2D(editor.scene, sink)
  editor.log('ok', `▶ Playing "${m.name}" — ${m.mode === '3d' ? 'Rapier' : 'Planck (Box2D)'} physics online!`)
  updatePlayUI()
}

function stopPlay() {
  if (!editor.playing) return
  editor.playing = false
  editor.paused = false
  editor.ended = false
  editor.input.setEnabled(false)
  editor.host.reset()
  if (phys2) { phys2.dispose(); phys2 = null }
  if (phys3) { phys3.dispose(); phys3 = null }
  try {
    editor.scene = deserializeScene(snapshot)
  } catch (err) {
    editor.log('err', 'Restore failed: ' + String(err))
  }
  editor.selection = null
  hideOverlay()
  editor.refreshAll()
  editor.applyMode()
  editor.resetCameras()
  editor.log('info', '⏹ Stopped — scene restored')
  updatePlayUI()
}

function restartPlay() {
  if (editor.playing) stopPlay()
  startPlay()
}

function updatePlayUI() {
  ui.playBtn.classList.toggle('active', editor.playing)
  ui.pauseBtn.classList.toggle('active', editor.paused)
  ui.stopBtn.classList.toggle('active', editor.playing)
  const dot = ui.status.state.querySelector('.dot') as HTMLElement
  dot?.classList.toggle('playing', editor.playing)
  ui.status.state.innerHTML = editor.playing
    ? `<span class="dot playing"></span> ${editor.paused ? 'Paused' : 'Playing'}`
    : '<span class="dot stopped"></span> Editor'
  updateHint()
}

ui.playBtn.addEventListener('click', startPlay)
ui.stopBtn.addEventListener('click', stopPlay)
ui.pauseBtn.addEventListener('click', () => {
  if (!editor.playing) return
  editor.paused = !editor.paused
  editor.log('info', editor.paused ? '⏸ Paused' : '▶ Resumed')
  updatePlayUI()
})

/* ---------- game-over overlay ---------- */

function endOverlay(msg: string, win: boolean) {
  if (editor.ended) return
  editor.ended = true
  editor.log(win ? 'ok' : 'warn', win ? `🏆 ${msg}` : `💀 ${msg}`)
  hideOverlay()
  const ov = document.createElement('div')
  ov.className = 'gameover-overlay' + (win ? ' win' : '')
  ov.id = 'nova-end-overlay'
  const big = document.createElement('div')
  big.className = 'big'
  big.textContent = win ? '🏆 ' + msg : '💀 ' + msg
  const again = document.createElement('button')
  again.className = 'btn primary'
  again.textContent = '↻ Play Again'
  again.addEventListener('click', () => { hideOverlay(); restartPlay() })
  const stop = document.createElement('button')
  stop.className = 'btn'
  stop.textContent = 'Back to Editor'
  stop.addEventListener('click', () => stopPlay())
  ov.append(big, again, stop)
  ui.vpWrap.appendChild(ov)
}

function hideOverlay() {
  document.getElementById('nova-end-overlay')?.remove()
}

/* ---------- main loop ---------- */

let last = performance.now()
let frames = 0
let fpsT = 0
let fps = 0

function frame(now: number) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  frames++
  fpsT += dt
  if (fpsT >= 0.5) { fps = Math.round(frames / fpsT); frames = 0; fpsT = 0 }

  r2d.resize()
  r3d.resize()

  const mode3d = editor.scene.meta.mode === '3d'

  if (editor.playing && !editor.paused && !editor.ended && engineAPI) {
    // 3D mouse look
    if (mode3d) {
      editor.playCam.yaw -= editor.input.mouse.dx * 0.0045
      const c3 = editor.scene.meta.camera3d
      if (c3.mode === 'first') {
        editor.playCam.pitch = Math.max(-1.2, Math.min(1.2, editor.playCam.pitch - editor.input.mouse.dy * 0.003))
      }
    }

    // world mouse (2D)
    const cam = editor.cam2dPlay
    const cw = ui.vp2d.clientWidth, ch = ui.vp2d.clientHeight
    const [wx, wy] = r2d.s2w(cam, cw, ch, editor.input.mouse.x, editor.input.mouse.y)
    editor.input.mouse.wx = wx
    editor.input.mouse.wy = wy

    engineAPI.dt = dt
    engineAPI.time += dt

    // scripts
    for (const e of [...editor.scene.entities]) {
      if (!e.visible) continue
      editor.host.run(e, engineAPI)
    }

    // physics (real worlds: Planck/Box2D for 2D, Rapier for 3D)
    if (mode3d) { if (phys3) phys3.step(dt) }
    else if (phys2) phys2.step(dt)

    // purge destroyed
    const dead = editor.scene.entities.filter(e => (e as any).__dead)
    for (const e of dead) {
      editor.host.drop(e.id)
      phys2?.remove(e.id)
      phys3?.remove(e.id)
      editor.scene.remove(e.id)
    }

    // camera follow (2D)
    const m = editor.scene.meta
    if (!mode3d && m.camera2d.follow) {
      const f = editor.scene.byName(m.camera2d.follow)
      if (f) {
        editor.cam2dPlay.x += (f.transform.pos.x - editor.cam2dPlay.x) * Math.min(1, dt * 6)
        editor.cam2dPlay.y += (f.transform.pos.y - editor.cam2dPlay.y) * Math.min(1, dt * 6)
      }
    }

    // shake
    if (editor.shake.time > 0) {
      editor.shake.time -= dt
      editor.cam2dPlay.shakeX = (Math.random() - 0.5) * 2 * editor.shake.amount
      editor.cam2dPlay.shakeY = (Math.random() - 0.5) * 2 * editor.shake.amount
    } else {
      editor.cam2dPlay.shakeX = 0
      editor.cam2dPlay.shakeY = 0
    }

    editor.input.postUpdate()
  }

  r2d.updateParticles(dt)

  const cam: Cam2D = editor.playing ? editor.cam2dPlay : editor.cam2dEdit
  r2d.draw(editor.scene, cam, { hud: mode3d, editor: !editor.playing, selected: editor.selection })
  r3d.sync(editor.scene, {
    orbit: editor.orbit as any,
    playing: editor.playing && mode3d,
    cam: editor.playCam,
    selected: editor.selection
  })

  // status
  if (frames % 12 === 0) {
    ui.status.fps.textContent = `${fps} fps`
    ui.status.count.textContent = `${editor.scene.entities.length} entities`
    ui.status.sel.textContent = editor.selection
      ? editor.scene.entities.find(e => e.id === editor.selection)?.name || '—'
      : '—'
  }
}
requestAnimationFrame(frame)

/* ---------- mode / cameras ---------- */

function applyMode() {
  const mode = editor.scene.meta.mode
  ui.vp2d.classList.toggle('show', mode === '2d')
  ui.vp3d.style.display = mode === '3d' ? 'block' : 'none'
  ui.seg2d.classList.toggle('active', mode === '2d')
  ui.seg3d.classList.toggle('active', mode === '3d')
  if (mode === '3d') {
    editor.orbit.target = { x: 0, y: 1, z: 0 } as any
    r3d.reset()
  }
  updateHint()
  r2d.resize()
  r3d.resize()
}

function updateHint() {
  const m = editor.scene.meta
  if (editor.playing) {
    ui.hintEl.textContent = m.mode === '3d'
      ? `${m.camera3d.mode === 'first' ? 'Mouse look + WASD + Space' : 'Mouse rotates camera · WASD + Space'}`
      : 'Playing — press Stop to return'
    ui.hintEl.style.opacity = '1'
  } else {
    ui.hintEl.textContent = m.mode === '3d'
      ? 'Editor: RMB orbit · Wheel zoom · Click select · Drag XZ'
      : 'Editor: RMB pan · Wheel zoom · Click select · Drag move'
    ui.hintEl.style.opacity = '0.85'
  }
}

function resetCameras() {
  const m = editor.scene.meta
  editor.cam2dEdit = { x: 0, y: 0, zoom: m.camera2d.zoom || 1, shakeX: 0, shakeY: 0 }
  editor.orbit = { theta: 0.7, phi: 0.95, dist: Math.max(14, (m.camera3d.dist || 9) * 2), target: { x: 0, y: 1, z: 0 } as any }
  editor.playCam = { yaw: 0, pitch: -0.12 }
}

/* ---------- scene loading ---------- */

function loadScene(scene: Scene, label: string) {
  editor.scene = scene
  editor.selection = null
  editor.refreshAll()
  editor.applyMode()
  editor.resetCameras()
  updateTitle()
  flushProject(false)
  editor.log('ok', `Scene loaded: ${label} (${scene.entities.length} entities, ${scene.meta.mode.toUpperCase()})`)
  statusAI()
}

function loadSpec(spec: SceneSpec, label: string) {
  loadScene(applySceneSpec(spec), label)
}

function currentSpec(): SceneSpec {
  return JSON.parse(serializeScene(editor.scene))
}

/* ---------- file ops ---------- */

async function saveProject() {
  flushProject()
  const content = serializeScene(editor.scene)
  const nova = (window as any).nova
  if (nova?.save) {
    const path = await nova.save(editor.scene.meta.name.replace(/[^\w -]+/g, '') + '.nova', content)
    if (path && !path.error) editor.log('ok', `💾 Saved: ${path}`)
    else if (path?.error) editor.log('err', 'Save failed: ' + path.error)
    else editor.log('info', 'Save cancelled')
  } else {
    const blob = new Blob([content], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (editor.scene.meta.name || 'game').replace(/\s+/g, '_') + '.nova'
    a.click()
    editor.log('ok', '💾 Downloaded project file (browser mode)')
  }
}

async function openProject() {
  const nova = (window as any).nova
  if (nova?.open) {
    const res = await nova.open()
    if (!res) { editor.log('info', 'Open cancelled'); return }
    if (res.error) { editor.log('err', 'Open failed: ' + res.error); return }
    loadScene(deserializeScene(res.content), res.name)
  } else {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = '.nova,.json'
    inp.onchange = () => {
      const f = inp.files?.[0]
      if (!f) return
      f.text().then(t => loadScene(deserializeScene(t), f.name))
    }
    inp.click()
  }
}

function newSceneModal() {
  const { body } = modal('🆕 New Scene', 'Kon mode e notun scene banabo?')
  const row = document.createElement('div')
  row.style.display = 'flex'
  row.style.gap = '10px'
  const b2 = document.createElement('button')
  b2.className = 'btn primary'; b2.style.flex = '1'
  b2.textContent = '⬜ Blank 2D'
  b2.addEventListener('click', () => { loadSpec(blank2D(), 'Untitled 2D'); document.querySelectorAll('.modal-back').forEach(m => m.remove()) })
  const b3 = document.createElement('button')
  b3.className = 'btn primary'; b3.style.flex = '1'
  b3.textContent = '🔲 Blank 3D'
  b3.addEventListener('click', () => { loadSpec(blank3D(), 'Untitled 3D'); document.querySelectorAll('.modal-back').forEach(m => m.remove()) })
  row.append(b2, b3)
  body.appendChild(row)
}

/* ---------- menus ---------- */

menubarButton(ui.topbar, 'File', [
  { label: '🆕 New Scene', hint: '', action: newSceneModal },
  { label: '📂 Open Project', action: openProject },
  { label: '💾 Save Project', hint: 'Ctrl+S', action: saveProject }
])

menubarButton(ui.topbar, 'AI', [
  { label: '⚙️ AI Settings…', action: () => openSettingsModal(statusAI) },
  { label: '🧠 Analyze Scene', action: analyzeScene },
  { sep: true },
  { label: '⌁ Open AI Builder', action: () => { activateTab('builder'); ui.builder.prompt.focus() } },
  { label: '💬 Open AI Assistant', action: () => { activateTab('assistant'); ui.assistant.input.focus() } }
])

menubarButton(ui.topbar, 'Help', [
  { label: '🔗 AI Agents (OpenCode · Kilo · Kiro…)', action: () => openAgentsModal() },
  { label: '📘 Scripting & AI Guide', action: openDocsModal },
  { label: 'ℹ️ About Nova', action: () => {
    const { body } = modal('Nova Engine', 'AI-first 2D & 3D game engine')
    body.innerHTML = `<div class="doc"><p>Nova Engine v0.2 — ekta AI-first game engine, ekhon real physics shoho:</p>
    <p>• <b>AI Builder</b> — prompt theke LLM diye full game generate<br>
    <b>2D</b> — Canvas2D renderer + <b>Planck.js (Box2D) physics</b>: rigid bodies, rotation, friction, bounce, sensors<br>
    • <b>3D</b> — WebGL (three.js) renderer + <b>Rapier (Rust/WASM) physics</b>: box/sphere/capsule colliders, contact events<br>
    • <b>Editor</b> — hierarchy, inspector, play mode, console<br>
    • <b>Scripting</b> — JS scripts per entity, hot reload</p></div>`
  } }
])

/* mode segment buttons */
ui.seg2d.addEventListener('click', () => { editor.scene.meta.mode = '2d'; editor.applyMode(); editor.refreshInspector() })
ui.seg3d.addEventListener('click', () => { editor.scene.meta.mode = '3d'; editor.applyMode(); editor.refreshInspector() })

/* Ctrl+S */
window.addEventListener('keydown', ev => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
    ev.preventDefault()
    saveProject()
  }
})

/* ---------- AI Builder wiring ---------- */

/* Prompt idea chips — prompt fill kore generate trigger kore (no canned templates) */

const IDEA_CHIPS: Array<{ icon: string; label: string; prompt: string }> = [
  { icon: '🏃', label: 'Platformer', prompt: 'ekta fun platformer banao — coins, enemies, moving platforms' },
  { icon: '🚀', label: 'Space Shooter', prompt: 'space shooter — alien waves attack korche, easy difficulty' },
  { icon: '🐦', label: 'Flappy', prompt: 'flappy bird game — pipes er majh diye ure jao' },
  { icon: '🧱', label: 'Breakout', prompt: 'breakout game — onek brick row smash koro' },
  { icon: '🦖', label: 'Runner', prompt: 'endless runner — hazard jump kore dodge koro' },
  { icon: '💎', label: '3D Explorer', prompt: '3d jungle world e explore kore 10 gems collect korbo' },
  { icon: '🌙', label: 'Neon Night', prompt: 'neon city runner, hard difficulty, night theme, 12 coins' },
  { icon: '🎲', label: 'Surprise Me', prompt: '' }
]

for (const idea of IDEA_CHIPS) {
  const chip = document.createElement('button')
  chip.className = 'chip'
  chip.textContent = `${idea.icon} ${idea.label}`
  chip.addEventListener('click', () => {
    ui.builder.prompt.value = idea.prompt
    ui.builder.gen.click()
  })
  ui.builder.chips.appendChild(chip)
}

function appendBuildLog(text: string, cls = '') {
  const d = document.createElement('div')
  if (cls) d.className = cls
  d.textContent = text
  ui.builder.blog.appendChild(d)
  ui.builder.blog.scrollTop = ui.builder.blog.scrollHeight
}

let generating = false

ui.builder.gen.addEventListener('click', async () => {
  if (generating) return
  generating = true
  ui.builder.gen.disabled = true
  ui.builder.gen.textContent = '⚙️ Building...'
  ui.builder.blog.innerHTML = ''
  const prompt = ui.builder.prompt.value
  appendBuildLog(`⚙ Prompt: "${prompt.slice(0, 120) || '(random)'}"`)
  appendBuildLog('⚙ NovaAI is designing your game...')
  try {
    const settings = loadAISettings()
    const res = await buildGame(settings, prompt)
    loadSpec(res.spec, 'AI generated')
    appendBuildLog(`✔ LLM generated a complete game — ${res.spec.entities?.length || 0} entities`, 'ok')
    appendBuildLog('▶ Chapo Play button to play!', 'hi')
  } catch (err) {
    appendBuildLog('✖ ' + String(err), 'err')
  }
  ui.builder.gen.disabled = false
  ui.builder.gen.textContent = '✨ Generate Game'
  generating = false
})

/* ---------- AI Assistant wiring ---------- */

function addChatMsg(role: 'user' | 'assistant', text: string) {
  const d = document.createElement('div')
  d.className = 'msg ' + role
  d.textContent = text
  ui.assistant.logEl.appendChild(d)
  ui.assistant.logEl.scrollTop = ui.assistant.logEl.scrollHeight
}

async function sendAssistant() {
  const text = ui.assistant.input.value.trim()
  if (!text) return
  ui.assistant.input.value = ''
  addChatMsg('user', text)

  const settings = loadAISettings()
  if (!aiConfigured(settings)) {
    const act = localAssistant(text, editor.scene, spec => {
      editor.scene.entities.push(specToEntity(spec))
    }, () => editor.refreshAll())
    if (act.changed) {
      editor.selection = null
      editor.refreshAll()
      editor.log('ok', '🤖 NovaAI: scene updated')
    }
    addChatMsg('assistant', act.reply)
    return
  }

  addChatMsg('assistant', '...thinking')
  const thinking = ui.assistant.logEl.lastElementChild as HTMLElement
  try {
    const res = await aiAssistant(normalizeSettings(settings), chatHistory, text)
    thinking.remove()
    if (res.patch) {
      loadScene(applySceneSpec(res.patch), 'AI assistant patch')
    }
    addChatMsg('assistant', res.reply || '(no reply)')
    chatHistory.push({ role: 'user', content: text })
    chatHistory.push({ role: 'assistant', content: res.reply.slice(0, 2000) })
    if (chatHistory.length > 14) chatHistory = chatHistory.slice(-14)
  } catch (err) {
    thinking.remove()
    const fallback = localAssistant(text, editor.scene, spec => {
      editor.scene.entities.push(specToEntity(spec))
    }, () => editor.refreshAll())
    addChatMsg('assistant', `⚠ LLM error: ${String(err).slice(0, 160)}\n\n${fallback.reply}`)
  }
}

ui.assistant.send.addEventListener('click', sendAssistant)
ui.assistant.input.addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { ev.preventDefault(); sendAssistant() }
})

addChatMsg('assistant', 'Hi! Ami NovaAI — tomar game assistant. :)\n\nOffline commands chalao: "add 5 coins", "add 3 enemies", "make background red", "clear all".\nAI Settings e LLM key dile ami puro scene modify + kotha bola o korte parbo!')

/* ---------- scene analysis ---------- */

function compactSpec(): string {
  const s = currentSpec()
  for (const e of (s.entities || [])) {
    for (const c of (e.comps || [])) {
      if (c.type === 'script' && typeof c.code === 'string' && c.code.length > 120) {
        c.code = c.code.slice(0, 120) + '...'
      }
    }
  }
  return JSON.stringify(s, null, 1).slice(0, 12000)
}

async function analyzeScene() {
  activateTab('assistant')
  addChatMsg('assistant', '🔍 Analyzing scene...')
  const s = editor.scene
  const stats = {
    mode: s.meta.mode,
    entities: s.entities.length,
    scripts: s.entities.filter(e => getComp(e, 'script')).length,
    bodies: s.entities.filter(e => getComp(e, 'body2d') || getComp(e, 'rigid3d')).length,
    hasPlayer: !!s.byTag('player').length,
    hasScoreHUD: !!s.byName('Score'),
    particles: s.entities.filter(e => getComp(e, 'particles2d')).length
  }
  const local: string[] = []
  if (!stats.hasPlayer) local.push('• Kono Player entity nei — tag "player" add koro')
  if (!stats.hasScoreHUD) local.push('• Score HUD nei — text2d screen:true entity "Score" add koro')
  if (stats.scripts === 0) local.push('• Kono script nei — game logic add koro')
  const settings = loadAISettings()
  if (aiConfigured(settings)) {
    try {
      const res = await aiAssistant(normalizeSettings(settings), [], `Analyze this Nova Engine scene and give 3-5 concrete improvement tips (gameplay, visuals, performance):\n${compactSpec()}`)
      addChatMsg('assistant', `📊 Scene analysis:\n${JSON.stringify(stats)}\n\n${res.reply}`)
      if (res.patch) loadScene(applySceneSpec(res.patch), 'AI analysis patch')
    } catch (err) {
      addChatMsg('assistant', `📊 ${JSON.stringify(stats)}\n\n⚠ LLM unavailable (${String(err).slice(0, 100)})\n${local.join('\n') || '• Scene looks good!'}`)
    }
  } else {
    addChatMsg('assistant', `📊 Local analysis:\n${JSON.stringify(stats, null, 1)}\n\nSuggestions:\n${local.join('\n') || '• Scene e shob ache — darun!'}\n\n(LLM connect korle deeper review pabe — AI Settings)`)
  }
}

/* ---------- assets panel (pixel art) ---------- */

import { SPRITE_CATEGORIES } from './engine/components'
import { spriteCanvas } from './engine/sprites'
import { uid } from './engine/core'

function renderAssets() {
  ui.assetGrid.innerHTML = ''
  for (const cat of SPRITE_CATEGORIES) {
    if (cat === 'none') continue
    const card = document.createElement('div')
    card.className = 'asset'
    const cv = document.createElement('canvas')
    cv.width = 16; cv.height = 16
    const ctx = cv.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(spriteCanvas(cat, 7), 0, 0)
    const lbl = document.createElement('span')
    lbl.textContent = cat
    card.append(cv, lbl)
    card.title = `Apply "${cat}" art to selected entity`
    card.addEventListener('click', () => {
      const sel = editor.scene.entities.find(e => e.id === editor.selection)
      if (!sel) { editor.log('warn', 'Age kono entity select koro, tarpor art apply koro'); return }
      let spr = getComp(sel, 'sprite2d')
      if (!spr) { spr = { type: 'sprite2d', sprite: cat, color: '#7c5cff', w: 48, h: 48, seed: 7, screen: false }; sel.comps.push(spr) }
      spr.sprite = cat
      spr.seed = Math.floor(Math.random() * 9999)
      editor.refreshInspector()
      editor.log('ok', `🎨 Applied "${cat}" art to "${sel.name}"`)
    })
    ui.assetGrid.appendChild(card)
  }
}

ui.assetShuffle.addEventListener('click', () => {
  const sel = editor.scene.entities.find(e => e.id === editor.selection)
  if (sel) {
    const spr = getComp(sel, 'sprite2d')
    if (spr) { spr.seed = Math.floor(Math.random() * 9999); editor.refreshInspector() }
  }
  renderAssets()
  editor.log('ok', '🎲 Randomized pixel art seeds')
})
renderAssets()

/* ---------- autosave ---------- */

const AUTO = 'nova.autosave'
setInterval(() => {
  if (editor.playing) return
  if (appEl.classList.contains('editorhidden')) return   // home screen theke dur
  try {
    localStorage.setItem(AUTO, serializeScene(editor.scene))
    flushProject(false)
  } catch { /* quota */ }
}, 15000)

/* ---------- editor topbar wiring ---------- */

ui.homeBtn.addEventListener('click', returnHome)
ui.saveBtn.addEventListener('click', saveProject)

/* ---------- global keyboard: Esc / F / G / Del / Ctrl+D ---------- */

window.addEventListener('keydown', ev => {
  const t = document.activeElement as HTMLElement | null
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
  if (typing) return

  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') {
    ev.preventDefault()
    const e = editor.scene.entities.find(x => x.id === editor.selection)
    if (e) {
      const c = editor.scene.cloneEntity(e)
      editor.selection = c.id
      editor.refreshAll()
      editor.log('ok', `⧉ Duplicated "${e.name}"`)
    }
    return
  }
  if ((ev.key === 'Delete' || ev.key === 'Backspace') && !editor.playing) {
    const e = editor.scene.entities.find(x => x.id === editor.selection)
    if (e) {
      editor.scene.remove(e.id)
      editor.selection = null
      editor.refreshAll()
      editor.log('warn', `🗑 Deleted "${e.name}"`)
    }
    return
  }
  if (ev.code === 'KeyF' && !editor.playing) { focusSelection(); return }
  if (ev.code === 'KeyG' && !editor.playing) {
    r2d.gridVisible = !r2d.gridVisible
    editor.log('info', `▦ Grid ${r2d.gridVisible ? 'on' : 'off'}`)
    return
  }
  if (ev.key === 'Escape') {
    if (editor.playing) stopPlay()
    else {
      editor.selection = null
      editor.refreshInspector()
      editor.refreshHierarchy()
    }
  }
})

/* ---------- camera focus (F) ---------- */

function focusSelection() {
  const e = editor.scene.entities.find(x => x.id === editor.selection)
  if (!e) { editor.log('info', '🎯 Focus: age kono entity select koro'); return }
  const p = e.transform.pos
  if (editor.scene.meta.mode === '3d') {
    editor.orbit.target = { x: p.x, y: p.y, z: p.z } as any
  } else {
    editor.cam2dEdit.x = p.x
    editor.cam2dEdit.y = p.y
  }
  editor.log('info', `🎯 Camera focused on "${e.name}"`)
}

/* ---------- About modal (home) ---------- */

function openAbout() {
  const { body } = modal('Nova Engine', `v${NOVA_VERSION} — AI-first 2D & 3D game engine`)
  body.innerHTML = `<div class="doc">
  <p><b>Nova Engine</b> — ekta AI-first 2D/3D game engine, real physics er sathe:</p>
  <p>• <b>2D</b> — Canvas2D renderer + <b>Planck.js (Box2D)</b> physics: rotation, friction, bounce, sensors<br>
  • <b>3D</b> — WebGL (three.js) renderer + <b>Rapier (Rust/WASM)</b> physics: box/sphere/capsule colliders, contacts<br>
  • <b>AI Builder</b> — LLM key connect korle prompt theke puro game generate<br>
  • <b>Editor</b> — hierarchy, inspector, play mode, console, scripts</p>
  <p style="color:var(--muted)">Planck.js · three.js · Rapier WASM · esbuild · Electron</p></div>`
}

/* ---------- viewport tools (zoom) ---------- */

function buildVpTools(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'vp-tools'
  const zLbl = document.createElement('span')
  zLbl.className = 'vpzoom'
  zLbl.textContent = '100%'
  const upd = () => {
    zLbl.textContent = editor.scene.meta.mode === '3d'
      ? Math.round(editor.orbit.dist) + 'u'
      : Math.round(editor.cam2dEdit.zoom * 100) + '%'
  }
  const b = (label: string, title: string, fn: () => void) => {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.title = title
    btn.addEventListener('click', () => { fn(); upd() })
    box.appendChild(btn)
    return btn
  }
  b('+', 'Zoom in', () => {
    if (editor.scene.meta.mode === '3d') editor.orbit.dist = Math.max(4, editor.orbit.dist / 1.25)
    else editor.cam2dEdit.zoom = Math.min(6, editor.cam2dEdit.zoom * 1.25)
  })
  b('−', 'Zoom out', () => {
    if (editor.scene.meta.mode === '3d') editor.orbit.dist = Math.min(160, editor.orbit.dist * 1.25)
    else editor.cam2dEdit.zoom = Math.max(0.15, editor.cam2dEdit.zoom / 1.25)
  })
  b('⟲', 'Reset camera', () => { resetCameras(); upd() })
  box.appendChild(zLbl)
  upd()
  return box
}
ui.vpWrap.appendChild(buildVpTools())

/* ---------- boot: home first, editor hidden ---------- */

home = buildHome(document.body, {
    createProject: newProject,
    openProject: id => { const p = getProject(id); if (p) openProjectEntry(p) },
    continueAutosave,
  importFile,
  openAI: () => openSettingsModal(statusAI),
  openAgents: () => openAgentsModal(),
  openDocs: openDocsModal,
  openShortcuts: openShortcutsModal,
  openAbout
})

appEl.classList.add('editorhidden')
home.show()

statusAI()
updatePlayUI()

function statusAI() {
  const s = loadAISettings()
  if (aiConfigured(s)) {
    const n = normalizeSettings(s)
    ui.status.ai.textContent = `🤖 AI: ${n.provider}/${n.model}`
  } else {
    ui.status.ai.textContent = '🤖 AI: not connected (AI menu → Settings e key add korun)'
  }
}
