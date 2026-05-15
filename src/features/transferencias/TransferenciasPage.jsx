import { useState, useEffect, useCallback } from 'react'
import { ArrowLeftRight, Plus, X, Search, ArrowRight, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoFecha } from '@/lib/formatos'
import { cn } from '@/lib/clases'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function diasRestantes(fecha) {
  if (!fecha) return 9999
  return Math.ceil((new Date(fecha) - new Date()) / 86400000)
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

const PASOS = [
  { num: 1, label: 'Producto' },
  { num: 2, label: 'Lote'     },
  { num: 3, label: 'Ruta'     },
  { num: 4, label: 'Cantidad' },
]

function ModalTransferencia({ sucursales, onClose, onGuardado }) {
  const { empresa, perfil } = useApp()

  // Datos
  const [productos,  setProductos]  = useState([])
  const [lotes,      setLotes]      = useState([])
  const [inventario, setInventario] = useState([])
  const [cargando,   setCargando]   = useState(true)

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

  // Map: producto_id → Set de sucursal_ids donde está DESHABILITADO
  const [deshabMap, setDeshabMap] = useState({})

  useEffect(() => {
    const cargar = async () => {
      const [{ data: prods }, { data: lots }, { data: inv }, { data: ps }] = await Promise.all([
        supabase.from('productos').select('id, nombre, categoria').eq('activo', true).order('nombre'),
        supabase.from('lotes').select('id, producto_id, codigo_lote, fecha_caducidad').eq('activo', true),
        supabase.from('inventario').select('id, lote_id, sucursal_id, cantidad').gt('cantidad', 0),
        supabase.from('productos_sucursales').select('producto_id, sucursal_id').eq('habilitado', false),
      ])
      // Construir mapa de deshabilitados
      const map = {}
      ;(ps || []).forEach(r => {
        if (!map[r.producto_id]) map[r.producto_id] = new Set()
        map[r.producto_id].add(r.sucursal_id)
      })
      setDeshabMap(map)
      setProductos(prods ?? [])
      setLotes(lots ?? [])
      setInventario(inv ?? [])
      setCargando(false)
    }
    cargar()
  }, [])

  // Derivados
  const producto = productos.find((p) => p.id === productoId)
  const loteObj  = lotes.find((l) => l.id === loteId)

  const lotesDeProducto = lotes
    .filter((l) => l.producto_id === productoId)
    .map((l) => ({ ...l, stockTotal: inventario.filter((i) => i.lote_id === l.id).reduce((s, i) => s + i.cantidad, 0) }))
    .sort((a, b) => new Date(a.fecha_caducidad) - new Date(b.fecha_caducidad))

  const stockEnSucursal = (sId) =>
    inventario.find((i) => i.lote_id === loteId && i.sucursal_id === sId)?.cantidad ?? 0

  const stockOrigen = stockEnSucursal(origenId)

  // Un producto válido para transferir si tiene habilitada al menos 1 sucursal origen con stock
  const prodsFiltrados = productos
    .filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    .map((p) => ({
    ...p,
    stockTotal: inventario
      .filter((i) => lotes.filter((l) => l.producto_id === p.id).map((l) => l.id).includes(i.lote_id))
      .reduce((s, i) => s + i.cantidad, 0),
  }))

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
    setGuardando(true)
    try {
      const cant = parseInt(cantidad, 10)

      // Descontar origen
      const invOrigen = inventario.find((i) => i.lote_id === loteId && i.sucursal_id === origenId)
      await supabase.from('inventario').update({ cantidad: invOrigen.cantidad - cant }).eq('id', invOrigen.id)

      // Sumar destino
      const invDestino = inventario.find((i) => i.lote_id === loteId && i.sucursal_id === destinoId)
      if (invDestino) {
        await supabase.from('inventario').update({ cantidad: invDestino.cantidad + cant }).eq('id', invDestino.id)
      } else {
        await supabase.from('inventario').insert({ empresa_id: empresa.id, lote_id: loteId, sucursal_id: destinoId, cantidad: cant })
      }

      // Registrar transferencia
      await supabase.from('transferencias').insert({
        empresa_id:  empresa.id,
        lote_id:     loteId,
        producto_id: productoId,
        origen_id:   origenId,
        destino_id:  destinoId,
        cantidad:    cant,
        nota:        nota.trim() || null,
        usuario_id:  perfil?.id ?? null,
      })

      // Bitácora
      const sucOrigen  = sucursales.find((s) => s.id === origenId)
      const sucDestino = sucursales.find((s) => s.id === destinoId)
      await supabase.from('bitacora').insert({
        empresa_id:  empresa.id,
        tipo:        'transferencia',
        descripcion: `${producto?.nombre} · ${sucOrigen?.nombre} → ${sucDestino?.nombre} · ${cant} uds`,
        usuario_id:  perfil?.id ?? null,
        sucursal_id: origenId,
        referencia_id: String(productoId),
        metadatos: { producto: producto?.nombre, lote: loteObj?.codigo_lote, origen: sucOrigen?.nombre, destino: sucDestino?.nombre, cantidad: cant, nota: nota.trim() || null },
      })

      toast.success('Transferencia registrada')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al transferir')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">

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
                      type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                      placeholder="Buscar producto..." autoFocus
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                    {prodsFiltrados.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-8">Sin resultados</p>
                    )}
                    {prodsFiltrados.map((p) => {
                      const sel = productoId === p.id
                      return (
                        <button key={p.id} onClick={() => { setProductoId(p.id); setLoteId(''); setErrores({}) }}
                          className={cn(
                            'flex items-center justify-between px-4 py-3 rounded-2xl border transition-all text-left',
                            sel ? 'bg-primary-50 border-primary-400' : 'bg-white border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <div>
                            <p className={cn('text-sm font-semibold', sel ? 'text-primary-900' : 'text-slate-900')}>{p.nombre}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{p.categoria ?? 'Sin categoría'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-full border',
                              p.stockTotal === 0
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            )}>
                              {p.stockTotal} uds
                            </span>
                            {sel && <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center text-white text-[10px] font-bold">✓</div>}
                          </div>
                        </button>
                      )
                    })}
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
                    {lotesDeProducto.length === 0 && (
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
                    const sucsHabilitadas = sucursales.filter(s => !deshabMap[productoId]?.has(s.id))
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
                    const sucsDestino = sucursales.filter(s => !deshabMap[productoId]?.has(s.id) && s.id !== origenId)
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

export default function TransferenciasPage() {
  const { esAdmin, sucursales, sucursalActiva } = useApp()

  const [transferencias, setTransferencias] = useState([])
  const [cargando, setCargando]             = useState(true)
  const [modalAbierto, setModalAbierto]     = useState(false)

  const sucursalIdx = useCallback((id) => sucursales.findIndex((s) => s.id === id), [sucursales])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase
        .from('transferencias')
        .select(`
          *,
          productos(nombre, categoria),
          lotes(codigo_lote, fecha_caducidad),
          origen:sucursales!origen_id(nombre),
          destino:sucursales!destino_id(nombre),
          usuario:perfiles!usuario_id(nombre)
        `)
        .order('creado_en', { ascending: false })

      if (error) throw error
      setTransferencias(data ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar transferencias')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transferencias</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {esAdmin ? 'Todas las sucursales' : sucursalActiva?.nombre ?? '—'}
          </p>
        </div>
        {sucursales.length > 1 && (
          <Button variante="primario" tamano="md" iconoIzq={<Plus className="w-4 h-4" />} onClick={() => setModalAbierto(true)}>
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
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
        {cargando ? (
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
            {/* Cards móvil */}
            <div className="flex flex-col divide-y divide-slate-100 sm:hidden">
              {transferencias.map((t) => (
                <div key={t.id} className="px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{t.productos?.nombre ?? '—'}</p>
                      <p className="text-xs text-slate-400">{formatoFecha(t.creado_en)} · {new Date(t.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
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
              ))}
            </div>
            {/* Tabla desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Fecha','Producto','Lote','Origen','','Destino','Cantidad','Nota'].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transferencias.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="text-sm font-medium text-slate-700">{formatoFecha(t.creado_en)}</p>
                        <p className="text-xs text-slate-400">{new Date(t.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{t.productos?.nombre ?? '—'}</p>
                        <p className="text-xs text-slate-400">{t.productos?.categoria ?? ''}</p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="text-sm font-mono text-slate-600">{t.lotes?.codigo_lote ?? '—'}</span>
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
          </>
        )}
      </div>

      {modalAbierto && (
        <ModalTransferencia
          sucursales={sucursales}
          onClose={() => setModalAbierto(false)}
          onGuardado={() => { setModalAbierto(false); cargar() }}
        />
      )}
    </div>
  )
}
