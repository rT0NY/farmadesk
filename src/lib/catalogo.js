import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginado'

// Catálogo y existencias compartidos entre pantallas. Cada consulta vive UNA vez
// en la memoria de la app (React Query): la que abre primero la pide y las demás
// la reutilizan. Son las mismas claves que cache.js invalida y parcha
// (invalidarStock, invalidarCatalogo, actualizarProductos), así que un producto
// editado o un movimiento de stock llega a todas las pantallas que la usan.
//
// Antes cada pantalla bajaba su propia copia: abrir "Nueva transferencia"
// pedía otra vez los 2,400 productos, todos los lotes y todo el inventario,
// aunque Inventario los acabara de traer.

/** Elimina caracteres de control (prefijos AIM de los escáneres), espacios y mayúsculas. */
// eslint-disable-next-line no-control-regex
export const normalizarCodigo = (s) => (s || '').replace(/[\x00-\x1f\x7f]/g, '').trim().toUpperCase()

/** Productos activos con precios, en orden alfabético. Lo usan Agregar inventario y Transferencias. */
export function useCatalogoProductos(empresaId, activo = true) {
  return useQuery({
    queryKey: ['inv_productos', empresaId],
    queryFn: async () => {
      // precio_compra alimenta el "valor estimado" de Agregar inventario. Solo
      // entran admin y encargado a las pantallas que usan este catálogo.
      const filas = await traerTodo(() => supabase.from('productos'),
        'id, nombre, categoria, precio_venta, precio_compra', q => q.eq('activo', true))
      // El orden alfabético se aplica aquí: la consulta pagina por id, que es
      // lo único único y estable.
      return filas.sort((a, b) => a.nombre.localeCompare(b.nombre))
    },
    enabled: activo && !!empresaId,
    staleTime: 10 * 60_000,
  })
}

/** Todos los códigos de barras. Por tandas: ya pasan de mil. */
export function useCatalogoCodigos(empresaId, activo = true) {
  return useQuery({
    queryKey: ['inv_codigos', empresaId],
    queryFn: () => traerTodo(() => supabase.from('codigos_barras'),
      'id, producto_id, codigo'),
    enabled: activo && !!empresaId,
    staleTime: 10 * 60_000,
  })
}

/**
 * Existencias de todos los productos: total y por sucursal, en UNA petición
 * (la función devuelve jsonb). La usan Inventario y Transferencias.
 */
export function useInventarioCompleto(empresaId, activo = true) {
  return useQuery({
    queryKey:  ['inventario_completo', empresaId],
    queryFn:   async () => {
      const { data, error } = await supabase.rpc('inventario_completo', {
        p_solo_con_stock:  false,
        p_solo_bajo_stock: false,
      })
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60_000,   // inventario cambia con cada venta — 5 min es razonable
    enabled:   activo && !!empresaId,
  })
}
