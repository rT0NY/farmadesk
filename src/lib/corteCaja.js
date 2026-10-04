import { escapeHtml, formatoMoneda } from '@/lib/formatos'

// Piezas compartidas por los dos cortes de caja: el de Ventas (antes de cerrar)
// y el de Caja (al cerrar y al reimprimir). Antes cada uno armaba su lista por
// su lado y los dos mostraban el folio de cada venta —CEN-000215— en lugar de
// lo que se vendió.
//
// Las ventas deben venir con su detalle:
//   .select('..., detalle_ventas(cantidad, precio_unitario, productos(nombre))')

const hora = (s) => new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

/** "PARACETAMOL 500 MG ×2, CUBREBOCAS" — para mostrar una venta en pantalla. */
export function nombresVenta(detalles) {
  return (detalles || [])
    .map(d => `${d.productos?.nombre ?? 'Producto'}${Number(d.cantidad) > 1 ? ` ×${d.cantidad}` : ''}`)
    .join(', ')
}

export function unidadesVenta(detalles) {
  return (detalles || []).reduce((s, d) => s + Number(d.cantidad || 0), 0)
}

// Estilos que necesita la tabla, para agregarlos al <style> del ticket. Solo
// negro (impresora térmica). Una línea punteada cierra cada venta para que sus
// productos se lean juntos.
export const ESTILOS_PRODUCTOS_VENDIDOS =
  '.prod td{vertical-align:top}' +
  '.prod td:first-child{white-space:nowrap;padding-right:4px}' +
  '.prod .c{text-align:center}' +
  '.prod .r{text-align:right;white-space:nowrap}' +
  '.prod tr.fin td{border-bottom:1px dotted #000;padding-bottom:3px}' +
  '.prod tr.fin:last-child td{border-bottom:none}'

/**
 * Tabla "Productos vendidos" del ticket del corte: un renglón por producto, en
 * el orden en que se vendieron. La hora va en el primero de cada venta, y si no
 * se pagó en efectivo se indica (`formaPago(venta)` devuelve '' para efectivo).
 */
export function tablaProductosVendidos(ventas, formaPago = () => '') {
  if (!ventas.length) return '<p style="font-size:11px">Sin ventas</p>'
  const filas = ventas.map(v => {
    const pago = formaPago(v)
    const etiquetaPago = pago ? ` <b>· ${escapeHtml(pago)}</b>` : ''
    const items = v.detalle_ventas || []
    if (!items.length) {
      // Sin detalle no hay productos que nombrar: queda el total de la venta
      return `<tr class="fin"><td>${hora(v.creado_en)}</td><td>Venta${etiquetaPago}</td><td class="c">—</td><td class="r">${formatoMoneda(v.total)}</td></tr>`
    }
    return items.map((d, i) =>
      `<tr${i === items.length - 1 ? ' class="fin"' : ''}>` +
      `<td>${i === 0 ? hora(v.creado_en) : ''}</td>` +
      `<td>${escapeHtml(d.productos?.nombre ?? 'Producto')}${i === 0 ? etiquetaPago : ''}</td>` +
      `<td class="c">${d.cantidad}</td>` +
      `<td class="r">${formatoMoneda(Number(d.cantidad) * Number(d.precio_unitario))}</td></tr>`
    ).join('')
  }).join('')
  return `<table class="prod"><thead><tr><th>Hora</th><th>Producto</th><th class="c">Cant</th><th class="r">Total</th></tr></thead><tbody>${filas}</tbody></table>`
}
