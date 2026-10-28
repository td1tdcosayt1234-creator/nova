/* ============ Nova Engine — 2D physics (Planck.js — a real Box2D port) ============
   Real rigid bodies: rotation, friction, restitution, dynamic–dynamic collisions,
   sensors and raycast ground checks. Engine units stay the same as before
   (positions in pixels, velocities in pixels/sec) — everything is converted
   through PPM so existing scenes keep working.

   While playing, the physics world is the source of truth after each step.
   Scripts express intent through body2d.vx/vy, transform.pos (teleport) and
   transform.rot.z (spin) — those intents are pushed into the world each frame,
   then the world's resolved state is synced back. */

import { World, Vec2, Box, Circle, type Body } from 'planck'
import { getComp, type Entity, type Scene } from './core'

/** pixels per meter — Box2D is happiest with 0.1–10 m bodies */
export const PPM = 50

const FIXED_DT = 1 / 60
const MAX_SUBSTEPS = 5
const R2D = 180 / Math.PI

export type CollideSink = (a: Entity, b: Entity) => void

export function bodyHalf(e: Entity): { hw: number; hh: number } {
  const b = getComp(e, 'body2d')
  if (b && b.w) return { hw: b.w / 2, hh: b.h / 2 }
  const s = getComp(e, 'sprite2d')
  if (s) return { hw: s.w / 2, hh: s.h / 2 }
  return { hw: 20, hh: 20 }
}

function pairKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a
}

export class Physics2D {
  world = new World({ gravity: new Vec2(0, 0) })
  private scene: Scene
  private sink: CollideSink
  private bodies = new Map<string, Body>()
  private byId = new Map<string, Entity>()
  private lastVel = new Map<string, [number, number]>()
  private lastRot = new Map<string, number>()
  private activePairs = new Set<string>()
  private acc = 0
  private disposed = false

  constructor(scene: Scene, sink: CollideSink) {
    this.scene = scene
    this.sink = sink
    this.world.setGravity(new Vec2(0, -(Number(scene.meta.gravity2d) || 0) / PPM))
    this.world.on('begin-contact', c => {
      const a = c.getFixtureA().getBody().getUserData()
      const b = c.getFixtureB().getBody().getUserData()
      if (typeof a === 'string' && typeof b === 'string') this.activePairs.add(pairKey(a, b))
    })
    this.world.on('end-contact', c => {
      const a = c.getFixtureA().getBody().getUserData()
      const b = c.getFixtureB().getBody().getUserData()
      if (typeof a === 'string' && typeof b === 'string') this.activePairs.delete(pairKey(a, b))
    })
    for (const e of [...scene.entities]) this.add(e)
  }

  /* body build for one entity (no body2d / hidden / existing → skip) */
  add(e: Entity) {
    if (this.disposed) return
    const b = getComp(e, 'body2d') as any
    if (!b || !e.visible || this.bodies.has(e.id)) return
    const half = bodyHalf(e)
    const hw = Math.max(2, half.hw) / PPM
    const hh = Math.max(2, half.hh) / PPM
    const t = e.transform.pos
    const body = this.world.createBody({
      type: b.isStatic ? 'static' : 'dynamic',
      position: new Vec2(t.x / PPM, t.y / PPM),
      angle: (e.transform.rot.z || 0) / R2D
    })
    body.setUserData(e.id)
    if (!b.isStatic) {
      body.setGravityScale(Number.isFinite(b.gravityScale) ? b.gravityScale : 1)
      if (b.keepUpright !== false) body.setFixedRotation(true)   // platformer-friendly default
    }
    const spr = getComp(e, 'sprite2d') as any
    const shape = (spr && spr.shape === 'circle')
      ? new Circle(Math.max(hw, hh))
      : new Box(hw, hh)
    body.createFixture(shape, {
      density: 1,
      friction: Number.isFinite(b.friction) ? b.friction : 0.35,
      restitution: Number(b.bounce) || 0,
      isSensor: !!b.sensor
    })
    this.bodies.set(e.id, body)
    this.byId.set(e.id, e)
    this.lastVel.set(e.id, [Number(b.vx) || 0, Number(b.vy) || 0])
    this.lastRot.set(e.id, e.transform.rot.z || 0)
  }

