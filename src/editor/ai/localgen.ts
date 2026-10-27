/* ============ Nova Engine — NovaAI: procedural game synthesis engine ============ *
 *  No canned templates. Every prompt is parsed into an intent (genre, theme,
 *  difficulty, counts, features) and a unique game is synthesized from
 *  building blocks + seeded variation. Same prompt never makes the same game.
 */

import { mulberry32 } from '../../engine/core'
import type { EntitySpec, SceneSpec } from '../../engine/spec'

/* ------------------------------------------------------------------ */
/* Core script snippets (top-level — used directly in comps)          */
/* ------------------------------------------------------------------ */

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

const S_GOAL = `// Goal flag
self.rot.z += engine.dt * 50
self.onCollide(function (other) {
  if (other.has("player")) engine.win("Level Complete!")
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

/* single-line snippets embedded inside other scripts (single-quoted) */
const L_BULLET = "self.mem.t = (self.mem.t || 0) + engine.dt; if (self.pos.y > 340) engine.destroy(self); self.onCollide(function (o) { if (o.has('enemy')) { engine.score += 1; var s = engine.find('Score'); if (s) s.setText('Score: ' + engine.score); o.burst(14); engine.destroy(o); engine.destroy(self) } })"

const L_ENEMY_FLY = "if (self.mem.ph === undefined) self.mem.ph = Math.random() * 6.28; self.pos.x += Math.sin(engine.time * 2 + self.mem.ph) * 40 * engine.dt; self.rot.z += engine.dt * 40; if (self.pos.y < -340) engine.destroy(self); self.onCollide(function (o) { if (o.has('player')) { o.burst(20); engine.gameOver('Ship destroyed!') } })"

const L_PIPE = "if (self.mem.sc === undefined) self.mem.sc = 0; if (self.mem.sc === 0 && self.pos.x < -60) { self.mem.sc = 1; engine.score += 1; var s = engine.find('Score'); if (s) s.setText('Score: ' + engine.score) } if (self.pos.x < -420) engine.destroy(self); self.onCollide(function (o) { if (o.has('player')) { o.burst(20); engine.gameOver('Crashed into a pipe!') } })"

const L_HAZARD = "if (self.pos.x < -640) engine.destroy(self); self.onCollide(function (o) { if (o.has('player')) { o.burst(16); engine.gameOver('Crash!') } })"

const L_TILES = "self.pos.x -= 300 * engine.dt; if (self.pos.x < -900) self.pos.x += 2700"

/* ------------------------------------------------------------------ */
/* Intent parsing (English + Banglish)                                */
/* ------------------------------------------------------------------ */

export type Genre = 'platformer' | 'shooter' | 'flappy' | 'breakout' | 'runner' | 'explorer3d'
export type ThemeKey = 'space' | 'night' | 'jungle' | 'desert' | 'candy' | 'ocean' | 'neon' | 'classic'

export interface Intent {
  genre: Genre
  theme: ThemeKey
  difficulty: number          // 1..10
  coins: number | null
  enemies: number | null
  gems: number | null
  doubleJump: boolean
  movingPlatforms: boolean
}

export function parseIntent(promptRaw: string, seed: number): Intent {
  const p = promptRaw.toLowerCase()
  const r = mulberry32(seed ^ 0x1234abcd)
  const count = (re: RegExp) => (p.match(re) || []).length

  const scores: Record<Genre, number> = {
    flappy: count(/flappy|bird|flap|pipe/g) * 3,
    breakout: count(/breakout|brick|paddle|pong|arkanoid/g) * 3,
    runner: count(/runner|endless|dino|run\b|scroll/g) * 3,
    shooter: count(/shoot|invader|galaga|bullet|ship|asteroid|alien wave/g) * 2 + (/\bspace\b/.test(p) ? 1 : 0),
    explorer3d: count(/3d|fps|first[- ]?person|third[- ]?person|walk|explore|open world/g) * 3,
    platformer: count(/platform|mario|jump|side[- ]?scroll|flag/g) * 2
  }
  let genre: Genre = 'platformer'
  let best = -1
  for (const k of Object.keys(scores) as Genre[]) {
    if (scores[k] > best) { best = scores[k]; genre = k }
  }
  if (best <= 0) genre = /\b3d\b|fps/.test(p) ? 'explorer3d' : 'platformer'
  // explicit mode words override
  if (/\b3d\b|fps|first person|third person/.test(p)) genre = 'explorer3d'
  else if (/\b2d\b/.test(p) && (genre === 'explorer3d')) genre = 'platformer'

  const themeScores: Array<[ThemeKey, number]> = [
    ['space', count(/space|galaxy|cosmic|planet|rocket/g)],
    ['night', count(/night|raat|dark|midnight|moon/g)],
    ['jungle', count(/jungle|bon|forest|tree|green/g)],
    ['desert', count(/desert|sand|sahara|dune/g)],
    ['candy', count(/candy|misti|sweet|pink|sugar/g)],
    ['ocean', count(/ocean|samudra|sea|water|aqua|fish/g)],
    ['neon', count(/neon|cyber|synth|vapor/g)]
  ]
  themeScores.sort((a, b) => b[1] - a[1])
  let theme: ThemeKey = 'classic'
  if (themeScores[0][1] > 0) theme = themeScores[0][0]
  else if (genre !== 'explorer3d') {
    const pool: ThemeKey[] = ['classic', 'night', 'jungle', 'candy', 'ocean', 'neon', 'desert']
    theme = pool[Math.floor(r() * pool.length)]
  }

  let difficulty = 5
  if (/easy|sohoj|sadha|simple|shohoj/.test(p)) difficulty = 3
  else if (/hard|kothin|insane|extreme|kothin/.test(p)) difficulty = 8
  else if (/very hard|nightmare/.test(p)) difficulty = 9
  else {
    const m = p.match(/difficulty (\d+)|(\d+)\/10/)
    if (m) difficulty = Math.max(1, Math.min(10, parseInt(m[1] || m[2])))
  }

  const num = (re: RegExp): number | null => {
    const m = p.match(re)
    if (!m) return null
    const n = parseInt(m[1])
    return Number.isFinite(n) ? Math.min(60, n) : null
  }

  return {
    genre,
    theme,
    difficulty,
    coins: num(/(\d+) (?:ta )?(coin|coins)/),
    enemies: num(/(\d+) (?:ta )?(enemy|enemies|monster|monsters)/),
    gems: num(/(\d+) (?:ta )?(gem|gems)/),
    doubleJump: /double.?jump|double jump/.test(p),
    movingPlatforms: /moving|cholonto|chalachol/.test(p)
  }
}

/* ------------------------------------------------------------------ */
/* Themes                                                             */
/* ------------------------------------------------------------------ */

interface Theme {
  label: string
  bgTop: string
  bgBottom: string
  useGradient: boolean
  groundColor: string
  groundSprite: string
  platColors: string[]
  playerColor: string
  accent: string
  particleColor: string
  starColors?: string[]
  clouds: boolean
}

const THEMES: Record<ThemeKey, Theme> = {
  space: {
    label: 'Deep Space', bgTop: '#05060f', bgBottom: '#141a33', useGradient: true,
    groundColor: '#1e293b', groundSprite: 'brick',
    platColors: ['#0e7490', '#155e75', '#3b82f6', '#6366f1'],
    playerColor: '#22d3ee', accent: '#22d3ee', particleColor: '#22d3ee',
    starColors: ['#ffffff', '#cbd5e1', '#94a3b8', '#e2e8f0'],
    clouds: false
  },
  night: {
    label: 'Midnight', bgTop: '#0a0a23', bgBottom: '#2b2d5e', useGradient: true,
    groundColor: '#312e5e', groundSprite: 'brick',
    platColors: ['#4c1d95', '#6d28d9', '#312e81', '#7c3aed'],
    playerColor: '#a78bfa', accent: '#a78bfa', particleColor: '#fbbf24',
    starColors: ['#e0e7ff', '#a5b4fc', '#818cf8'],
    clouds: true
  },
  jungle: {
    label: 'Jungle', bgTop: '#052e1a', bgBottom: '#3f8a4a', useGradient: true,
    groundColor: '#2e4a33', groundSprite: 'brick',
    platColors: ['#16a34a', '#15803d', '#a16207', '#84cc16'],
    playerColor: '#ef476f', accent: '#34d399', particleColor: '#86efac',
    clouds: true
  },
  desert: {
    label: 'Desert', bgTop: '#c2711d', bgBottom: '#fde68a', useGradient: true,
    groundColor: '#b45309', groundSprite: 'brick',
    platColors: ['#d97706', '#b45309', '#92400e', '#f59e0b'],
    playerColor: '#7c2d12', accent: '#f59e0b', particleColor: '#fcd34d',
    clouds: false
  },
  candy: {
    label: 'Candy World', bgTop: '#f0abfc', bgBottom: '#fecdd3', useGradient: true,
    groundColor: '#ec4899', groundSprite: 'brick',
    platColors: ['#ec4899', '#f472b6', '#a855f7', '#fda4af'],
    playerColor: '#7c3aed', accent: '#f472b6', particleColor: '#fbcfe8',
    clouds: true
  },
  ocean: {
    label: 'Ocean', bgTop: '#0c4a6e', bgBottom: '#7dd3fc', useGradient: true,
    groundColor: '#0e7490', groundSprite: 'brick',
    platColors: ['#0891b2', '#0e7490', '#06b6d4', '#38bdf8'],
    playerColor: '#fbbf24', accent: '#38bdf8', particleColor: '#7dd3fc',
    clouds: true
  },
  neon: {
    label: 'Neon City', bgTop: '#0f0c29', bgBottom: '#302b63', useGradient: true,
    groundColor: '#1e1b4b', groundSprite: 'brick',
    platColors: ['#ec4899', '#8b5cf6', '#06b6d4', '#f59e0b'],
    playerColor: '#f0abfc', accent: '#f0abfc', particleColor: '#f0abfc',
    clouds: false
  },
  classic: {
    label: 'Classic', bgTop: '#101a3a', bgBottom: '#3b5f8a', useGradient: true,
    groundColor: '#2e4a33', groundSprite: 'brick',
    platColors: ['#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#3b82f6'],
    playerColor: '#ef476f', accent: '#7c5cff', particleColor: '#fbbf24',
    clouds: true
  }
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
/* ------------------------------------------------------------------ */

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

function movingPlatform(x: number, y: number, w: number, color: string, seed: number): EntitySpec {
  return {
    name: 'MovingPlatform', tags: ['ground'], pos: [x, y, 1],
    comps: [
      { type: 'sprite2d', sprite: 'none', color, w, h: 18, screen: false },
      { type: 'body2d', isStatic: true, w, h: 18 },
      {
        type: 'script', code: `// Moving platform: ping-pong horizontally
