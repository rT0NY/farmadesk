import { useState, useEffect } from 'react'

function esDispositivoMovil() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent
  const esMovilUA = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  const esTactil  = navigator.maxTouchPoints > 1
  return esMovilUA || esTactil
}

export function useDevice() {
  const [isMobile, setIsMobile] = useState(esDispositivoMovil)

  useEffect(() => {
    // Re-evaluar en cambios de orientación
    const handler = () => setIsMobile(esDispositivoMovil())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return { isMobile, isDesktop: !isMobile }
}
