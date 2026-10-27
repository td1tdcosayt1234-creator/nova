/* ============ Nova Engine — Script host (user game logic) ============ */

import type { Entity, Scene } from './core'

export interface InputAPI {
  down(c: string): boolean
  pressed(c: string): boolean
  mouse: { x: number; y: number; wx: number; wy: number; inside: boolean; left: boolean; right: boolean }
}

export interface SelfAPI {
  name: string
  pos: { x: number; y: number; z: number }
  vel: { x: number; y: number; z: number }
  rot: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
  color: string
  visible: boolean
  onGround: boolean
  mem: Record<string, any>
  tags: string[]
  destroyed: boolean
  has(tag: string): boolean
  addTag(t: string): void
  removeTag(t: string): void
  setText(t: string): void
  burst(n?: number): void
  onCollide(cb: (other: SelfAPI, tag: string) => void): void
}

export interface EngineAPI {
  dt: number
  time: number
  score: number
  input: InputAPI
  log(...args: any[]): void
  random(min: number, max?: number): number
  chance(p: number): boolean
  pick<T>(arr: T[]): T
  find(name: string): SelfAPI | null
  findAll(tag: string): SelfAPI[]
  spawn(spec: any): SelfAPI
  destroy(target: SelfAPI | string): void
  camera: { shake(a?: number, t?: number): void; follow(name: string): void; zoom(z: number): void; readonly yaw: number }
  win(msg?: string): void
  gameOver(msg?: string): void
  reload(): void
  burstAt(target: SelfAPI | string, n?: number): void
}

export type ScriptFn = (self: SelfAPI, engine: EngineAPI) => void

export function compileScript(code: string): ScriptFn {
  return new Function('self', 'engine', '"use strict";\n' + code) as ScriptFn
}

type CollideCb = { cb: (other: any) => void }

export class ScriptHost {
  private fns = new Map<string, ScriptFn>()
  private failed = new Set<string>()
  private registered = new Set<string>()
  private errOnce = new Set<string>()
  private mems = new Map<string, Record<string, any>>()
  private apis = new Map<string, SelfAPI>()
  private collide: Map<string, CollideCb[]> = new Map()

  hooks: {
    burst(entityId: string, n?: number): void
  } = { burst: () => {} }

  ensure(entity: Entity): ScriptFn | null {
    if (this.failed.has(entity.id)) return null
    let fn = this.fns.get(entity.id)
    if (fn) return fn
    const sc = entity.comps.find(c => c.type === 'script')
    if (!sc || !sc.code || !sc.code.trim()) return null
    try {
      fn = compileScript(sc.code)
      this.fns.set(entity.id, fn)
      return fn
    } catch (err) {
      this.failed.add(entity.id)
      console.error(`[script:${entity.name}] compile error:`, err)
      return null
    }
  }

  api(entity: Entity, engine: EngineAPI): SelfAPI {
    let a: any = this.apis.get(entity.id)
    if (a) return a

    const body = () => entity.comps.find(c => c.type === 'body2d')
    const rig = () => entity.comps.find(c => c.type === 'rigid3d')
    const spr = () => entity.comps.find(c => c.type === 'sprite2d')
    const mesh = () => entity.comps.find(c => c.type === 'mesh3d')
    const txt = () => entity.comps.find(c => c.type === 'text2d')

    a = {
      name: entity.name,
      destroyed: false,
      mem: this.mems.get(entity.id) || {},
      has: (t) => entity.tags.includes(t),
      addTag: (t) => { if (!entity.tags.includes(t)) entity.tags.push(t) },
      removeTag: (t) => { entity.tags = entity.tags.filter(x => x !== t) },
      setText: (t) => { const c = txt(); if (c) c.text = String(t) },
      burst: (n = 10) => this.hooks.burst(entity.id, n),
      onCollide: (cb) => {
        if (this.registered.has(entity.id)) return
        this.registered.add(entity.id)
        const list = this.collide.get(entity.id) || []
        list.push({ cb })
        this.collide.set(entity.id, list)
      }
    }
    this.mems.set(entity.id, a.mem)

    Object.defineProperty(a, 'pos', { get: () => entity.transform.pos, set: (v) => Object.assign(entity.transform.pos, v) })
    Object.defineProperty(a, 'rot', { get: () => entity.transform.rot, set: (v) => Object.assign(entity.transform.rot, v) })
    Object.defineProperty(a, 'scale', { get: () => entity.transform.scale, set: (v) => Object.assign(entity.transform.scale, v) })
    Object.defineProperty(a, 'visible', { get: () => entity.visible, set: (v) => { entity.visible = !!v } })
    Object.defineProperty(a, 'tags', { get: () => entity.tags })
    Object.defineProperty(a, 'vel', {
      get: () => {
        const b = body(), r = rig()
        if (b) return { x: b.vx, y: b.vy, z: 0 }
        if (r) return { x: r.vx, y: r.vy, z: r.vz }
        return { x: 0, y: 0, z: 0 }
      },
      set: (v) => {
        const b = body(), r = rig()
        if (b) { b.vx = v.x ?? b.vx; b.vy = v.y ?? b.vy }
        else if (r) { r.vx = v.x ?? r.vx; r.vy = v.y ?? r.vy; r.vz = v.z ?? r.vz }
      }
    })
    Object.defineProperty(a, 'color', {
      get: () => { const s = spr(); if (s) return s.color; const m = mesh(); return m ? m.color : '#ffffff' },
      set: (v) => { const s = spr(); if (s) s.color = v; const m = mesh(); if (m) m.color = v }
    })
    Object.defineProperty(a, 'onGround', {
      get: () => {
        const b = body()
        if (b) return !!b.onGround
        const r = rig()
        return r ? !!r.onGround : false
      }
    })

    this.apis.set(entity.id, a)
    return a
  }

  run(entity: Entity, engine: EngineAPI) {
    const fn = this.ensure(entity)
    if (!fn) return
    const a = this.api(entity, engine)
    try {
      fn(a, engine)
    } catch (err) {
      const key = 'err:' + entity.id
      if (!this.errOnce.has(key)) {
        this.errOnce.add(key)
        console.error(`[script:${entity.name}] runtime error:`, err)
      }
    }
  }

  /** Fire collide callbacks registered by entity `aId` with `other`. */
  dispatchCollide(aId: string, other: Entity, engine: EngineAPI) {
    const list = this.collide.get(aId)
    if (!list) return
    for (const { cb } of list) {
      try { cb(this.api(other, engine)) } catch (err) { console.error('[collide]', err) }
    }
  }

  drop(id: string) {
    this.fns.delete(id)
    this.apis.delete(id)
    this.mems.delete(id)
    this.collide.delete(id)
  }

  reset() {
    this.fns.clear()
    this.failed.clear()
    this.registered.clear()
    this.errOnce.clear()
    this.mems.clear()
    this.apis.clear()
    this.collide.clear()
  }
}