if (self.mem.t === undefined) self.mem.t = Math.random() * 6.28
if (self.mem.x0 === undefined) { self.mem.x0 = self.pos.x - 70; self.mem.x1 = self.pos.x + 70 }
self.mem.t += engine.dt * 1.6
var mid = (self.mem.x0 + self.mem.x1) / 2
self.pos.x = mid + Math.sin(self.mem.t) * (self.mem.x1 - mid)`
      }
    ]
  }
}

function groundSeg(x: number, w: number, theme: Theme, seed: number): EntitySpec {
  return {
    name: 'Ground', tags: ['ground'], pos: [x, -40, 1],
    comps: [
      { type: 'sprite2d', sprite: theme.groundSprite, color: theme.groundColor, w, h: 80, seed, screen: false },
      { type: 'body2d', isStatic: true, w, h: 80 }
    ]
  }
}

function enemyPatrol(x: number, y: number, speed: number, seed: number): EntitySpec {
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

function cloud(x: number, y: number, seed: number): EntitySpec {
  return {
    name: 'Cloud', pos: [x, y, -5],
    comps: [
      { type: 'sprite2d', sprite: 'cloud', w: 130, h: 52, seed, color: '#e2e8f0', screen: false },
      { type: 'script', code: S_CLOUD }
    ]
  }
}

function star(x: number, y: number, color: string, size: number): EntitySpec {
  return {
    name: 'Star', pos: [x, y, -8],
    comps: [{ type: 'sprite2d', sprite: 'none', color, w: size, h: size, screen: false }]
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

function playerEntity2D(intent: Intent, theme: Theme, x: number, y: number, seed: number): EntitySpec {
  const jumpCode = intent.doubleJump
    ? `var pressed = engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")
