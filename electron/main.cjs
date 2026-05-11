const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require('electron')
const path   = require('path')
const fs     = require('fs')
const os     = require('os')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Log a archivo (para diagnosticar el updater en producción) ───────────────
function logUpdater(msg) {
  try {
    const logPath = path.join(app.getPath('userData'), 'updater.log')
    const linea   = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(logPath, linea, 'utf8')
  } catch { /* sin errores en el log */ }
}

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

let ultimoEvento = null

function emitirUpdate(canal, payload = {}) {
  ultimoEvento = { canal, payload }
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(canal, payload)
  })
}

function configurarActualizaciones() {
  if (isDev) return

  logUpdater(`=== Farmadesk ${app.getVersion()} iniciando updater ===`)

  try {
    const { autoUpdater } = require('electron-updater')

    autoUpdater.autoDownload         = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowDowngrade       = false
    autoUpdater.logger               = {
      info:  msg => logUpdater(`[info]  ${msg}`),
      warn:  msg => logUpdater(`[warn]  ${msg}`),
      error: msg => logUpdater(`[error] ${msg}`),
      debug: msg => {},  // demasiado verboso
    }

    autoUpdater.on('checking-for-update', () => {
      logUpdater('Verificando actualizaciones...')
    })

    autoUpdater.on('update-available', info => {
      logUpdater(`Actualización disponible: ${info.version}`)
      emitirUpdate('update:available', { version: info.version })
    })

    autoUpdater.on('update-not-available', info => {
      logUpdater(`Sin actualización. Versión actual: ${app.getVersion()}, última: ${info.version}`)
    })

    autoUpdater.on('download-progress', progress => {
      logUpdater(`Descargando: ${Math.round(progress.percent)}%`)
      emitirUpdate('update:progress', {
        percent:     Math.round(progress.percent),
        total:       progress.total,
        transferred: progress.transferred,
      })
    })

    autoUpdater.on('update-downloaded', info => {
      logUpdater(`Descarga completa: ${info.version}`)
      emitirUpdate('update:downloaded', { version: info.version })
    })

    autoUpdater.on('error', err => {
      logUpdater(`ERROR: ${err?.message ?? String(err)}`)
    })

    logUpdater('Esperando 8s para que el renderer monte...')
    setTimeout(() => {
      logUpdater('Lanzando checkForUpdates()')
      autoUpdater.checkForUpdates()
      setInterval(() => {
        logUpdater('Check periódico (24h)')
        autoUpdater.checkForUpdates()
      }, 24 * 60 * 60 * 1000)
    }, 8000)

  } catch (e) {
    logUpdater(`EXCEPCIÓN: ${e?.message ?? String(e)}`)
  }
}

ipcMain.handle('update:estado-actual', () => ultimoEvento)

// Leer el log del updater desde el renderer (para diagnóstico)
ipcMain.handle('update:leer-log', () => {
  try {
    const logPath = path.join(app.getPath('userData'), 'updater.log')
    if (!fs.existsSync(logPath)) return '(sin log aún)'
    return fs.readFileSync(logPath, 'utf8').split('\n').slice(-30).join('\n')
  } catch (e) {
    return `Error leyendo log: ${e.message}`
  }
})

ipcMain.handle('update:quit-and-install', () => {
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.quitAndInstall()
  } catch (e) {
    logUpdater(`quitAndInstall error: ${e?.message}`)
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
