/* ============ Nova Engine — Console panel ============ */

import type { LogLevel } from './state'

export interface ConsolePanel {
  log(level: LogLevel, msg: string): void
  clear(): void
}

export function initConsole(ed: import('./state').Editor, logEl: HTMLElement, clearBtn: HTMLButtonElement): ConsolePanel {
  const panel: ConsolePanel = {
    log(level, msg) {
      const line = document.createElement('div')
      line.className = 'cline ' + level
      const ts = new Date().toTimeString().slice(0, 8)
      line.innerHTML = `<span class="ts">${ts}</span>`
      line.appendChild(document.createTextNode(String(msg)))
      logEl.appendChild(line)
      while (logEl.children.length > 400) logEl.removeChild(logEl.firstChild!)
      logEl.scrollTop = logEl.scrollHeight
    },
    clear() { logEl.innerHTML = '' }
  }
  clearBtn.addEventListener('click', () => panel.clear())

  // route console output into panel (keep originals)
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origErr = console.error.bind(console)
  const fmt = (a: any) => typeof a === 'string' ? a : safeJson(a)
  console.log = (...a: any[]) => { origLog(...a); panel.log('info', a.map(fmt).join(' ')) }
  console.warn = (...a: any[]) => { origWarn(...a); panel.log('warn', a.map(fmt).join(' ')) }
  console.error = (...a: any[]) => { origErr(...a); panel.log('err', a.map(fmt).join(' ')) }
  window.addEventListener('error', ev => panel.log('err', `Uncaught: ${ev.message}`))
  window.addEventListener('unhandledrejection', ev => panel.log('err', `Promise: ${String(ev.reason).slice(0, 300)}`))

  return panel
}

function safeJson(v: any): string {
  try { return typeof v === 'object' ? JSON.stringify(v).slice(0, 400) : String(v) } catch { return String(v) }
}