if (self.onGround) self.mem.jumps = 0
if (pressed && (self.onGround || (self.mem.jumps || 0) < 1)) {
  self.mem.jumps = (self.mem.jumps || 0) + 1
  self.vel.y = 660
  self.burst(8)
}`
    : `if ((engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) && self.onGround) {
  self.vel.y = 660
  self.burst(8)
}`
  return {
    name: 'Player', tags: ['player'], pos: [x, y, 4],
    comps: [
      { type: 'sprite2d', sprite: 'player', w: 36, h: 46, seed, color: theme.playerColor, screen: false },
      { type: 'body2d', gravityScale: 1, w: 30, h: 44 },
      { type: 'particles2d', rate: 0, life: 0.5, speed: 100, spread: 180, size: 5, color: theme.particleColor },
      {
        type: 'script', code: `// Player controller (2D platformer)
var SP = 240
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.vel.x = -SP
else if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.vel.x = SP
else self.vel.x = 0
${jumpCode}
if (self.pos.y < -260) engine.gameOver("You fell!")`
      }
    ]
  }
}

function playerEntity3D(x: number, y: number, color: string): EntitySpec {
  return {
    name: 'Player', tags: ['player'], pos: [x, y, 0],
    comps: [
      { type: 'mesh3d', geo: 'capsule', color, texture: 'none', wire: false },
      { type: 'rigid3d', gravityScale: 1, radius: 0.7 },
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

/* ------------------------------------------------------------------ */
/* Genre synthesizers — procedural, intent-driven, seed-varied        */
/* ------------------------------------------------------------------ */

function synthesize(intent: Intent, seed: number): SceneSpec {
  const th = THEMES[intent.theme]
  const r = mulberry32(seed)
  const R = (a: number, b: number) => a + r() * (b - a)
  const RI = (a: number, b: number) => Math.floor(R(a, b + 1))
  const diff = intent.difficulty

  switch (intent.genre) {
    case 'platformer': {
      const E: EntitySpec[] = []
      const segs = 4 + Math.floor(diff / 2) + RI(0, 2)
      const gapMin = diff <= 4 ? 60 : diff <= 7 ? 75 : 100
      const gapMax = diff <= 4 ? 110 : diff <= 7 ? 150 : 175
      const enemySpeed = 40 + diff * 7

      let cx = -350
      let lastEnd = -350
      for (let i = 0; i < segs; i++) {
        const w = R(430, 950)
        E.push(groundSeg(cx + w / 2, w, th, RI(1, 9999)))
        lastEnd = cx + w / 2 + w / 2
        cx += w + R(gapMin, gapMax)
      }

      // platforms + coins
      const platCount = 4 + Math.floor(diff) + RI(0, 2)
      for (let i = 0; i < platCount; i++) {
        const w = R(110, 240)
        const x = R(-260, lastEnd + 100)
        const y = R(60, 115)
        if (intent.movingPlatforms && r() < 0.35) {
          E.push(movingPlatform(x, y, w, th.platColors[RI(0, th.platColors.length - 1)], RI(1, 9999)))
        } else {
          E.push(platform(x, y, w, th.platColors[RI(0, th.platColors.length - 1)], RI(1, 9999)))
        }
        E.push(coin2D(x, y + 42, RI(1, 9999)))
      }

      const coinTotal = intent.coins ?? (7 + RI(0, 7) + Math.floor(diff / 2))
      for (let i = 0; i < coinTotal; i++) {
        E.push(coin2D(R(-300, lastEnd), R(34, 130), RI(1, 9999)))
      }

      const enemyTotal = intent.enemies ?? Math.max(1, Math.floor(diff / 2.5) + RI(1, 3))
      for (let i = 0; i < enemyTotal; i++) {
        E.push(enemyPatrol(R(-250, lastEnd - 60), 30, enemySpeed, RI(1, 9999)))
      }

      E.push({
        name: 'Goal', tags: ['goal'], pos: [lastEnd - 80, 40, 2],
        comps: [
          { type: 'sprite2d', sprite: 'star', color: th.accent, w: 46, h: 46, seed: RI(1, 9999), screen: false },
          { type: 'body2d', isStatic: true, sensor: true, w: 40, h: 46 },
          { type: 'script', code: S_GOAL }
        ]
      })

      E.push(playerEntity2D(intent, th, -320, 60, RI(1, 9999)))

      if (th.clouds) for (let i = 0; i < 5; i++) E.push(cloud(R(-500, lastEnd + 500), R(150, 320), RI(1, 9999)))
      if (th.starColors) for (let i = 0; i < 26; i++) E.push(star(R(-600, lastEnd + 600), R(-100, 380), th.starColors[RI(0, th.starColors.length - 1)], R(2, 4)))

      E.push(hudText('Score', 'Score: 0'))
      E.push(hint2D('A/D move · Space jump · stomp enemies · reach the flag!'))

      return {
        name: `${th.label} Platformer`, mode: '2d',
        useGradient: th.useGradient, bgTop: th.bgTop, bgBottom: th.bgBottom,
        gravity2d: 1700,
        camera2d: { zoom: 1, follow: 'Player' },
        entities: E
      }
    }

    case 'shooter': {
      const E: EntitySpec[] = []
      const stars = th.starColors ? 46 : 20
      const starCols = th.starColors || ['#ffffff', '#cbd5e1', '#94a3b8']
      for (let i = 0; i < stars; i++) E.push(star(R(-460, 460), R(-310, 330), starCols[RI(0, starCols.length - 1)], R(2, 4)))
      const waveGap = Math.max(0.7, 2.3 - diff * 0.16)
      const bulletCool = (0.24 - diff * 0.01).toFixed(2)

      E.push({
        name: 'Player', tags: ['player'], pos: [0, -220, 5],
        comps: [
          { type: 'sprite2d', sprite: 'ship', w: 48, h: 48, seed: RI(1, 9999), color: th.playerColor, screen: false },
          { type: 'body2d', gravityScale: 0, w: 40, h: 40 },
          { type: 'particles2d', rate: 0, life: 0.35, speed: 120, spread: 180, size: 4, color: th.particleColor },
          {
            type: 'script', code: `// Ship controller: fly + fire
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
  self.mem.cool = ${bulletCool}
  engine.spawn({
    name: "Bullet", tags: ["bullet"],
    pos: [self.pos.x, self.pos.y + 28, 5],
    comps: [
      { type: "sprite2d", sprite: "none", color: "${th.accent}", w: 7, h: 20, screen: false },
      { type: "body2d", gravityScale: 0, vy: 560, w: 7, h: 20 },
      { type: "script", code: "${L_BULLET}" }
    ]
  })
  self.burst(3)
}`
          }
        ]
      })

      E.push({
        name: 'Spawner',
        comps: [{
          type: 'script', code: `// Enemy spawner — waves scale up
