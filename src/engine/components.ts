/* ============ Nova Engine — Component catalog (drives the Inspector) ============ */

import type { Component } from './core'

export interface FieldDef {
  key: string
  label: string
  type: 'number' | 'text' | 'color' | 'select' | 'code' | 'check'
  options?: string[]
  step?: number
}

export interface CompDef {
  label: string
  icon: string
  fields: FieldDef[]
  defaults: () => Component
}

export const SPRITE_CATEGORIES = [
  'none', 'player', 'coin', 'gem', 'enemy', 'ship', 'ufo',
  'alien', 'crate', 'orb', 'cloud', 'tree', 'star', 'brick'
]

export const MESH_GEOS = [
  'box', 'sphere', 'capsule', 'cylinder', 'cone', 'torus', 'torusKnot', 'plane'
]

export const LIGHT_KINDS = ['sun', 'ambient', 'hemisphere', 'point']

export const COMP_DEFS: Record<string, CompDef> = {
  sprite2d: {
    label: 'Sprite 2D',
    icon: '🖼️',
    defaults: () => ({ type: 'sprite2d', sprite: 'none', color: '#7c5cff', w: 60, h: 60, seed: 7, screen: false }),
    fields: [
      { key: 'sprite', label: 'Pixel Art', type: 'select', options: SPRITE_CATEGORIES },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'w', label: 'Width', type: 'number', step: 1 },
      { key: 'h', label: 'Height', type: 'number', step: 1 },
      { key: 'seed', label: 'Art Seed', type: 'number', step: 1 },
      { key: 'screen', label: 'Screen Space', type: 'check' }
    ]
  },
  text2d: {
    label: 'Text (HUD)',
    icon: '🔤',
    defaults: () => ({ type: 'text2d', text: 'Hello Nova', size: 22, color: '#ffffff', screen: true }),
    fields: [
      { key: 'text', label: 'Text', type: 'text' },
      { key: 'size', label: 'Size', type: 'number', step: 1 },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'screen', label: 'Screen Space', type: 'check' }
    ]
  },
  particles2d: {
    label: 'Particles',
    icon: '✨',
    defaults: () => ({ type: 'particles2d', rate: 0, life: 0.6, speed: 90, spread: 180, size: 5, color: '#fbbf24' }),
    fields: [
      { key: 'rate', label: 'Rate /sec', type: 'number', step: 1 },
      { key: 'life', label: 'Life', type: 'number', step: 0.1 },
      { key: 'speed', label: 'Speed', type: 'number', step: 10 },
      { key: 'spread', label: 'Spread°', type: 'number', step: 10 },
      { key: 'size', label: 'Size', type: 'number', step: 1 },
      { key: 'color', label: 'Color', type: 'color' }
    ]
  },
  body2d: {
    label: 'Physics 2D',
    icon: '🧱',
    defaults: () => ({ type: 'body2d', vx: 0, vy: 0, gravityScale: 1, isStatic: false, sensor: false, bounce: 0, w: 60, h: 60, onGround: false }),
    fields: [
      { key: 'vx', label: 'Velocity X', type: 'number', step: 10 },
      { key: 'vy', label: 'Velocity Y', type: 'number', step: 10 },
      { key: 'gravityScale', label: 'Gravity ×', type: 'number', step: 0.1 },
      { key: 'isStatic', label: 'Static', type: 'check' },
      { key: 'sensor', label: 'Trigger Only', type: 'check' },
      { key: 'bounce', label: 'Bounce', type: 'number', step: 0.1 },
      { key: 'w', label: 'Collider W', type: 'number', step: 1 },
      { key: 'h', label: 'Collider H', type: 'number', step: 1 }
    ]
  },
  mesh3d: {
    label: 'Mesh 3D',
    icon: '🧊',
    defaults: () => ({ type: 'mesh3d', geo: 'box', color: '#7c5cff', texture: 'none', wire: false }),
    fields: [
      { key: 'geo', label: 'Geometry', type: 'select', options: MESH_GEOS },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'texture', label: 'Pixel Skin', type: 'select', options: SPRITE_CATEGORIES },
      { key: 'wire', label: 'Wireframe', type: 'check' }
    ]
  },
  rigid3d: {
    label: 'Physics 3D',
    icon: '🪐',
    defaults: () => ({ type: 'rigid3d', vx: 0, vy: 0, vz: 0, isStatic: false, sensor: false, bounce: 0, gravityScale: 1, radius: 0, onGround: false }),
    fields: [
      { key: 'vx', label: 'Velocity X', type: 'number', step: 1 },
      { key: 'vy', label: 'Velocity Y', type: 'number', step: 1 },
      { key: 'vz', label: 'Velocity Z', type: 'number', step: 1 },
      { key: 'isStatic', label: 'Static', type: 'check' },
      { key: 'sensor', label: 'Trigger Only', type: 'check' },
      { key: 'bounce', label: 'Bounce', type: 'number', step: 0.1 },
      { key: 'gravityScale', label: 'Gravity ×', type: 'number', step: 0.1 },
      { key: 'radius', label: 'Radius', type: 'number', step: 0.1 }
    ]
  },
  light3d: {
    label: 'Light 3D',
    icon: '💡',
    defaults: () => ({ type: 'light3d', kind: 'sun', color: '#ffffff', intensity: 1.5, distance: 0 }),
    fields: [
      { key: 'kind', label: 'Kind', type: 'select', options: LIGHT_KINDS },
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'intensity', label: 'Intensity', type: 'number', step: 0.1 },
      { key: 'distance', label: 'Range', type: 'number', step: 1 }
    ]
  },
  script: {
    label: 'Script',
    icon: '📜',
    defaults: () => ({
      type: 'script',
      code: '// Runs every frame.\n// self   = this entity (pos, vel, color, mem...)\n// engine = world API (input, find, spawn...)\n// Try: self.pos.x += engine.dt * 40'
    }),
    fields: [{ key: 'code', label: 'Code', type: 'code' }]
  }
}

export function compLabel(type: string): string {
  return COMP_DEFS[type]?.label || type
}
export function compIcon(type: string): string {
  return COMP_DEFS[type]?.icon || '❓'
}
export function compDefaults(type: string): Component | null {
  const d = COMP_DEFS[type]
  return d ? d.defaults() : null
}
