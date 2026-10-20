import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Plus, X, Search, ArrowRight, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCatalogoProductos, useCatalogoCodigos, useInventarioCompleto, normalizarCodigo } from '@/lib/catalogo'
import { useMediaQuery, DESDE_SM } from '@/hooks/useMediaQuery'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Fab } from '@/components/ui/Fab'
import { formatoFecha, fechaEnZona } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { invalidarStock } from '@/lib/cache'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

// Una fecha sin hora la interpreta el navegador como medianoche UTC, que en
// México cae el día anterior: ya entrada la tarde el lote aparecía con un día
// menos de vida. Anclar los dos extremos al mediodía UTC borra el desfase sin
// depender del huso horario del equipo.
function diasRestantes(fecha) {
  if (!fecha) return 9999
  const corte = new Date(`${fechaEnZona()}T12:00:00Z`)
  const vence = new Date(SOLO_FECHA.test(fecha) ? `${fecha}T12:00:00Z` : fecha)
  return Math.round((vence - corte) / 86400000)
}

function estadoCaducidad(dias) {
  if (dias < 0)   return { label: 'Vencido',   clase: 'bg-red-100 text-red-700 border-red-200' }
  if (dias < 30)  return { label: `${dias}d`,   clase: 'bg-red-100 text-red-700 border-red-200' }
  if (dias < 90)  return { label: `${dias}d`,   clase: 'bg-amber-100 text-amber-700 border-amber-200' }
  return           { label: 'OK',               clase: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

const PALETA = [
  { bg: 'bg-blue-50',   texto: 'text-blue-700',   borde: 'border-blue-300',   circulo: 'bg-blue-600'   },
  { bg: 'bg-violet-50', texto: 'text-violet-700',  borde: 'border-violet-300', circulo: 'bg-violet-600' },
  { bg: 'bg-emerald-50',texto: 'text-emerald-700', borde: 'border-emerald-300',circulo: 'bg-emerald-600'},
  { bg: 'bg-amber-50',  texto: 'text-amber-700',   borde: 'border-amber-300',  circulo: 'bg-amber-500'  },
]

function paleta(idx) { return PALETA[Math.abs(idx ?? 0) % PALETA.length] }

// ─── Badge sucursal (tabla) ───────────────────────────────────────────────────

function SucursalBadge({ nombre, idx = 0 }) {
  if (!nombre) return <span className="text-slate-400">—</span>
  const p = paleta(idx)
  return (
    <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', p.bg, p.texto, p.borde)}>
      {nombre}
    </span>
  )
}

// ─── Modal nueva transferencia ─────────────────────────────────────────────────

// La lista de productos se recorta a propósito. Con 2,300 productos, pintarlos
// todos son ~14,000 nodos que React tiene que reconciliar en cada tecla, y en
// una caja de 288 px de alto nadie los recorre: se busca por nombre. Ventas ya
// recorta a 8 y 12 por lo mismo.
const TOPE_LISTA = 50

// Separa nombre y códigos en el texto de búsqueda de cada producto
const SEP = '\u0001'

const PASOS = [
  { num: 1, label: 'Producto' },
  { num: 2, label: 'Lote'     },
  { num: 3, label: 'Ruta'     },
  { num: 4, label: 'Cantidad' },
]

function ModalTransferencia({ sucursales, onClose, onGuardado }) {
  const { empresa, perfil } = useApp()

  // Selección
  const [paso,       setPaso]       = useState(1)
  const [busqueda,   setBusqueda]   = useState('')
  const [productoId, setProductoId] = useState('')
  const [loteId,     setLoteId]     = useState('')
  const [origenId,   setOrigenId]   = useState('')
  const [destinoId,  setDestinoId]  = useState('')
  const [cantidad,   setCantidad]   = useState('')
  const [nota,       setNota]       = useState('')
  const [errores,    setErrores]    = useState({})
  const [guardando,  setGuardando]  = useState(false)
  const guardandoRef = useRef(false)

  // ─── Datos ─────────────────────────────────────────────────────────────────
  // Antes, al abrir, se bajaban los 2,400 productos, TODOS los lotes y TODO el
  // inventario de la empresa, cada uno en tandas seguidas: unas diez peticiones
  // y segundos de espera, en cada apertura. Ahora:
  //   - catálogo y códigos: los mismos que usa Agregar inventario, ya en memoria
  //     (src/lib/catalogo.js);
  //   - existencia de cada producto: la misma consulta de Inventario, una sola
  //     petición;
  //   - lotes: solo los del producto elegido, cuando se elige.
  const { data: productos = [], isLoading: cargando } = useCatalogoProductos(empresa?.id)
  const { data: codigosCat = [] } = useCatalogoCodigos(empresa?.id)
  const { data: existencias } = useInventarioCompleto(empresa?.id)

  // Lotes del producto elegido —con lo que hay de cada uno en cada sucursal— y
  // las sucursales donde está deshabilitado. Dos consultas chicas, al elegirlo.
  // Siempre frescas (staleTime 0): es lo que se va a mover.
  const { data: detalle, isLoading: cargandoLotes } = useQuery({
    queryKey: ['transferencia_lotes', productoId],
    queryFn: async () => {
      const [{ data: lots, error: e1 }, { data: ps, error: e2 }] = await Promise.all([
        supabase.from('lotes')
          .select('id, codigo_lote, fecha_caducidad, inventario(sucursal_id, cantidad)')
          .eq('producto_id', productoId)
          .eq('activo', true),
        supabase.from('productos_sucursales')
          .select('sucursal_id')
          .eq('producto_id', productoId)
          .eq('habilitado', false),
      ])
      if (e1) throw e1
      if (e2) throw e2
      return { lotes: lots ?? [], deshabilitadas: (ps ?? []).map(r => r.sucursal_id) }
    },
    enabled: !!productoId,
    staleTime: 0,
  })

  // ─── Índices ───────────────────────────────────────────────────────────────
  // Se arman una vez cuando llega el catálogo; después cada búsqueda es un
  // acceso directo (como en Agregar inventario).
  const { productoPorCodigo, textoBusqueda, codigoDe } = useMemo(() => {
    const texto = new Map()
    for (const p of productos) texto.set(p.id, (p.nombre || '').toLowerCase())
    const porCodigo = new Map()
    const primero = new Map()
    for (const bc of codigosCat) {
      const t = texto.get(bc.producto_id)
      if (t !== undefined) texto.set(bc.producto_id, t + SEP + (bc.codigo || '').toLowerCase())
      const k = normalizarCodigo(bc.codigo)
      if (k && !porCodigo.has(k)) porCodigo.set(k, bc.producto_id)
      if (!primero.has(bc.producto_id)) primero.set(bc.producto_id, bc.codigo)
    }
    return { productoPorCodigo: porCodigo, textoBusqueda: texto, codigoDe: primero }
  }, [productos, codigosCat])

  const stockPorProducto = useMemo(() => {
    const m = new Map()
    for (const r of existencias ?? []) m.set(r.producto_id, Number(r.stock_total) || 0)
    return m
  }, [existencias])

  // ─── Derivados ─────────────────────────────────────────────────────────────

  const producto = useMemo(() => productos.find((p) => p.id === productoId), [productos, productoId])

  // El orden se compara como texto y no con new Date(): un lote sin fecha daba
  // new Date(null), que es 1970, y se colaba hasta arriba como si fuera el más
  // próximo a vencer. Los sin fecha caen al final, donde estorban menos.
  const lotesDeProducto = useMemo(() => (
    (detalle?.lotes ?? [])
      .map((l) => ({ ...l, stockTotal: (l.inventario ?? []).reduce((s, i) => s + (Number(i.cantidad) || 0), 0) }))
      .sort((a, b) => (a.fecha_caducidad ?? '9999-12-31').localeCompare(b.fecha_caducidad ?? '9999-12-31'))
  ), [detalle])

  const loteObj = useMemo(() => lotesDeProducto.find((l) => l.id === loteId), [lotesDeProducto, loteId])
  const deshabilitadas = useMemo(() => new Set(detalle?.deshabilitadas ?? []), [detalle])

  // Lo que hay del lote elegido en una sucursal. Se toma la PRIMERA fila: si
  // algún día hubiera dos del mismo lote en la misma sucursal, se sigue
  // mostrando lo mismo que antes. Quien valida de verdad es la RPC al transferir.
  const stockEnSucursal = useCallback((sId) => {
    const f = (loteObj?.inventario ?? []).find((i) => i.sucursal_id === sId)
    return f ? Number(f.cantidad) || 0 : 0
  }, [loteObj])

  const stockOrigen = stockEnSucursal(origenId)

  // Por nombre o por código de barras. Un código exacto (el escáner) va primero.
  const prodsFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return productos
    const lista = productos.filter((p) => (textoBusqueda.get(p.id) ?? '').includes(q))
    const exacto = productoPorCodigo.get(normalizarCodigo(busqueda))
    if (exacto) {
      const i = lista.findIndex((p) => p.id === exacto)
      if (i > 0) lista.unshift(lista.splice(i, 1)[0])
    }
    return lista
  }, [productos, textoBusqueda, productoPorCodigo, busqueda])

  // El stock solo se resuelve para los que de verdad se van a pintar. Mientras
  // llegan las existencias queda sin número (undefined) en vez de un 0 falso.
  const prodsVisibles = useMemo(
    () => prodsFiltrados.slice(0, TOPE_LISTA)
      .map((p) => ({ ...p, stockTotal: stockPorProducto.get(p.id), codigo: codigoDe.get(p.id) })),
    [prodsFiltrados, stockPorProducto, codigoDe]
  )

  // Cambiar de producto deja sin efecto lote y ruta: eran de otro producto
  const elegirProducto = (id) => {
    setProductoId(id); setLoteId(''); setOrigenId(''); setDestinoId(''); setErrores({})
  }

  const alEscribir = (valor) => {
    setBusqueda(valor)
    // El escáner escribe el código completo: si coincide, se elige solo
    const id = productoPorCodigo.get(normalizarCodigo(valor))
    if (id && id !== productoId) elegirProducto(id)
  }

  // Enter (el escáner lo manda al final): con un código exacto o un solo
  // resultado, se elige y se pasa al lote.
  const alEnter = () => {
    const id = productoPorCodigo.get(normalizarCodigo(busqueda))
      ?? (prodsFiltrados.length === 1 ? prodsFiltrados[0].id : null)
    if (!id) return
    if (id !== productoId) elegirProducto(id)
    setPaso(2)
  }

  // Validación por paso
  const validar = (p) => {
    const e = {}
    if (p === 1 && !productoId) e.producto = 'Selecciona un producto'
    if (p === 2 && !loteId)     e.lote     = 'Selecciona un lote'
    if (p === 3) {
      if (!origenId)  e.origen  = 'Selecciona la sucursal origen'
      if (!destinoId) e.destino = 'Selecciona la sucursal destino'
      if (origenId && destinoId && origenId === destinoId) e.destino = 'Origen y destino deben ser distintos'
      if (origenId && stockOrigen === 0) e.origen = 'Sin stock en esta sucursal para este lote'
    }
    if (p === 4) {
      const cant = parseInt(cantidad, 10)
      if (!cantidad || isNaN(cant) || cant <= 0)           e.cantidad = 'Ingresa una cantidad mayor a cero'
      else if (String(cant) !== String(Number(cantidad)))  e.cantidad = 'Solo se aceptan cantidades enteras'
      else if (cant > stockOrigen)                         e.cantidad = `Máximo disponible: ${stockOrigen} uds`
    }
    setErrores(e)
    return Object.keys(e).length === 0
  }

  const avanzar = () => { if (validar(paso)) setPaso((p) => p + 1) }
  const retroceder = () => { setPaso((p) => p - 1); setErrores({}) }

  const guardar = async () => {
    if (!validar(4)) return
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const cant = parseInt(cantidad, 10)

      const { error } = await supabase.rpc('registrar_transferencia', {
        p_lote_id:     loteId,
        p_producto_id: productoId,
        p_origen_id:   origenId,
        p_destino_id:  destinoId,
        p_empresa_id:  empresa.id,
        p_usuario_id:  perfil?.id ?? null,
        p_cantidad:    cant,
        p_nota:        nota.trim() || null,
      })

      if (error) throw error

      // Bitácora (no crítico)
      const sucOrigen  = sucursales.find((s) => s.id === origenId)
      const sucDestino = sucursales.find((s) => s.id === destinoId)
      supabase.from('bitacora').insert({
        empresa_id:    empresa.id,
        tipo:          'transferencia',
        descripcion:   `${producto?.nombre} · ${sucOrigen?.nombre} → ${sucDestino?.nombre} · ${cant} uds`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   origenId,
        referencia_id: String(productoId),
        metadatos: { producto: producto?.nombre, lote: loteObj?.codigo_lote, origen: sucOrigen?.nombre, destino: sucDestino?.nombre, cantidad: cant, nota: nota.trim() || null },
      })

      // El stock cambió de sucursal: que Inventario no siga mostrando el reparto viejo
      invalidarStock()

      toast.success('Transferencia registrada')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al transferir')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] animate-modal-in">

        {/* Header con stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-slate-900">Nueva transferencia</h2>
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* Stepper */}
          <div className="flex items-center">
            {PASOS.map((s, i) => {
              const hecho  = paso > s.num
              const activo = paso === s.num
              return (
                <div key={s.num} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      hecho  ? 'bg-emerald-500 text-white' :
                      activo ? 'bg-primary-600 text-white' :
                               'bg-slate-100 text-slate-400'
                    )}>
                      {hecho ? '✓' : s.num}
                    </div>
                    <span className={cn('text-[10px] font-semibold',
                      activo ? 'text-primary-600' : hecho ? 'text-emerald-500' : 'text-slate-400'
                    )}>{s.label}</span>
                  </div>
                  {i < PASOS.length - 1 && (
                    <div className={cn('flex-1 h-0.5 mx-1 mb-4 transition-colors', paso > s.num ? 'bg-emerald-400' : 'bg-slate-200')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {cargando ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Paso 1: Producto ── */}
              {paso === 1 && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-slate-500">¿Qué producto vas a transferir?</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text" value={busqueda} onChange={(e) => alEscribir(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); alEnter() } }}
                      placeholder="Buscar por nombre o código de barras..." autoFocus
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                    {prodsFiltrados.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-8">Sin resultados</p>
                    )}
                    {prodsVisibles.map((p) => {
                      const sel = productoId === p.id
                      return (
                        <button key={p.id} onClick={() => elegirProducto(p.id)}
                          className={cn(
                            'flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border transition-all text-left',
                            sel ? 'bg-primary-50 border-primary-400' : 'bg-white border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <div className="min-w-0">
                            <p className={cn('text-sm font-semibold', sel ? 'text-primary-900' : 'text-slate-900')}>{p.nombre}</p>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">
                              {p.codigo ? <span className="font-mono">{p.codigo}</span> : 'Sin código'}
                              {' · '}{p.categoria ?? 'Sin categoría'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border',
                              p.stockTotal === undefined
                                ? 'bg-slate-50 text-slate-400 border-slate-200'
                                : p.stockTotal === 0
                                  ? 'bg-red-50 text-red-600 border-red-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            )}>
                              {p.stockTotal === undefined ? '…' : `${p.stockTotal} uds`}
                            </span>
                            {sel && <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                          </div>
                        </button>
                      )
                    })}
                    {prodsFiltrados.length > TOPE_LISTA && (
                      <p className="text-xs text-slate-400 text-center py-3">
                        Mostrando {TOPE_LISTA} de {prodsFiltrados.length} · escribe para afinar
                      </p>
                    )}
                  </div>
                  {errores.producto && <p className="text-xs text-red-500">{errores.producto}</p>}
                </div>
              )}

              {/* ── Paso 2: Lote ── */}
              {paso === 2 && (
                <div className="flex flex-col gap-4">
                  <div className="bg-primary-50 border border-primary-200 rounded-2xl px-4 py-3">
                    <p className="text-sm font-semibold text-primary-900">{producto?.nombre}</p>
                    <p className="text-xs text-primary-600">{producto?.categoria}</p>
                  </div>
                  <p className="text-sm text-slate-500">¿Qué lote quieres transferir?</p>
                  <div className="flex flex-col gap-2">
                    {cargandoLotes ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                      </div>
                    ) : lotesDeProducto.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-8">Este producto no tiene lotes activos</p>
                    )}
                    {lotesDeProducto.map((l) => {
                      const dias = diasRestantes(l.fecha_caducidad)
                      const est  = estadoCaducidad(dias)
                      const sel  = loteId === l.id
                      return (
                        <button key={l.id} onClick={() => { setLoteId(l.id); setErrores({}) }}
                          className={cn(
                            'flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left',
                            sel ? 'bg-primary-50 border-primary-400' : 'bg-white border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900 font-mono">{l.codigo_lote ?? 'Sin código'}</p>
                            <p className="text-xs text-slate-400 mt-0.5">Caduca: {formatoFecha(l.fecha_caducidad)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-600">{l.stockTotal} uds</span>
                            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', est.clase)}>{est.label}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {errores.lote && <p className="text-xs text-red-500">{errores.lote}</p>}
                </div>
              )}

              {/* ── Paso 3: Ruta ── */}
              {paso === 3 && (
                <div className="flex flex-col gap-5">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{producto?.nombre}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Lote: <span className="font-mono">{loteObj?.codigo_lote ?? '—'}</span></p>
                  </div>

                  {/* Origen */}
                  {(() => {
                    const sucsHabilitadas = sucursales.filter(s => !deshabilitadas.has(s.id))
                    return (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-slate-700">Sucursal origen <span className="text-slate-400 font-normal text-xs">¿de dónde sale?</span></p>
                        <div className={cn('grid gap-3', sucsHabilitadas.length <= 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                          {sucsHabilitadas.map((s, i) => {
                            const p     = paleta(i)
                            const stock = stockEnSucursal(s.id)
                            const sel   = origenId === s.id
                            return (
                              <button key={s.id}
                                onClick={() => { setOrigenId(s.id); if (destinoId === s.id) setDestinoId(''); setErrores({}) }}
                                className={cn(
                                  'flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border transition-all',
                                  sel ? cn(p.bg, p.borde) : stock === 0 ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-white border-slate-200 hover:border-slate-300'
                                )}
                              >
                                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold', sel ? p.circulo : 'bg-slate-300')}>
                                  {s.nombre.charAt(0).toUpperCase()}
                                </div>
                                <p className={cn('text-xs font-semibold text-center leading-tight', sel ? p.texto : 'text-slate-600')}>{s.nombre}</p>
                                <p className={cn('text-lg font-bold', stock === 0 ? 'text-red-500' : sel ? p.texto : 'text-slate-900')}>{stock}</p>
                                <p className="text-[10px] text-slate-400">uds disponibles</p>
                              </button>
                            )
                          })}
                        </div>
                        {errores.origen && <p className="text-xs text-red-500">{errores.origen}</p>}
                      </div>
                    )
                  })()}

                  {origenId && <div className="text-center text-2xl text-primary-400 font-bold select-none">↓</div>}

                  {/* Destino — solo sucursales habilitadas y que no sean el origen */}
                  {(() => {
                    const sucsDestino = sucursales.filter(s => !deshabilitadas.has(s.id) && s.id !== origenId)
                    return (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-slate-700">Sucursal destino <span className="text-slate-400 font-normal text-xs">¿a dónde va?</span></p>
                        {sucsDestino.length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-3">No hay otras sucursales disponibles para este producto</p>
                        ) : (
                          <div className={cn('grid gap-3', sucsDestino.length <= 2 ? 'grid-cols-2' : 'grid-cols-3')}>
                            {sucsDestino.map((s, i) => {
                              const p   = paleta(i)
                              const sel = destinoId === s.id
                              const stock = stockEnSucursal(s.id)
                              return (
                                <button key={s.id}
                                  onClick={() => { setDestinoId(s.id); setErrores({}) }}
                                  className={cn(
                                    'flex flex-col items-center gap-1.5 px-3 py-4 rounded-2xl border transition-all',
                                    sel ? cn(p.bg, p.borde) : 'bg-white border-slate-200 hover:border-slate-300'
                                  )}
                                >
                                  <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold', sel ? p.circulo : 'bg-slate-300')}>
                                    {s.nombre.charAt(0).toUpperCase()}
                                  </div>
                                  <p className={cn('text-xs font-semibold text-center leading-tight', sel ? p.texto : 'text-slate-600')}>{s.nombre}</p>
                                  <p className="text-lg font-bold text-slate-900">{stock}</p>
                                  <p className="text-[10px] text-slate-400">uds actuales</p>
                                </button>
                              )
                            })}
                          </div>
                        )}
                        {errores.destino && <p className="text-xs text-red-500">{errores.destino}</p>}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ── Paso 4: Cantidad ── */}
              {paso === 4 && (
                <div className="flex flex-col gap-5">
                  {/* Resumen */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 flex flex-col gap-2.5">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Resumen</p>
                    {[
                      { label: 'Producto', valor: producto?.nombre },
                      { label: 'Lote',     valor: <span className="font-mono">{loteObj?.codigo_lote ?? '—'}</span> },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">{r.label}</span>
                        <span className="font-semibold text-slate-900">{r.valor}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Ruta</span>
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const iOri  = sucursales.findIndex((s) => s.id === origenId)
                          const iDest = sucursales.findIndex((s) => s.id === destinoId)
                          const pOri  = paleta(iOri)
                          const pDest = paleta(iDest)
                          const ori   = sucursales.find((s) => s.id === origenId)
                          const dest  = sucursales.find((s) => s.id === destinoId)
                          return <>
                            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', pOri.bg, pOri.texto, pOri.borde)}>{ori?.nombre}</span>
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border', pDest.bg, pDest.texto, pDest.borde)}>{dest?.nombre}</span>
                          </>
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Disponible en origen</span>
                      <span className="font-bold text-emerald-600">{stockOrigen} uds</span>
                    </div>
                  </div>

                  {/* Stepper cantidad */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-700">
                      Cantidad a transferir <span className="text-slate-400 font-normal">máx. {stockOrigen}</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setCantidad(c => String(Math.max(1, Number(c || 0) - 1)))}
                        className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xl font-bold transition-colors flex items-center justify-center flex-shrink-0"
                      >−</button>
                      <input
                        type="number" min="1" max={stockOrigen} step="1" value={cantidad}
                        onChange={(e) => { setCantidad(e.target.value); setErrores((er) => ({ ...er, cantidad: '' })) }}
                        placeholder="0"
                        className={cn(
                          'flex-1 bg-slate-50 border rounded-2xl px-4 py-3 text-center text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30',
                          errores.cantidad ? 'border-red-300' : 'border-slate-200'
                        )}
                      />
                      <button
                        onClick={() => setCantidad(c => String(Math.min(stockOrigen, Number(c || 0) + 1)))}
                        className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xl font-bold transition-colors flex items-center justify-center flex-shrink-0"
                      >+</button>
                    </div>
                    {errores.cantidad && <p className="text-xs text-red-500">{errores.cantidad}</p>}
                    {parseInt(cantidad, 10) > 0 && parseInt(cantidad, 10) <= stockOrigen && (
                      <p className="text-xs text-slate-400">
                        Quedará en origen: <strong className="text-slate-600">{stockOrigen - parseInt(cantidad, 10)} uds</strong>
                      </p>
                    )}
                  </div>

                  {/* Nota */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-slate-700">Nota <span className="text-slate-400 font-normal">opcional</span></label>
                    <input
                      type="text" value={nota} onChange={(e) => setNota(e.target.value)}
                      placeholder="Ej: Reabastecimiento mensual..."
                      className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            {paso > 1 && (
              <button onClick={retroceder} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variante="secundario" tamano="sm" onClick={onClose}>Cancelar</Button>
            {paso < 4
              ? <Button variante="primario" tamano="sm" onClick={avanzar}>Siguiente</Button>
              : <Button variante="primario" tamano="md" cargando={guardando} onClick={guardar}>Confirmar transferencia</Button>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Historial por tandas conforme se baja, como en Productos e Inventario. Antes
// eran páginas de 50 con botones y, en cada una, un conteo exacto de toda la
// tabla. Ahora cada tanda trae solo lo que se pinta, sin conteo, y avanza por
// cursor (fecha + id del último renglón) en vez de saltar N filas: así una
// transferencia nueva a media lectura no repite ni salta renglones, y el
// servidor no recorre lo ya visto.
const POR_TANDA = 40
const SELECT_TRANSFERENCIAS =
  'id, creado_en, cantidad, nota, origen_id, destino_id, ' +
  'productos(nombre, categoria, codigos_barras(codigo, unidades_por_empaque)), ' +
  'origen:sucursales!origen_id(nombre), destino:sucursales!destino_id(nombre)'

// El código que se muestra: el de la pieza (1 unidad) antes que el de caja
function codigoDe(t) {
  const cs = t.productos?.codigos_barras ?? []
  if (!cs.length) return null
  const [principal] = [...cs].sort((a, b) => (a.unidades_por_empaque ?? 1) - (b.unidades_por_empaque ?? 1))
  return { codigo: principal.codigo, mas: cs.length - 1 }
}

function CeldaCodigo({ t }) {
  const c = codigoDe(t)
  if (!c) return <span className="text-xs text-slate-400">Sin código</span>
  return (
    <span className="text-sm font-mono text-slate-600">
      {c.codigo}
      {c.mas > 0 && <span className="text-xs text-slate-400 font-sans"> +{c.mas}</span>}
    </span>
  )
}

const horaDe = (s) => new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export default function TransferenciasPage() {
  const { empresa, esAdmin, sucursales, sucursalActiva } = useApp()
  const queryClient = useQueryClient()
  const escritorio = useMediaQuery(DESDE_SM)
  const [modalAbierto, setModalAbierto] = useState(false)
  const centinelaRef = useRef(null)

  const sucursalIdx = useCallback((id) => sucursales.findIndex((s) => s.id === id), [sucursales])

  const clave = useMemo(() => ['transferencias', empresa?.id], [empresa?.id])
  const { data, error, isLoading, isFetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useInfiniteQuery({
    queryKey: clave,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('transferencias')
        .select(SELECT_TRANSFERENCIAS)
        .eq('empresa_id', empresa.id)
        // El id desempata las fechas idénticas
        .order('creado_en', { ascending: false })
        .order('id', { ascending: false })
        .limit(POR_TANDA)
      if (pageParam) {
        q = q.or(`creado_en.lt."${pageParam.creado_en}",and(creado_en.eq."${pageParam.creado_en}",id.lt.${pageParam.id})`)
      }
      const { data: filas, error: err } = await q
      if (err) throw err
      return filas ?? []
    },
    initialPageParam: null,
    getNextPageParam: (ultima) => {
      if (ultima.length < POR_TANDA) return undefined
      const u = ultima[ultima.length - 1]
      return { creado_en: u.creado_en, id: u.id }
    },
    enabled: !!empresa?.id,
  })
  const transferencias = useMemo(() => (data?.pages ?? []).flat(), [data])

  useEffect(() => {
    if (error) toast.error(error.message ?? 'Error al cargar transferencias')
  }, [error])

  // Al acercarse al final se pide la siguiente tanda. No mientras otra
  // consulta de esta lista va en camino: la librería advierte que se pisarían.
  useEffect(() => {
    const el = centinelaRef.current
    if (!el || !hasNextPage || isFetching) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) fetchNextPage() }, { rootMargin: '0px 0px 400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetching, fetchNextPage, transferencias.length])

  // Al salir se conserva solo la primera tanda (con su hora de carga). Al volver
  // se ve al instante, y si hay que actualizarla se pide UNA tanda, no todas
  // las que se hubieran bajado.
  useEffect(() => () => {
    const estado = queryClient.getQueryState(clave)
    queryClient.setQueryData(clave,
      (d) => (d && d.pages.length > 1 ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d),
      { updatedAt: estado?.dataUpdatedAt })
  }, [queryClient, clave])

  useFocusRefresh(() => refetch())

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Transferencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {esAdmin ? 'Todas las sucursales' : sucursalActiva?.nombre ?? '—'}
          </p>
        </div>
        {sucursales.length > 1 && (
          // En celular lo hace el botón flotante
          <Button variante="primario" tamano="md" className="hidden lg:inline-flex" iconoIzq={<Plus className="w-4 h-4" />} onClick={() => setModalAbierto(true)}>
            Nueva transferencia
          </Button>
        )}
      </div>

      {sucursales.length < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700">
          Necesitas al menos dos sucursales para realizar transferencias.
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : transferencias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <ArrowLeftRight className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Sin transferencias registradas</p>
          </div>
        ) : (
          <>
            {/* Solo se construye la versión que se ve: con las dos (una oculta
                con CSS) cada renglón existía dos veces. */}
            {!escritorio ? (
              <div className="flex flex-col divide-y divide-slate-100">
                {transferencias.map((t) => {
                  const c = codigoDe(t)
                  return (
                    <div key={t.id} className="px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{t.productos?.nombre ?? '—'}</p>
                          <p className="text-xs text-slate-400">
                            {c ? <span className="font-mono">{c.codigo}</span> : 'Sin código'}
                            {' · '}{formatoFecha(t.creado_en)} · {horaDe(t.creado_en)}
                          </p>
                        </div>
                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold flex-shrink-0">
                          {t.cantidad}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <SucursalBadge nombre={t.origen?.nombre} idx={sucursalIdx(t.origen_id)} />
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                        <SucursalBadge nombre={t.destino?.nombre} idx={sucursalIdx(t.destino_id)} />
                      </div>
                      {t.nota && <p className="text-xs text-slate-400">{t.nota}</p>}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {['Fecha','Producto','Código','Origen','','Destino','Cantidad','Nota'].map((h, i) => (
                        <th key={h || i} className="px-5 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transferencias.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <p className="text-sm font-medium text-slate-700">{formatoFecha(t.creado_en)}</p>
                          <p className="text-xs text-slate-400">{horaDe(t.creado_en)}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-slate-900">{t.productos?.nombre ?? '—'}</p>
                          <p className="text-xs text-slate-400">{t.productos?.categoria ?? ''}</p>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <CeldaCodigo t={t} />
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <SucursalBadge nombre={t.origen?.nombre} idx={sucursalIdx(t.origen_id)} />
                        </td>
                        <td className="px-2 py-4 text-slate-300"><ArrowRight className="w-4 h-4" /></td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <SucursalBadge nombre={t.destino?.nombre} idx={sucursalIdx(t.destino_id)} />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 text-sm font-bold">{t.cantidad}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-400">{t.nota ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Marca invisible al final: al acercarse, se pide la siguiente tanda */}
            {hasNextPage && <div ref={centinelaRef} className="h-1" aria-hidden="true" />}
            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-5 border-t border-slate-100">
                <div className="w-6 h-6 border-[3px] border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            )}
            {!hasNextPage && (data?.pages.length ?? 0) > 1 && (
              <p className="text-xs text-slate-400 text-center py-4 border-t border-slate-100">No hay más transferencias</p>
            )}
          </>
        )}
      </div>

      {modalAbierto && (
        <ModalTransferencia
          sucursales={sucursales}
          onClose={() => setModalAbierto(false)}
          onGuardado={() => { setModalAbierto(false); queryClient.invalidateQueries({ queryKey: ['transferencias'] }) }}
        />
      )}

      {/* Con una sola sucursal no hay a dónde transferir: igual que el botón del encabezado */}
      {sucursales.length > 1 && <Fab onClick={() => setModalAbierto(true)} label="Nueva transferencia" />}
    </div>
  )
}
