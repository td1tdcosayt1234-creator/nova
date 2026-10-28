/* ============ Nova Engine — 3D physics (Rapier — Rust rigid-body engine, WASM) ============
   Real rigid bodies: box / sphere / capsule / cuboid colliders straight from mesh3d
   geometry, friction, restitution, dynamic–dynamic collisions, contact events,
   raycast ground checks and optional CCD. Units are plain meters (like the renderer).

   While playing, the physics world is the source of truth after each step.
   Scripts express intent through rigid3d.vx/vy/vz, transform.pos (teleport) and
   transform.rot (spin) — intents are pushed into the world each frame, then the
   world's resolved state is synced back. */

import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { getComp, type Entity, type Scene, type Vec3 } from './core'

/** load the WASM module once — await this before constructing Physics3D */
export const rapierReady = RAPIER.init()

const FIXED_DT = 1 / 60
const MAX_SUBSTEPS = 5
const DEG = Math.PI / 180

export type CollideSink = (a: Entity, b: Entity) => void

/** conservative sphere-ish radius (used by the editor gizmos/renderers) */
export function radiusOf(e: Entity): number {
  const r = getComp(e, 'rigid3d') as any
  if (r && r.radius) return r.radius
  const m = getComp(e, 'mesh3d') as any
  const s = e.transform.scale
  if (!m) return 0.5
  if (m.geo === 'plane') return 0
  if (m.geo === 'sphere') return 0.5 * Math.max(s.x, s.y, s.z)
  if (m.geo === 'capsule') return 0.5 * Math.max(s.x, s.z)
  const hx = 0.5 * s.x, hy = 0.5 * s.y, hz = 0.5 * s.z
  return 0.7 * Math.sqrt(hx * hx + hy * hy + hz * hz)
}

/** approximation of the collider's lower half-height (for ground rays) */
export function halfHeightOf(e: Entity): number {
  const r = getComp(e, 'rigid3d') as any
  const m = getComp(e, 'mesh3d') as any
  const geo = m?.geo || 'box'
  const s = e.transform.scale
  if (r && Number(r.radius) > 0 && geo !== 'box' && geo !== 'plane') return Number(r.radius)
  if (geo === 'plane') return 0.5
  if (geo === 'sphere' || geo === 'torus' || geo === 'torusKnot') return 0.5 * Math.max(s.x, s.y, s.z)
  if (geo === 'capsule') return 0.275 * s.y + 0.35 * Math.max(s.x, s.z)
  return 0.5 * s.y
}

/* three.js views rot as XYZ-intrinsic degrees — keep physics & render in the same space */
const _e = new THREE.Euler()
const _q = new THREE.Quaternion()

function eulerDegToQuat(rot: Vec3): { x: number; y: number; z: number; w: number } {
  _e.set(
    (Number(rot.x) || 0) * DEG,
    (Number(rot.y) || 0) * DEG,
    (Number(rot.z) || 0) * DEG,
    'XYZ'
  )
  _q.setFromEuler(_e)
  return { x: _q.x, y: _q.y, z: _q.z, w: _q.w }
}

function quatToEulerDeg(q: { x: number; y: number; z: number; w: number }, out: Vec3) {
  _q.set(q.x, q.y, q.z, q.w)
  _e.setFromQuaternion(_q, 'XYZ')
  out.x = _e.x / DEG
  out.y = _e.y / DEG
  out.z = _e.z / DEG
}

function pairKey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a
}

export class Physics3D {
  world = new RAPIER.World(new RAPIER.Vector3(0, 0, 0))
  private events = new RAPIER.EventQueue(true)
  private scene: Scene
  private sink: CollideSink
  private bodies = new Map<string, RAPIER.RigidBody>()
  private byId = new Map<string, Entity>()
  private staticBody = new Map<string, boolean>()
  private colliderEnt = new Map<number, string>()
  private lastVel = new Map<string, [number, number, number]>()
  private lastRot = new Map<string, Vec3>()
  private activePairs = new Set<string>()
  private acc = 0
  private disposed = false

