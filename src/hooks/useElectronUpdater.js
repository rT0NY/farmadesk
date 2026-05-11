import { useEffect, useState } from 'react'

export function useElectronUpdater() {
  const [estado,   setEstado]   = useState('idle')
  const [version,  setVersion]  = useState(null)
  const [progreso, setProgreso] = useState(0)

  useEffect(() => {
    if (!window.electronAPI?.onUpdateEvento) return

    function aplicarEvento(canal, payload) {
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
    }

    // Al montar, consultar el último evento que haya disparado el main process.
    // Resuelve el timing: si update:available llegó antes de que React montara,
    // el estado queda guardado en main y lo recuperamos aquí.
    window.electronAPI.estadoActual?.().then(ultimo => {
      if (ultimo?.canal) aplicarEvento(ultimo.canal, ultimo.payload)
    })

    // Escuchar eventos futuros (descargas en progreso, completadas)
    const cleanup = window.electronAPI.onUpdateEvento((canal, payload) => {
      aplicarEvento(canal, payload)
    })

    return cleanup
  }, [])

  function instalar() {
    window.electronAPI?.instalarActualizacion?.()
  }

  return { estado, version, progreso, instalar }
}
