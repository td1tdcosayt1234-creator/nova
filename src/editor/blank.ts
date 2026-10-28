/* ============ Nova Engine — blank scenes & scene building blocks ============
   These are plain, honest starting scenes — every entity here is real and
   drivable. (The old canned "fake template" synth was removed.) */

import type { EntitySpec, SceneSpec } from '../engine/spec'

/* ---------- embedded script snippets ---------- */

const S_COIN = `// Coin: bob + spin + collect
self.mem.t = (self.mem.t || 0) + engine.dt
if (self.mem.base === undefined) self.mem.base = self.pos.y
self.pos.y = self.mem.base + Math.sin(self.mem.t * 3) * 5
self.rot.z += engine.dt * 90
self.onCollide(function (other) {
  if (!other.has("player")) return
  engine.score += 1
  var s = engine.find("Score")
  if (s) s.setText("Score: " + engine.score)
  self.burst(12)
  engine.destroy(self)
})`

const S_CLOUD = `// Drifting cloud
if (self.mem.s === undefined) self.mem.s = 6 + Math.random() * 12
self.pos.x -= self.mem.s * engine.dt
if (self.pos.x < -820) self.pos.x = 1750`

const S_GEM_3D = `// Gem: spin, bob, proximity pickup
self.rot.y += engine.dt * 120
if (self.mem.base === undefined) self.mem.base = self.pos.y
self.pos.y = self.mem.base + Math.sin(engine.time * 2) * 0.25
var p = engine.find("Player")
if (p) {
  var dx = p.pos.x - self.pos.x
  var dz = p.pos.z - self.pos.z
  if (dx * dx + dz * dz < 1.6) {
    engine.score += 1
    var s = engine.find("Score")
    if (s) s.setText("Gems: " + engine.score)
    engine.destroy(self)
    if (engine.findAll("coin").length <= 1) engine.win("All gems collected!")
  }
}`

/* ---------- building blocks (SceneSpec snippets) ---------- */

export function coin2D(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Coin', tags: ['coin'], pos: [x, y, 3],
    comps: [
      { type: 'sprite2d', sprite: 'coin', w: 26, h: 26, seed, color: '#ffd700', screen: false },
      { type: 'body2d', isStatic: true, sensor: true, gravityScale: 0, w: 22, h: 22 },
      { type: 'script', code: S_COIN }
    ]
  }
}

export function platform(x: number, y: number, w: number, color: string, seed: number): EntitySpec {
  return {
    name: 'Platform', tags: ['ground'], pos: [x, y, 1],
    comps: [
      { type: 'sprite2d', sprite: 'none', color, w, h: 18, seed, screen: false },
      { type: 'body2d', isStatic: true, w, h: 18 }
    ]
  }
}

export function movingPlatform(x: number, y: number, w: number, color: string, seed: number): EntitySpec {
  return {
    name: 'MovingPlatform', tags: ['ground'], pos: [x, y, 1],
    comps: [
      { type: 'sprite2d', sprite: 'none', color, w, h: 18, seed, screen: false },
      { type: 'body2d', isStatic: true, w, h: 18 },
      {
        type: 'script', code: `// Moving platform: ping-pong horizontally (statics follow transform)
if (self.mem.t === undefined) self.mem.t = Math.random() * 6.28
if (self.mem.x0 === undefined) { self.mem.x0 = self.pos.x - 70; self.mem.x1 = self.pos.x + 70 }
self.mem.t += engine.dt * 1.6
var mid = (self.mem.x0 + self.mem.x1) / 2
self.pos.x = mid + Math.sin(self.mem.t) * (self.mem.x1 - mid)`
      }
    ]
  }
}

