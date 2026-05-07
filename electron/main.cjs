const { app, BrowserWindow, shell, Menu, dialog } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function crearVentana() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '../public/logo.png'),
    title: 'Farmadesk',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    backgroundColor: '#f8fafc',
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

// ── Auto-actualizaciones (solo en producción) ─────────────────────────────────
function configurarActualizaciones() {
  if (isDev) return
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload    = true   // descarga en segundo plano
    autoUpdater.autoInstallOnAppQuit = true // instala al cerrar si no eligió reiniciar

    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type:    'info',
        title:   'Actualización lista',
        message: 'Se descargó una nueva versión de Farmadesk.',
        detail:  'Reinicia la aplicación para aplicar la actualización.',
        buttons: ['Reiniciar ahora', 'Más tarde'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.on('error', (err) => {
      console.error('Error al buscar actualizaciones:', err?.message ?? err)
    })

    // Verificar al iniciar y cada 4 horas
    autoUpdater.checkForUpdates()
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
  } catch (e) {
    console.error('electron-updater no disponible:', e?.message)
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  crearVentana()
  configurarActualizaciones()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