if (self.mem.init === undefined) {
  self.mem.init = 1
  self.mem.t = 0.4
  self.mem.wave = 0
  for (var i = 0; i < 4; i++) spawnEnemy(-330 + i * 160, 290)
}
self.mem.t -= engine.dt
if (self.mem.t <= 0) {
  self.mem.wave = (self.mem.wave || 0) + 1
  self.mem.t = ${waveGap.toFixed(2)}
  for (var j = 0; j < Math.min(1 + Math.floor(self.mem.wave / 3), 4); j++) spawnEnemy(engine.random(-380, 380), engine.random(240, 310))
}
function spawnEnemy(x, y) {
  engine.spawn({
    name: "Enemy", tags: ["enemy"],
    pos: [x, y, 3],
    comps: [
      { type: "sprite2d", sprite: "enemy", w: 42, h: 42, seed: Math.floor(Math.random() * 9999), color: "#ef4444", screen: false },
      { type: "body2d", gravityScale: 0, vy: ${-(45 + diff * 6)}, w: 38, h: 38 },
      { type: "script", code: "${L_ENEMY_FLY}" }
    ]
  })
}`
        }]
      })

      E.push(hudText('Score', 'Score: 0'))
      E.push(hint2D('Arrows/WASD fly · Space fire'))

      return {
        name: `${th.label} Shooter`, mode: '2d',
        useGradient: th.useGradient, bgTop: th.bgTop, bgBottom: th.bgBottom,
        gravity2d: 0,
        camera2d: { zoom: 1, follow: '' },
        entities: E
      }
    }

    case 'flappy': {
      const E: EntitySpec[] = []
      const gapHalf = diff <= 4 ? 85 : diff <= 7 ? 70 : 55
      const pipeSpeed = 150 + diff * 10

      E.push({
        name: 'Bird', tags: ['player'], pos: [-60, 40, 5],
        comps: [
          { type: 'sprite2d', sprite: 'orb', w: 34, h: 32, seed: RI(1, 9999), color: th.playerColor, screen: false },
          { type: 'body2d', gravityScale: 1, w: 28, h: 26 },
          {
            type: 'script', code: `// Bird: flap
