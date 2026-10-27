/* ============ Nova Engine — 2D physics (AABB platformer style, y-up world) ============ */

import { getComp, type Entity, type Scene } from './core'

export type CollideSink = (a: Entity, b: Entity) => void

export function bodyHalf(e: Entity): { hw: number; hh: number } {
  const b = getComp(e, 'body2d')
  if (b && b.w) return { hw: b.w / 2, hh: b.h / 2 }
  const s = getComp(e, 'sprite2d')
  if (s) return { hw: s.w / 2, hh: s.h / 2 }
  return { hw: 20, hh: 20 }
}

function overlap(a: Entity, b: Entity): { ox: number; oy: number } | null {
  const A = bodyHalf(a), B = bodyHalf(b)
  const dx = b.transform.pos.x - a.transform.pos.x
  const dy = b.transform.pos.y - a.transform.pos.y
  const ox = A.hw + B.hw - Math.abs(dx)
  const oy = A.hh + B.hh - Math.abs(dy)
  if (ox > 0 && oy > 0) return { ox, oy }
  return null
}

export function stepPhysics2D(scene: Scene, dt: number, sink: CollideSink) {
  const bodies = scene.entities.filter(e => e.visible && getComp(e, 'body2d'))
  const statics: Entity[] = []
  const movers: Entity[] = []
  for (const e of bodies) {
    const b = getComp(e, 'body2d')!
    ;(b.isStatic ? statics : movers).push(e)
  }

  const g = scene.meta.gravity2d

  // integrate movers (y-up: gravity pulls down)
  for (const e of movers) {
    const b = getComp(e, 'body2d')!
    if (b.gravityScale !== 0) b.vy += -g * b.gravityScale * dt
    e.transform.pos.x += b.vx * dt
    e.transform.pos.y += b.vy * dt
    b.onGround = false
  }

  // resolve movers vs statics (axis-separated, sequential)
  for (const m of movers) {
    const mb = getComp(m, 'body2d')!
    const MH = bodyHalf(m)
    for (const s of statics) {
      const sb = getComp(s, 'body2d')!
      if (sb.sensor) continue
      const r = overlap(m, s)
      if (!r) continue
      const SH = bodyHalf(s)
      const dx = s.transform.pos.x - m.transform.pos.x
      const dy = s.transform.pos.y - m.transform.pos.y

      if (r.ox <= r.oy) {
        // resolve X
        if (dx > 0) m.transform.pos.x -= r.ox
        else m.transform.pos.x += r.ox
        mb.vx = mb.bounce > 0 ? -mb.vx * mb.bounce : 0
      } else {
        // resolve Y
        if (dy > 0) {
          // static is above mover -> ceiling hit
          m.transform.pos.y -= r.oy
          mb.vy = mb.bounce > 0 ? -mb.vy * mb.bounce : Math.min(mb.vy, 0)
        } else {
          // static is below mover -> landed on it
          m.transform.pos.y += r.oy
          mb.vy = mb.bounce > 0 ? -mb.vy * mb.bounce : 0
          mb.onGround = true
        }
      }
      void SH
    }
  }

  // pairwise collide events
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j]
      const ab = getComp(a, 'body2d')!, bb = getComp(b, 'body2d')!
      const bothStatic = ab.isStatic && bb.isStatic
      if (bothStatic) continue
      if (overlap(a, b)) sink(a, b)
    }
  }
}
