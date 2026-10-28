/* ============ Nova Engine — 2D renderer (Canvas2D, y-up world) ============ */

import { getComp, type Entity, type Scene } from './core'
import { spriteCanvas } from './sprites'

export interface Cam2D { x: number; y: number; zoom: number; shakeX: number; shakeY: number }

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }

export class Renderer2D {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  private active: Particle[] = []
  private pending: Particle[][] = []
  lastDt = 0.016
  gridVisible = true

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  resize() {
    const c = this.canvas
    const dpr = window.devicePixelRatio || 1
    const w = c.clientWidth, h = c.clientHeight
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.width = Math.floor(w * dpr)
      c.height = Math.floor(h * dpr)
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Spawn a burst at a world position (called via runtime hook). */
  burstAt(x: number, y: number, color: string, size: number, n: number) {
    const list: Particle[] = []
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 60 + Math.random() * 160
      list.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.4 + Math.random() * 0.3,
        max: 0.7,
        size: size * (0.6 + Math.random() * 0.8),
        color
      })
    }
    this.pending.push(list)
  }

  updateParticles(dt: number) {
    this.lastDt = dt
    for (const b of this.pending) this.active.push(...b)
    this.pending = []
    for (const p of this.active) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 0.96
      p.vy *= 0.96
    }
    this.active = this.active.filter(p => p.life > 0)
  }

  w2s(cam: Cam2D, cw: number, ch: number, wx: number, wy: number): [number, number] {
    return [
      cw / 2 + (wx - cam.x) * cam.zoom + cam.shakeX,
      ch / 2 - (wy - cam.y) * cam.zoom + cam.shakeY
    ]
  }

  s2w(cam: Cam2D, cw: number, ch: number, sx: number, sy: number): [number, number] {
    return [
      (sx - cw / 2) / cam.zoom + cam.x,
      (ch / 2 - sy) / cam.zoom + cam.y
    ]
  }

  draw(scene: Scene, cam: Cam2D, opts: { hud: boolean; editor: boolean; selected: string | null }) {
    const ctx = this.ctx
    const cw = this.canvas.clientWidth
    const ch = this.canvas.clientHeight
    if (cw <= 0 || ch <= 0) return
    ctx.save()
    ctx.clearRect(0, 0, cw, ch)

    const m = scene.meta
    if (m.useGradient) {
      const gr = ctx.createLinearGradient(0, 0, 0, ch)
      gr.addColorStop(0, m.bgTop)
      gr.addColorStop(1, m.bgBottom)
      ctx.fillStyle = gr
    } else {
      ctx.fillStyle = m.bg
    }
    ctx.fillRect(0, 0, cw, ch)

    if (!opts.hud) {
      if (opts.editor && this.gridVisible) this.drawGrid(cam, cw, ch)

      const ents = scene.entities
        .filter(e => e.visible && !getComp(e, 'text2d'))
        .sort((a, b) => a.transform.pos.z - b.transform.pos.z)

      for (const e of ents) this.drawEntity(e, cam, cw, ch)

      // world-space text (2D only)
      for (const e of scene.entities) {
        if (!e.visible) continue
        const t = getComp(e, 'text2d')
        if (!t || t.screen) continue
        const [sx, sy] = this.w2s(cam, cw, ch, e.transform.pos.x, e.transform.pos.y)
        this.drawText(t.text, sx, sy, t.size * cam.zoom, t.color)
      }

      // particles
      for (const p of this.active) {
        const [sx, sy] = this.w2s(cam, cw, ch, p.x, p.y)
        ctx.globalAlpha = Math.max(0, p.life / p.max)
        ctx.fillStyle = p.color
        const s = Math.max(1, p.size * cam.zoom)
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s)
      }
      ctx.globalAlpha = 1

      if (opts.editor && opts.selected) {
        const e = scene.entities.find(x => x.id === opts.selected)
        if (e) this.drawSelection(e, cam, cw, ch)
      }
    }

    // HUD: screen-space text (in 3d mode every text2d is HUD)
    for (const e of scene.entities) {
      if (!e.visible) continue
      const t = getComp(e, 'text2d')
      if (!t) continue
      if (opts.hud || t.screen) {
        this.drawText(t.text, e.transform.pos.x, e.transform.pos.y, t.size, t.color)
      }
    }

    ctx.restore()
  }

  private drawText(text: string, x: number, y: number, size: number, color: string) {
    const ctx = this.ctx
    ctx.font = `700 ${size}px 'Segoe UI', system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillStyle = color
    ctx.fillText(String(text), x, y)
  }

  private drawGrid(cam: Cam2D, cw: number, ch: number) {
    const ctx = this.ctx
    const step = 50 * cam.zoom
    if (step < 12) return
    ctx.strokeStyle = 'rgba(255,255,255,0.045)'
    ctx.lineWidth = 1
    const ox = cw / 2 - cam.x * cam.zoom
    const oy = ch / 2 + cam.y * cam.zoom
    const startX = ((ox % step) + step) % step
    const startY = ((oy % step) + step) % step
    ctx.beginPath()
    for (let x = startX; x < cw; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, ch) }
    for (let y = startY; y < ch; y += step) { ctx.moveTo(0, y); ctx.lineTo(cw, y) }
    ctx.stroke()
    ctx.strokeStyle = 'rgba(124,92,255,0.25)'
    ctx.beginPath()
    ctx.moveTo(ox, 0); ctx.lineTo(ox, ch)
    ctx.moveTo(0, oy); ctx.lineTo(cw, oy)
    ctx.stroke()
  }

  private drawEntity(e: Entity, cam: Cam2D, cw: number, ch: number) {
    const ctx = this.ctx
    const [sx, sy] = this.w2s(cam, cw, ch, e.transform.pos.x, e.transform.pos.y)
    const spr = getComp(e, 'sprite2d')
    const part = getComp(e, 'particles2d')

    if (spr) {
      const w = spr.w * cam.zoom
      const h = spr.h * cam.zoom
      ctx.save()
      ctx.translate(sx, sy)
      if (e.transform.rot.z) ctx.rotate(-e.transform.rot.z * Math.PI / 180)
      if (spr.sprite && spr.sprite !== 'none') {
        const img = spriteCanvas(spr.sprite, spr.seed || 1)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, -w / 2, -h / 2, w, h)
      } else {
        ctx.fillStyle = spr.color
        const shape = (spr as any).shape || 'box'
        if (shape === 'circle') {
          ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2); ctx.fill()
        } else if (shape === 'triangle') {
          ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill()
        } else {
          ctx.fillRect(-w / 2, -h / 2, w, h)
        }
      }
      ctx.restore()
    }

    if (part && part.rate > 0) {
      const acc = ((e as any).__acc || 0) + part.rate * this.lastDt
      if (acc >= 1) {
        ;(e as any).__acc = 0
        const p: Particle = {
          x: e.transform.pos.x, y: e.transform.pos.y,
          vx: (Math.random() - 0.5) * part.speed,
          vy: (Math.random() - 0.3) * part.speed,
          life: part.life, max: part.life,
          size: part.size, color: part.color
        }
        this.active.push(p)
      } else {
        ;(e as any).__acc = acc
      }
    }
  }

  private drawSelection(e: Entity, cam: Cam2D, cw: number, ch: number) {
    const ctx = this.ctx
    const b = getComp(e, 'body2d')
    const s = getComp(e, 'sprite2d')
    const w = (b?.w || s?.w || 40) * cam.zoom
    const h = (b?.h || s?.h || 40) * cam.zoom
    const [sx, sy] = this.w2s(cam, cw, ch, e.transform.pos.x, e.transform.pos.y)
    ctx.strokeStyle = '#f0abfc'
    ctx.lineWidth = 1.5
    ctx.strokeRect(sx - w / 2 - 2, sy - h / 2 - 2, w + 4, h + 4)
    ctx.fillStyle = '#f0abfc'
    for (const [hx, hy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      ctx.fillRect(sx + hx * w / 2 - 3, sy + hy * h / 2 - 3, 6, 6)
    }
  }
}
