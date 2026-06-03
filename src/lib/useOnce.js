import { useRef } from 'react'

/**
 * Devuelve una función `once(asyncFn)` que envuelve cualquier handler async
 * garantizando que solo se ejecuta una vez a la vez, sin importar cuántos
 * clicks lleguen antes del primer re-render.
 *
 * Uso:
 *   const once = useOnce()
 *   const guardar = once(async () => { ... })
 *
 * Compatible con el patrón useState existente — el estado de loading sigue
 * usándose para la UI; el ref añade la barrera síncrona real.
 */
export function useOnce() {
  const inFlight = useRef(false)
  return function once(asyncFn) {
    return async function (...args) {
      if (inFlight.current) return
      inFlight.current = true
      try {
        return await asyncFn(...args)
      } finally {
        inFlight.current = false
      }
    }
  }
}