if (engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) self.vel.y = 430
self.rot.z = Math.max(-40, Math.min(70, self.vel.y * 0.09))
if (self.pos.y < -300 || self.pos.y > 340) engine.gameOver("Crashed!")`
          },
          { type: 'particles2d', rate: 0, life: 0.3, speed: 60, spread: 180, size: 4, color: th.particleColor }
        ]
      })

      E.push({
        name: 'PipeSpawner',
        comps: [{
          type: 'script', code: `// Pipe spawner
if (self.mem.init === undefined) { self.mem.init = 1; self.mem.t = 0.6 }
self.mem.t -= engine.dt
if (self.mem.t <= 0) {
  self.mem.t = ${ (1.7 - diff * 0.06).toFixed(2) }
  var gapY = engine.random(10, 210)
  engine.spawn({
    name: "PipeBottom", tags: ["pipe"],
    pos: [560, gapY - ${gapHalf} - 120, 3],
    comps: [
      { type: "sprite2d", sprite: "none", color: "${th.platColors[0]}", w: 70, h: 260, screen: false },
      { type: "body2d", gravityScale: 0, vx: ${-pipeSpeed}, w: 70, h: 260 },
      { type: "script", code: "${L_PIPE}" }
    ]
  })
  engine.spawn({
    name: "PipeTop", tags: ["pipe"],
    pos: [560, gapY + ${gapHalf} + 120, 3],
    comps: [
      { type: "sprite2d", sprite: "none", color: "${th.platColors[1]}", w: 70, h: 260, screen: false },
      { type: "body2d", gravityScale: 0, vx: ${-pipeSpeed}, w: 70, h: 260 },
      { type: "script", code: "${L_PIPE}" }
    ]
  })
}`
        }]
      })

      E.push({
        name: 'Ground', tags: ['ground'], pos: [0, -330, 1],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: th.groundColor, w: 1200, h: 60, screen: false },
          { type: 'body2d', isStatic: true, sensor: true, w: 1200, h: 60 }
        ]
      })

      if (th.clouds) for (let i = 0; i < 4; i++) E.push(cloud(R(-300, 1100), R(220, 340), RI(1, 9999)))

      E.push(hudText('Score', 'Score: 0'))
      E.push(hint2D('Space to flap'))

      return {
        name: `${th.label} Flappy`, mode: '2d',
        useGradient: th.useGradient, bgTop: th.bgTop, bgBottom: th.bgBottom,
        gravity2d: 1400,
        camera2d: { zoom: 1, follow: '' },
        entities: E
      }
    }

    case 'breakout': {
      const E: EntitySpec[] = []
      const rows = Math.min(8, 3 + Math.floor(diff / 2))
      const total = rows * 9
      const rowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4']

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 9; col++) {
          E.push({
            name: 'Brick', tags: ['brick'],
            pos: [-262 + col * 66, 260 - row * 32, 2],
            comps: [
              { type: 'sprite2d', sprite: 'none', color: rowColors[row % rowColors.length], w: 60, h: 22, screen: false },
              { type: 'body2d', isStatic: true, w: 60, h: 22 },
              {
                type: 'script', code: `self.onCollide(function (o) {
  if (o.has("ball")) {
    engine.score += 1
    var s = engine.find("Score")
    if (s) s.setText("Bricks: " + engine.score + " / ${total}")
    self.burst(10)
    engine.destroy(self)
    if (engine.score >= ${total}) engine.win("All bricks cleared!")
  }
})`
              }
            ]
          })
        }
      }

      E.push({
        name: 'Paddle', tags: ['paddle'], pos: [0, -290, 3],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: '#e2e8f0', w: 120, h: 18, screen: false },
          { type: 'body2d', isStatic: true, w: 120, h: 18 },
          {
            type: 'script', code: `// Paddle: mouse or keys
