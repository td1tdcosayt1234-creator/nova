const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nova', {
  isDesktop: true,
  save: (name, content) => ipcRenderer.invoke('nova:save', { name, content }),
  open: () => ipcRenderer.invoke('nova:open'),
  aiFetch: (req) => ipcRenderer.invoke('nova:ai', req)
})
