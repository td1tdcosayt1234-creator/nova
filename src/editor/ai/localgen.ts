/* ============ Nova Engine — Offline NovaAI: procedural game templates ============ *
 *  Ei generator engine er "built-in AI": prompt/keyword theke full playable
 *  game generate kore (entities + scripts + camera + level layout).
 *  LLM key thakle builder LLM use kore, na thakle eta use hoy.
 */

import { mulberry32 } from '../../engine/core'
import type { EntitySpec, SceneSpec } from '../../engine/spec'

/* ------------------------------------------------------------------ */
/* Shared script snippets (top-level — used directly in comps)        */
/* ------------------------------------------------------------------ */

const S_PLAYER_2D = `// Player controller (2D platformer)
var SP = 240
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.vel.x = -SP
else if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.vel.x = SP
else self.vel.x = 0
if ((engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) && self.onGround) {
  self.vel.y = 660
  self.burst(8)
}
if (self.pos.y < -260) engine.gameOver("You fell!")`

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

const S_ENEMY = `// Enemy: patrol, stompable
if (self.mem.dir === undefined) self.mem.dir = 1
if (self.mem.x0 === undefined) self.mem.x0 = self.pos.x - 110
if (self.mem.x1 === undefined) self.mem.x1 = self.pos.x + 110
if (self.pos.x > self.mem.x1) self.mem.dir = -1
if (self.pos.x < self.mem.x0) self.mem.dir = 1
self.vel.x = 55 * self.mem.dir
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

const S_GOAL = `// Goal flag
self.rot.z += engine.dt * 50
self.onCollide(function (other) {
  if (other.has("player")) engine.win("Level Complete!")
})`

const S_CLOUD = `// Drifting cloud
if (self.mem.s === undefined) self.mem.s = 6 + Math.random() * 12
self.pos.x -= self.mem.s * engine.dt
if (self.pos.x < -780) self.pos.x = 1700`

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

const S_PLAYER_3D = `// Player controller (3D, camera-relative)
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

/* single-line snippets embedded inside other scripts (single-quoted) */
const L_BULLET = "self.mem.t = (self.mem.t || 0) + engine.dt; if (self.pos.y > 340) engine.destroy(self); self.onCollide(function (o) { if (o.has('enemy')) { engine.score += 1; var s = engine.find('Score'); if (s) s.setText('Score: ' + engine.score); o.burst(14); engine.destroy(o); engine.destroy(self) } })"

const L_ENEMY_FLY = "if (self.mem.ph === undefined) self.mem.ph = Math.random() * 6.28; self.pos.x += Math.sin(engine.time * 2 + self.mem.ph) * 40 * engine.dt; self.rot.z += engine.dt * 40; if (self.pos.y < -340) engine.destroy(self); self.onCollide(function (o) { if (o.has('player')) { o.burst(20); engine.gameOver('Ship destroyed!') } })"

const L_PIPE = "if (self.mem.sc === undefined) self.mem.sc = 0; if (self.mem.sc === 0 && self.pos.x < -60) { self.mem.sc = 1; engine.score += 1; var s = engine.find('Score'); if (s) s.setText('Score: ' + engine.score) } if (self.pos.x < -420) engine.destroy(self); self.onCollide(function (o) { if (o.has('player')) { o.burst(20); engine.gameOver('Crashed into a pipe!') } })"

const L_HAZARD = "if (self.pos.x < -640) engine.destroy(self); self.onCollide(function (o) { if (o.has('player')) { o.burst(16); engine.gameOver('Crash!') } })"

const L_BRICK = "self.onCollide(function (o) { if (o.has('ball')) { engine.score += 1; var s = engine.find('Score'); if (s) s.setText('Bricks: ' + engine.score + ' / 45'); self.burst(10); engine.destroy(self); if (engine.score >= 45) engine.win('All bricks cleared!') } })"

const L_BALL = "if (self.pos.y < -340) engine.gameOver('Ball lost!')"

const L_TILES = "self.pos.x -= 300 * engine.dt; if (self.pos.x < -900) self.pos.x += 2700"

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

const PALETTE = ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899', '#06b6d4']

function coin2D(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Coin', tags: ['coin'], pos: [x, y, 3],
    comps: [
      { type: 'sprite2d', sprite: 'coin', w: 26, h: 26, seed, color: '#ffd700', screen: false },
      { type: 'body2d', isStatic: true, sensor: true, gravityScale: 0, w: 22, h: 22 },
      { type: 'script', code: S_COIN }
    ]
  }
}

