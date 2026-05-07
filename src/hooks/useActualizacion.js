import { useEffect, useState } from 'react'

// __APP_VERSION__ es inyectado por vite.config.js en tiempo de build.
// En dev siempre coincide con public/version.json → sin falsas alertas.
const VERSION_ACTUAL = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null
const INTERVALO_MS   = 10 * 60 * 1000 // cada 10 minutos

export function useActualizacion() {
  const [hayActualizacion, setHayActualizacion] = useState(false)

  useEffect(() => {
    if (!VERSION_ACTUAL) return

    const check = async () => {
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!res.ok) return
        const { v } = await res.json()
        if (v && v !== VERSION_ACTUAL) setHayActualizacion(true)
      } catch {
        // Sin conexión o error de red — ignorar silenciosamente
      }
    }

    check()
    const id = setInterval(check, INTERVALO_MS)
    return () => clearInterval(id)
  }, [])

  return hayActualizacion
}
