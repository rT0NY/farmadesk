import { useState, useEffect } from 'react'
import { estadoRed, suscribirRed } from '@/lib/latencia'

/**
 * Estado de la conexión, medido de forma PASIVA.
 *
 * Antes este hook lanzaba una consulta a Supabase cada 30 s solo para
 * cronometrarla. Esa consulta se sumaba a la carga de la app y, si caía junto a
 * una ráfaga de peticiones, medía la cola propia en vez de la red — por eso el
 * indicador se degradaba con el uso y "se arreglaba" al recargar.
 *
 * Ahora el dato sale de las peticiones que la app ya hace (ver lib/latencia.js).
 * Cero tráfico adicional.
 */
export function useConexion() {
  const [online, setOnline] = useState(navigator.onLine)
  const [red,    setRed]    = useState(estadoRed)

  useEffect(() => {
    const handleOnline  = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    const desuscribir = suscribirRed(setRed)
    setRed(estadoRed())

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
      desuscribir()
    }
  }, [])

  // "Conectado al router pero sin internet": el SO dice online pero Supabase
  // lleva varias peticiones seguidas fallando.
  const hayInternet = online && !red.caida
  const latencia = hayInternet ? red.latencia : null

  const calidad = !hayInternet   ? 'sin_conexion'
    : latencia === null          ? 'midiendo'
    : latencia < 200             ? 'excelente'
    : latencia < 600             ? 'buena'
    : latencia < 1500            ? 'lenta'
    :                              'muy_lenta'

  return { online: hayInternet, latencia, calidad }
}