function platform(x: number, y: number, w: number, color: string, seed: number): EntitySpec {
  return {
    name: 'Platform', tags: ['ground'], pos: [x, y, 1],
    comps: [
      { type: 'sprite2d', sprite: 'none', color, w, h: 18, screen: false },
      { type: 'body2d', isStatic: true, w, h: 18 }
    ]
  }
}

function groundSeg(x: number, w: number, seed: number): EntitySpec {
  return {
    name: 'Ground', tags: ['ground'], pos: [x, -40, 1],
    comps: [
      { type: 'sprite2d', sprite: 'brick', color: '#2e4a33', w, h: 80, seed, screen: false },
      { type: 'body2d', isStatic: true, w, h: 80 }
    ]
  }
}

function enemyPatrol(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Enemy', tags: ['enemy'], pos: [x, y, 3],
    comps: [
      { type: 'sprite2d', sprite: 'enemy', w: 34, h: 34, seed, color: '#ef4444', screen: false },
      { type: 'body2d', gravityScale: 1, w: 30, h: 30 },
      { type: 'script', code: S_ENEMY }
    ]
  }
}

function cloud(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Cloud', pos: [x, y, -5],
    comps: [
      { type: 'sprite2d', sprite: 'cloud', w: 130, h: 52, seed, color: '#e2e8f0', screen: false },
      { type: 'script', code: S_CLOUD }
    ]
  }
}

function hudText(name: string, text: string, size = 20): EntitySpec {
  return { name, pos: [16, 14, 0], comps: [{ type: 'text2d', text, size, color: '#ffffff', screen: true }] }
}

function hint2D(text: string): EntitySpec {
  return { name: 'Hint', pos: [16, 46, 0], comps: [{ type: 'text2d', text, size: 13, color: '#94a3b8', screen: true }] }
}

function gem3D(x: number, z: number, seed: number): EntitySpec {
  return {
    name: 'Gem', tags: ['coin'], pos: [x, 0.8, z],
    comps: [
      { type: 'mesh3d', geo: 'box', color: '#22d3ee', texture: 'gem', wire: false },
      { type: 'rigid3d', isStatic: false, sensor: true, gravityScale: 0, radius: 0.7 },
      { type: 'script', code: S_GEM_3D }
    ]
  }
}

function crate3D(x: number, z: number, seed: number): EntitySpec {
  return {
    name: 'Crate', tags: ['wall'], pos: [x, 0.75, z],
    comps: [
      { type: 'mesh3d', geo: 'box', color: '#b45309', texture: 'crate', wire: false },
      { type: 'rigid3d', isStatic: true, radius: 0.8 }
    ]
  }
}

function tree3D(x: number, z: number): EntitySpec[] {
  return [
    {
      name: 'TreeTrunk', pos: [x, 0.9, z],
      comps: [
        { type: 'mesh3d', geo: 'cylinder', color: '#92603a', texture: 'none', wire: false },
        { type: 'rigid3d', isStatic: true, radius: 0.45 }
      ]
    },
    {
      name: 'TreeTop', pos: [x, 2.4, z],
      comps: [{ type: 'mesh3d', geo: 'cone', color: '#16a34a', texture: 'tree', wire: false }]
    }
  ]
}

const SUN_3D: EntitySpec = {
  name: 'Sunlight', pos: [18, 30, 12],
  comps: [{ type: 'light3d', kind: 'sun', color: '#ffffff', intensity: 1.35, distance: 0 }]
}
const SKY_3D: EntitySpec = {
  name: 'Skylight',
  comps: [{ type: 'light3d', kind: 'hemisphere', color: '#bfd4ff', intensity: 0.65, distance: 0 }]
}

/* ------------------------------------------------------------------ */
/* Templates                                                          */
/* ------------------------------------------------------------------ */

