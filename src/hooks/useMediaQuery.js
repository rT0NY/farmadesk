import { useCallback, useSyncExternalStore } from 'react'

// Los mismos cortes que usa Tailwind (v4): con estos valores el hook y las
// clases `sm:` / `md:` cambian exactamente en el mismo ancho.
export const DESDE_SM = '(min-width: 40rem)'
export const DESDE_MD = '(min-width: 48rem)'

/**
 * `true` mientras la ventana cumpla la media query, y se actualiza al cambiar
 * de tamaño. Sirve para construir solo la versión que se ve —tabla o tarjetas—
 * en vez de construir las dos y esconder una con CSS: escondida o no, cada fila
 * se armaba igual y costaba lo mismo.
 *
 * No confundir con `useDevice`, que decide por tipo de aparato (una laptop
 * táctil sale como móvil). Este decide por ancho, igual que las clases de CSS.
 */
export function useMediaQuery(query) {
  const suscribir = useCallback((avisar) => {
    const mq = window.matchMedia(query)
    if (mq.addEventListener) {
      mq.addEventListener('change', avisar)
      return () => mq.removeEventListener('change', avisar)
    }
    // Safari anterior a 14
    mq.addListener(avisar)
    return () => mq.removeListener(avisar)
  }, [query])

  return useSyncExternalStore(suscribir, () => window.matchMedia(query).matches, () => false)
}
