const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Impresión ────────────────────────────────────────────────────────────────
  imprimirTicket:    (html) => ipcRenderer.invoke('imprimir-ticket', html),
  obtenerImpresoras: ()     => ipcRenderer.invoke('obtener-impresoras'),

  // ── Auto-actualizaciones ─────────────────────────────────────────────────────
  // Instala la actualización ya descargada y reinicia la app
  instalarActualizacion: () => ipcRenderer.invoke('update:quit-and-install'),

  // Suscribe a eventos del updater. Retorna un cleanup para el useEffect.
  onUpdateEvento: (callback) => {
    const canales = ['update:available', 'update:progress', 'update:downloaded']
    const handlers = canales.map(canal => {
      const fn = (_, payload) => callback(canal, payload)
      ipcRenderer.on(canal, fn)
      return { canal, fn }
    })
    return () => handlers.forEach(({ canal, fn }) => ipcRenderer.removeListener(canal, fn))
  },
})
