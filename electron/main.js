const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('node:fs')

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

app.whenReady().then(() => {
  createWindow()
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
