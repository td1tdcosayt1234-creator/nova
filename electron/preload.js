const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nova', {
  isDesktop: true,
  save: (name, content) => ipcRenderer.invoke('nova:save', { name, content }),
  open: () => ipcRenderer.invoke('nova:open'),
  aiFetch: (req) => ipcRenderer.invoke('nova:ai', req),
  /* Nova Bridge (AI agents) */
  pushBridgeState: (state) => ipcRenderer.invoke('nova:bridge:state', state),
  bridgeInfo: () => ipcRenderer.invoke('nova:bridge:info'),
  setBridgePort: (port) => ipcRenderer.invoke('nova:bridge:setPort', port),
  onBridgeCommand: (cb) => ipcRenderer.on('bridge:cmd', (e, cmd) => { try { cb(cmd) } catch { /* guard */ } })
})
