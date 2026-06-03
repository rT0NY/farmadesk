import { useEffect, useState, useRef } from 'react'
import { toast } from 'sonner'
import {
  X, Package, Calendar, Edit2, Trash2, Scale,
  Store, Minus, Plus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { formatoFecha } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/clases'

const ESTADOS = {
  vigente:     { punto: 'bg-emerald-500', borde: 'border-l-emerald-500', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', texto: 'Vigente' },
  por_caducar: { punto: 'bg-amber-500',   borde: 'border-l-amber-500',   badge: 'bg-amber-100 text-amber-800 border-amber-200',     texto: 'Por caducar' },
  caducado:    { punto: 'bg-red-500',      borde: 'border-l-red-500',      badge: 'bg-red-100 text-red-800 border-red-200',           texto: 'Caducado' },
  sin_fecha:   { punto: 'bg-slate-400',    borde: 'border-l-slate-400',    badge: 'bg-slate-100 text-slate-700 border-slate-200',     texto: 'Sin fecha' },
}

function ModalEditarLote({ lote, onCerrar, onGuardar }) {
  const [codigoLote, setCodigoLote] = useState(lote.codigo_lote || '')
  const [fechaCad, setFechaCad] = useState(lote.fecha_caducidad || '')
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)
  async function guardar() {
    if (!codigoLote.trim()) { toast.error('Código de lote requerido'); return }
    if (!fechaCad) { toast.error('Fecha de caducidad requerida'); return }
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    const { error } = await supabase.from('lotes').update({ codigo_lote: codigoLote.trim(), fecha_caducidad: fechaCad }).eq('id', lote.lote_id)
    if (error) { toast.error(error.message); guardandoRef.current = false; setGuardando(false); return }
    toast.success('Lote actualizado'); guardandoRef.current = false; setGuardando(false); onGuardar()
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onCerrar} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2"><Edit2 className="w-4 h-4 text-primary-600" /><h3 className="text-base font-semibold text-slate-900">Editar lote</h3></div>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <Input label="Código de lote *" value={codigoLote} onChange={e => setCodigoLote(e.target.value)} className="font-mono" />
          <Input label="Fecha de caducidad *" type="date" iconoIzq={<Calendar className="w-5 h-5" />} value={fechaCad} onChange={e => setFechaCad(e.target.value)} />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} cargando={guardando}>Guardar</Button>
        </div>
      </div>
    </div>
  )
}

function ModalCuadrar({ lote, sucursales, onCerrar, onGuardar }) {
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id || '')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cuadrRefG = useRef(false)
  const stockSuc = lote.stock_por_sucursal || {}
  const stockActual = Number(stockSuc[sucursalId] || 0)
  useEffect(() => { setCantidad(String(Number(stockSuc[sucursalId] || 0))) }, [sucursalId])
  async function guardar() {
    const cant = Number(cantidad)
    if (isNaN(cant) || cant < 0) { toast.error('Cantidad no válida'); return }
    if (!motivo.trim()) { toast.error('Indica un motivo'); return }
    if (cuadrRefG.current) return
    cuadrRefG.current = true
    setGuardando(true)
    try {
      const { error } = await supabase.rpc('ajustar_inventario', { p_lote_id: lote.lote_id, p_sucursal_id: sucursalId, p_nueva_cantidad: cant, p_motivo: motivo.trim() })
      if (error) throw error
      toast.success('Inventario ajustado'); onGuardar()
    } catch (err) { toast.error(err.message || 'Error al ajustar') } finally { cuadrRefG.current = false; setGuardando(false) }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onCerrar} />
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div><div className="flex items-center gap-2"><Scale className="w-4 h-4 text-primary-600" /><h3 className="text-base font-semibold text-slate-900">Cuadrar inventario</h3></div><p className="text-xs text-slate-500 mt-0.5">Lote: <span className="font-mono font-semibold">{lote.codigo_lote}</span></p></div>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Sucursal</p>
            <div className="grid grid-cols-3 gap-2">
              {sucursales.map(s => {
                const sel = sucursalId === s.id; const qty = Number(stockSuc[s.id] || 0)
                return (<button key={s.id} onClick={() => setSucursalId(s.id)} className={cn('text-center p-3 rounded-2xl border transition-all', sel ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-500/20' : 'bg-white border-slate-200 hover:border-slate-300')}>
                  <Store className={cn('w-4 h-4 mx-auto mb-1', sel ? 'text-primary-600' : 'text-slate-400')} />
                  <p className={cn('text-xs font-semibold truncate', sel ? 'text-primary-700' : 'text-slate-600')}>{s.nombre}</p>
                  <p className={cn('text-lg font-bold mt-1', qty === 0 ? 'text-red-600' : 'text-slate-900')}>{qty}</p>
                </button>)
              })}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 mb-1">Nueva cantidad <span className="text-slate-400">(actual: {stockActual})</span></p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCantidad(c => String(Math.max(0, Number(c) - 1)))} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Minus className="w-4 h-4" /></button>
              <input type="number" min="0" value={cantidad} onChange={e => setCantidad(e.target.value)} placeholder="0" className="flex-1 h-10 rounded-xl border border-slate-200 bg-white text-center text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500" />
              <button onClick={() => setCantidad(c => String(Number(c) + 1))} className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Plus className="w-4 h-4" /></button>
            </div>
            {cantidad && Number(cantidad) !== stockActual && (<p className="text-xs text-slate-500 mt-1.5">Diferencia: <span className={cn('font-semibold', Number(cantidad) - stockActual > 0 ? 'text-emerald-600' : 'text-red-600')}>{Number(cantidad) - stockActual > 0 ? '+' : ''}{Number(cantidad) - stockActual}</span></p>)}
          </div>
          <Input label="Motivo del ajuste *" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Merma, conteo físico, error..." />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} cargando={guardando}>Confirmar ajuste</Button>
        </div>
      </div>
    </div>
  )
}

