/* ============ Nova Bridge — local MCP + REST server ============
   External AI agents (OpenCode, Kilo, Kiro, Antigravity, Cursor,
   Claude Desktop...) connect here to read/control the running engine.

   MCP (streamable HTTP):  POST http://127.0.0.1:<port>/mcp
   REST:                   GET  /health /scene /entities /console /state
                           POST /scene /run /stop
   Only listens on 127.0.0.1 (local machine). */

const http = require('http')
const { DEFAULT_PORT, MCP_PROTOCOL_VERSIONS, NOVA_VERSION } = require('./bridge-shared')

let server = null
let port = DEFAULT_PORT
let startedAt = null

/* latest renderer state (pushed via IPC nova:bridge-state) */
const state = {
  inHome: true,
  playing: false,
  paused: false,
  scene: null,          // serialized SceneSpec
  entities: [],         // compact list
  selection: null,
  console: [],          // [{t, level, msg}]
  updated: 0
}

/* command sink: forwards to renderer (function set in bridge-main integration) */
let commandSink = null
function setCommandSink(fn) { commandSink = fn }
function sendCommand(cmd) {
  if (!commandSink) return { ok: false, error: 'no renderer window attached' }
  return commandSink(cmd)
}

/* ---------- compact entity rows for agents ---------- */
function entityRows() {
  if (state.inHome || !state.scene) return []
  return (state.entities || []).map(e => ({
    id: e.id, name: e.name, tags: e.tags || [], pos: e.pos,
    comps: (e.comps || []).map(c => c.type),
    visible: e.visible !== false,
    scripted: !!e.scripted
  }))
}

/* ---------- MCP tool definitions ---------- */
const JsonStr = { type: 'string' }
const Num = { type: 'number', minimum: 1, maximum: 500 }

const TOOLS = [
  {
    name: 'get_scene',
    description: 'Get the full Nova Engine scene as JSON (entities, transforms, components, scene settings). Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'set_scene',
    description: 'Replace the open scene with a Nova SceneSpec JSON object. WARNING: replaces the current scene (current one is kept in its project save first).',
    inputSchema: { type: 'object', properties: { spec: { type: 'object', description: 'Nova SceneSpec' } }, required: ['spec'] }
  },
  {
    name: 'list_entities',
    description: 'Compact list of every entity: id, name, tags, position, component types.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'read_console',
    description: 'Read engine console/log lines (newest last).',
    inputSchema: { type: 'object', properties: { limit: Num }, additionalProperties: false }
  },
  {
    name: 'run_scene',
    description: 'Press Play in the engine (runs the scene in play mode with physics).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'stop_scene',
    description: 'Stop play mode and restore the editor state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'play_state',
    description: 'Quick status: in home or editor, playing/paused, 2d/3d mode, entity count, selection name.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
]

function toolResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

function handleToolCall(name, args) {
  switch (name) {
    case 'get_scene':
      if (state.inHome || !state.scene) {
        return toolResult(JSON.stringify({ error: 'no scene open — engine is on the Home screen. Open a project first.' }, null, 1))
      }
      return toolResult(state.scene)

    case 'set_scene': {
      const spec = args && (args.spec || args.scene || args.spec_json)
      if (!spec || typeof spec !== 'object') {
        return toolResult(JSON.stringify({ error: "missing 'spec' — pass a Nova SceneSpec object" }), true)
      }
      const r = sendCommand({ type: 'set_scene', spec })
      return toolResult(JSON.stringify(r, null, 1))
    }
    case 'list_entities':
      return toolResult(JSON.stringify({ count: entityRows().length, entities: entityRows() }, null, 1))

    case 'read_console': {
      const lim = Math.max(1, Math.min(500, Number(args && args.limit) || 50))
      const lines = (state.console || []).slice(-lim)
      return toolResult(JSON.stringify({ lines }, null, 1))
    }
    case 'run_scene': {
      if (state.playing) return toolResult(JSON.stringify({ ok: true, note: 'already playing' }))
      const r = sendCommand({ type: 'run' })
      return toolResult(JSON.stringify(r, null, 1))
    }
    case 'stop_scene': {
      if (!state.playing) return toolResult(JSON.stringify({ ok: true, note: 'not playing' }))
      const r = sendCommand({ type: 'stop' })
      return toolResult(JSON.stringify(r, null, 1))
    }
    case 'play_state': {
      const sel = state.selection
      return toolResult(JSON.stringify({
        screen: state.inHome ? 'home' : 'editor',
        playing: state.playing,
        paused: state.paused,
        mode: state.scene ? (state.scene.meta ? state.scene.meta.mode : null) : null,
        scene_name: state.scene && state.scene.meta ? state.scene.meta.name : null,
        entity_count: entityRows().length,
        selection: sel
      }, null, 1))
    }
    default:
      return toolResult(JSON.stringify({ error: `unknown tool: ${name}` }), true)
  }
}

/* ---------- MCP JSON-RPC handling (stateless streamable HTTP, replies application/json) ---------- */

function handleJsonRpc(msg) {
  const method = msg && msg.method

  if (method === 'initialize') {
    const asked = msg.params && msg.params.protocolVersion
    const proto = MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0]
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: proto,
        capabilities: { tools: {} },
        serverInfo: { name: 'nova-engine', title: 'Nova Engine Bridge', version: NOVA_VERSION }
      }
    }
  }
  if (method === 'ping') return { jsonrpc: '2.0', id: msg.id, result: {} }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } }
  }
  if (method === 'tools/call') {
    const p = msg.params || {}
    try {
      const res = handleToolCall(p.name, p.arguments || {})
      return { jsonrpc: '2.0', id: msg.id, result: res }
    } catch (err) {
      return { jsonrpc: '2.0', id: msg.id, result: toolResult('tool crashed: ' + String(err), true) }
    }
  }
  if (typeof method === 'string' && method.startsWith('notifications/')) {
    return null   // notifications need no reply
  }
  if (msg.id !== undefined) {
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'unknown method: ' + String(method) } }
  }
  return null
}

