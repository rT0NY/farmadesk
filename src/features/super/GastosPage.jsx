import { useEffect, useState, useCallback, useRef} from 'react'
import {
  Receipt, Plus, Trash2, Edit2, CheckCircle2, RefreshCw,
  AlertCircle, X, Save, CalendarClock, DollarSign,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'sonner'

function estadoGasto(g) {
  if (!g.dia_mes) return 'sin_dia'
  const hoy = new Date()
  if (g.ultimo_pago) {
    const up = new Date(g.ultimo_pago + 'T12:00:00')
    if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth()) return 'pagado'
  }
  const d = hoy.getDate()
  if (d > g.dia_mes)   return 'vencido'
  if (d === g.dia_mes) return 'hoy'
  return 'pendiente'
}

const ESTADO_CFG = {
  vencido:  { label: 'Vencido',   bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  hoy:      { label: 'Pago hoy',  bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  pendiente:{ label: 'Pendiente', bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
  pagado:   { label: 'Pagado',    bg: 'bg-emerald-100',text: 'text-emerald-700',dot: 'bg-emerald-500' },
  sin_dia:  { label: 'Sin día',   bg: 'bg-slate-50',   text: 'text-slate-400',  dot: 'bg-slate-300'  },
}

function ModalGasto({ gasto, onCerrar, onExito }) {
  const esEdicion = !!gasto?.id
  const [form, setForm] = useState({
    nombre:        gasto?.nombre        ?? '',
    monto_mensual: gasto?.monto_mensual != null ? String(gasto.monto_mensual) : '',
    dia_mes:       gasto?.dia_mes       != null ? String(gasto.dia_mes) : '',
    notas:         gasto?.notas         ?? '',
  })
  const [cargando, setCargando] = useState(false)
  const cargandoRef = useRef(false)

  const guardar = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return toast.error('El nombre es requerido')
    const monto = parseFloat(form.monto_mensual)
    if (isNaN(monto) || monto < 0) return toast.error('Monto inválido')

    if (cargandoRef.current) return
    cargandoRef.current = true
    setCargando(true)
    try {
      const payload = {
        nombre:        form.nombre.trim(),
        monto_mensual: monto,
        dia_mes:       form.dia_mes ? parseInt(form.dia_mes) : null,
        notas:         form.notas.trim() || null,
      }
      if (esEdicion) {
        const { error } = await supabase.from('gastos_super').update(payload).eq('id', gasto.id)
        if (error) throw error
        toast.success('Gasto actualizado')
      } else {
        const { error } = await supabase.from('gastos_super').insert([payload])
        if (error) throw error
        toast.success('Gasto creado')
      }
      onExito?.()
      onCerrar()
    } catch (err) {
      toast.error(err.message || 'Error al guardar')
    } finally {
      cargandoRef.current = false
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => !cargando && onCerrar()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-modal-in">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-md shadow-red-500/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {esEdicion ? 'Editar gasto' : 'Nuevo gasto'}
              </h3>
              <p className="text-xs text-slate-500">Gasto mensual recurrente</p>
            </div>
          </div>
          <button onClick={onCerrar} disabled={cargando}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={guardar} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">Nombre *</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej. Supabase, Hosting, Dominio..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">Monto mensual (MXN) *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">$</span>
              <input type="number" min="0" step="0.01" value={form.monto_mensual}
                onChange={e => setForm(f => ({ ...f, monto_mensual: e.target.value }))}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
              Día de cobro mensual (opcional)
            </label>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                <button key={d} type="button"
                  onClick={() => setForm(f => ({ ...f, dia_mes: f.dia_mes === String(d) ? '' : String(d) }))}
                  className={cn(
                    'h-9 rounded-xl text-sm font-semibold transition-all',
                    form.dia_mes === String(d)
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-700 border border-slate-200'
                  )}>
                  {d}
                </button>
              ))}
            </div>
            {form.dia_mes
              ? <p className="text-[10px] text-red-600 font-medium">Se cobra el día {form.dia_mes} de cada mes</p>
              : <p className="text-[10px] text-slate-400">Selecciona el día del mes (1–28)</p>
            }
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500">Notas (opcional)</label>
            <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
              placeholder="Ej. Plan Pro, servidor X..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white" />
          </div>
        </form>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <button onClick={onCerrar} disabled={cargando}
            className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={guardar} disabled={cargando}
            className="flex-1 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            <Save className="w-4 h-4" />
            {cargando ? 'Guardando...' : esEdicion ? 'Actualizar' : 'Crear gasto'}
          </button>
        </div>
      </div>
    </div>
  )
}