var mx = engine.input.mouse.wx
if (engine.input.mouse.inside && mx !== undefined) self.pos.x = Math.max(-268, Math.min(268, mx))
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.pos.x -= 430 * engine.dt
if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.pos.x += 430 * engine.dt`
          }
        ]
      })

      E.push({
        name: 'Ball', tags: ['ball'], pos: [0, -240, 4],
        comps: [
          { type: 'sprite2d', sprite: 'none', color: '#f8fafc', w: 16, h: 16, screen: false },
          { type: 'body2d', gravityScale: 0, bounce: 1, vx: R(110, 190), vy: 280 + diff * 14, w: 16, h: 16 },
          { type: 'script', code: `if (self.pos.y < -340) engine.gameOver("Ball lost!")` }
        ]
      })

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

      E.push(hudText('Score', `Bricks: 0 / ${total}`))
      E.push(hint2D('Move mouse or A/D'))

      return {
        name: `${th.label} Breakout`, mode: '2d',
        useGradient: false, bg: th.bgTop,
        gravity2d: 0,
        camera2d: { zoom: 1, follow: '' },
        entities: E
      }
    }

    case 'runner': {
      const E: EntitySpec[] = []
      for (let i = 0; i < 3; i++) {
        E.push({
          name: 'Ground' + i, tags: ['ground'], pos: [-450 + i * 900, -30, 1],
          comps: [
            { type: 'sprite2d', sprite: th.groundSprite, color: th.groundColor, w: 900, h: 60, seed: RI(1, 9999), screen: false },
            { type: 'body2d', isStatic: true, w: 900, h: 60 },
            { type: 'script', code: L_TILES }
          ]
        })
      }

      E.push({
        name: 'Player', tags: ['player'], pos: [-80, 40, 4],
        comps: [
          { type: 'sprite2d', sprite: 'player', w: 38, h: 46, seed: RI(1, 9999), color: th.playerColor, screen: false },
          { type: 'body2d', gravityScale: 1, w: 30, h: 44 },
          {
            type: 'script', code: `// Runner: jump only