/* ---------- REST + HTTP plumbing ---------- */

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type, authorization, mcp-session-id')
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

function json(res, status, obj) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(obj, null, 1))
}

async function route(req, res) {
  cors(res)
  const u = new URL(req.url, 'http://127.0.0.1')
  const p = u.pathname.replace(/\/+$/, '') || '/'
  const method = req.method.toUpperCase()

  if (method === 'OPTIONS') { res.statusCode = 204; return res.end() }

  /* MCP endpoint */
  if (p === '/mcp') {
    if (method !== 'POST') {
      // no GET-streaming — spec allows 405
      if (method === 'GET') { res.statusCode = 405; res.setHeader('allow', 'POST'); return res.end() }
      return json(res, 405, { error: 'POST JSON-RPC only' })
    }
    let body
    try { body = await readBody(req) } catch { return json(res, 400, { error: 'bad body' }) }
    if (Array.isArray(body)) {
      const outs = body.map(handleJsonRpc).filter(Boolean)
      return json(res, 200, outs.length === 1 ? outs[0] : outs)
    }
    const out = handleJsonRpc(body)
    if (!out) { res.statusCode = 202; return res.end() }
    return json(res, 200, out)
  }

  /* REST */
  if (p === '/health' && method === 'GET') {
    return json(res, 200, {
      app: 'nova-engine', version: NOVA_VERSION, uptime_s: startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0,
      screen: state.inHome ? 'home' : 'editor', playing: state.playing,
      scene: state.scene && state.scene.meta ? state.scene.meta.name : null,
      entity_count: entityRows().length
    })
  }
  if (p === '/scene' && method === 'GET') {
    if (state.inHome || !state.scene) return json(res, 409, { error: 'no scene open — open a project in the engine first' })
    return json(res, 200, typeof state.scene === 'string' ? JSON.parse(state.scene) : state.scene)
  }
  if (p === '/scene' && method === 'POST') {
    const body = await readBody(req)
    const spec = body.spec || body.scene || body
    if (!spec || typeof spec !== 'object') return json(res, 400, { error: "POST a Nova SceneSpec as JSON (optionally wrapped in {\"spec\":...})" })
    return json(res, 200, sendCommand({ type: 'set_scene', spec }))
  }
  if (p === '/entities' && method === 'GET') {
    return json(res, 200, { count: entityRows().length, entities: entityRows() })
  }
  if (p === '/console' && method === 'GET') {
    const lim = Math.max(1, Math.min(500, Number(u.searchParams.get('limit')) || 50))
    return json(res, 200, { lines: (state.console || []).slice(-lim) })
  }
  if (p === '/state' && method === 'GET') {
    return json(res, 200, {
      screen: state.inHome ? 'home' : 'editor', playing: state.playing, paused: state.paused,
      mode: state.scene && state.scene.meta ? state.scene.meta.mode : null,
      scene_name: state.scene && state.scene.meta ? state.scene.meta.name : null,
      entity_count: entityRows().length, selection: state.selection, updated: state.updated
    })
  }
  if (p === '/run' && method === 'POST') return json(res, 200, sendCommand({ type: 'run' }))
  if (p === '/stop' && method === 'POST') return json(res, 200, sendCommand({ type: 'stop' }))

  if (p === '/' && method === 'GET') {
    return json(res, 200, {
      app: 'nova-engine-bridge',
      mcp: { url: `http://127.0.0.1:${port}/mcp`, transport: 'streamable-http' },
      rest: {
        health: 'GET /health', state: 'GET /state', scene: 'GET /scene | POST /scene {"spec":{...}}',
        entities: 'GET /entities', console: 'GET /console?limit=50',
        run: 'POST /run', stop: 'POST /stop'
      }
    })
  }

  json(res, 404, { error: 'not found' })
}

function startServer(newPort) {
  return new Promise((resolve, reject) => {
    stopServer().catch(() => {})
    const srv = http.createServer((req, res) => {
      Promise.resolve(route(req, res)).catch(err => {
        try { json(res, 500, { error: String(err && err.message || err) }) } catch { /* socket gone */ }
      })
    })
    srv.on('error', reject)
    srv.listen(newPort, '127.0.0.1', () => {
      server = srv
      port = newPort
      startedAt = Date.now()
      resolve(port)
    })
  })
}

function stopServer() {
  return new Promise(resolve => {
    if (!server) return resolve()
    const s = server
    server = null
    s.close(() => resolve())
    s.closeAllConnections && s.closeAllConnections()
  })
}

module.exports = {
  state: state,
  setCommandSink,
  start: p => startServer(p || DEFAULT_PORT),
  stop: stopServer,
  isRunning: () => !!server,
  getPort: () => port
}
