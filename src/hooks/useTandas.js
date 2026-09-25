import { useEffect, useRef, useState } from 'react'

/**
 * Pinta una lista larga por tandas: primero `tanda` renglones, y otros tantos
 * cada vez que el renglón centinela del final se acerca a la vista.
 *
 * Con 2,900 productos, pintarlos todos de golpe eran más de 100 mil elementos
 * en la página y varios segundos de congelamiento al entrar, al escribir en el
 * buscador y sobre todo al borrarlo, que volvía a construir la lista entera.
 *
 * `clave` resume los filtros: cuando cambia se vuelve a la primera tanda. Si
 * solo cambian los datos (un renglón actualizado) se conserva lo que el
 * usuario ya había desplegado.
 *
 * Poner `centinelaRef` en un elemento que se pinte solo cuando `hayMas`.
 */
export function useTandas(lista, clave, tanda = 50) {
  const [estado, setEstado] = useState({ clave, n: tanda })
  const n = estado.clave === clave ? estado.n : tanda

  const visibles = lista.length > n ? lista.slice(0, n) : lista
  const hayMas   = n < lista.length
  const centinelaRef = useRef(null)

  useEffect(() => {
    const el = centinelaRef.current
    if (!el || !hayMas) return
    // El margen empieza a pintar la siguiente tanda un poco antes de llegar al
    // final, para que al deslizar no se note el corte.
    const obs = new IntersectionObserver(entradas => {
      if (entradas.some(e => e.isIntersecting)) {
        setEstado(prev => ({ clave, n: (prev.clave === clave ? prev.n : tanda) + tanda }))
      }
    }, { rootMargin: '0px 0px 600px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [clave, n, hayMas, tanda])

  return { visibles, hayMas, total: lista.length, centinelaRef }
}