if ((engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) && self.onGround) {
  self.vel.y = 680
  self.burst(6)
}
if (self.pos.y < -260) engine.gameOver("Fell off!")`
          }
        ]
      })

      const interval = Math.max(0.55, 1.35 - diff * 0.09).toFixed(2)
      E.push({
        name: 'Spawner',
        comps: [{
          type: 'script', code: `// Obstacle spawner + distance score
if (self.mem.init === undefined) { self.mem.init = 1; self.mem.t = 1.2 }
self.mem.t -= engine.dt
var s = engine.find("Score")
if (s) { engine.score = Math.floor(engine.time * 10); s.setText("Distance: " + Math.floor(engine.time * 10) + "m") }
if (self.mem.t <= 0) {
  self.mem.t = ${interval} + Math.random() * 0.7
  var tall = Math.random() < 0.3
  engine.spawn({
    name: "Obstacle", tags: ["hazard"],
    pos: [560, tall ? 30 : 18, 3],
    comps: [
      { type: "sprite2d", sprite: "crate", w: tall ? 34 : 42, h: tall ? 78 : 40, seed: Math.floor(Math.random() * 9999), color: "${th.groundColor}", screen: false },
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
}`
        }]
      })

      if (th.clouds) for (let i = 0; i < 4; i++) E.push(cloud(R(-400, 1400), R(180, 320), RI(1, 9999)))
      if (th.starColors) for (let i = 0; i < 24; i++) E.push(star(R(-500, 500), R(-50, 380), th.starColors[RI(0, th.starColors.length - 1)], R(2, 4)))

      E.push(hudText('Score', 'Distance: 0m'))
      E.push(hint2D('Space to jump'))

      return {
        name: `${th.label} Runner`, mode: '2d',
        useGradient: th.useGradient, bgTop: th.bgTop, bgBottom: th.bgBottom,
        gravity2d: 1800,
        camera2d: { zoom: 1, follow: 'Player' },
        entities: E
      }
    }

    case 'explorer3d': {
      const E: EntitySpec[] = [
        { name: 'Sunlight', pos: [18, 30, 12], comps: [{ type: 'light3d', kind: 'sun', color: '#ffffff', intensity: 1.35, distance: 0 }] },
        { name: 'Skylight', comps: [{ type: 'light3d', kind: 'hemisphere', color: '#bfd4ff', intensity: 0.65, distance: 0 }] }
      ]
      const arena = 45 + diff * 3
      const groundColor = intent.theme === 'jungle' ? '#1f8a4c' : intent.theme === 'desert' ? '#d4a017' : intent.theme === 'space' ? '#1e293b' : intent.theme === 'candy' ? '#f9a8d4' : '#334155'

      E.push({ name: 'Ground', pos: [0, 0, 0], comps: [{ type: 'mesh3d', geo: 'plane', color: groundColor, texture: 'none', wire: false }] })
      E.push(playerEntity3D(0, 1.1, th.playerColor))

      const gemTotal = intent.gems ?? (5 + Math.floor(diff / 2))
      const spots: Array<[number, number]> = []
      while (spots.length < gemTotal) {
        const x = R(-arena / 2, arena / 2), z = R(-arena / 2, arena / 2)
        if (Math.abs(x) + Math.abs(z) < 6) continue
        if (spots.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 7)) continue
        spots.push([x, z])
      }
      for (const [x, z] of spots) E.push(gem3D(Math.round(x), Math.round(z), RI(1, 9999)))

      for (let i = 0; i < 2 + diff; i++) {
        E.push(crate3D(Math.round(R(-arena / 2, arena / 2)), Math.round(R(-arena / 2, arena / 2)), RI(1, 9999)))
      }
      for (let i = 0; i < 6 + RI(0, 4); i++) {
        const x = Math.round(R(-arena / 2 - 3, arena / 2 + 3)), z = Math.round(R(-arena / 2 - 3, arena / 2 + 3))
        if (Math.abs(x) < 4 && Math.abs(z) < 4) continue
        tree3D(x, z).forEach(sp => E.push(sp))
      }

      E.push(hudText('Score', 'Gems: 0'))
      E.push(hint2D('WASD move · Space jump · Mouse rotates camera'))

      return {
        name: `${th.label} Explorer`, mode: '3d',
        useGradient: true, bgTop: th.bgTop, bgBottom: th.bgBottom,
        gravity3d: 24,
        camera3d: { mode: 'third', follow: 'Player', fov: 60, dist: 9, height: 3.6 },
        entities: E
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                */
/* ------------------------------------------------------------------ */

export interface GenInfo { genre: Genre; theme: ThemeKey; themeLabel: string; difficulty: number; doubleJump: boolean; movingPlatforms: boolean }

export function generateOffline(prompt: string, seed = Math.floor(Math.random() * 1e9)): { spec: SceneSpec; info: GenInfo } {
  const intent = parseIntent(prompt || '', seed)
  const spec = synthesize(intent, seed)
  return { spec, info: { genre: intent.genre, theme: intent.theme, themeLabel: THEMES[intent.theme].label, difficulty: intent.difficulty, doubleJump: intent.doubleJump, movingPlatforms: intent.movingPlatforms } }
}

export function blank2D(): SceneSpec {
  return {
    name: 'Untitled 2D', mode: '2d', useGradient: true,
    bgTop: '#101a3a', bgBottom: '#3b5f8a', gravity2d: 1700,
    camera2d: { zoom: 1, follow: 'Player' },
    entities: [
      groundSeg(0, 1200, THEMES.classic, 42),
      {
        name: 'Player', tags: ['player'], pos: [0, 60, 4],
        comps: [
          { type: 'sprite2d', sprite: 'player', w: 36, h: 46, seed: 7, color: '#ef476f', screen: false },
          { type: 'body2d', gravityScale: 1, w: 30, h: 44 },
          { type: 'script', code: `// Player controller (2D platformer)
var SP = 240
if (engine.input.down("KeyA") || engine.input.down("ArrowLeft")) self.vel.x = -SP
else if (engine.input.down("KeyD") || engine.input.down("ArrowRight")) self.vel.x = SP
else self.vel.x = 0
if ((engine.input.pressed("Space") || engine.input.pressed("ArrowUp") || engine.input.pressed("KeyW")) && self.onGround) {
  self.vel.y = 660
  self.burst(8)
}
if (self.pos.y < -260) engine.gameOver("You fell!")` }
        ]
      },
      hudText('Score', 'Score: 0'),
      hint2D('A/D move · Space jump · Select an entity and add Scripts in the Inspector')
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
      { name: 'Ground', pos: [0, 0, 0], comps: [{ type: 'mesh3d', geo: 'plane', color: '#334155', texture: 'none', wire: false }] },
      playerEntity3D(0, 1.1, '#f97316'),
      hudText('Score', 'Score: 0'),
      hint2D('WASD move · Space jump')
    ]
  }
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
      for (let i = 0; i < n; i++) addSpec(enemyPatrol(-250 + Math.random() * 500, 30, 55, Math.floor(Math.random() * 9999)))
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
          addSpec(platform(Math.round(-300 + Math.random() * 700), Math.round(50 + Math.random() * 120), w, '#8b5cf6', Math.floor(Math.random() * 9999)))
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
      return { reply: `Background is now ${m[2]}.`, changed: true }
    }
    return { reply: `I don't know the color "${m[2]}". Try: red, blue, green, yellow, purple, pink, orange, cyan, white, black, gray, gold, teal, lime`, changed: false }
  }

  if ((m = t.match(/make (?:the )?(.+?) (red|blue|green|yellow|purple|pink|orange|cyan|white|black|gray|grey|gold|teal|lime|violet|sky)\b/)) && !/background|bg|sky/.test(t)) {
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
    return { reply: `No entity named "${name}". Try: add 5 coins`, changed: false }
  }

  if ((m = t.match(/gravity (?:to )?(\d+)/))) {
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

  if (/^(hi|hello|hey|help|ki korte paro|kibhabe|how)/.test(t)) {
    return {
      reply: 'Ami NovaAI — tomar offline game assistant! Commands:\n\n  • add 10 coins / gems · add 3 enemies\n  • add 5 platforms / crates / trees\n  • make background red · make Player green\n  • gravity 800 · zoom 1.5\n  • clear coins / enemies / all\n\nAI Builder tab e prompt likhe full game generate koro — LLM key thakle (AI Settings) aro shoktishali!',
      changed: false
    }
  }

  return {
    reply: [
      'I am NovaAI (offline mode — connect an LLM in AI Settings for full power). Commands I understand:',
      '',
      '  • add 10 coins / gems · add 3 enemies',
      '  • add 5 platforms / crates / trees',
      '  • make background red · make Player green',
      '  • gravity 800 · zoom 1.5',
      '  • clear coins / enemies / all',
      '',
      'Tip: use the AI Builder tab (⌁) to synthesize a full game from a prompt!'
    ].join('\n'),
    changed: false
  }
}
