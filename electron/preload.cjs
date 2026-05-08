const { contextBridge, ipcRenderer } = require('electron')

// Expone funciones seguras al renderer (VentasPage, etc.)
contextBridge.exposeInMainWorld('electronAPI', {
  imprimirTicket:    (html) => ipcRenderer.invoke('imprimir-ticket', html),
  obtenerImpresoras: ()     => ipcRenderer.invoke('obtener-impresoras'),
})
