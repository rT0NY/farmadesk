import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  TrendingUp, DollarSign, Clock, CheckCircle2,
  Building2, CreditCard, Receipt, RefreshCw,
  ChevronRight, Phone, Bell, AlertCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'

function estadoPagoEmpresa(e) {
  if (!e.dia_pago) return null
  const hoy = new Date(); const d = hoy.getDate()
  if (e.ultimo_pago) {
    const up = new Date(e.ultimo_pago + 'T12:00:00')
    if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth()) return 'pagado'
  }
  if (d === e.dia_pago) return 'hoy'
  if (d > e.dia_pago)   return 'vencido'
  return 'proximo'
}

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

const COLOR_ICON = {
  blue:    'bg-primary-50 border-primary-100 text-primary-600',
  emerald: 'bg-emerald-50 border-emerald-100 text-emerald-600',
  amber:   'bg-amber-50 border-amber-100 text-amber-600',
  red:     'bg-red-50 border-red-100 text-red-600',
  slate:   'bg-slate-100 border-slate-200 text-slate-500',
}

function KpiCard({ label, value, sub, icon: Icon, color = 'blue' }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <p className="text-xs font-semibold text-slate-500 leading-tight">{label}</p>
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border', COLOR_ICON[color])}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const HOY_STR = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

export default function DashboardSuperPage() {
  const navigate = useNavigate()
  const [kpis, setKpis] = useState(null)
  const [gastos, setGastos] = useState([])
  const [urgentes, setUrgentes] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [{ data: kpisData }, { data: gastosData }, { data: empresasData }] = await Promise.all([
        supabase.rpc('resumen_dashboard_super'),
        supabase.rpc('obtener_gastos_super'),
        supabase.from('empresas')
          .select('id, nombre, estado, dia_pago, ultimo_pago, precio_mensual, cliente_nombre, cliente_telefono')
          .neq('estado', 'eliminada'),
      ])
      setKpis(kpisData)
      setGastos(gastosData || [])
      setUrgentes((empresasData || []).filter(e => {
        const ep = estadoPagoEmpresa(e)
        return ep === 'hoy' || ep === 'vencido'
      }))
    } catch (err) {
      toast.error(err.message || 'Error al cargar dashboard')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const mrr          = Number(kpis?.mrr_esperado || 0)
  const cobrado      = Number(kpis?.cobrado_mes || 0)
  const pendiente    = mrr - cobrado
  const gastosTotal  = gastos.reduce((s, g) => s + Number(g.monto_mensual), 0)
  const gananciaNeta = cobrado - gastosTotal
  const pctCobrado   = mrr > 0 ? Math.round((cobrado / mrr) * 100) : 0

  const gastosUrgentes = gastos.filter(g => {
    const eg = estadoGasto(g); return eg === 'hoy' || eg === 'vencido'
  })

  const marcarEmpresaPagada = async (empresaId, ev) => {
    ev.stopPropagation()
    const { error } = await supabase.rpc('marcar_empresa_pagada', { p_empresa_id: empresaId })
    if (error) { toast.error(error.message); return }
    setUrgentes(prev => prev.filter(e => e.id !== empresaId))
    toast.success('Pago registrado')
  }

  const marcarGastoPagado = async (gastoId) => {
    const { error } = await supabase.rpc('marcar_gasto_super_pagado', { p_gasto_id: gastoId })
    if (error) { toast.error(error.message); return }
    const hoy = new Date().toISOString().slice(0, 10)
    setGastos(prev => prev.map(g => g.id === gastoId ? { ...g, ultimo_pago: hoy } : g))
    toast.success('Gasto marcado como pagado')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{HOY_STR}</p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {cargando ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="MRR esperado" value={formatoMoneda(mrr)}
              sub={`${kpis?.empresas_con_precio || 0} empresa${kpis?.empresas_con_precio !== 1 ? 's' : ''}`}
              icon={TrendingUp} color="blue" />
            <KpiCard label="Cobrado este mes" value={formatoMoneda(cobrado)}
              sub={`${pctCobrado}% del MRR`}
              icon={CheckCircle2} color="emerald" />
            <KpiCard label="Por cobrar" value={formatoMoneda(pendiente)}
              sub={`${(kpis?.empresas_con_precio || 0) - (kpis?.empresas_pagadas_mes || 0)} pendientes`}
              icon={Clock} color="amber" />
            <KpiCard label="Ganancia neta" value={formatoMoneda(gananciaNeta)}
              sub="cobrado − gastos"
              icon={DollarSign} color={gananciaNeta >= 0 ? 'emerald' : 'red'} />
          </div>

          {/* KPIs secundarios */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Empresas activas" value={kpis?.empresas_activas || 0}
              sub={`${kpis?.empresas_pagadas_mes || 0} pagadas este mes`}
              icon={Building2} color="blue" />
            <KpiCard label="Sin precio" value={(kpis?.empresas_activas || 0) - (kpis?.empresas_con_precio || 0)}
              sub="empresas sin precio"
              icon={AlertCircle} color="slate" />
            <KpiCard label="Gastos del mes" value={formatoMoneda(gastosTotal)}
              sub={`${gastos.length} concepto${gastos.length !== 1 ? 's' : ''}`}
              icon={Receipt} color="red" />
            <KpiCard label="Pagadas / Total" value={`${kpis?.empresas_pagadas_mes || 0} / ${kpis?.empresas_con_precio || 0}`}
              sub="con precio registrado"
              icon={CreditCard} color="blue" />
          </div>

          {/* Alerta: empresas */}
          {urgentes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-sm font-bold text-amber-800">
                  {urgentes.length} empresa{urgentes.length !== 1 ? 's' : ''} con pago pendiente
                </p>
              </div>
              <div className="space-y-2">
                {urgentes.map(e => {
                  const ep = estadoPagoEmpresa(e)
                  return (
                    <div key={e.id}
                      onClick={() => navigate(`/super/empresas/${e.id}`)}
                      className="flex items-center gap-3 bg-white border border-amber-200 rounded-2xl px-4 py-3 cursor-pointer hover:bg-amber-50/50 transition-colors">
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', ep === 'hoy' ? 'bg-amber-500' : 'bg-red-500')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{e.nombre}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500">{e.cliente_nombre || '—'}</span>
                          {e.cliente_telefono && (
                            <a href={`tel:${e.cliente_telefono}`} onClick={ev => ev.stopPropagation()}
                              className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
                              <Phone className="w-3 h-3" />{e.cliente_telefono}
                            </a>
                          )}
                          {Number(e.precio_mensual) > 0 && (
                            <span className="text-xs font-bold text-slate-700">{formatoMoneda(e.precio_mensual)}</span>
                          )}
                        </div>
                      </div>
                      <button onClick={ev => marcarEmpresaPagada(e.id, ev)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex-shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />Pagado
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Alerta: gastos */}
          {gastosUrgentes.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-3xl px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-red-600 flex-shrink-0" />
                <p className="text-sm font-bold text-red-800">
                  {gastosUrgentes.length} gasto{gastosUrgentes.length !== 1 ? 's' : ''} por marcar como pagado
                </p>
              </div>
              <div className="space-y-2">
                {gastosUrgentes.map(g => (
                  <div key={g.id} className="flex items-center gap-3 bg-white border border-red-200 rounded-2xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{g.nombre}</p>
                      <p className="text-xs text-slate-500">{formatoMoneda(g.monto_mensual)} · Día {g.dia_mes}</p>
                    </div>
                    <button onClick={() => marcarGastoPagado(g.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 transition-colors flex-shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />Pagado
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Todo en orden */}
          {urgentes.length === 0 && gastosUrgentes.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-3.5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-emerald-800">Todo al corriente este mes</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
