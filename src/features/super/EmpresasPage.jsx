import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, RefreshCw, Building2, Users, Store, TrendingUp, ChevronRight,
  Bell, Phone, CheckCircle2, CalendarClock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatoMoneda } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import ModalCrearEmpresa from './ModalCrearEmpresa'
import { cn } from '@/lib/clases'

// Verifica si una empresa tiene pago pendiente este mes
function estadoPago(empresa) {
  if (!empresa.dia_pago) return null
  const hoy = new Date()
  const diaHoy = hoy.getDate()
  if (empresa.ultimo_pago) {
    const up = new Date(empresa.ultimo_pago + 'T12:00:00')
    if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth()) {
      return 'pagado'
    }
  }
  if (diaHoy === empresa.dia_pago) return 'hoy'
  if (diaHoy > empresa.dia_pago)   return 'vencido'
  return 'proximo' // aún no llega el día
}

const ESTADO_INFO = {
  activa:     { label: 'Activa',     dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  suspendida: { label: 'Suspendida', dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  eliminada:  { label: 'Eliminada',  dot: 'bg-red-500',     badge: 'bg-red-50 text-red-700 border-red-200' },
}

const FILTROS = [
  { v: 'todas',     label: 'Todas'      },
  { v: 'activa',    label: 'Activas'    },
  { v: 'suspendida',label: 'Suspendidas'},
]

export default function EmpresasPage() {
  const navigate = useNavigate()
  const [empresas, setEmpresas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [modalAbierto, setModalAbierto] = useState(false)

  const cargar = async () => {
    setCargando(true)
    try {
      const [{ data, error }, { data: billing }] = await Promise.all([
        supabase.rpc('resumen_empresas_super'),
        supabase.from('empresas').select('id, cliente_nombre, cliente_telefono, dia_pago, ultimo_pago').neq('estado', 'eliminada'),
      ])
      if (error) throw error
      const bMap = {}
      ;(billing || []).forEach(e => { bMap[e.id] = e })
      setEmpresas((data || []).map(e => ({ ...e, ...bMap[e.id] })))
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }

  const marcarPagado = async (empresaId, e) => {
    e.stopPropagation()
    const hoy = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('empresas').update({ ultimo_pago: hoy }).eq('id', empresaId)
    if (error) { console.error(error); return }
    setEmpresas(prev => prev.map(emp =>
      emp.id === empresaId ? { ...emp, ultimo_pago: hoy } : emp
    ))
  }

  useEffect(() => { cargar() }, [])

  const filtradas = empresas
    .filter(e => filtro === 'todas' || e.estado === filtro)
    .filter(e => !busqueda.trim() || e.nombre.toLowerCase().includes(busqueda.toLowerCase()))

  const conteos = empresas.reduce((acc, e) => {
    acc[e.estado] = (acc[e.estado] || 0) + 1
    return acc
  }, {})

  const abrirDetalle = (empresa) => {
    if (empresa.estado === 'eliminada') return
    navigate(`/super/empresas/${empresa.id}`)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Empresas</h1>
          <p className="text-sm text-slate-500 mt-1">
            {empresas.length} cliente{empresas.length !== 1 ? 's' : ''} registrado{empresas.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setModalAbierto(true)} iconoIzq={<Plus className="w-4 h-4" />}>
          <span className="hidden sm:inline">Nueva empresa</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {/* KPIs */}
      {!cargando && empresas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-emerald-700">{conteos.activa || 0}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Activas</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{conteos.suspendida || 0}</p>
            <p className="text-xs text-amber-600 mt-0.5">Suspendidas</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-slate-700">{empresas.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total</p>
          </div>
        </div>
      )}

      {/* Banner recordatorio de pagos */}
      {(() => {
        const urgentes = empresas.filter(e => {
          const ep = estadoPago(e)
          return ep === 'hoy' || ep === 'vencido'
        })
        if (urgentes.length === 0) return null
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-3xl px-5 py-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-800">
                {urgentes.length === 1
                  ? '1 empresa con pago pendiente'
                  : `${urgentes.length} empresas con pago pendiente`}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {urgentes.map(e => {
                const ep = estadoPago(e)
                return (
                  <div key={e.id} className="flex items-center gap-3 bg-white border border-amber-200 rounded-2xl px-4 py-3">
                    <div className={cn('w-2 h-2 rounded-full flex-shrink-0', ep === 'hoy' ? 'bg-amber-500' : 'bg-red-500')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{e.nombre}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {e.cliente_nombre && (
                          <span className="text-xs text-slate-500">{e.cliente_nombre}</span>
                        )}
                        {e.cliente_telefono && (
                          <a href={`tel:${e.cliente_telefono}`} onClick={ev => ev.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
                            <Phone className="w-3 h-3" />{e.cliente_telefono}
                          </a>
                        )}
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                          ep === 'hoy' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                          {ep === 'hoy' ? `Hoy · día ${e.dia_pago}` : `Vencido · día ${e.dia_pago}`}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={ev => marcarPagado(e.id, ev)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex-shrink-0"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Pagado
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Controles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="Buscar empresa..."
            iconoIzq={<Search className="w-5 h-5" />}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTROS.map(f => (
            <button
              key={f.v}
              onClick={() => setFiltro(f.v)}
              className={cn(
                'px-4 py-2.5 rounded-2xl text-sm font-medium border transition-all',
                filtro === f.v
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              )}
            >
              {f.label}
              <span className={cn('ml-2 text-xs px-1.5 py-0.5 rounded-full', filtro === f.v ? 'bg-white/20' : 'bg-slate-100')}>
                {f.v === 'todas' ? empresas.length : conteos[f.v] || 0}
              </span>
            </button>
          ))}
          <button
            onClick={cargar}
            disabled={cargando}
            className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
        {cargando ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">
              {empresas.length === 0
                ? 'Sin empresas registradas. Crea la primera.'
                : 'Sin resultados para ese filtro.'}
            </p>
          </div>
        ) : (
          <>
            {/* Cabecera tabla */}
            <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/60">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Empresa</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Usuarios</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Sucursales</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Ventas/mes</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Ingresos/mes</p>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider"></p>
            </div>

            <div className="divide-y divide-slate-100">
              {filtradas.map(empresa => {
                const info = ESTADO_INFO[empresa.estado] || ESTADO_INFO.activa
                const clickable = empresa.estado !== 'eliminada'
                return (
                  <div
                    key={empresa.id}
                    onClick={() => abrirDetalle(empresa)}
                    className={cn(
                      'flex items-center gap-3 px-5 py-4 transition-colors',
                      clickable ? 'cursor-pointer hover:bg-slate-50/80' : 'opacity-50',
                    )}
                  >
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-primary-600" />
                    </div>

                    {/* Info principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 truncate">{empresa.nombre}</p>
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', info.badge)}>
                          <span className={cn('w-1 h-1 rounded-full', info.dot)} />
                          {info.label}
                        </span>
                        {(() => {
                          const ep = estadoPago(empresa)
                          if (!ep || ep === 'proximo') return null
                          if (ep === 'pagado') return (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                              <CheckCircle2 className="w-2.5 h-2.5" />Pagado
                            </span>
                          )
                          return (
                            <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                              ep === 'hoy' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200')}>
                              <CalendarClock className="w-2.5 h-2.5" />
                              {ep === 'hoy' ? 'Pago hoy' : 'Pago vencido'}
                            </span>
                          )
                        })()}
                      </div>
                      {empresa.motivo_suspension && (
                        <p className="text-xs text-amber-600 mt-0.5 truncate">{empresa.motivo_suspension}</p>
                      )}
                    </div>

                    {/* Métricas — desktop */}
                    <div className="hidden sm:flex items-center gap-6 flex-shrink-0">
                      <div className="text-right w-20">
                        <div className="flex items-center justify-end gap-1">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-700">{empresa.total_usuarios || 0}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">usuarios</p>
                      </div>
                      <div className="text-right w-20">
                        <div className="flex items-center justify-end gap-1">
                          <Store className="w-3 h-3 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-700">{empresa.total_sucursales || 0}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">sucursales</p>
                      </div>
                      <div className="text-right w-20">
                        <div className="flex items-center justify-end gap-1">
                          <TrendingUp className="w-3 h-3 text-slate-400" />
                          <span className="text-sm font-semibold text-slate-700">{empresa.total_ventas_mes || 0}</span>
                        </div>
                        <p className="text-[10px] text-slate-400">ventas/mes</p>
                      </div>
                      <div className="text-right w-24">
                        <p className="text-sm font-bold text-emerald-700 tabular-nums">
                          {Number(empresa.monto_ventas_mes) > 0 ? formatoMoneda(empresa.monto_ventas_mes) : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400">ingresos/mes</p>
                      </div>
                    </div>

                    {/* Métricas — mobile */}
                    <div className="flex sm:hidden items-center gap-3 flex-shrink-0 text-right">
                      <div>
                        <p className="text-xs font-semibold text-slate-700">{empresa.total_usuarios || 0} usr · {empresa.total_sucursales || 0} suc</p>
                        {Number(empresa.monto_ventas_mes) > 0 && (
                          <p className="text-xs font-bold text-emerald-600">{formatoMoneda(empresa.monto_ventas_mes)}</p>
                        )}
                      </div>
                    </div>

                    {clickable && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <ModalCrearEmpresa
        abierto={modalAbierto}
        onCerrar={() => setModalAbierto(false)}
        onExito={cargar}
      />
    </div>
  )
}
