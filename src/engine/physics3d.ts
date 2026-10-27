/* ============ Nova Engine — 3D physics (spheres + ground plane y=0) ============ */

import { getComp, type Entity, type Scene } from './core'

export type CollideSink = (a: Entity, b: Entity) => void

export function radiusOf(e: Entity): number {
  const r = getComp(e, 'rigid3d')
  if (r && r.radius) return r.radius
  const m = getComp(e, 'mesh3d')
  const s = e.transform.scale
  if (!m) return 0.5
  if (m.geo === 'plane') return 0
  if (m.geo === 'sphere') return 0.5 * Math.max(s.x, s.y, s.z)
  if (m.geo === 'capsule') return 0.5 * Math.max(s.x, s.z)
  // box-ish: half diagonal * 0.7 approximation
  const hx = 0.5 * s.x, hy = 0.5 * s.y, hz = 0.5 * s.z
  return 0.7 * Math.sqrt(hx * hx + hy * hy + hz * hz)
}

export function stepPhysics3D(scene: Scene, dt: number, sink: CollideSink) {
  const g = scene.meta.gravity3d
  const bodies = scene.entities.filter(e => e.visible && getComp(e, 'rigid3d'))
  const statics: Entity[] = []
  const movers: Entity[] = []
  for (const e of bodies) {
    const r = getComp(e, 'rigid3d')!
    ;(r.isStatic ? statics : movers).push(e)
  }

  for (const e of movers) {
    const r = getComp(e, 'rigid3d')!
    if (r.gravityScale !== 0) r.vy += -g * r.gravityScale * dt
    const p = e.transform.pos
    p.x += r.vx * dt
    p.y += r.vy * dt
    p.z += r.vz * dt
    const rad = radiusOf(e)
    r.onGround = false
    if (p.y - rad < 0) {
      p.y = rad
      r.vy = r.bounce > 0 ? -r.vy * r.bounce : 0
      if (Math.abs(r.vy) < 0.6) r.vy = 0
      r.onGround = true
    }
  }

  // movers pushed out of statics horizontally (sphere approx)
  for (const m of movers) {
    const mr = getComp(m, 'rigid3d')!
    if (mr.sensor) continue
    const ra = radiusOf(m)
    for (const s of statics) {
      const sr = getComp(s, 'rigid3d')!
      if (sr.sensor) continue
      const rb = radiusOf(s)
      if (rb <= 0) continue
      const a = m.transform.pos, b = s.transform.pos
      const dy = Math.abs(a.y - b.y)
      if (dy > ra + rb) continue
      const dx = b.x - a.x, dz = b.z - a.z
      const d = Math.sqrt(dx * dx + dz * dz)
      const min = ra + rb
      if (d < min && d > 0.0001) {
        const push = (min - d)
        a.x -= (dx / d) * push
        a.z -= (dz / d) * push
      }
    }
  }

  // collide events
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j]
      const ab = getComp(a, 'rigid3d')!, bb = getComp(b, 'rigid3d')!
      if (ab.isStatic && bb.isStatic) continue
      const A = a.transform.pos, B = b.transform.pos
      const ra = radiusOf(a), rb = radiusOf(b)
      const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z
      if (dx * dx + dy * dy + dz * dz < (ra + rb) * (ra + rb)) sink(a, b)
    }
  }
}
