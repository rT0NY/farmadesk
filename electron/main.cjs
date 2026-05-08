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
    // Solo abrir en navegador externo URLs reales — nunca URLs vacías o about:
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

// Devuelve lista de impresoras instaladas en el sistema
ipcMain.handle('obtener-impresoras', async () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return []
  try {
    return await win.webContents.getPrintersAsync()
  } catch {
    return []
  }
})

// Imprime un ticket HTML usando el diálogo nativo de Windows
ipcMain.handle('imprimir-ticket', async (event, html) => {
  return new Promise((resolve) => {
    // Escribe el HTML en un archivo temporal para cargarlo sin límites de URL
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
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
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

    // Si el usuario cierra la ventana antes de imprimir
    printWin.on('closed', () => resolve({ success: false, errorType: 'cancelled' }))
  })
})

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
