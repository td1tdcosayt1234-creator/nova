/* ============ Nova Engine — Input ============ */

const GAME_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'
])

export class Input {
  enabled = false
  downSet = new Set<string>()
  pressedSet = new Set<string>()
  mouse = { x: 0, y: 0, wx: 0, wy: 0, inside: false, dx: 0, dy: 0, left: false, right: false, mid: false }
  wheel = 0
  private el: HTMLElement | null = null
  private handlers: Array<[string, any]> = []

  attach(el: HTMLElement) {
    this.el = el

    const kd = (ev: KeyboardEvent) => {
      if (!this.enabled) return
      const c = ev.code
      if (GAME_CODES.has(c)) ev.preventDefault()
      if (!this.downSet.has(c)) this.pressedSet.add(c)
      this.downSet.add(c)
    }
    const ku = (ev: KeyboardEvent) => { this.downSet.delete(ev.code) }
    const blur = () => { this.downSet.clear(); this.mouse.left = false; this.mouse.right = false }

    const mm = (ev: MouseEvent) => {
      const r = el.getBoundingClientRect()
      this.mouse.dx += ev.clientX - this.mouse.x
      this.mouse.dy += ev.clientY - this.mouse.y
      this.mouse.x = ev.clientX - r.left
      this.mouse.y = ev.clientY - r.top
    }
    const md = (ev: MouseEvent) => {
      if (ev.button === 0) this.mouse.left = true
      if (ev.button === 1) this.mouse.mid = true
      if (ev.button === 2) this.mouse.right = true
    }
    const mu = (ev: MouseEvent) => {
      if (ev.button === 0) this.mouse.left = false
      if (ev.button === 1) this.mouse.mid = false
      if (ev.button === 2) this.mouse.right = false
    }
    const wh = (ev: WheelEvent) => { this.wheel += ev.deltaY }
    const ctx = (ev: Event) => { ev.preventDefault() }

    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', blur)
    el.addEventListener('mousemove', mm)
    el.addEventListener('mousedown', md)
    window.addEventListener('mouseup', mu)
    el.addEventListener('wheel', wh, { passive: true })
    el.addEventListener('contextmenu', ctx)
    el.addEventListener('mouseenter', () => { this.mouse.inside = true })
    el.addEventListener('mouseleave', () => { this.mouse.inside = false })

    this.handlers = [
      ['keydown', kd], ['keyup', ku], ['blur', blur], ['mousemove', mm],
      ['mousedown', md], ['mouseup', mu], ['wheel', wh], ['contextmenu', ctx]
    ]
  }

  setEnabled(v: boolean) {
    this.enabled = v
    if (v) { this.downSet.clear(); this.pressedSet.clear() }
  }

  isDown(c: string) { return this.downSet.has(c) }
  isPressed(c: string) { return this.pressedSet.has(c) }

  postUpdate() {
    this.pressedSet.clear()
    this.mouse.dx = 0
    this.mouse.dy = 0
    this.wheel = 0
  }
}
