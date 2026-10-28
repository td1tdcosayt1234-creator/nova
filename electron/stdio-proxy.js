#!/usr/bin/env node
/* ============ Nova Bridge — stdio proxy ============
   For MCP clients that only support stdio servers (Claude Desktop,
   Cursor, Kilo, OpenCode local configs...). Forwards JSON-RPC from
   stdin to the running Nova Engine bridge over HTTP.

   Claude Desktop config:
   { "mcpServers": { "nova-engine": { "command": "node",
       "args": ["<nova-engine path>\\electron\\stdio-proxy.js"] } } } */

const http = require('http')
const readline = require('readline')
const { DEFAULT_PORT } = require('./bridge-shared')

const BASE = `http://127.0.0.1:${DEFAULT_PORT}/mcp`

function postRpc(msg) {
  return new Promise(resolve => {
    const body = JSON.stringify(msg)
    const req = http.request(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), accept: 'application/json' }
    }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => { resolve({ status: res.statusCode, data }) })
    })
    req.on('error', err => resolve({ status: 0, data: String(err) }))
    req.end(body)
  })
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })

rl.on('line', async line => {
  const s = line.trim()
  if (!s) return
  let msg
  try { msg = JSON.parse(s) } catch { return }
  const r = await postRpc(msg)
  if (r.status === 202 || !r.data) return          // notification accepted, no reply
  try {
    if (msg.id !== undefined) {
      // pure JSON reply on its own line
      JSON.parse(r.data)
      process.stdout.write(r.data.replace(/\s+/g, ' ') + '\n')
    }
  } catch {
    if (msg.id !== undefined) {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0', id: msg.id, error: { code: -32700, message: 'bridge returned invalid JSON: ' + r.data.slice(0, 200) }
      }) + '\n')
    }
  }
})

rl.on('close', () => process.exit(0))

process.on('SIGINT', () => process.exit(0))
process.stderr.write(`nova-engine stdio proxy → ${BASE}\n`)