export const TEMPLATES: Record<string, {
  label: string
  icon: string
  mode: '2d' | '3d'
  hint: string
  build: (seed: number) => SceneSpec
}> = {
  platformer: {
    label: 'Platformer', icon: '🏃', mode: '2d',
    hint: 'Run & jump platformer with coins, stompable enemies and a goal flag.',
    build(seed) {
      const r = mulberry32(seed)
      const E: EntitySpec[] = []
      const platColor = PALETTE[Math.floor(r() * PALETTE.length)]

      // scrolling ground with gaps
      let cx = -350
      const segEnds: Array<{ x: number; w: number }> = []
      for (let i = 0; i < 5; i++) {
        const w = 480 + Math.floor(r() * 520)
        E.push(groundSeg(cx + w / 2, w, Math.floor(r() * 9999)))
        segEnds.push({ x: cx, w })
        cx += w / 2 + 70 + Math.floor(r() * 80)
        cx += w / 2
      }
      void segEnds

      // floating platforms
      for (let i = 0; i < 6; i++) {
        const w = 110 + Math.floor(r() * 120)
        const x = -250 + r() * (cx + 200)
        const y = 60 + Math.floor(r() * 50)
        E.push(platform(x, y, w, platColor, Math.floor(r() * 9999)))
        E.push(coin2D(x, y + 42, Math.floor(r() * 9999)))
      }

      // coins on ground level
      for (let i = 0; i < 7; i++) {
        E.push(coin2D(-260 + r() * (cx + 100), 36 + r() * 70, Math.floor(r() * 9999)))
      }

      // enemies
      for (let i = 0; i < 3; i++) {
        E.push(enemyPatrol(-180 + r() * (cx - 60), 30, Math.floor(r() * 9999)))
      }

      // goal
      E.push({
        name: 'Goal', tags: ['goal'], pos: [cx - 90, 40, 2],
        comps: [
          { type: 'sprite2d', sprite: 'star', color: '#22c55e', w: 46, h: 46, seed: Math.floor(r() * 9999), screen: false },
          { type: 'body2d', isStatic: true, sensor: true, w: 40, h: 46 },
          { type: 'script', code: S_GOAL }
        ]
      })

      // player
      E.push({
        name: 'Player', tags: ['player'], pos: [-320, 60, 4],
        comps: [
          { type: 'sprite2d', sprite: 'player', w: 36, h: 46, seed: Math.floor(r() * 9999), color: '#ef476f', screen: false },
          { type: 'body2d', gravityScale: 1, w: 30, h: 44 },
          { type: 'particles2d', rate: 0, life: 0.5, speed: 100, spread: 180, size: 5, color: '#fbbf24' },
          { type: 'script', code: S_PLAYER_2D }
        ]
      })

      for (let i = 0; i < 5; i++) E.push(cloud(-500 + r() * 2200, 160 + r() * 150, Math.floor(r() * 9999)))

      E.push(hudText('Score', 'Score: 0'))
      E.push(hint2D('A/D or ←/→ to move · Space/W to jump'))

      return {
        name: 'Nova Platformer', mode: '2d',
        useGradient: true, bgTop: '#101a3a', bgBottom: '#3b5f8a',
        gravity2d: 1700,
        camera2d: { zoom: 1, follow: 'Player' },
        entities: E
      }
    }
  },

  shooter: {
    label: 'Space Shooter', icon: '🚀', mode: '2d',
    hint: 'Arrow keys to fly, Space to shoot waves of enemies.',
    build(seed) {
      const r = mulberry32(seed)
      const E: EntitySpec[] = []

      for (let i = 0; i < 46; i++) {
        E.push({
          name: 'Star', pos: [-460 + r() * 920, -310 + r() * 650, -8],
          comps: [{ type: 'sprite2d', sprite: 'none', color: ['#ffffff', '#cbd5e1', '#94a3b8', '#e2e8f0'][Math.floor(r() * 4)], w: 2 + r() * 2, h: 2 + r() * 2, screen: false }]
        })
      }

      E.push({
        name: 'Player', tags: ['player'], pos: [0, -220, 5],
        comps: [
          { type: 'sprite2d', sprite: 'ship', w: 48, h: 48, seed: Math.floor(r() * 9999), color: '#22d3ee', screen: false },
          { type: 'body2d', gravityScale: 0, w: 40, h: 40 },
          { type: 'particles2d', rate: 0, life: 0.35, speed: 120, spread: 180, size: 4, color: '#22d3ee' },
          { type: 'script', code: `// Ship controller: fly + fire
var S = 330
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.vel.x = -S
else if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.vel.x = S
else self.vel.x = 0
if (engine.input.down("KeyW") || engine.input.down("ArrowUp")) self.vel.y = S
else if (engine.input.down("KeyS") || engine.input.down("ArrowDown")) self.vel.y = -S
else self.vel.y = 0
self.pos.x = Math.max(-420, Math.min(420, self.pos.x))
self.pos.y = Math.max(-280, Math.min(310, self.pos.y))
self.mem.cool = (self.mem.cool || 0) - engine.dt
if (engine.input.down("Space") && self.mem.cool <= 0) {
  self.mem.cool = 0.16
  engine.spawn({
    name: "Bullet", tags: ["bullet"],
    pos: [self.pos.x, self.pos.y + 28, 5],
    comps: [
      { type: "sprite2d", sprite: "none", color: "#22d3ee", w: 7, h: 20, screen: false },
      { type: "body2d", gravityScale: 0, vy: 560, w: 7, h: 20 },
      { type: "script", code: "${L_BULLET}" }
    ]
  })
  self.burst(3)
}` }
        ]
      })

      E.push({
        name: 'Spawner',
        comps: [{ type: 'script', code: `// Enemy spawner
if (self.mem.init === undefined) {
  self.mem.init = 1
  self.mem.t = 0.4
  self.mem.wave = 0
  for (var i = 0; i < 5; i++) spawnEnemy(-350 + i * 160, 290)
}
self.mem.t -= engine.dt
if (self.mem.t <= 0) {
  self.mem.wave = (self.mem.wave || 0) + 1
  self.mem.t = Math.max(0.8, 2.2 - self.mem.wave * 0.1)
  for (var j = 0; j < Math.min(1 + Math.floor(self.mem.wave / 3), 4); j++) spawnEnemy(engine.random(-380, 380), engine.random(240, 310))
}
function spawnEnemy(x, y) {
  engine.spawn({
    name: "Enemy", tags: ["enemy"],
    pos: [x, y, 3],
    comps: [
      { type: "sprite2d", sprite: "enemy", w: 42, h: 42, seed: Math.floor(Math.random() * 9999), color: "#ef4444", screen: false },
      { type: "body2d", gravityScale: 0, vy: -55, w: 38, h: 38 },
      { type: "script", code: "${L_ENEMY_FLY}" }
    ]
  })
}` }]
      })

      E.push(hudText('Score', 'Score: 0'))
      E.push(hint2D('Arrows/WASD to fly · Space to fire'))

      return {
        name: 'Nova Shooter', mode: '2d',
        useGradient: true, bgTop: '#05060f', bgBottom: '#141a33',
        gravity2d: 0,
        camera2d: { zoom: 1, follow: '' },
        entities: E
      }
    }
  },

  flappy: {
    label: 'Flappy Bird', icon: '🐦', mode: '2d',
    hint: 'Space to flap through the gaps.',
    build(seed) {
      const r = mulberry32(seed)
      const E: EntitySpec[] = []

      E.push({
        name: 'Bird', tags: ['player'], pos: [-60, 40, 5],
        comps: [
          { type: 'sprite2d', sprite: 'orb', w: 34, h: 32, seed: Math.floor(r() * 9999), color: '#fbbf24', screen: false },
          { type: 'body2d', gravityScale: 1, w: 28, h: 26 },
          { type: 'script', code: `// Bird: flap
if (engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) self.vel.y = 430
self.rot.z = Math.max(-40, Math.min(70, self.vel.y * 0.09))
if (self.pos.y < -300 || self.pos.y > 340) engine.gameOver("Crashed!")` },
          { type: 'particles2d', rate: 0, life: 0.3, speed: 60, spread: 180, size: 4, color: '#fbbf24' }
        ]
      })

      E.push({
        name: 'PipeSpawner',
        comps: [{ type: 'script', code: `// Pipe spawner
if (self.mem.init === undefined) { self.mem.init = 1; self.mem.t = 0.6 }
self.mem.t -= engine.dt
if (self.mem.t <= 0) {
  self.mem.t = 1.55
  var gapY = engine.random(10, 210)
  engine.spawn({
    name: "PipeBottom", tags: ["pipe"],
    pos: [560, gapY - 190, 3],
    comps: [
      { type: "sprite2d", sprite: "none", color: "#22c55e", w: 70, h: 260, screen: false },
      { type: "body2d", gravityScale: 0, vx: -170, w: 70, h: 260 },
      { type: "script", code: "${L_PIPE}" }
    ]
  })
  engine.spawn({
    name: "PipeTop", tags: ["pipe"],
    pos: [560, gapY + 190, 3],
    comps: [
      { type: "sprite2d", sprite: "none", color: "#16a34a", w: 70, h: 260, screen: false },
      { type: "body2d", gravityScale: 0, vx: -170, w: 70, h: 260 },
      { type: "script", code: "${L_PIPE}" }
    ]
  })
}` }]
      })

      E.push({
        name: 'Ground', tags: ['ground'], pos: [0, -330, 1],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: '#166534', w: 1200, h: 60, screen: false },
          { type: 'body2d', isStatic: true, sensor: true, w: 1200, h: 60 }
        ]
      })

      for (let i = 0; i < 4; i++) E.push(cloud(-300 + r() * 1400, 220 + r() * 120, Math.floor(r() * 9999)))

      E.push(hudText('Score', 'Score: 0'))
      E.push(hint2D('Space to flap'))

      return {
        name: 'Nova Flappy', mode: '2d',
        useGradient: true, bgTop: '#0c4a6e', bgBottom: '#7dd3fc',
        gravity2d: 1400,
        camera2d: { zoom: 1, follow: '' },
        entities: E
      }
    }
  },

  breakout: {
    label: 'Brick Breaker', icon: '🧱', mode: '2d',
    hint: 'Move the paddle (mouse or A/D), smash all 45 bricks.',
    build(seed) {
      const r = mulberry32(seed)
      const E: EntitySpec[] = []
      const rowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6']

      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 9; col++) {
          E.push({
            name: 'Brick', tags: ['brick'],
            pos: [-262 + col * 66, 260 - row * 32, 2],
            comps: [
              { type: 'sprite2d', sprite: 'none', color: rowColors[row], w: 60, h: 22, screen: false },
              { type: 'body2d', isStatic: true, w: 60, h: 22 },
              { type: 'script', code: L_BRICK }
            ]
          })
        }
      }

      E.push({
        name: 'Paddle', tags: ['paddle'], pos: [0, -290, 3],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: '#e2e8f0', w: 120, h: 18, screen: false },
          { type: 'body2d', isStatic: true, w: 120, h: 18 },
          { type: 'script', code: `// Paddle: mouse or keys
var mx = engine.input.mouse.wx
if (engine.input.mouse.inside && mx !== undefined) self.pos.x = Math.max(-268, Math.min(268, mx))
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.pos.x -= 430 * engine.dt
if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.pos.x += 430 * engine.dt` }
        ]
      })

      E.push({
        name: 'Ball', tags: ['ball'], pos: [0, -240, 4],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: '#f8fafc', w: 16, h: 16, screen: false },
          { type: 'body2d', gravityScale: 0, bounce: 1, vx: 130 + r() * 60, vy: 330, w: 16, h: 16 },
          { type: 'script', code: L_BALL }
        ]
      })

      // walls
      const wall = (name: string, x: number, y: number, w: number, h: number) => E.push({
        name, tags: ['wall'], pos: [x, y, 1],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: '#334155', w, h, screen: false },
          { type: 'body2d', isStatic: true, w, h }
        ]
      })
      wall('WallL', -336, 0, 22, 700)
      wall('WallR', 336, 0, 22, 700)
      wall('WallT', 0, 336, 700, 22)

      E.push(hudText('Score', 'Bricks: 0 / 45'))
      E.push(hint2D('Move mouse or A/D'))

      return {
        name: 'Nova Breakout', mode: '2d',
        useGradient: false, bg: '#0f172a',
        gravity2d: 0,
        camera2d: { zoom: 1, follow: '' },
        entities: E
      }
    }
  },

  runner: {
    label: 'Endless Runner', icon: '🦖', mode: '2d',
    hint: 'Auto-runner: Space to jump over obstacles.',
    build(seed) {
      const r = mulberry32(seed)
      const E: EntitySpec[] = []

      for (let i = 0; i < 3; i++) {
        E.push({
          name: 'Ground' + i, tags: ['ground'], pos: [-450 + i * 900, -30, 1],
          comps: [
            { type: 'sprite2d', sprite: 'brick', color: '#334155', w: 900, h: 60, seed: Math.floor(r() * 9999), screen: false },
            { type: 'body2d', isStatic: true, w: 900, h: 60 },
            { type: 'script', code: L_TILES }
          ]
        })
      }

      E.push({
        name: 'Player', tags: ['player'], pos: [-80, 40, 4],
        comps: [
          { type: 'sprite2d', sprite: 'player', w: 38, h: 46, seed: Math.floor(r() * 9999), color: '#ef476f', screen: false },
          { type: 'body2d', gravityScale: 1, w: 30, h: 44 },
          { type: 'script', code: `// Runner: jump only
if ((engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) && self.onGround) {
  self.vel.y = 680
  self.burst(6)
}
if (self.pos.y < -260) engine.gameOver("Fell off!")` }
        ]
      })

      E.push({
        name: 'Spawner',
        comps: [{ type: 'script', code: `// Obstacle spawner + distance score
if (self.mem.init === undefined) { self.mem.init = 1; self.mem.t = 1.2 }
self.mem.t -= engine.dt
var s = engine.find("Score")
if (s) { engine.score = Math.floor(engine.time * 10); s.setText("Distance: " + Math.floor(engine.time * 10) + "m") }
if (self.mem.t <= 0) {
  self.mem.t = 0.9 + Math.random() * 0.8
  var tall = Math.random() < 0.3
  engine.spawn({
    name: "Obstacle", tags: ["hazard"],
    pos: [560, tall ? 30 : 18, 3],
    comps: [
      { type: "sprite2d", sprite: "crate", w: tall ? 34 : 42, h: tall ? 78 : 40, seed: Math.floor(Math.random() * 9999), color: "#b45309", screen: false },
      { type: "body2d", isStatic: true, sensor: true, w: tall ? 34 : 42, h: tall ? 78 : 40 },
      { type: "script", code: "${L_HAZARD}" }
    ]
  })
  if (Math.random() < 0.5) spawnCoin()
}
function spawnCoin() {
  engine.spawn({
    name: "Coin", tags: ["coin"],
    pos: [560, engine.random(50, 130), 3],
    comps: [
      { type: "sprite2d", sprite: "coin", w: 26, h: 26, seed: Math.floor(Math.random() * 9999), color: "#ffd700", screen: false },
      { type: "body2d", isStatic: true, sensor: true, gravityScale: 0, w: 22, h: 22 },
      { type: "script", code: "${S_COIN}" }
    ]
  })
}` }]
      })

      for (let i = 0; i < 4; i++) E.push(cloud(-400 + r() * 1800, 180 + r() * 140, Math.floor(r() * 9999)))

      E.push(hudText('Score', 'Distance: 0m'))
      E.push(hint2D('Space to jump'))

      return {
        name: 'Nova Runner', mode: '2d',
        useGradient: true, bgTop: '#1e1b4b', bgBottom: '#7c3aed',
        gravity2d: 1800,
        camera2d: { zoom: 1, follow: 'Player' },
        entities: E
      }
    }
  },

  explorer3d: {
    label: '3D Gem Explorer', icon: '💎', mode: '3d',
    hint: 'Third-person 3D: explore, collect 6 gems, avoid crates.',
    build(seed) {
      const r = mulberry32(seed)
      const E: EntitySpec[] = [SUN_3D, SKY_3D]

      E.push({
        name: 'Ground', pos: [0, 0, 0],
        comps: [{ type: 'mesh3d', geo: 'plane', color: '#1f8a4c', texture: 'none', wire: false }]
      })

      E.push({
        name: 'Player', tags: ['player'], pos: [0, 1.1, 0],
        comps: [
          { type: 'mesh3d', geo: 'capsule', color: '#f97316', texture: 'none', wire: false },
          { type: 'rigid3d', gravityScale: 1, radius: 0.7 },
          { type: 'script', code: S_PLAYER_3D }
        ]
      })

      const spots: Array<[number, number]> = []
      while (spots.length < 6) {
        const x = -22 + r() * 44, z = -22 + r() * 44
        if (Math.abs(x) + Math.abs(z) < 6) continue
        if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 7)) continue
        spots.push([x, z])
      }
      for (const [x, z] of spots) E.push(gem3D(Math.round(x), Math.round(z), Math.floor(r() * 9999)))

      for (let i = 0; i < 5; i++) {
        E.push(crate3D(Math.round(-20 + r() * 40), Math.round(-20 + r() * 40), Math.floor(r() * 9999)))
      }
      for (let i = 0; i < 7; i++) {
        const x = Math.round(-26 + r() * 52), z = Math.round(-26 + r() * 52)
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue
        E.push(...tree3D(x, z))
      }

      E.push(hudText('Score', 'Gems: 0'))
      E.push(hint2D('WASD move (camera-relative) · Space jump · Mouse rotates camera'))

      return {
        name: 'Nova Explorer', mode: '3d',
        useGradient: true, bgTop: '#0b1026', bgBottom: '#1b2b4a',
        gravity3d: 24,
        camera3d: { mode: 'third', follow: 'Player', fov: 60, dist: 9, height: 3.6 },
        entities: E
      }
    }
  },

  empty2d: {
    label: 'Empty 2D', icon: '⬜', mode: '2d',
    hint: 'Blank 2D scene with ground, player, camera and score HUD.',
    build() {
      const E: EntitySpec[] = [
        groundSeg(0, 1200, 42),
        {
          name: 'Player', tags: ['player'], pos: [0, 60, 4],
          comps: [
            { type: 'sprite2d', sprite: 'player', w: 36, h: 46, seed: 7, color: '#ef476f', screen: false },
            { type: 'body2d', gravityScale: 1, w: 30, h: 44 },
            { type: 'script', code: S_PLAYER_2D }
          ]
        },
        hudText('Score', 'Score: 0'),
        hint2D('A/D move · Space jump · Select an entity and add Scripts in the Inspector')
      ]
      return {
        name: 'Untitled 2D', mode: '2d', useGradient: true,
        bgTop: '#101a3a', bgBottom: '#3b5f8a', gravity2d: 1700,
        camera2d: { zoom: 1, follow: 'Player' },
        entities: E
      }
    }
  },

  empty3d: {
    label: 'Empty 3D', icon: '🔲', mode: '3d',
    hint: 'Blank 3D scene with ground, player capsule, lights and camera.',
    build() {
      const E: EntitySpec[] = [
        SUN_3D, SKY_3D,
        { name: 'Ground', pos: [0, 0, 0], comps: [{ type: 'mesh3d', geo: 'plane', color: '#334155', texture: 'none', wire: false }] },
        {
          name: 'Player', tags: ['player'], pos: [0, 1.1, 0],
          comps: [
            { type: 'mesh3d', geo: 'capsule', color: '#f97316', texture: 'none', wire: false },
            { type: 'rigid3d', gravityScale: 1, radius: 0.7 },
            { type: 'script', code: S_PLAYER_3D }
          ]
        },
        hudText('Score', 'Score: 0'),
        hint2D('WASD move · Space jump')
      ]
      return {
        name: 'Untitled 3D', mode: '3d', useGradient: true,
        bgTop: '#0b1026', bgBottom: '#1b2b4a', gravity3d: 24,
        camera3d: { mode: 'third', follow: 'Player', fov: 60, dist: 9, height: 3.4 },
        entities: E
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Prompt -> template matching (keyword scorer)                       */
/* ------------------------------------------------------------------ */

export function matchTemplate(prompt: string): string {
  const p = prompt.toLowerCase()
  const scores: Record<string, number> = {
    flappy: (p.match(/flappy|bird|flap|pipe/g) || []).length * 3,
    breakout: (p.match(/breakout|brick|paddle|pong|arkanoid/g) || []).length * 3,
    runner: (p.match(/runner|endless|dino|run\b|scroll/g) || []).length * 3,
    shooter: (p.match(/shoot|space|invader|galaga|bullet|ship|asteroid|enemy wave/g) || []).length * 2,
    explorer3d: (p.match(/3d|fps|first[- ]?person|third[- ]?person|walk|explore|gem|cube|sphere|camera/g) || []).length * 2,
    platformer: (p.match(/platform|mario|jump|side[- ]?scroll|coin|flag/g) || []).length * 2
  }
  let best = 'platformer'
  let bestScore = -1
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = k }
  }
  if (bestScore <= 0) return /\b3d\b|fps/.test(p) ? 'explorer3d' : 'platformer'
  return best
}

export function generateOffline(prompt: string, seed = Math.floor(Math.random() * 1e9)): { spec: SceneSpec; template: string } {
  const key = prompt.trim() ? matchTemplate(prompt) : 'platformer'
  const t = TEMPLATES[key] || TEMPLATES.platformer
  return { spec: t.build(seed), template: key }
}

/* ------------------------------------------------------------------ */
/* Offline assistant commands (no API key needed)                     */
/* ------------------------------------------------------------------ */

const COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  purple: '#a855f7', pink: '#ec4899', orange: '#f97316', cyan: '#06b6d4',
  white: '#ffffff', black: '#111827', gray: '#6b7280', grey: '#6b7280',
  gold: '#d4af37', teal: '#14b8a6', lime: '#84cc16', dark: '#1e293b',
  violet: '#7c5cff', sky: '#0ea5e9'
}

