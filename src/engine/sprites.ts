/* ============ Nova Engine — Procedural pixel-art sprite generator ============ */

import { mulberry32, hashStr } from './core'

export type SpriteImage = { w: number; h: number; data: Uint8ClampedArray }

const P = {
  player: ['#ffd166', '#ef476f', '#f8f9fa', '#118ab2'],
  coin: ['#ffd700', '#ffb703', '#fff3c4', '#b8860b'],
  gem: ['#22d3ee', '#a78bfa', '#e0f2fe', '#0e7490'],
  enemy: ['#ef4444', '#7f1d1d', '#fca5a5', '#1f2937'],
  ship: ['#22d3ee', '#e2e8f0', '#6366f1', '#0ea5e9'],
  ufo: ['#a3e635', '#65a30d', '#e2e8f0', '#84cc16'],
  alien: ['#a78bfa', '#7c3aed', '#f0abfc', '#ddd6fe'],
  crate: ['#b45309', '#78350f', '#d97706', '#fbbf24'],
  orb: ['#f472b6', '#fb7185', '#ffe4e6', '#e11d48'],
  cloud: ['#e2e8f0', '#f8fafc', '#cbd5e1', '#94a3b8'],
  tree: ['#16a34a', '#15803d', '#a16207', '#22c55e'],
  star: ['#fde047', '#facc15', '#fffbeb', '#f59e0b'],
  brick: ['#6b7280', '#4b5563', '#9ca3af', '#374151'],
  none: ['#7c5cff', '#5b8def', '#c4b5fd', '#818cf8']
} as Record<string, string[]>

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* mask(x,y) -> true if pixel is inside the sprite shape */
function maskFor(cat: string): (x: number, y: number) => boolean {
  const S = 16
  const circle = (cx: number, cy: number, r: number) => (x: number, y: number) =>
    (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r
  const ell = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1

  switch (cat) {
    case 'player': return (x, y) => {
      if (y <= 5) return ell(7.5, 3, 3.4, 3.2)(x, y)
      if (y <= 11) return x >= 3 && x <= 12
      return (x >= 4 && x <= 6) || (x >= 9 && x <= 11)
    }
    case 'coin': return circle(7.5, 7.5, 6.2)
    case 'gem': return (x, y) => Math.abs(x - 7.5) + Math.abs(y - 7.5) <= 6.4
    case 'enemy': return (x, y) => {
      if (y <= 13 && y >= 3) {
        const ry = y <= 4 || y >= 12 ? 4.4 : 5.4
        if (ell(7.5, 8, 5.6, ry)(x, y)) return true
      }
      return y === 14 && (x >= 3 && x <= 5 || x >= 10 && x <= 12)
    }
    case 'ship': return (x, y) => {
      if (y < 1 || y > 14) return false
      const half = 1 + Math.floor((y - 1) * 0.55)
      return Math.abs(x - 7.5) <= half
    }
    case 'ufo': return (x, y) => {
      if (y >= 2 && y <= 6) return ell(7.5, 4.5, 4.4, 2.6)(x, y)
      return y >= 7 && y <= 11 && x >= 1 && x <= 14
    }
    case 'alien': return (x, y) => {
      if (y <= 1) return x === 4 || x === 11
      if (y === 2) return x === 4 || x === 5 || x === 10 || x === 11
      return ell(7.5, 7.5, 5, 5.2)(x, y) && y >= 3
    }
    case 'crate': return (x, y) => x >= 1 && y >= 1 && x <= 14 && y <= 14
    case 'orb': return circle(7.5, 7.5, 6.8)
    case 'cloud': return (x, y) =>
      ell(4.5, 9.5, 3.6, 2.4)(x, y) || ell(8, 8, 4.2, 3)(x, y) || ell(11.5, 9.5, 3.6, 2.4)(x, y)
    case 'tree': return (x, y) => {
      if (y >= 9 && x >= 6 && x <= 9) return true
      return circle(7.5, 5.5, 4.6)(x, y) || circle(5.5, 7, 3)(x, y) || circle(9.5, 7, 3)(x, y)
    }
    case 'star': return (x, y) => {
      const dx = x - 7.5, dy = y - 7.5
      const r = Math.sqrt(dx * dx + dy * dy)
      const th = Math.atan2(dy, dx)
      const rr = 3.2 + 3.4 * Math.cos(5 * th)
      return r <= rr
    }
    case 'brick': return (x, y) => x >= 1 && y >= 2 && x <= 14 && y <= 13
    default: return (x, y) => x >= 1 && y >= 1 && x <= 14 && y <= 14
  }
}

const cache = new Map<string, HTMLCanvasElement>()

export function spriteCanvas(category: string, seed: number, size = 16): HTMLCanvasElement {
  const key = `${category}|${seed}`
  const hit = cache.get(key)
  if (hit) return hit

  const cat = P[category] ? category : 'none'
  const rnd = mulberry32(hashStr(key) ^ 0x9e3779b9)
  const pal = P[cat]
  const inMask = maskFor(cat)
  const n = size
  const img = new SpriteImageLite(n, n)

  const cols = pal.map(hex)
  const pick = () => {
    const r = rnd()
    return r < 0.55 ? cols[0] : r < 0.8 ? cols[1] : r < 0.94 ? cols[2] : cols[3]
  }

  const grid: (number | -1)[][] = []
  for (let y = 0; y < n; y++) {
    grid[y] = []
    for (let x = 0; x < n; x++) {
      if (!inMask(x, y)) { grid[y][x] = -1; continue }
      grid[y][x] = Math.floor(rnd() * 4)
    }
  }

  // special details per category
  if (cat === 'enemy' || cat === 'alien') {
    const dark = cols[3]
    grid[7][5] = -2; grid[7][10] = -2 // eyes (custom value)
  }
  if (cat === 'crate') {
    for (let i = 1; i <= 14; i++) { grid[i][1] = 3; grid[i][14] = 3; grid[1][i] = 3; grid[14][i] = 3 }
    for (let i = 3; i <= 12; i++) { grid[i][i] = 3; grid[i][15 - i] = 3 }
  }
  if (cat === 'ship' && n > 8) { grid[3][7] = 2; grid[3][8] = 2; grid[4][7] = 2; grid[4][8] = 2 }
  if (cat === 'ufo') for (let x = 3; x <= 12; x += 2) if (grid[9][x] !== -1) grid[9][x] = 3
  if (cat === 'orb') { grid[5][5] = 2; grid[5][6] = 2; grid[6][5] = 2 }
  if (cat === 'brick') {
    for (let x = 0; x < n; x++) { grid[5][x] = 3; grid[9][x] = 3 }
    for (let y = 0; y < n; y++) { grid[y][5] = 3; grid[y][10] = 3 }
  }

  const darker = (c: [number, number, number]): [number, number, number] =>
    [Math.floor(c[0] * 0.62), Math.floor(c[1] * 0.62), Math.floor(c[2] * 0.62)]

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = grid[y][x]
      if (v === -1) continue
      let c: [number, number, number]
      if (v === -2) c = [15, 15, 25]
      else {
        c = cols[v]
        const edge =
          (y === 0 || grid[y - 1][x] === -1) ||
          (y === n - 1 || grid[y + 1][x] === -1) ||
          (x === 0 || grid[y][x - 1] === -1) ||
          (x === n - 1 || grid[y][x + 1] === -1)
        if (edge) c = darker(c)
      }
      img.set(x, y, c[0], c[1], c[2], 255)
    }
  }

  const cv = document.createElement('canvas')
  cv.width = n; cv.height = n
  const ctx = cv.getContext('2d')!
  const id = new ImageData(img.data as any, n, n)
  ctx.putImageData(id, 0, 0)
  cache.set(key, cv)
  return cv
}

class SpriteImageLite {
  data: Uint8ClampedArray
  constructor(public w: number, public h: number) {
    this.data = new Uint8ClampedArray(w * h * 4)
  }
  set(x: number, y: number, r: number, g: number, b: number, a: number) {
    const i = (y * this.w + x) * 4
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a
  }
}

export type SpriteImageFull = SpriteImage
