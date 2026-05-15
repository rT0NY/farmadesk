import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Mide latencia haciendo un query ligero a Supabase
// Retorna ms si hay conexión real, null si falla (incluye "conectado al router sin internet")
async function medirLatencia() {
  const t0 = performance.now()
  try {
    const { error } = await supabase.from('sucursales').select('id').limit(1)
    if (error) return null
    return Math.round(performance.now() - t0)
  } catch {
    return null
  }
}

export function useConexion() {
  const [online,   setOnline]   = useState(navigator.onLine)
  const [latencia, setLatencia] = useState(null) // ms o null si no se midió

  const medir = useCallback(async () => {
    if (!navigator.onLine) { setLatencia(null); return }
    const ms = await medirLatencia()
    setLatencia(ms)
  }, [])

  useEffect(() => {
    const handleOnline  = () => { setOnline(true);  medir() }
    const handleOffline = () => { setOnline(false); setLatencia(null) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    // Medir al montar y cada 30 segundos
    medir()
    const intervalo = setInterval(medir, 30_000)

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalo)
    }
  }, [medir])

  const calidad = !online      ? 'sin_conexion'
    : latencia === null        ? 'midiendo'
    : latencia < 200           ? 'excelente'
    : latencia < 600           ? 'buena'
    : latencia < 1500          ? 'lenta'
    :                            'muy_lenta'

  return { online, latencia, calidad }
}
