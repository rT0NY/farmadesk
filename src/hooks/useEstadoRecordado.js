import { useEffect, useState } from 'react'

// Vive mientras la app esté abierta. Se borra al recargar o cerrar, a propósito:
// los filtros sirven para seguir donde uno se quedó, no para aparecer días
// después sin que nadie recuerde haberlos puesto.
const memoria = new Map()

/**
 * Como `useState`, pero el valor sobrevive a cambiar de sección. Al salir de
 * Productos la página se desmonta y sus filtros volvían a "Todos"; con esto,
 * al regresar siguen como se dejaron.
 *
 * `clave` debe ser única por página y por filtro, p. ej. 'productos.estado'.
 */
export function useEstadoRecordado(clave, inicial) {
  const [valor, setValor] = useState(() => (memoria.has(clave) ? memoria.get(clave) : inicial))
  useEffect(() => { memoria.set(clave, valor) }, [clave, valor])
  return [valor, setValor]
}