function ModalEliminarLote({ lote, productoNombre, onCerrar, onConfirmar }) {
  const [eliminando, setEliminando] = useState(false)
  async function eliminar() {
    setEliminando(true)
    try {
      const { error } = await supabase.rpc('eliminar_lote', { p_lote_id: lote.lote_id })
      if (error) throw error
      toast.success('Lote eliminado')
      onConfirmar()
    } catch (err) {
      toast.error(err.message || 'Error al eliminar')
    } finally {
      setEliminando(false)
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60" onClick={onCerrar} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-red-700">Eliminar lote</h3>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4"><p className="text-sm font-semibold text-red-800 mb-1">Esta acción no se puede deshacer</p><p className="text-xs text-red-700">Se eliminará el lote <span className="font-mono font-bold">{lote.codigo_lote}</span> y todo su inventario en todas las sucursales.</p></div>
          <div className="text-sm text-slate-600 space-y-1"><p><span className="text-slate-400">Producto:</span> <strong>{productoNombre}</strong></p><p><span className="text-slate-400">Caducidad:</span> {lote.fecha_caducidad || 'Sin fecha'}</p><p><span className="text-slate-400">Stock total:</span> {lote.total_lote} unidades</p></div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button variante="peligro" onClick={eliminar} cargando={eliminando}>Eliminar lote</Button>
        </div>
      </div>
    </div>
  )
}

export default function ModalLotes({ producto, onCerrar, onCambio }) {
  const { sucursales } = useApp()
  const [lotes, setLotes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [editarLote, setEditarLote] = useState(null)
  const [cuadrarLote, setCuadrarLote] = useState(null)
  const [eliminarLote, setEliminarLote] = useState(null)
  // Sucursales donde este producto está habilitado
  const [sucursalesHabilitadas, setSucursalesHabilitadas] = useState(sucursales)

  useEffect(() => { if (producto) cargarLotes() }, [producto])

  const cargarLotes = async () => {
    setCargando(true)
    try {
      const [{ data, error }, { data: ps }] = await Promise.all([
        supabase.rpc('lotes_de_producto', { p_producto_id: producto.producto_id }),
        supabase.from('productos_sucursales')
          .select('sucursal_id, habilitado')
          .eq('producto_id', producto.producto_id),
      ])
      if (error) throw error
      setLotes(data || [])

      // Si hay filas en productos_sucursales, filtrar solo las habilitadas
      // Si no hay filas (producto sin configuración), mostrar todas
      if (ps && ps.length > 0) {
        const deshabilitadas = new Set(ps.filter(r => !r.habilitado).map(r => r.sucursal_id))
        setSucursalesHabilitadas(sucursales.filter(s => !deshabilitadas.has(s.id)))
      } else {
        setSucursalesHabilitadas(sucursales)
      }
    }
    catch (err) { console.error(err) } finally { setCargando(false) }
  }

  const handleSubExito = () => { setEditarLote(null); setCuadrarLote(null); setEliminarLote(null); cargarLotes(); onCambio?.() }

  if (!producto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center"><Package className="w-5 h-5 text-primary-600" /></div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">{producto.producto_nombre}</h3>
              <p className="text-xs text-slate-500">{producto.categoria || 'Sin categoría'} · Stock total: <strong>{producto.stock_total}</strong></p>
            </div>
          </div>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {cargando ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
          ) : lotes.length === 0 ? (
            <div className="text-center py-8"><Package className="w-10 h-10 text-slate-300 mx-auto mb-3" /><p className="text-sm text-slate-500">No hay lotes registrados</p></div>
          ) : (
            lotes.map(lote => {
              const est = ESTADOS[lote.estado_caducidad] || ESTADOS.sin_fecha
              const stockSuc = lote.stock_por_sucursal || {}
              return (
                <div key={lote.lote_id} className={cn('bg-white border border-slate-200 rounded-2xl overflow-hidden border-l-4', est.borde)}>
                  {/* Cabecera */}
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', est.punto)} />
                      <span className="text-sm font-mono font-bold text-slate-900">{lote.codigo_lote}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className={cn('text-[11px] font-bold px-2.5 py-1 rounded-full border', est.badge)}>{est.texto}</span>
                      <span className="text-base font-bold text-slate-900">{lote.total_lote} uds</span>
                    </div>
                  </div>
                  {/* Fecha */}
                  <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      Caduca: {lote.fecha_caducidad ? formatoFecha(lote.fecha_caducidad) : 'Sin fecha'}
                      {lote.dias_para_caducar !== null && (
                        <span className={cn('ml-1.5 font-semibold', lote.dias_para_caducar < 0 ? 'text-red-600' : lote.dias_para_caducar <= 30 ? 'text-amber-600' : 'text-slate-500')}>
                          · {lote.dias_para_caducar < 0 ? `hace ${Math.abs(lote.dias_para_caducar)}d` : `${lote.dias_para_caducar}d restantes`}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Grid sucursales — solo las habilitadas para este producto */}
                  <div className="px-4 py-3 border-t border-slate-100">
                    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(sucursalesHabilitadas.length, 3)}, 1fr)` }}>
                      {sucursalesHabilitadas.map(s => {
                        const cant = Number(stockSuc[s.id] || 0)
                        return (
                          <div key={s.id} className={cn('text-center py-3 px-2 rounded-xl border', cant > 0 ? 'bg-primary-50/50 border-primary-200' : 'bg-slate-50 border-slate-200')}>
                            <p className={cn('text-[11px] font-semibold mb-1', cant > 0 ? 'text-primary-700' : 'text-slate-500')}>{s.nombre}</p>
                            <p className={cn('text-2xl font-bold tabular-nums', cant === 0 ? 'text-slate-300' : 'text-slate-900')}>{cant}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">uds</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {/* Acciones */}
                  <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-center gap-2">
                    <button onClick={() => setEditarLote(lote)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button onClick={() => setCuadrarLote(lote)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary-700 border border-primary-200 bg-primary-50 hover:bg-primary-100 transition-colors">
                      <Scale className="w-3.5 h-3.5" /> Cuadrar
                    </button>
                    <button onClick={() => setEliminarLote(lote)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Dar de baja
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {editarLote && <ModalEditarLote lote={editarLote} onCerrar={() => setEditarLote(null)} onGuardar={handleSubExito} />}
      {cuadrarLote && <ModalCuadrar lote={cuadrarLote} sucursales={sucursalesHabilitadas} onCerrar={() => setCuadrarLote(null)} onGuardar={handleSubExito} />}
      {eliminarLote && <ModalEliminarLote lote={eliminarLote} productoNombre={producto.producto_nombre} onCerrar={() => setEliminarLote(null)} onConfirmar={handleSubExito} />}
    </div>
  )
}