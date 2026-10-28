/* ============ Nova Engine — AI Builder & Assistant (real LLM integration) ============ */

import type { SceneSpec } from '../../engine/spec'
import { validateSpec } from '../../engine/spec'
import { chatComplete, aiConfigured, type AISettings } from './providers'

/* ---------- Builder: prompt -> SceneSpec (real LLM, no canned templates) ---------- */

const SCHEMA_DOC = `You are NovaAI, the built-in game generator of "Nova Engine" (an AI-first 2D/3D game engine).
The user describes a game; you reply with ONE complete game as a single JSON SceneSpec. No explanations, only JSON.

FORMAT (SceneSpec):
{
  "name": "short game name",
  "mode": "2d" | "3d",
  "useGradient": true,
  "bgTop": "#hex", "bgBottom": "#hex",       // 2d sky gradient (2d mode) / fog color (3d)
  "gravity2d": 1700,                          // 2d mode: ~1400-2000, 0 for space games
  "gravity3d": 24,                            // 3d mode: ~15-30
  "camera2d": { "zoom": 1, "follow": "Player" },
  "camera3d": { "mode": "third|first|top|orbit", "follow": "Player", "fov": 60, "dist": 9, "height": 3.4 },
  "entities": [ EntitySpec, ... ]
}
EntitySpec:
{ "name": "Player", "tags": ["player"], "pos": [x,y,z], "rot": [x,y,z], "scale": [x,y,z],
  "comps": [ ComponentSpec, ... ] }

ComponentSpec types (all fields optional, sensible defaults exist):
- {"type":"sprite2d","sprite":"none|player|coin|gem|enemy|ship|ufo|alien|crate|orb|cloud|tree|star|brick","color":"#hex","w":60,"h":60,"seed":7,"screen":false,"shape":"box|circle|triangle"}
- {"type":"text2d","text":"Score: 0","size":22,"color":"#fff","screen":true}   // screen:true = HUD pixel coords
- {"type":"particles2d","rate":0,"life":0.6,"speed":90,"spread":180,"size":5,"color":"#fbbf24"}
- {"type":"body2d","vx":0,"vy":0,"gravityScale":1,"isStatic":false,"sensor":false,"bounce":0,"friction":0.35,"keepUpright":true,"w":60,"h":60}
- {"type":"mesh3d","geo":"box|sphere|capsule|cylinder|cone|torus|torusKnot|plane","color":"#hex","texture":"none|player|coin|gem|enemy|ship|ufo|alien|crate|orb|cloud|tree|star|brick","wire":false}
- {"type":"rigid3d","vx":0,"vy":0,"vz":0,"isStatic":false,"sensor":false,"bounce":0,"friction":0.6,"lockRot":false,"gravityScale":1,"radius":0}
- {"type":"light3d","kind":"sun|ambient|hemisphere|point","color":"#hex","intensity":1.5,"distance":0}
- {"type":"script","code":"javascript body, runs every frame"}

REAL PHYSICS:
2D uses Planck (a full Box2D port); 3D uses Rapier (Rust rigid-body engine). Bodies have mass,
rotation (unless keepUpright/lockRot), friction and bounce; EVERY dynamic body collides with
every other body (not only statics). Ground detection sets self.onGround.

SCRIPT API (scripts run every frame):
self.pos {x,y,z} (2D: y is UP, +x right) · self.vel {x,y,z} (pixels/s in 2D, m/s in 3D) · self.rot (degrees, z for 2D) · self.scale · self.color · self.visible · self.onGround · self.mem {} (persistent vars across frames) · self.tags (array) · self.has(tag) · self.setText(str) (text2d entities) · self.burst(n) (particle burst) · self.onCollide(cb) where cb(other) fires every frame two bodies touch — other is another SelfAPI.
engine.dt · engine.time · engine.score (number) · engine.input.down("KeyW"|"ArrowUp"|"Space"...) · engine.input.pressed(...)(true only the frame the key went down) · engine.input.mouse {x,y,wx,wy,inside,left} (2d: wx/wy = world coords) · engine.find("Name") · engine.findAll(tag) · engine.spawn(EntitySpec) · engine.destroy(selfAPI) · engine.camera.shake(strength, seconds) · engine.camera.yaw (3d camera yaw, read-only) · engine.random(a,b) · engine.chance(p) · engine.pick(arr) · engine.win(msg) · engine.gameOver(msg) · engine.log(...)

RULES:
1. WORLD 2D: y grows UP, origin center of screen; visible area roughly x in [-450,450], y in [-280,320] at zoom 1. Ground boxes are centered boxes.
2. Give the player entity name "Player" with tags ["player"], and a score HUD text2d named "Score" with screen:true at pos [16,14].
3. 2D ground/body2d components: set friction (e.g. ground 0.3, ice 0.05) and keepUpright:true for players (so they don't tumble). Collectibles: body2d{isStatic:true, sensor:true} + script using self.onCollide to score & destroy.
4. Player jump: if(self.onGround) self.vel.y = +620 (y is UP!). For moving platforms set self.pos each frame (statics follow their transform).
5. 3D: make a real ground entity (mesh3d geo "plane", scale [50,1,50] — it becomes a big static collider). Player: capsule mesh + rigid3d{lockRot:true, friction:0.05} so it doesn't tip over. Props like crates/gems: plain rigid3d dynamic bodies. Camera-relative movement uses engine.camera.yaw.
6. Scripts must be complete runnable JS function bodies (no imports, no DOM, no fetch). Keep each under ~40 lines. Use "var" and double quotes.
7. Make it FUN and COMPLETE: clear win/lose conditions, working score, enough content (5+ gameplay entities). 2D levels: include ground, obstacles/enemies, collectibles and a goal.
8. Reply with ONLY the JSON object (it may be wrapped in \`\`\`json fences).`

