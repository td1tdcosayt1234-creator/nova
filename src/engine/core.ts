/* ============ Nova Engine — Core: math, ECS, Scene ============ */

export type Vec3 = { x: number; y: number; z: number }

export function v3(x = 0, y = 0, z = 0): Vec3 { return { x, y, z } }
export function cloneVec3(v: Vec3): Vec3 { return { x: v.x, y: v.y, z: v.z } }
export function clamp(x: number, a: number, b: number) { return x < a ? a : x > b ? b : x }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

let idCounter = Math.floor(Math.random() * 1e6)
export function uid(prefix = 'e'): string {
  return `${prefix}${idCounter++}_${Math.random().toString(36).slice(2, 6)}`
}

/* ---------- Components / Entities ---------- */

export type Component = { type: string } & Record<string, any>

export type Transform = { pos: Vec3; rot: Vec3; scale: Vec3 }

export function makeTransform(): Transform {
  return { pos: v3(), rot: v3(), scale: v3(1, 1, 1) }
}

export type Entity = {
  id: string
  name: string
  visible: boolean
  tags: string[]
  transform: Transform
  comps: Component[]
}

export function getComp<T = Component>(e: Entity, type: string): T | null {
  for (const c of e.comps) if (c.type === type) return c as T
  return null
}
export function hasComp(e: Entity, type: string): boolean {
  return !!getComp(e, type)
}
export function addComp(e: Entity, c: Component): Component {
  const old = getComp(e, c.type)
  if (old) { Object.assign(old, c); return old }
  e.comps.push(c)
  return c
}
export function removeComp(e: Entity, type: string) {
  e.comps = e.comps.filter(c => c.type !== type)
}

/* ---------- Scene ---------- */

export type Camera2DMeta = { zoom: number; follow: string }
export type Camera3DMeta = {
  mode: 'orbit' | 'first' | 'third' | 'top'
  follow: string
  fov: number
  dist: number
  height: number
}

export type SceneMeta = {
  name: string
  mode: '2d' | '3d'
  bg: string
  bgTop: string
  bgBottom: string
  useGradient: boolean
  gravity2d: number
  gravity3d: number
  camera2d: Camera2DMeta
  camera3d: Camera3DMeta
}

export function defaultMeta(): SceneMeta {
  return {
    name: 'Untitled Scene',
    mode: '2d',
    bg: '#1a2130',
    bgTop: '#0b1026',
    bgBottom: '#223a5e',
    useGradient: true,
    gravity2d: 1700,
    gravity3d: 22,
    camera2d: { zoom: 1, follow: '' },
    camera3d: { mode: 'third', follow: 'Player', fov: 60, dist: 9, height: 3.2 }
  }
}

export class Scene {
  meta: SceneMeta = defaultMeta()
  entities: Entity[] = []

  createEntity(
    name: string,
    comps: Component[] = [],
    opts: { tags?: string[]; pos?: Vec3; rot?: Vec3; scale?: Vec3; visible?: boolean } = {}
  ): Entity {
    const e: Entity = {
      id: uid(),
      name,
      visible: opts.visible !== false,
      tags: opts.tags ? [...opts.tags] : [],
      transform: makeTransform(),
      comps: comps.map(c => ({ ...c }))
    }
    if (opts.pos) e.transform.pos = { ...opts.pos }
    if (opts.rot) e.transform.rot = { ...opts.rot }
    if (opts.scale) e.transform.scale = { ...opts.scale }
    this.entities.push(e)
    return e
  }

  remove(id: string) {
    this.entities = this.entities.filter(e => e.id !== id)
  }

  byName(name: string): Entity | null {
    for (const e of this.entities) if (e.name === name) return e
    return null
  }

  byTag(tag: string): Entity[] {
    return this.entities.filter(e => e.tags.includes(tag))
  }

  cloneEntity(e: Entity): Entity {
    const copy: Entity = JSON.parse(JSON.stringify(e))
    copy.id = uid()
    copy.name = e.name + ' copy'
    const i = this.entities.indexOf(e)
    this.entities.splice(i + 1, 0, copy)
    return copy
  }
}

/* ---------- Serialization ---------- */

export function serializeScene(s: Scene): string {
  return JSON.stringify({ v: 1, nova: true, meta: s.meta, entities: s.entities }, null, 2)
}

export function deserializeScene(text: string): Scene {
  const raw = JSON.parse(text)
  const s = new Scene()
  if (raw && raw.meta) s.meta = Object.assign(defaultMeta(), raw.meta)
  if (raw && Array.isArray(raw.entities)) {
    s.entities = raw.entities.map((e: any) => ({
      id: e.id || uid(),
      name: e.name || 'Entity',
      visible: e.visible !== false,
      tags: Array.isArray(e.tags) ? e.tags : [],
      transform: {
        pos: e.transform?.pos || v3(),
        rot: e.transform?.rot || v3(),
        scale: e.transform?.scale || v3(1, 1, 1)
      },
      comps: Array.isArray(e.comps) ? e.comps : []
    }))
  }
  return s
}
