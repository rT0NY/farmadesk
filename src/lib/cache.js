import { queryClient } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'

// Consultas cacheadas que muestran existencias. Se invalidan por prefijo, así que
// no hace falta conocer el empresa_id que llevan como segundo elemento.
const CLAVES_STOCK = [['inventario_completo'], ['productos']]

// Catálogo del buscador de "Agregar inventario". No muestra existencias, pero
// sí nombres, precios y códigos: sin marcarlo, un producto recién creado no
// aparecía ahí hasta que vencían sus 10 minutos de caché.
const CLAVES_CATALOGO = [['inv_productos'], ['inv_codigos']]

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

/** Lo mismo para el catálogo del buscador. Llamar al crear, editar o archivar productos. */
export function invalidarCatalogo() {
  CLAVES_CATALOGO.forEach(queryKey => queryClient.invalidateQueries({ queryKey }))
}

// ─── Actualizar renglones sueltos ─────────────────────────────────────────────
// Recargar la lista entera después de cada alta de stock o de cada producto
// editado obligaba al servidor a recalcular los 2,400 productos para cambiar
// uno. Aquí se piden solo los renglones afectados, con la MISMA función y los
// mismos argumentos que usa la página: un renglón pedido aparte sale idéntico
// al que traería la lista completa.
//
// Ante cualquier duda —la consulta falla, la lista se está recargando en ese
// momento, son demasiados productos— se cae a la recarga completa de siempre.

const LISTAS = [
  {
    clave:  ['inventario_completo'],
    rpc:    'inventario_completo',
    args:   { p_solo_con_stock: false, p_solo_bajo_stock: false },
    id:     'producto_id',
    nombre: 'producto_nombre',
  },
  {
    clave:  ['productos'],
    rpc:    'listar_productos_completo',
    args:   { p_solo_activos: true },
    id:     'id',
    nombre: 'nombre',
  },
]

// Arriba de esto sale más a cuenta recargar la lista completa.
const TOPE_RENGLONES = 50

// Dos altas seguidas del mismo producto pueden responder en desorden. Cada
// pedido lleva un número y solo el último de cada producto se aplica: si no,
// la respuesta vieja pisaría a la nueva.
const turnos = new Map()
let ultimoTurno = 0

// Un lote nunca cambia de producto, así que la traducción se guarda.
const productoDeLote = new Map()

const consultasDe = (clave) => queryClient.getQueryCache().findAll({ queryKey: clave })

// Solo se parcha una lista en reposo. Si se está recargando, o su última carga
// falló, se le deja la recarga completa: parcharla podría quedar debajo de una
// respuesta más vieja, o esconder el error.
const enReposo = (q) =>
  q.state.status === 'success' && q.state.fetchStatus === 'idle' && !q.state.isInvalidated

const recargar = (q) => queryClient.invalidateQueries({ queryKey: q.queryKey, exact: true })

// Coloca `fila` en orden alfabético. La lista llega ordenada por el servidor.
function insertarPorNombre(lista, fila, nombre) {
  const n = fila[nombre] ?? ''
  const i = lista.findIndex(p => (p[nombre] ?? '').localeCompare(n) > 0)
  if (i === -1) lista.push(fila)
  else lista.splice(i, 0, fila)
}

// Reemplaza en `prev` los renglones de `vigentes` por los que mandó el servidor.
// Un producto pedido que no volvió ya no pertenece a la lista (se archivó) y se
// quita. Si el nombre no cambió se queda en su lugar; si cambió, o es nuevo,
// se acomoda por orden alfabético.
function aplicarRenglones(prev, filas, vigentes, { id, nombre }) {
  if (!Array.isArray(prev)) return prev
  const nuevas = new Map()
  for (const f of filas) if (vigentes.has(f[id])) nuevas.set(f[id], f)

  const lista = []
  const porAcomodar = []
  for (const p of prev) {
    if (!vigentes.has(p[id])) { lista.push(p); continue }
    const f = nuevas.get(p[id])
    nuevas.delete(p[id])
    if (!f) continue
    if (f[nombre] === p[nombre]) lista.push(f)
    else porAcomodar.push(f)
  }
  porAcomodar.push(...nuevas.values())
  for (const f of porAcomodar) insertarPorNombre(lista, f, nombre)
  return lista
}

