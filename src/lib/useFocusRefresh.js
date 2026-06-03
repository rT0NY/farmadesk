import { useEffect, useRef } from 'react'

/**
 * Reemplaza el patrón window.addEventListener('focus', cargar) con un cooldown.
 * Solo dispara el callback si los datos tienen más de `cooldownMs` milisegundos.
 *
 * Usa un ref interno para el callback, por lo que funciona con funciones inline
 * (e.g. () => cargar(0)) sin necesitar useCallback extra.
 *
 * Uso:
 *   useFocusRefresh(cargar)               // cooldown por defecto: 5 min
 *   useFocusRefresh(() => cargar(0))      // callback con argumento
 *   useFocusRefresh(fetchData, 3 * 60_000) // cooldown personalizado
 */
export function useFocusRefresh(callback, cooldownMs = 5 * 60_000) {
  const lastFreshRef  = useRef(Date.now())
  const callbackRef   = useRef(callback)
  callbackRef.current = callback            // Siempre apunta al callback más reciente

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFreshRef.current < cooldownMs) return
      lastFreshRef.current = Date.now()
      callbackRef.current()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [cooldownMs])                          // Solo re-registra si cambia el cooldown
}
