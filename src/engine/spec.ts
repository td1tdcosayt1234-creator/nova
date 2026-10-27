/* ============ Nova Engine — SceneSpec (AI builder output format) ============ */

import { Scene, defaultMeta, getComp, uid, type Entity, type Vec3 } from './core'
import { COMP_DEFS } from './components'

export interface EntitySpec {
  name: string
  tags?: string[]
  pos?: number[]
  rot?: number[]
  scale?: number[]
  visible?: boolean
  comps?: Array<Record<string, any> & { type: string }>
}

export interface SceneSpec {
  name?: string
  mode?: '2d' | '3d'
  bg?: string
  bgTop?: string
  bgBottom?: string
  useGradient?: boolean
  gravity2d?: number
  gravity3d?: number
  camera2d?: { zoom?: number; follow?: string }
  camera3d?: { mode?: string; follow?: string; fov?: number; dist?: number; height?: number }
  entities?: EntitySpec[]
}

export function specToEntity(s: EntitySpec): Entity {
  const e: Entity = {
    id: uid(),
    name: s.name || 'Entity',
    visible: s.visible !== false,
    tags: Array.isArray(s.tags) ? s.tags.filter(t => typeof t === 'string') : [],
    transform: {
      pos: toVec(s.pos),
      rot: toVec(s.rot),
      scale: toVec(s.scale, 1)
    },
    comps: []
  }
  for (const c of (Array.isArray(s.comps) ? s.comps : [])) {
    if (!c || typeof c.type !== 'string') continue
    const def = COMP_DEFS[c.type]
    const comp = def ? Object.assign(def.defaults(), c) : { ...c }
    e.comps.push(comp)
  }
  return e
}

function toVec(a: number[] | undefined, def = 0): Vec3 {
  const v = Array.isArray(a) ? a : []
  return { x: num(v[0], def), y: num(v[1], def), z: num(v[2], def) }
}
function num(x: any, def: number): number {
  const n = Number(x)
  return Number.isFinite(n) ? n : def
}

export function applySceneSpec(spec: SceneSpec): Scene {
  const s = new Scene()
  const m = Object.assign(defaultMeta(), {})
  if (spec.name) m.name = String(spec.name).slice(0, 60)
  if (spec.mode === '3d' || spec.mode === '2d') m.mode = spec.mode
  if (typeof spec.bg === 'string') m.bg = spec.bg
  if (typeof spec.bgTop === 'string') m.bgTop = spec.bgTop
  if (typeof spec.bgBottom === 'string') m.bgBottom = spec.bgBottom
  if (typeof spec.useGradient === 'boolean') m.useGradient = spec.useGradient
  if (Number.isFinite(spec.gravity2d)) m.gravity2d = Number(spec.gravity2d)
  if (Number.isFinite(spec.gravity3d)) m.gravity3d = Number(spec.gravity3d)
  if (spec.camera2d && typeof spec.camera2d === 'object') {
    if (Number.isFinite(spec.camera2d.zoom)) m.camera2d.zoom = clampN(spec.camera2d.zoom, 0.1, 6)
    if (typeof spec.camera2d.follow === 'string') m.camera2d.follow = spec.camera2d.follow
  }
  if (spec.camera3d && typeof spec.camera3d === 'object') {
    const c = spec.camera3d
    if (c.mode === 'first' || c.mode === 'third' || c.mode === 'top' || c.mode === 'orbit') m.camera3d.mode = c.mode
    if (typeof c.follow === 'string') m.camera3d.follow = c.follow
    if (Number.isFinite(c.fov)) m.camera3d.fov = clampN(c.fov, 20, 110)
    if (Number.isFinite(c.dist)) m.camera3d.dist = clampN(c.dist, 2, 60)
    if (Number.isFinite(c.height)) m.camera3d.height = clampN(c.height, 0.5, 30)
  }
  s.meta = m
  s.entities = (spec.entities || []).filter(e => e && typeof e.name === 'string').map(specToEntity)
  return s
}

export function addSpecToScene(scene: Scene, spec: EntitySpec): Entity {
  const e = specToEntity(spec)
  scene.entities.push(e)
  return e
}

export function validateSpec(spec: any): { ok: boolean; issues: string[] } {
  const issues: string[] = []
  if (!spec || typeof spec !== 'object') return { ok: false, issues: ['not an object'] }
  if (!Array.isArray(spec.entities)) issues.push('missing "entities" array')
  else {
    if (!spec.entities.length) issues.push('no entities')
    for (const e of spec.entities) {
      if (!e.name) issues.push('entity missing name')
      for (const c of (e.comps || [])) {
        if (!COMP_DEFS[c.type]) issues.push(`unknown component type "${c.type}"`)
      }
    }
  }
  return { ok: issues.length === 0, issues }
}

function clampN(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)) }

export function countComps(scene: Scene, type: string): number {
  return scene.entities.filter(e => getComp(e, type)).length
}