// El catálogo del buscador se arma con los mismos datos del renglón de
// Productos, así que se actualiza sin otra consulta.
function aplicarCatalogo(filas, vigentes) {
  const porId = new Map()
  for (const f of filas) if (vigentes.has(f.id)) porId.set(f.id, f)

  for (const q of consultasDe(['inv_productos'])) {
    if (!enReposo(q)) { recargar(q); continue }
    queryClient.setQueryData(q.queryKey, prev => {
      if (!Array.isArray(prev)) return prev
      const lista = prev.filter(p => !vigentes.has(p.id))
      for (const f of porId.values()) {
        insertarPorNombre(lista, {
          id: f.id, nombre: f.nombre, categoria: f.categoria,
          precio_venta: f.precio_venta, precio_compra: f.precio_compra,
        }, 'nombre')
      }
      return lista
    }, { updatedAt: q.state.dataUpdatedAt })
  }

  for (const q of consultasDe(['inv_codigos'])) {
    if (!enReposo(q)) { recargar(q); continue }
    queryClient.setQueryData(q.queryKey, prev => {
      if (!Array.isArray(prev)) return prev
      // Solo se tocan los códigos de productos que siguen activos. Los de uno
      // archivado siguen en la base, y el escáner los necesita para avisar que
      // el código ya está ocupado.
      const lista = prev.filter(c => !porId.has(c.producto_id))
      for (const f of porId.values()) {
        for (const codigo of f.codigos || []) lista.push({ producto_id: f.id, codigo })
      }
      return lista
    }, { updatedAt: q.state.dataUpdatedAt })
  }
}

/**
 * Actualiza en memoria solo los productos indicados, en vez de recargar las
 * listas completas. Usar después de un cambio que afecta productos conocidos:
 * guardar un producto, dar de alta stock.
 *
 * Una lista que está en pantalla recibe sus renglones nuevos. Una que no está
 * en pantalla solo se marca como vieja, igual que con `invalidarStock`: se
 * recarga completa la próxima vez que se abra su página.
 *
 * `catalogo: true` además actualiza el buscador de "Agregar inventario". Pasarlo
 * cuando cambió el producto en sí (nombre, precios, códigos), no solo su stock.
 */
export async function actualizarProductos(ids, { catalogo = false } = {}) {
  const unicos = [...new Set((ids || []).filter(Boolean))]
  if (!unicos.length || unicos.length > TOPE_RENGLONES) {
    invalidarStock()
    if (catalogo) invalidarCatalogo()
    return
  }

  let catalogoListo = false

  await Promise.all(LISTAS.map(async (lista) => {
    const consultas = consultasDe(lista.clave)
    const activas = consultas.filter(q => q.isActive())
    consultas.filter(q => !q.isActive()).forEach(recargar)
    if (!activas.length) return

    const turno = ++ultimoTurno
    unicos.forEach(id => turnos.set(lista.rpc + id, turno))

    try {
      const { data, error } = await supabase.rpc(lista.rpc, { ...lista.args, p_producto_ids: unicos })
      if (error) throw error
      const filas = Array.isArray(data) ? data : []

      const vigentes = new Set(unicos.filter(id => turnos.get(lista.rpc + id) === turno))
      if (!vigentes.size) return

      for (const q of activas) {
        if (!enReposo(q)) { recargar(q); continue }
        // `updatedAt` conserva la hora de la última carga completa. Así la
        // lista se sigue refrescando entera cuando le toca, y con ella llegan
        // los cambios que hicieron otras terminales.
        queryClient.setQueryData(q.queryKey,
          prev => aplicarRenglones(prev, filas, vigentes, lista),
          { updatedAt: q.state.dataUpdatedAt })
      }

      if (catalogo && lista.rpc === 'listar_productos_completo') {
        aplicarCatalogo(filas, vigentes)
        catalogoListo = true
      }
    } catch (e) {
      console.error(`Renglones de ${lista.rpc}:`, e)
      activas.forEach(recargar)
    }
  }))

  // Sin el renglón de Productos a la mano no hay con qué parchar el catálogo.
  if (catalogo && !catalogoListo) invalidarCatalogo()
}

/**
 * Como `actualizarProductos`, pero a partir de lotes: es lo único que traen los
 * avisos de Realtime sobre `inventario`. Si nada que muestre stock está en
 * pantalla no se consulta nada; solo se marca viejo.
 */
export async function actualizarStockDeLotes(loteIds) {
  const unicos = [...new Set((loteIds || []).filter(Boolean))]
  const enPantalla = LISTAS.some(l => consultasDe(l.clave).some(q => q.isActive()))
  if (!unicos.length || unicos.length > TOPE_RENGLONES || !enPantalla) {
    invalidarStock()
    return
  }

  try {
    const faltan = unicos.filter(id => !productoDeLote.has(id))
    if (faltan.length) {
      const { data, error } = await supabase.from('lotes').select('id, producto_id').in('id', faltan)
      if (error) throw error
      for (const l of data || []) productoDeLote.set(l.id, l.producto_id)
    }
    const ids = unicos.map(id => productoDeLote.get(id))
    // Un lote que no se pudo traducir: mejor recargar todo que dejar un hueco
    if (ids.some(id => !id)) { invalidarStock(); return }
    await actualizarProductos(ids)
  } catch (e) {
    console.error('Stock por lotes:', e)
    invalidarStock()
  }
}