export type AssistantAction = { reply: string; changed: boolean }

export function localAssistant(
  text: string,
  scene: import('../../engine/core').Scene,
  addSpec: (spec: EntitySpec) => void,
  refresh: () => void
): AssistantAction {
  const t = text.toLowerCase().trim()
  const mode = scene.meta.mode

  let m
  if ((m = t.match(/add (\d+) (coin|coins|gem|gems|star|stars)/))) {
    const n = Math.min(50, parseInt(m[1]))
    for (let i = 0; i < n; i++) {
      if (mode === '2d') addSpec(coin2D(-300 + Math.random() * 700, 40 + Math.random() * 180, Math.floor(Math.random() * 9999)))
      else addSpec(gem3D(Math.round(-18 + Math.random() * 36), Math.round(-18 + Math.random() * 36), Math.floor(Math.random() * 9999)))
    }
    refresh()
    return { reply: `Added ${n} ${m[2]}. Play to collect them!`, changed: true }
  }

  if ((m = t.match(/add (\d+) (enemy|enemies|monster|monsters)/))) {
    const n = Math.min(30, parseInt(m[1]))
    if (mode === '2d') {
      for (let i = 0; i < n; i++) addSpec(enemyPatrol(-250 + Math.random() * 500, 30, Math.floor(Math.random() * 9999)))
    } else {
      for (let i = 0; i < n; i++) {
        addSpec({
          name: 'Enemy', tags: ['enemy'], pos: [Math.round(-18 + Math.random() * 36), 0.8, Math.round(-18 + Math.random() * 36)],
          comps: [
            { type: 'mesh3d', geo: 'sphere', color: '#ef4444', texture: 'enemy', wire: false },
            { type: 'rigid3d', isStatic: true, radius: 0.7 }
          ]
        })
      }
    }
    refresh()
    return { reply: `Added ${n} ${m[2]}${mode === '2d' ? ' (they patrol — stomp them!)' : ' as static obstacles'}.`, changed: true }
  }

  if ((m = t.match(/add (\d+) (platform|platforms|wall|walls|crate|crates|box|boxes|tree|trees)/))) {
    const n = Math.min(30, parseInt(m[1]))
    const kind = m[2].replace(/s$/, '')
    for (let i = 0; i < n; i++) {
      if (mode === '2d') {
        if (kind === 'tree') {
          addSpec(cloud(Math.round(-300 + Math.random() * 700), Math.round(120 + Math.random() * 160), Math.floor(Math.random() * 9999)))
        } else {
          const w = 100 + Math.floor(Math.random() * 140)
          addSpec(platform(Math.round(-300 + Math.random() * 700), Math.round(50 + Math.random() * 120), w, PALETTE[Math.floor(Math.random() * PALETTE.length)], Math.floor(Math.random() * 9999)))
        }
      } else {
        if (kind === 'tree') {
          const x = Math.round(-18 + Math.random() * 36)
          const z = Math.round(-18 + Math.random() * 36)
          tree3D(x, z).forEach(sp => addSpec(sp))
        } else {
          addSpec(crate3D(Math.round(-18 + Math.random() * 36), Math.round(-18 + Math.random() * 36), Math.floor(Math.random() * 9999)))
        }
      }
    }
    refresh()
    return { reply: `Added ${n} ${kind}${n > 1 ? 's' : ''}.`, changed: true }
  }

  if ((m = t.match(/(?:make |set )?(?:the )?(?:background|bg|sky) (?:to |as )?(color )?(\w+)/))) {
    const hex = COLORS[m[2]]
    if (hex) {
      scene.meta.bg = hex
      scene.meta.bgTop = hex
      scene.meta.bgBottom = hex
      scene.meta.useGradient = false
      refresh()
      return { reply: `Background set to ${m[2]} (${hex}).`, changed: true }
    }
  }

  if ((m = t.match(/make (?:the )?(?:entity )?["']?([\w ]+)["']? (?:color )?(\w+)/)) && COLORS[m[2]] && !/background|bg|sky/.test(t)) {
    const name = m[1].trim()
    const e = scene.byName(name) || scene.byName(name.replace(/\b\w/g, c => c.toUpperCase()))
    if (e) {
      const hex = COLORS[m[2]]
      const spr = e.comps.find(c => c.type === 'sprite2d')
      const mesh = e.comps.find(c => c.type === 'mesh3d')
      if (spr) spr.color = hex
      if (mesh) mesh.color = hex
      refresh()
      return { reply: `"${e.name}" is now ${m[2]}.`, changed: true }
    }
    return { reply: `No entity named "${name}" found. Try: add 5 coins`, changed: false }
  }

  if ((m = t.match(/gravity (?:to |as )?(\d+)/))) {
    const n = parseInt(m[1])
    if (mode === '2d') scene.meta.gravity2d = n
    else scene.meta.gravity3d = Math.max(1, Math.min(60, n))
    refresh()
    return { reply: `Gravity set to ${n}.`, changed: true }
  }

  if ((m = t.match(/zoom (?:to )?([\d.]+)/))) {
    scene.meta.camera2d.zoom = Math.max(0.2, Math.min(4, parseFloat(m[1])))
    refresh()
    return { reply: `Camera zoom set to ${scene.meta.camera2d.zoom}.`, changed: true }
  }

  if ((m = t.match(/clear (coins|gems|enemies|everything|all)/))) {
    const what = m[1]
    if (what === 'everything' || what === 'all') {
      scene.entities = scene.entities.filter(e => e.tags.includes('player'))
    } else if (what === 'coins' || what === 'gems') {
      scene.entities = scene.entities.filter(e => !e.tags.includes('coin'))
    } else {
      scene.entities = scene.entities.filter(e => !e.tags.includes('enemy'))
    }
    refresh()
    return { reply: `Cleared ${what}.`, changed: true }
  }

  return {
    reply: [
      'I am NovaAI (offline mode — connect an LLM in AI Settings for full power). Commands I understand:',
      '',
      '  • add 10 coins / gems · add 3 enemies',
      '  • add 5 platforms / crates / trees',
      '  • make background red · make Player green',
      '  • gravity 800 · zoom 1.5',
      '  • clear coins / clear enemies / clear all',
      '',
      'Tip: use the AI Builder tab (⌁) to generate a full game from a description!'
    ].join('\n'),
    changed: false
  }
}
