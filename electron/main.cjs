const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')

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
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
    backgroundColor: '#f8fafc',
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  return win
}

// ── Impresión via IPC ─────────────────────────────────────────────────────────

ipcMain.handle('obtener-impresoras', async () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return []
  try {
    return await win.webContents.getPrintersAsync()
  } catch {
    return []
  }
})

ipcMain.handle('imprimir-ticket', async (event, html) => {
  return new Promise((resolve) => {
    const tmpFile = path.join(os.tmpdir(), 'farmadesk-ticket.html')
    try {
      fs.writeFileSync(tmpFile, html, 'utf8')
    } catch (e) {
      resolve({ success: false, errorType: 'write_error' })
      return
    }

    const printWin = new BrowserWindow({
      show: false,
      width: 400,
      height: 700,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    })

    printWin.loadFile(tmpFile)
    printWin.webContents.once('did-finish-load', () => {
      printWin.webContents.print(
        { silent: false, printBackground: true, color: false },
        (success, errorType) => {
          printWin.destroy()
          resolve({ success, errorType: errorType || null })
        }
      )
    })
    printWin.on('closed', () => resolve({ success: false, errorType: 'cancelled' }))
  })
})

// ── Auto-actualizaciones ──────────────────────────────────────────────────────

// Broadcast a todas las ventanas del renderer
function emitirUpdate(canal, payload = {}) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(canal, payload)
  })
}

function configurarActualizaciones() {
  if (isDev) return
  try {
    const { autoUpdater } = require('electron-updater')

    autoUpdater.autoDownload         = true   // descarga silenciosa en segundo plano
    autoUpdater.autoInstallOnAppQuit = true   // instala al cerrar si el usuario difirió
    autoUpdater.allowDowngrade       = false  // nunca bajar de versión

    // Eventos → renderer (el banner en la UI reacciona a estos)
    autoUpdater.on('update-available', info => {
      emitirUpdate('update:available', { version: info.version })
    })

    autoUpdater.on('download-progress', progress => {
      emitirUpdate('update:progress', {
        percent:    Math.round(progress.percent),
        total:      progress.total,
        transferred: progress.transferred,
      })
    })

    autoUpdater.on('update-downloaded', info => {
      emitirUpdate('update:downloaded', { version: info.version })
    })

    autoUpdater.on('error', err => {
      console.error('[updater]', err?.message ?? err)
    })

    // Verificar al iniciar, luego cada 24 horas
    autoUpdater.checkForUpdates()
    setInterval(() => autoUpdater.checkForUpdates(), 24 * 60 * 60 * 1000)
  } catch (e) {
    console.error('[updater] electron-updater no disponible:', e?.message)
  }
}

// Instalar ahora desde el renderer (botón "Reiniciar" en el banner)
ipcMain.handle('update:quit-and-install', () => {
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall()
  } catch (e) {
    console.error('[updater] quitAndInstall falló:', e?.message)
  }
})

// ── Init ──────────────────────────────────────────────────────────────────────

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