  constructor(scene: Scene, sink: CollideSink) {
    this.scene = scene
    this.sink = sink
    this.world.gravity = new RAPIER.Vector3(0, -(Number(scene.meta.gravity3d) || 0), 0)
    for (const e of [...scene.entities]) this.add(e)
  }

  /* collider straight off the mesh geometry (plane → big static slab) */
  private colliderFor(e: Entity): RAPIER.ColliderDesc {
    const r = getComp(e, 'rigid3d') as any
    const m = getComp(e, 'mesh3d') as any
    const geo = m?.geo || 'box'
    const s = e.transform.scale
    let desc: RAPIER.ColliderDesc
    if (geo === 'plane') {
      desc = RAPIER.ColliderDesc.cuboid(160, 0.5, 160)
      desc.setTranslation(0, -0.5, 0)   // top surface exactly at entity y
    } else if (r && Number(r.radius) > 0 && geo !== 'box') {
      desc = RAPIER.ColliderDesc.ball(Number(r.radius))     // legacy radius field (old scenes)
    } else if (geo === 'sphere' || geo === 'torus' || geo === 'torusKnot') {
      desc = RAPIER.ColliderDesc.ball(0.5 * Math.max(s.x, s.y, s.z))
    } else if (geo === 'capsule') {
      desc = RAPIER.ColliderDesc.capsule(
        Math.max(0.02, 0.275 * s.y),
        Math.max(0.02, 0.35 * Math.max(s.x, s.z))
      )
    } else {
      desc = RAPIER.ColliderDesc.cuboid(
        Math.max(0.01, 0.5 * s.x),
        Math.max(0.01, 0.5 * s.y),
        Math.max(0.01, 0.5 * s.z)
      )
    }
    desc.setFriction(Number.isFinite(r?.friction) ? r.friction : 0.6)
    desc.setRestitution(Number(r?.bounce) || 0)
    desc.setDensity(1)
    if (r?.sensor) desc.setSensor(true)
    desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
    return desc
  }

  add(e: Entity) {
    if (this.disposed) return
    const r = getComp(e, 'rigid3d') as any
    if (!r || !e.visible || this.bodies.has(e.id)) return
    const m = getComp(e, 'mesh3d') as any
    const geo = m?.geo || 'box'
    const isStatic = !!r.isStatic || geo === 'plane'
    const t = e.transform
    const desc = isStatic ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic()
    desc.setTranslation(t.pos.x, t.pos.y, t.pos.z)
    const q = eulerDegToQuat(t.rot)
    desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    const body = this.world.createRigidBody(desc)
    if (!isStatic) {
      body.setGravityScale(Number.isFinite(r.gravityScale) ? r.gravityScale : 1, true)
      if (r.lockRot) body.lockRotations(true, true)
    }
    const collider = this.world.createCollider(this.colliderFor(e), body)
    this.colliderEnt.set(collider.handle, e.id)
    this.bodies.set(e.id, body)
    this.byId.set(e.id, e)
    this.staticBody.set(e.id, isStatic)
    this.lastVel.set(e.id, [Number(r.vx) || 0, Number(r.vy) || 0, Number(r.vz) || 0])
    this.lastRot.set(e.id, { x: t.rot.x, y: t.rot.y, z: t.rot.z })
  }

  remove(id: string) {
    const body = this.bodies.get(id)
    if (!body) return
    for (const [h, eid] of [...this.colliderEnt]) if (eid === id) this.colliderEnt.delete(h)
    this.bodies.delete(id)
    this.byId.delete(id)
    this.lastVel.delete(id)
    this.lastRot.delete(id)
    for (const k of [...this.activePairs]) if (k.indexOf(id) !== -1) this.activePairs.delete(k)
    this.world.removeRigidBody(body)
  }

