import { useEffect, useState, useCallback, useRef} from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  CreditCard, Phone, CalendarClock, CheckCircle2,
  Bell, Clock, AlertCircle, RefreshCw, ChevronRight,
  Building2, Search, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { toast } from 'sonner'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function estadoPago(empresa) {
  if (!empresa.dia_pago) return 'sin_configurar'
  const hoy = new Date()
  const diaHoy = hoy.getDate()
  if (empresa.ultimo_pago) {
    const up = new Date(empresa.ultimo_pago + 'T12:00:00')
    if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth())
      return 'pagado'
  }
  if (diaHoy === empresa.dia_pago) return 'hoy'
  if (diaHoy > empresa.dia_pago)   return 'vencido'
  const diasFaltan = empresa.dia_pago - diaHoy
  if (diasFaltan <= 5) return 'proximo'
  return 'al_corriente'
}

const ESTADO_CONFIG = {
  vencido:        { label: 'Vencido',      bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500',    orden: 0 },
  hoy:            { label: 'Pago hoy',     bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500',  orden: 1 },
  proximo:        { label: 'Próximo',      bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200',    dot: 'bg-sky-500',    orden: 2 },
  pagado:         { label: 'Pagado',       bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500',orden: 3 },
  al_corriente:   { label: 'Al corriente', bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  dot: 'bg-slate-400',  orden: 4 },
  sin_configurar: { label: 'Sin día',      bg: 'bg-slate-50',   text: 'text-slate-400',  border: 'border-slate-200',  dot: 'bg-slate-300',  orden: 5 },
}

const HOY_STR = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CobranzaPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [empresas, setEmpresas] = useState([])
  const [cargando, setCargando] = useState(true)
  const cargandoRef = useRef(false)
  const [filtro, setFiltro] = useState('urgentes')
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(async () => {
    if (cargandoRef.current) return
    cargandoRef.current = true
    setCargando(true)
    try {
      // El RPC ya excluye eliminadas y ordena por nombre
      const { data, error } = await supabase.rpc('datos_cobranza_super')
      if (error) throw error
      setEmpresas(data || [])
    } catch (err) {
      toast.error(err.message || 'Error al cargar')
    } finally {
      cargandoRef.current = false
      setCargando(false)
    }
  }, [])

  // Recarga al navegar aquí (location.key cambia en cada navegación) y al enfocar ventana
  useEffect(() => { cargar() }, [cargar, location.key])
  useFocusRefresh(cargar)

  const marcarPagado = async (empresaId, e) => {
    e.stopPropagation()
    const hoy = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.rpc('marcar_empresa_pagada', { p_empresa_id: empresaId })
    if (error) { toast.error(error.message); return }
    setEmpresas(prev => prev.map(emp => emp.id === empresaId ? { ...emp, ultimo_pago: hoy } : emp))
    toast.success('Pago registrado')
  }

  // Enriquecer con estado calculado y ordenar por urgencia
  const conEstado = empresas
    .map(e => ({ ...e, _estado: estadoPago(e) }))
    .sort((a, b) => ESTADO_CONFIG[a._estado].orden - ESTADO_CONFIG[b._estado].orden)

  // Filtrar
  const filtradas = conEstado.filter(e => {
    const q = busqueda.trim().toLowerCase()
    const matchBusqueda = !q ||
      e.nombre.toLowerCase().includes(q) ||
      (e.cliente_nombre || '').toLowerCase().includes(q) ||
      (e.cliente_telefono || '').includes(q)
    if (!matchBusqueda) return false
    if (filtro === 'urgentes')   return e._estado === 'vencido' || e._estado === 'hoy'
    if (filtro === 'pendientes') return e._estado === 'vencido' || e._estado === 'hoy' || e._estado === 'proximo'
    if (filtro === 'pagados')    return e._estado === 'pagado'
    if (filtro === 'sin_dia')    return e._estado === 'sin_configurar'
    return true
  })

  // KPIs
  const kpis = {
    vencido:  conEstado.filter(e => e._estado === 'vencido').length,
    hoy:      conEstado.filter(e => e._estado === 'hoy').length,
    proximo:  conEstado.filter(e => e._estado === 'proximo').length,
    pagado:   conEstado.filter(e => e._estado === 'pagado').length,
    total:    conEstado.filter(e => e._estado !== 'sin_configurar').length,
  }

  const urgentes = kpis.vencido + kpis.hoy

  const FILTROS = [
    { v: 'urgentes',   label: 'Urgentes',   count: urgentes },
    { v: 'pendientes', label: 'Pendientes', count: kpis.vencido + kpis.hoy + kpis.proximo },
    { v: 'pagados',    label: 'Pagados',    count: kpis.pagado },
    { v: 'todos',      label: 'Todos',      count: conEstado.length },
    { v: 'sin_dia',    label: 'Sin día',    count: conEstado.length - kpis.total },
  ]

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Cobranza</h1>
          <p className="text-sm text-slate-500 mt-1 capitalize">{HOY_STR}</p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {/* KPIs */}
      {!cargando && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={cn('rounded-2xl p-4 border text-center', urgentes > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200')}>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <AlertCircle className={cn('w-4 h-4', urgentes > 0 ? 'text-red-500' : 'text-slate-400')} />
              <p className={cn('text-2xl font-bold tabular-nums', urgentes > 0 ? 'text-red-700' : 'text-slate-500')}>{urgentes}</p>
            </div>
            <p className={cn('text-xs', urgentes > 0 ? 'text-red-600' : 'text-slate-400')}>Vencido / Hoy</p>
          </div>
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Clock className="w-4 h-4 text-sky-500" />
              <p className="text-2xl font-bold text-sky-700 tabular-nums">{kpis.proximo}</p>
            </div>
            <p className="text-xs text-sky-600">Próximos (≤5 días)</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{kpis.pagado}</p>
            </div>
            <p className="text-xs text-emerald-600">Pagados este mes</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CreditCard className="w-4 h-4 text-slate-400" />
              <p className="text-2xl font-bold text-slate-700 tabular-nums">{kpis.total}</p>
            </div>
            <p className="text-xs text-slate-500">Con día de pago</p>
          </div>
        </div>
      )}

      {/* Filtros + búsqueda */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar empresa, contacto o teléfono..."
            className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {FILTROS.map(f => (
            <button key={f.v} onClick={() => setFiltro(f.v)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                filtro === f.v
                  ? 'bg-gradient-to-b from-primary-600 to-primary-700 text-white border-transparent shadow-md shadow-primary-500/30'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              )}>
              {f.label}
              {f.count > 0 && (
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                  filtro === f.v ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
        {cargando ? (
          <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Bell className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">
              {busqueda ? 'Sin resultados para esa búsqueda' : 'Sin empresas en este filtro'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtradas.map(empresa => {
              const ep = empresa._estado
              const cfg = ESTADO_CONFIG[ep]
              const diasFaltan = empresa.dia_pago
                ? empresa.dia_pago - new Date().getDate()
                : null

              return (
                <div key={empresa.id}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/super/empresas/${empresa.id}`)}>

                  {/* Dot urgencia */}
                  <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', cfg.dot)} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900 truncate">{empresa.nombre}</p>
                      <span className={cn('inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.bg, cfg.text, cfg.border)}>
                        {cfg.label}
                        {ep === 'proximo' && diasFaltan > 0 && ` · ${diasFaltan}d`}
                        {(ep === 'hoy' || ep === 'vencido') && empresa.dia_pago && ` · día ${empresa.dia_pago}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {empresa.cliente_nombre && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Building2 className="w-3 h-3 text-slate-300" />
                          {empresa.cliente_nombre}
                        </span>
                      )}
                      {empresa.cliente_telefono && (
                        <a href={`tel:${empresa.cliente_telefono}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
                          <Phone className="w-3 h-3" />
                          {empresa.cliente_telefono}
                        </a>
                      )}
                      {empresa.dia_pago && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <CalendarClock className="w-3 h-3" />
                          Día {empresa.dia_pago}
                        </span>
                      )}
                      {Number(empresa.precio_mensual) > 0 && (
                        <span className="text-xs font-bold text-emerald-700 tabular-nums">
                          {formatoMoneda(empresa.precio_mensual)}
                        </span>
                      )}
                      {empresa.ultimo_pago && (
                        <span className="text-xs text-slate-400">
                          Último: {new Date(empresa.ultimo_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(ep === 'vencido' || ep === 'hoy') && (
                      <button
                        onClick={e => marcarPagado(empresa.id, e)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Pagado
                      </button>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
