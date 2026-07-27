import { queryClient } from '@/lib/queryClient'

// Consultas cacheadas que muestran existencias. Se invalidan por prefijo, así que
// no hace falta conocer el empresa_id que llevan como segundo elemento.
const CLAVES_STOCK = [['inventario_completo'], ['productos']]

/**
 * Marca como obsoleto el inventario en caché. Llamar después de CUALQUIER
 * movimiento de stock (venta, transferencia, recepción de pedido, ajuste,
 * baja de lote, cancelación de venta).
 *
 * Si la página de Inventario está montada se refresca al instante; si no, se
 * refresca sola la próxima vez que se entre. Sin esto las cantidades se quedan
 * congeladas hasta que vence el staleTime o se reinicia la app.
 */
export function invalidarStock() {
  CLAVES_STOCK.forEach(queryKey => queryClient.invalidateQueries({ queryKey }))
}