  /** advance the world (fixed timestep) and sync everything back */
  step(dt: number) {
    if (this.disposed) return
    this.pushIntents()
    this.acc += Math.min(dt, 0.1)
    let steps = 0
    while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.world.timestep = FIXED_DT
      this.world.step(this.events)
      this.acc -= FIXED_DT
      steps++
    }
    if (steps === MAX_SUBSTEPS) this.acc = 0
    this.events.drainCollisionEvents((h1, h2, started) => {
      const a = this.colliderEnt.get(h1)
      const b = this.colliderEnt.get(h2)
      if (!a || !b) return
      if (started) this.activePairs.add(pairKey(a, b))
      else this.activePairs.delete(pairKey(a, b))
    })
    this.syncFromWorld()
    this.flushPairs()
  }

  /** scripts → world */
  private pushIntents() {
    for (const [id, body] of this.bodies) {
      const e = this.byId.get(id)
      const r = e ? (getComp(e, 'rigid3d') as any) : null
      if (!e || !r) continue
      const t = e.transform
      if (this.staticBody.get(id)) {
        // statics (incl. ground planes) mirror script-driven motion exactly
        body.setTranslation(new RAPIER.Vector3(t.pos.x, t.pos.y, t.pos.z), true)
        const q = eulerDegToQuat(t.rot)
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
        continue
      }
      const lv = body.linvel()
      const want = [Number(r.vx) || 0, Number(r.vy) || 0, Number(r.vz) || 0]
      if (Math.abs(want[0] - lv.x) > 1e-6 || Math.abs(want[1] - lv.y) > 1e-6 || Math.abs(want[2] - lv.z) > 1e-6) {
        body.setLinvel(new RAPIER.Vector3(want[0], want[1], want[2]), true)
      }
      const last = this.lastRot.get(id) || { x: 0, y: 0, z: 0 }
      if (Math.abs(t.rot.x - last.x) > 1e-4 || Math.abs(t.rot.y - last.y) > 1e-4 || Math.abs(t.rot.z - last.z) > 1e-4) {
        const q = eulerDegToQuat(t.rot)
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      }
      const tr = body.translation()
      if (Math.abs(t.pos.x - tr.x) > 1e-4 || Math.abs(t.pos.y - tr.y) > 1e-4 || Math.abs(t.pos.z - tr.z) > 1e-4) {
        body.setTranslation(new RAPIER.Vector3(t.pos.x, t.pos.y, t.pos.z), true)
      }
    }
  }

  /** world → transforms/components + ground flags */
  private syncFromWorld() {
    for (const [id, body] of this.bodies) {
      const e = this.byId.get(id)
      const r = e ? (getComp(e, 'rigid3d') as any) : null
      if (!e || !r) continue
      if (this.staticBody.get(id)) continue   // statics keep script-driven transforms
      const tr = body.translation()
      const t = e.transform.pos
      t.x = tr.x; t.y = tr.y; t.z = tr.z
      const q = body.rotation()
      quatToEulerDeg(q, e.transform.rot)
      const lr = this.lastRot.get(id)
      if (lr) { lr.x = e.transform.rot.x; lr.y = e.transform.rot.y; lr.z = e.transform.rot.z }
      else this.lastRot.set(id, { ...e.transform.rot })
      const lv = body.linvel()
      r.vx = lv.x; r.vy = lv.y; r.vz = lv.z
      this.lastVel.set(id, [lv.x, lv.y, lv.z])
      r.onGround = this.groundBelow(body, e)
    }
  }

  /** raycast straight down, excluding this body's own colliders */
  private groundBelow(body: RAPIER.RigidBody, e: Entity): boolean {
    const half = halfHeightOf(e)
    const p = body.translation()
    const ray = new RAPIER.Ray(
      { x: p.x, y: p.y + 0.2, z: p.z },
      { x: 0, y: -1, z: 0 }
    )
    const hit = this.world.castRay(ray, 0.2 + half + 0.25, true, undefined, undefined, undefined, body)
    if (!hit) return false
    return !hit.collider.isSensor() && hit.timeOfImpact <= half + 0.22
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
    try { this.events.free() } catch { /* already freed */ }
    try { this.world.free() } catch { /* already freed */ }
    this.bodies.clear()
    this.byId.clear()
    this.staticBody.clear()
    this.colliderEnt.clear()
    this.lastVel.clear()
    this.lastRot.clear()
    this.acc = 0
  }
}