export function enemyPatrol(x: number, y: number, speed: number, seed: number): EntitySpec {
  return {
    name: 'Enemy', tags: ['enemy'], pos: [x, y, 3],
    comps: [
      { type: 'sprite2d', sprite: 'enemy', w: 34, h: 34, seed, color: '#ef4444', screen: false },
      { type: 'body2d', gravityScale: 1, w: 30, h: 30 },
      {
        type: 'script', code: `// Enemy: patrol, stompable
if (self.mem.dir === undefined) self.mem.dir = 1
if (self.mem.x0 === undefined) self.mem.x0 = self.pos.x - 110
if (self.mem.x1 === undefined) self.mem.x1 = self.pos.x + 110
if (self.pos.x > self.mem.x1) self.mem.dir = -1
if (self.pos.x < self.mem.x0) self.mem.dir = 1
self.vel.x = ${speed} * self.mem.dir
self.onCollide(function (other) {
  if (!other.has("player")) return
  if (other.pos.y > self.pos.y + 12) {
    engine.score += 2
    var s = engine.find("Score")
    if (s) s.setText("Score: " + engine.score)
    self.burst(16)
    engine.destroy(self)
    engine.camera.shake(6, 0.25)
  } else {
    engine.gameOver("Caught by an enemy!")
  }
})`
      }
    ]
  }
}

export function cloud(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Cloud', pos: [x, y, -5],
    comps: [
      { type: 'sprite2d', sprite: 'cloud', w: 130, h: 52, seed, color: '#e2e8f0', screen: false },
      { type: 'script', code: S_CLOUD }
    ]
  }
}

export function hudText(name: string, text: string, size = 20): EntitySpec {
  return { name, pos: [16, 14, 0], comps: [{ type: 'text2d', text, size, color: '#ffffff', screen: true }] }
}

export function hint2D(text: string): EntitySpec {
  return { name: 'Hint', pos: [16, 46, 0], comps: [{ type: 'text2d', text, size: 13, color: '#94a3b8', screen: true }] }
}

export function gem3D(x: number, z: number, seed: number): EntitySpec {
  return {
    name: 'Gem', tags: ['coin'], pos: [x, 0.9, z],
    comps: [
      { type: 'mesh3d', geo: 'box', color: '#22d3ee', texture: 'gem', wire: false },
      { type: 'rigid3d', gravityScale: 0, sensor: true },
      { type: 'script', code: S_GEM_3D }
    ]
  }
}

/** dynamic crate — real physics, it tumbles and stacks */
export function crate3D(x: number, z: number, seed: number): EntitySpec {
  return {
    name: 'Crate', pos: [x, 0.75, z],
    comps: [
      { type: 'mesh3d', geo: 'box', color: '#b45309', texture: 'crate', wire: false },
      { type: 'rigid3d', friction: 0.7 }
    ]
  }
}

/** static wall you can hide behind */
export function wall3D(x: number, z: number): EntitySpec {
  return {
    name: 'Wall', tags: ['wall'], pos: [x, 1.25, z],
    comps: [
      { type: 'mesh3d', geo: 'box', color: '#64748b', texture: 'brick', wire: false },
      { type: 'rigid3d', isStatic: true }
    ]
  }
}

export function crate2D(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Crate', pos: [x, y, 2],
    comps: [
      { type: 'sprite2d', sprite: 'crate', w: 44, h: 44, seed, color: '#b45309', screen: false },
      { type: 'body2d', gravityScale: 1, w: 44, h: 44, friction: 0.25, keepUpright: false, bounce: 0.05 }
    ]
  }
}

export function tree3D(x: number, z: number): EntitySpec[] {
  return [
    {
      name: 'TreeTrunk', pos: [x, 0.9, z],
      comps: [
        { type: 'mesh3d', geo: 'cylinder', color: '#92603a', texture: 'none', wire: false },
        { type: 'rigid3d', isStatic: true }
      ]
    },
    {
      name: 'TreeTop', pos: [x, 2.4, z],
      comps: [{ type: 'mesh3d', geo: 'cone', color: '#16a34a', texture: 'tree', wire: false }]
    }
  ]
}

export function hudGem3D(): EntitySpec {
  return hudText('Score', 'Gems: 0')
}

/* ---------- blank scenes ---------- */