  remove(id: string) {
    const body = this.bodies.get(id)
    if (!body) return
    this.bodies.delete(id)
    this.byId.delete(id)
    this.lastVel.delete(id)
    this.lastRot.delete(id)
    for (const k of [...this.activePairs]) if (k.indexOf(id) !== -1) this.activePairs.delete(k)
    this.world.destroyBody(body)
  }

  /** advance the world with a fixed timestep (accumulator) and sync everything back */
  step(dt: number) {
    if (this.disposed) return
    this.pushIntents()
    this.acc += Math.min(dt, 0.1)
    let steps = 0
    while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.world.step(FIXED_DT, 8, 3)
      this.acc -= FIXED_DT
      steps++
    }
    if (steps === MAX_SUBSTEPS) this.acc = 0
    this.syncFromWorld()
    this.flushPairs()
  }

  /** scripts → world (vel/teleport/spin intents, static platform movement) */
  private pushIntents() {
    for (const [id, body] of this.bodies) {
      const e = this.byId.get(id)
      const b = e ? (getComp(e, 'body2d') as any) : null
      if (!e || !b) continue
      const t = e.transform
      if (b.isStatic) {
        // statics don't integrate — mirror script-driven motion (moving platforms, bobbing pickups)
        body.setPosition(new Vec2(t.pos.x / PPM, t.pos.y / PPM))
        body.setAngle((t.rot.z || 0) / R2D)
        continue
      }
      const lv = body.getLinearVelocity()
      const vx = (Number(b.vx) || 0) / PPM
      const vy = (Number(b.vy) || 0) / PPM
      if (Math.abs(vx - lv.x) > 1e-6 || Math.abs(vy - lv.y) > 1e-6) {
        body.setLinearVelocity(new Vec2(vx, vy))
      }
      if (!body.isFixedRotation()) {
        const want = t.rot.z || 0
        if (Math.abs(want - (this.lastRot.get(id) || 0)) > 1e-4) body.setAngle(want / R2D)
      }
      const p = body.getPosition()
      if (Math.abs(t.pos.x / PPM - p.x) > 1e-4 || Math.abs(t.pos.y / PPM - p.y) > 1e-4) {
        body.setPosition(new Vec2(t.pos.x / PPM, t.pos.y / PPM))
      }
    }
  }

  /** world → transforms/components + ground flags */
  private syncFromWorld() {
    for (const [id, body] of this.bodies) {
      const e = this.byId.get(id)
      const b = e ? (getComp(e, 'body2d') as any) : null
      if (!e || !b) continue
      if (b.isStatic) continue   // statics: transform is authoritative (scripts may move them)
      const p = body.getPosition()
      e.transform.pos.x = p.x * PPM
      e.transform.pos.y = p.y * PPM
      if (!body.isFixedRotation()) {
        const deg = body.getAngle() * R2D
        e.transform.rot.z = deg
        this.lastRot.set(id, deg)
      }
      const lv = body.getLinearVelocity()
      b.vx = lv.x * PPM
      b.vy = lv.y * PPM
      this.lastVel.set(id, [b.vx, b.vy])
      b.onGround = this.groundBelow(body, e)
    }
  }

  /** raycast straight down; any non-sensor fixture below the feet = grounded */
  private groundBelow(body: Body, e: Entity): boolean {
    const half = bodyHalf(e).hh
    const p = body.getPosition()
    let hit = false
    this.world.rayCast(
      new Vec2(p.x, p.y),
      new Vec2(p.x, p.y - (half + 8) / PPM),
      (fixture, _pt, _n, frac) => {
        if (fixture.getBody() === body) return 1
        if (fixture.isSensor()) return 1
        hit = true
        return frac
      }
    )
    return hit
  }

  /** dispatch active contact pairs to scripts (both directions) */
  private flushPairs() {
    for (const key of this.activePairs) {
      const [a, b] = key.split('|')
      const ea = this.byId.get(a)
      const eb = this.byId.get(b)
      if (ea && eb) this.sink(ea, eb)
    }
  }

  dispose() {
    this.disposed = true
    this.activePairs.clear()
    this.bodies.clear()
    this.byId.clear()
    this.lastVel.clear()
    this.lastRot.clear()
    this.acc = 0
    this.world = new World({ gravity: new Vec2(0, 0) })
  }
}
