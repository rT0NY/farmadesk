/**
 * Reglas que comparten el ingreso masivo y la edición masiva.
 *
 * Van aquí y no duplicadas en cada ventana a propósito: son la misma regla de
 * negocio, y si mañana cambia una tiene que cambiar en los dos lados.
 * Duplicarlas es cómo se desincronizan sin que nadie lo note.
 *
 * Separadas de `piezasMasivas.jsx` porque un archivo que exporta componentes
 * no debe exportar además constantes: rompe la recarga en caliente de Vite.
 */

// Tope por tanda. No es una limitación técnica: es para que una conexión caída
// no se lleve una captura larga, y para que revisar antes de guardar siga
// siendo manejable.
export const MAX_FILAS = 50

// Utilidad y precio de venta son dos caras del mismo dato: se escribe uno y el
// otro se completa solo, igual que en el alta de uno en uno. Allá vive en un
// efecto; aquí se calcula al vuelo dentro del cambio, que evita el rebote de un
// render intermedio con el valor viejo en pantalla.
export function emparejarPrecios(f, campo) {
  const pc = Number(f.precio_compra) || 0
  if (pc <= 0) return f

  const redondear = (n) => (Math.round(n * 100) / 100).toFixed(2)

  if (campo === 'utilidad') {
    const util = Number(f.utilidad) || 0
    return util > 0 ? { ...f, precio_venta: redondear(pc * (1 + util / 100)) } : f
  }

  if (campo === 'precio_venta') {
    const pv = Number(f.precio_venta) || 0
    return pv > 0 ? { ...f, utilidad: redondear(((pv - pc) / pc) * 100) } : f
  }

  if (campo === 'precio_compra') {
    // Al mover el costo manda la utilidad si ya estaba puesta; si no, se
    // recalcula ella a partir del precio de venta que el usuario ya escribió.
    const util = Number(f.utilidad) || 0
    if (util > 0) return { ...f, precio_venta: redondear(pc * (1 + util / 100)) }
    const pv = Number(f.precio_venta) || 0
    if (pv > 0)   return { ...f, utilidad: redondear(((pv - pc) / pc) * 100) }
  }

  return f
}