export function blank2D(): SceneSpec {
  return {
    name: 'Untitled 2D', mode: '2d', useGradient: true,
    bgTop: '#101a3a', bgBottom: '#3b5f8a', gravity2d: 1700,
    camera2d: { zoom: 1, follow: 'Player' },
    entities: [
      {
        name: 'Ground', tags: ['ground'], pos: [0, -40, 1],
        comps: [
          { type: 'sprite2d', sprite: 'brick', color: '#8b7355', w: 1200, h: 80, seed: 42, screen: false },
          { type: 'body2d', isStatic: true, w: 1200, h: 80, friction: 0.3 }
        ]
      },
      platform(-260, 60, 220, '#8b5cf6', 11),
      platform(300, 150, 170, '#10b981', 22),
      crate2D(90, 260, 3),
      crate2D(92, 320, 4),
      {
        name: 'Player', tags: ['player'], pos: [0, 60, 4],
        comps: [
          { type: 'sprite2d', sprite: 'player', w: 36, h: 46, seed: 7, color: '#ef476f', screen: false },
          { type: 'body2d', gravityScale: 1, w: 30, h: 44, friction: 0.05 },
          { type: 'particles2d', rate: 0, life: 0.5, speed: 100, spread: 180, size: 5, color: '#fbbf24' },
          {
            type: 'script', code: `// Player controller (2D platformer)
var SP = 240
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.vel.x = -SP
else if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.vel.x = SP
else self.vel.x = 0
if ((engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) && self.onGround) {
  self.vel.y = 660
  self.burst(8)
}
if (self.pos.y < -260) engine.gameOver("You fell!")`
          }
        ]
      },
      hudText('Score', 'Score: 0'),
      hint2D('A/D move · Space jump (with real Box2D physics) · Crates tumble now · Select entities & add Scripts in the Inspector')
    ]
  }
}

export function playerEntity3D(x: number, y: number, color: string): EntitySpec {
  return {
    name: 'Player', tags: ['player'], pos: [x, y, 0],
    comps: [
      { type: 'mesh3d', geo: 'capsule', color, texture: 'none', wire: false },
      { type: 'rigid3d', gravityScale: 1, lockRot: true, friction: 0.05 },
      {
        type: 'script', code: `// Player controller (3D, camera-relative)
var S = 7.5
var yaw = engine.camera.yaw
var fx = Math.sin(yaw), fz = Math.cos(yaw)
var rx = -Math.cos(yaw), rz = Math.sin(yaw)
var f = 0, r = 0
if (engine.input.down("KeyW") || engine.input.down("ArrowUp")) f += 1
if (engine.input.down("KeyS") || engine.input.down("ArrowDown")) f -= 1
if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) r += 1
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) r -= 1
var mx = fx * f + rx * r, mz = fz * f + rz * r
var l = Math.sqrt(mx * mx + mz * mz)
if (l > 0) { mx /= l; mz /= l }
self.vel.x = mx * S
self.vel.z = mz * S
if (engine.input.pressed("Space") && self.onGround) self.vel.y = 9.5
if (self.pos.y < -30) { self.pos.x = 0; self.pos.y = 1.2; self.pos.z = 0; self.vel.y = 0 }`
      }
    ]
  }
}

export function blank3D(): SceneSpec {
  return {
    name: 'Untitled 3D', mode: '3d', useGradient: true,
    bgTop: '#0b1026', bgBottom: '#1b2b4a', gravity3d: 24,
    camera3d: { mode: 'third', follow: 'Player', fov: 60, dist: 9, height: 3.4 },
    entities: [
      { name: 'Sunlight', pos: [18, 30, 12], comps: [{ type: 'light3d', kind: 'sun', color: '#ffffff', intensity: 1.35, distance: 0 }] },
      { name: 'Skylight', comps: [{ type: 'light3d', kind: 'hemisphere', color: '#bfd4ff', intensity: 0.65, distance: 0 }] },
      { name: 'Ground', pos: [0, 0, 0], scale: [50, 1, 50], comps: [{ type: 'mesh3d', geo: 'plane', color: '#334155', texture: 'none', wire: false }] },
      playerEntity3D(0, 1.2, '#f97316'),
      crate3D(3.2, 0, 5),
      crate3D(3.2, 1.2, 6),
      crate3D(3.2, 2.4, 7),
      {
        name: 'Ball', pos: [-3, 1.4, 0],
        comps: [
          { type: 'mesh3d', geo: 'sphere', color: '#60a5fa', texture: 'none', wire: false },
          { type: 'rigid3d', bounce: 0.55, friction: 0.3 }
        ]
      },
      crate3D(1, 6, 8),
      hudGem3D(),
      hint2D('WASD move · Space jump · Rapier 3D physics — push the crates around!')
    ]
  }
}
