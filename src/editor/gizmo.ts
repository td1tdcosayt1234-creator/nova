/* ============ Nova Engine — Gizmos: select / move / camera controls ============ */

import { getComp } from '../engine/core'
import { selectedEntity, type Editor } from './state'

export function initGizmo(
  ed: Editor,
  vp2d: HTMLCanvasElement,
  vp3d: HTMLCanvasElement
) {
  /* ---------- 2D viewport ---------- */

  let dragging: { id: string; offX: number; offY: number } | null = null
  let panning = false
  let panStart = { x: 0, y: 0, cx: 0, cy: 0 }

  vp2d.addEventListener('mousedown', ev => {
    if (ed.playing) return
    const r = vp2d.getBoundingClientRect()
    const mx = ev.clientX - r.left, my = ev.clientY - r.top
    if (ev.button === 1 || ev.button === 2 || (ev.button === 0 && ev.shiftKey)) {
      panning = true
      panStart = { x: mx, y: my, cx: ed.cam2dEdit.x, cy: ed.cam2dEdit.y }
      ev.preventDefault()
      return
    }
    if (ev.button !== 0) return
    const hit = hitTest2D(ed, mx, my)
    ed.selection = hit ? hit.id : null
    ed.refreshHierarchy()
    ed.refreshInspector()
    if (hit) {
      const e = ed.scene.entities.find(x => x.id === hit.id)!
      const [wx, wy] = ed.r2d.s2w(ed.cam2dEdit, vp2d.clientWidth, vp2d.clientHeight, mx, my)
      dragging = { id: hit.id, offX: wx - e.transform.pos.x, offY: wy - e.transform.pos.y }
    }
  })

  window.addEventListener('mousemove', ev => {
    if (ed.playing) return
    if (panning) {
      const r = vp2d.getBoundingClientRect()
      const mx = ev.clientX - r.left, my = ev.clientY - r.top
      const z = ed.cam2dEdit.zoom
      ed.cam2dEdit.x = panStart.cx - (mx - panStart.x) / z
      ed.cam2dEdit.y = panStart.cy + (my - panStart.y) / z
      return
    }
    if (dragging) {
      const r = vp2d.getBoundingClientRect()
      const mx = ev.clientX - r.left, my = ev.clientY - r.top
      const [wx, wy] = ed.r2d.s2w(ed.cam2dEdit, vp2d.clientWidth, vp2d.clientHeight, mx, my)
      const e = ed.scene.entities.find(x => x.id === dragging!.id)
      if (e) {
        e.transform.pos.x = Math.round((wx - dragging.offX) * 2) / 2
        e.transform.pos.y = Math.round((wy - dragging.offY) * 2) / 2
        updateInspectorValues(ed)
      }
    }
  })

  window.addEventListener('mouseup', () => { dragging = null; panning = false })

  vp2d.addEventListener('wheel', ev => {
    if (ed.playing) return
    ev.preventDefault()
    const z = ed.cam2dEdit.zoom * (ev.deltaY > 0 ? 0.9 : 1.1)
    ed.cam2dEdit.zoom = Math.max(0.15, Math.min(4, z))
  }, { passive: false })

  /* ---------- 3D viewport ---------- */

  let drag3d: { id: string; planeY: number } | null = null
  let orbiting = false

  vp3d.addEventListener('mousedown', ev => {
    if (ed.playing) return
    if (ev.button === 2 || ev.button === 1) {
      orbiting = true
      return
    }
    if (ev.button !== 0) return
    const r = vp3d.getBoundingClientRect()
    const nx = ((ev.clientX - r.left) / r.width) * 2 - 1
    const ny = -(((ev.clientY - r.top) / r.height) * 2 - 1)
    const id = ed.r3d.pick(nx, ny)
    ed.selection = id
    ed.refreshHierarchy()
    ed.refreshInspector()
    if (id) {
      const e = ed.scene.entities.find(x => x.id === id)!
      drag3d = { id, planeY: e.transform.pos.y }
    }
  })

  window.addEventListener('mousemove', ev => {
    if (ed.playing) return
    if (orbiting) {
      ed.orbit.theta -= ev.movementX * 0.006
      ed.orbit.phi = Math.max(0.12, Math.min(1.5, ed.orbit.phi + ev.movementY * 0.006))
      return
    }
    if (drag3d) {
      const r = vp3d.getBoundingClientRect()
      const nx = ((ev.clientX - r.left) / r.width) * 2 - 1
      const ny = -(((ev.clientY - r.top) / r.height) * 2 - 1)
      const pt = ed.r3d.groundPoint(nx, ny, drag3d.planeY)
      if (pt) {
        const e = ed.scene.entities.find(x => x.id === drag3d!.id)
        if (e) {
          e.transform.pos.x = Math.round(pt.x * 4) / 4
          e.transform.pos.z = Math.round(pt.z * 4) / 4
          updateInspectorValues(ed)
        }
      }
    }
  })

  window.addEventListener('mouseup', () => { orbiting = false; drag3d = null })

  vp3d.addEventListener('wheel', ev => {
    if (ed.playing) return
    ev.preventDefault()
    ed.orbit.dist = Math.max(2, Math.min(90, ed.orbit.dist * (ev.deltaY > 0 ? 1.08 : 0.92)))
  }, { passive: false })

  /* ---------- keyboard (editor mode) ---------- */

  window.addEventListener('keydown', ev => {
    if (ed.playing) return
    const tag = (ev.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const sel = selectedEntity(ed)
      if (sel) {
        ed.scene.remove(sel.id)
        ed.selection = null
        ed.refreshAll()
        ed.log('warn', `Deleted "${sel.name}"`)
      }
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') {
      ev.preventDefault()
      const sel = selectedEntity(ed)
      if (sel) {
        const c = ed.scene.cloneEntity(sel)
        ed.selection = c.id
        ed.refreshAll()
      }
    }
  })
}

interface Hit { id: string; z: number }

function hitTest2D(ed: Editor, mx: number, my: number): Hit | null {
  const vp2d = ed.r2d.canvas
  const cw = vp2d.clientWidth, ch = vp2d.clientHeight
  let best: Hit | null = null
  for (const e of ed.scene.entities) {
    if (!e.visible) continue
    if (getComp(e, 'text2d') && !getComp(e, 'sprite2d')) continue
    const b = getComp(e, 'body2d')
    const s = getComp(e, 'sprite2d')
    const hw = (b?.w || s?.w || 40) / 2
    const hh = (b?.h || s?.h || 40) / 2
    const [sx, sy] = ed.r2d.w2s(ed.cam2dEdit, cw, ch, e.transform.pos.x, e.transform.pos.y)
    if (Math.abs(mx - sx) <= hw * ed.cam2dEdit.zoom && Math.abs(my - sy) <= hh * ed.cam2dEdit.zoom) {
      if (!best || e.transform.pos.z >= best.z) best = { id: e.id, z: e.transform.pos.z }
    }
  }
  return best
}

/** live-update inspector vec3 inputs while dragging */
function updateInspectorValues(ed: Editor) {
  const sel = selectedEntity(ed)
  if (!sel) return
  const inputs = document.querySelectorAll<HTMLInputElement>('input[data-getter]')
  for (const i of inputs) {
    const getter = i.dataset.getter as 'pos' | 'rot' | 'scale'
    const axis = i.dataset.axis2 as 'x' | 'y' | 'z'
    const v = sel.transform[getter][axis]
    if (Number.isFinite(v) && document.activeElement !== i) i.value = String(Math.round(v * 100) / 100)
  }
}
