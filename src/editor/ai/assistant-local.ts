/* ============ Nova Engine — offline assistant commands ============
   Pattern-matched commands that make REAL scene edits (no API key needed).
   The old canned game-synth pretending to be "AI" was removed. */

import type { Scene } from '../../engine/core'
import type { EntitySpec } from '../../engine/spec'
import { coin2D, enemyPatrol, platform, cloud, tree3D, crate3D, crate2D, wall3D, gem3D } from '../blank'

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
  scene: Scene,
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
            { type: 'rigid3d', isStatic: true, bounce: 0.1 }
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
        } else if (kind === 'crate' || kind === 'box') {
          addSpec(crate2D(Math.round(-300 + Math.random() * 700), Math.round(100 + Math.random() * 160), Math.floor(Math.random() * 9999)))
        } else {
          const w = 100 + Math.floor(Math.random() * 140)
          addSpec(platform(Math.round(-300 + Math.random() * 700), Math.round(50 + Math.random() * 120), w, '#8b5cf6', Math.floor(Math.random() * 9999)))
        }
      } else {
        if (kind === 'tree') {
          const x = Math.round(-18 + Math.random() * 36)
          const z = Math.round(-18 + Math.random() * 36)
          tree3D(x, z).forEach(sp => addSpec(sp))
        } else if (kind === 'wall') {
          addSpec(wall3D(Math.round(-18 + Math.random() * 36), Math.round(-18 + Math.random() * 36)))
        } else {
          addSpec(crate3D(Math.round(-18 + Math.random() * 36), Math.round(-18 + Math.random() * 36), Math.floor(Math.random() * 9999)))
        }
      }
    }
    refresh()
    return { reply: `Added ${n} ${kind}${n > 1 ? 's' : ''}${kind === 'crate' || kind === 'box' ? ' (with real physics — they tumble and stack!)' : ''}.`, changed: true }
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
      reply: 'Ami NovaAI — network chhara-o real scene edit kori. Commands:\n\n  • add 10 coins / gems · add 3 enemies\n  • add 5 platforms / crates / trees / walls\n  • make background red · make Player green\n  • gravity 800 · zoom 1.5\n  • clear coins / enemies / all\n\nAI Builder tab e prompt likhe full game generate korte paren — LLM key thakle (AI Settings).',
      changed: false
    }
  }

  return {
    reply: [
      'I am NovaAI (offline mode — connect an LLM in AI Settings for full power). Commands I understand:',
      '',
      '  • add 10 coins / gems · add 3 enemies',
      '  • add 5 platforms / crates / trees / walls',
      '  • make background red · make Player green',
      '  • gravity 800 · zoom 1.5',
      '  • clear coins / enemies / all',
      '',
      'Tip: use the AI Builder tab (⌁) with an LLM key to generate a full game from a prompt!'
    ].join('\n'),
    changed: false
  }
}