const HOY_STR = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

export default function GastosPage() {
  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const cargandoRef = useRef(false)
  const [modalGasto, setModalGasto] = useState(null)

  const cargar = useCallback(async () => {
    if (cargandoRef.current) return
    cargandoRef.current = true
    setCargando(true)
    try {
      const { data, error } = await supabase.rpc('obtener_gastos_super')
      if (error) throw error
      setGastos(data || [])
    } catch (err) {
      toast.error(err.message || 'Error al cargar gastos')
    } finally {
      cargandoRef.current = false
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const marcarPagado = async (gastoId) => {
    const { error } = await supabase.rpc('marcar_gasto_super_pagado', { p_gasto_id: gastoId })
    if (error) { toast.error(error.message); return }
    const hoy = new Date().toISOString().slice(0, 10)
    setGastos(prev => prev.map(g => g.id === gastoId ? { ...g, ultimo_pago: hoy } : g))
    toast.success('Gasto marcado como pagado')
  }

  const eliminar = async (gasto) => {
    if (!window.confirm(`¿Eliminar el gasto "${gasto.nombre}"?`)) return
    const { error } = await supabase.from('gastos_super').delete().eq('id', gasto.id)
    if (error) { toast.error(error.message); return }
    setGastos(prev => prev.filter(g => g.id !== gasto.id))
    toast.success('Gasto eliminado')
  }

  const conEstado = gastos.map(g => ({ ...g, _estado: estadoGasto(g) }))
  const totalMonto = gastos.reduce((s, g) => s + Number(g.monto_mensual || 0), 0)
  const vencidos = conEstado.filter(g => g._estado === 'vencido' || g._estado === 'hoy').length
  const pagados  = conEstado.filter(g => g._estado === 'pagado').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Gastos</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{HOY_STR}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={cargar} disabled={cargando}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
          </button>
          <button onClick={() => setModalGasto({})}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo gasto</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        </div>
      </div>

      {/* KPIs */}
      {!cargando && (
        <div className="grid grid-cols-3 gap-3">
          <div className={cn('rounded-2xl p-4 border text-center', vencidos > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200')}>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AlertCircle className={cn('w-4 h-4', vencidos > 0 ? 'text-red-500' : 'text-slate-400')} />
              <p className={cn('text-2xl font-bold tabular-nums', vencidos > 0 ? 'text-red-700' : 'text-slate-500')}>{vencidos}</p>
            </div>
            <p className={cn('text-xs', vencidos > 0 ? 'text-red-600' : 'text-slate-400')}>Por pagar</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{pagados}</p>
            </div>
            <p className="text-xs text-emerald-600">Pagados este mes</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <p className="text-base font-bold text-slate-700 tabular-nums leading-tight">{formatoMoneda(totalMonto)}</p>
            </div>
            <p className="text-xs text-slate-500">Total mensual</p>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
        {cargando ? (
          <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : gastos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">Sin gastos registrados</p>
            <button onClick={() => setModalGasto({})}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Agregar primer gasto
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conEstado.map(g => {
              const cfg = ESTADO_CFG[g._estado]
              return (
                <div key={g.id} className="flex items-center gap-4 px-5 py-4">
                  <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{g.nombre}</p>
                      <span className={cn('inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full', cfg.bg, cfg.text)}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-sm font-bold text-slate-700 tabular-nums">{formatoMoneda(g.monto_mensual)}</span>
                      {g.dia_mes && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <CalendarClock className="w-3 h-3" /> Día {g.dia_mes}
                        </span>
                      )}
                      {g.notas && <span className="text-xs text-slate-400">{g.notas}</span>}
                      {g.ultimo_pago && (
                        <span className="text-xs text-slate-400">
                          Último: {new Date(g.ultimo_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(g._estado === 'vencido' || g._estado === 'hoy') && (
                      <button onClick={() => marcarPagado(g.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 transition-colors">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Pagado
                      </button>
                    )}
                    <button onClick={() => setModalGasto(g)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors border border-slate-200">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => eliminar(g)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors border border-red-200">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalGasto !== null && (
        <ModalGasto
          gasto={modalGasto && Object.keys(modalGasto).length > 0 ? modalGasto : null}
          onCerrar={() => setModalGasto(null)}
          onExito={cargar}
        />
      )}
    </div>
  )
}
