import { useEffect, useState } from 'react'

/**
 * Escucha los eventos de electron-updater enviados desde main.cjs via IPC.
 * Solo activo cuando la app corre dentro de Electron (window.electronAPI existe).
 *
 * Estados posibles:
 *   idle       → sin actividad (inicial)
 *   disponible → hay actualización, descargando en segundo plano
 *   descargando → con porcentaje de progreso
 *   lista      → descarga completa, lista para instalar
 */
export function useElectronUpdater() {
  const [estado,   setEstado]   = useState('idle')
  const [version,  setVersion]  = useState(null)
  const [progreso, setProgreso] = useState(0)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateEvento) return

    const cleanup = window.electronAPI.onUpdateEvento((canal, payload) => {
      if (canal === 'update:available') {
        setVersion(payload.version)
        setEstado('disponible')
        setProgreso(0)
      } else if (canal === 'update:progress') {
        setProgreso(payload.percent ?? 0)
        setEstado('descargando')
      } else if (canal === 'update:downloaded') {
        setVersion(payload.version)
        setEstado('lista')
        setProgreso(100)
      }
    })

    return cleanup
  }, [])

  function instalar() {
    window.electronAPI?.instalarActualizacion?.()
  }

  return { estado, version, progreso, instalar }
}