export async function aiGenerateScene(settings: AISettings, prompt: string): Promise<SceneSpec> {
  const text = await chatComplete(
    settings,
    SCHEMA_DOC,
    [{ role: 'user', content: `Make this game: ${prompt}\n\nRemember: reply with ONLY the SceneSpec JSON.` }],
    0.6
  )
  const spec = extractJSON(text)
  const v = validateSpec(spec)
  if (!v.ok) throw new Error('Generated spec invalid: ' + v.issues.join('; '))
  return spec as SceneSpec
}

export function extractJSON(text: string): any {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fence ? fence[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI reply')
  const slice = raw.slice(start, end + 1)
  try { return JSON.parse(slice) } catch {
    // tolerate trailing commas
    const cleaned = slice.replace(/,(\s*[}\]])/g, '$1')
    return JSON.parse(cleaned)
  }
}

/* ---------- Assistant ---------- */

const ASSISTANT_DOC = `You are NovaAI Assistant inside "Nova Engine" — an AI-first 2D/3D game engine editor.
You help the user build/edit their game. You know the engine's SceneSpec format and script API (same as the game builder).
When the user asks for a change to the CURRENT scene, reply briefly AND include the complete updated SceneSpec in a \`\`\`nova ... \`\`\` code fence (full JSON with ALL entities, not a diff). The engine detects the fence and applies it.
When the user asks a question or chats, just reply helpfully in 2-6 sentences. If they ask how scripting works, show tiny code examples. The script API:
self.pos/vel/rot/scale/color/visible/mem/has(tag)/setText/burst(n)/onCollide(cb) · engine.dt/time/score/input.down/pressed/find/findAll/spawn/destroy/camera.shake/camera.yaw/win/gameOver/log. 2D world is y-up. Physics is real (Planck 2D / Rapier 3D).`

export interface AssistantResult { reply: string; patch: SceneSpec | null }

export async function aiAssistant(
  settings: AISettings,
  history: ChatMsg[],
  userMsg: string
): Promise<AssistantResult> {
  const text = await chatComplete(settings, ASSISTANT_DOC, [...history, { role: 'user', content: userMsg }], 0.7)
  let patch: SceneSpec | null = null
  const fence = text.match(/```nova\s*([\s\S]*?)```/)
  if (fence) {
    try { patch = extractJSON(fence[1]) } catch { patch = null }
  }
  const clean = text.replace(/```[a-z]*[\s\S]*?```/g, (s) => s.length > 220 ? '(scene spec applied)' : s)
  return { reply: clean.trim(), patch }
}

export type ChatMsg = { role: 'user' | 'assistant'; content: string }

/* ---------- Unified entry used by the editor ---------- */

export interface BuilderResult {
  spec: SceneSpec
  source: 'llm'
}

/** Generate a complete game via the configured LLM. No offline fallback — needs a key. */
export async function buildGame(settings: AISettings, prompt: string): Promise<BuilderResult> {
  if (!prompt.trim()) throw new Error('Khali prompt — ki banabo likho!')
  if (!aiConfigured(settings)) {
    throw new Error('No AI key configured — AI Settings (AI menu → AI Settings…) e key add korun. The old fake offline generator was removed; generation is real LLM now.')
  }
  const spec = await aiGenerateScene(settings, prompt)
  return { spec, source: 'llm' }
}

export { localAssistant, type AssistantAction } from './assistant-local'
export { loadAISettings, normalizeSettings, aiConfigured } from './providers'
