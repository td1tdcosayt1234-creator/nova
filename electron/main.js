const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('node:fs')
const bridge = require('./bridge')
const { DEFAULT_PORT } = require('./bridge-shared')

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1080,
    minHeight: 700,
    title: 'Nova Engine',
    backgroundColor: '#0b0e14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  return win
}

/* ---------- Nova Bridge (local MCP + REST for AI agents) ---------- */

let bridgePort = DEFAULT_PORT
try { if (process.env.NOVA_BRIDGE_PORT) bridgePort = Number(process.env.NOVA_BRIDGE_PORT) || DEFAULT_PORT } catch { /* default */ }

bridge.setCommandSink(cmd => {
  if (!win || win.isDestroyed()) return { ok: false, error: 'window closed' }
  win.webContents.send('bridge:cmd', cmd)
  return { ok: true, note: `command "${cmd.type}" sent to the engine` }
})

async function startBridge() {
  try {
    const p = await bridge.start(bridgePort)
    console.log(`[nova-bridge] MCP+REST online → http://127.0.0.1:${p}/mcp`)
  } catch (err) {
    console.error('[nova-bridge] failed to start:', err)
  }
}

app.whenReady().then(() => {
  createWindow()
  startBridge()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* ---------- IPC: project files ---------- */

ipcMain.handle('nova:save', async (e, { name, content }) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showSaveDialog(w, {
      defaultPath: name || 'game.nova',
      filters: [{ name: 'Nova Project', extensions: ['nova'] }]
    })
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, content, 'utf8')
    return r.filePath
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('nova:open', async (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(w, {
      filters: [{ name: 'Nova Project', extensions: ['nova'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths.length) return null
    return {
      name: path.basename(r.filePaths[0]),
      content: fs.readFileSync(r.filePaths[0], 'utf8')
    }
  } catch (err) {
    return { error: String(err) }
  }
})

/* ---------- IPC: AI proxy (avoids renderer CORS entirely) ---------- */

ipcMain.handle('nova:ai', async (e, { url, headers, body }) => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(headers || {}) },
      body
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, text }
  } catch (err) {
    return { ok: false, status: 0, text: String(err) }
  }
})

/* ---------- IPC: Nova Bridge ---------- */

ipcMain.handle('nova:bridge:state', (e, state) => {
  bridge.state.inHome = !!state.inHome
  bridge.state.playing = !!state.playing
  bridge.state.paused = !!state.paused
  bridge.state.scene = state.scene || null
  bridge.state.entities = Array.isArray(state.entities) ? state.entities : []
  bridge.state.selection = state.selection || null
  bridge.state.console = Array.isArray(state.console) ? state.console.slice(-200) : []
  bridge.state.updated = Date.now()
  return { ok: true }
})

ipcMain.handle('nova:bridge:info', () => ({
  running: bridge.isRunning(),
  port: bridge.getPort(),
  mcpUrl: `http://127.0.0.1:${bridge.getPort()}/mcp`,
  appPath: app.getAppPath()
}))

ipcMain.handle('nova:bridge:setPort', async (e, port) => {
  const p = Math.max(1024, Math.min(65535, Number(port) || DEFAULT_PORT))
  bridgePort = p
  try {
    await bridge.start(p)
    return { ok: true, port: p, mcpUrl: `http://127.0.0.1:${p}/mcp` }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
})
