import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CreditCard, User, Check, Building2, X,
  Banknote, CheckCircle2, Clock, Search, ArrowUpDown,
  AlertTriangle, Calendar,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoMoneda, formatoFecha } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

// ─── Tarjeta resumen ──────────────────────────────────────────────────────────

function TarjetaKpi({ titulo, valor, sub, color }) {
  const cls = {
    red:    { wrap: 'bg-red-50    border-red-200',    num: 'text-red-700',    sub: 'text-red-400'    },
    amber:  { wrap: 'bg-amber-50  border-amber-200',  num: 'text-amber-700',  sub: 'text-amber-500'  },
    emerald:{ wrap: 'bg-emerald-50 border-emerald-200',num:'text-emerald-700',sub: 'text-emerald-500' },
  }[color] ?? {}
  return (
    <div className={cn('rounded-2xl border px-4 py-3.5 flex flex-col gap-0.5', cls.wrap)}>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{titulo}</p>
      <p className={cn('text-xl font-bold tabular-nums leading-tight', cls.num)}>{valor}</p>
      {sub && <p className={cn('text-xs', cls.sub)}>{sub}</p>}
    </div>
  )
}

// ─── Modal abono ──────────────────────────────────────────────────────────────

function ModalAbono({ cuenta, liquidarDirecto, onClose, onExito }) {
  const { perfil, empresa } = useApp()
  const saldo = cuenta.total - cuenta.abonado
  const pct   = Math.min(100, Math.round((cuenta.abonado / cuenta.total) * 100))
  const [monto, setMonto]         = useState(liquidarDirecto ? String(saldo.toFixed(2)) : '')
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const abonoNum = parseFloat(monto) || 0

  const guardar = async (forzarTotal = false) => {
    const abono = forzarTotal ? saldo : parseFloat(monto)
    if (!abono || abono <= 0) return toast.error('El monto debe ser mayor a cero')
    if (abono > saldo + 0.001) return toast.error(`El abono no puede superar el saldo (${formatoMoneda(saldo)})`)
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      // Redondear a centavos para evitar errores de punto flotante (ej: 99.9 + 0.1 = 100.00000000000001)
      const round2 = (n) => Math.round(n * 100) / 100
      const nuevoAbonado = round2(cuenta.abonado + abono)
      const pagada = nuevoAbonado >= round2(cuenta.total)

      const { error } = await supabase
        .from('cuentas_pendientes')
        .update({ abonado: nuevoAbonado, pagada })
        .eq('id', cuenta.id)

      if (error) throw error

      await logBitacora({
        empresa_id:    empresa?.id,
        tipo:          pagada ? 'cuenta_liquidada' : 'cuenta_abono',
        descripcion:   pagada
          ? `Cuenta liquidada · ${cuenta.nombre_cliente} · ${formatoMoneda(cuenta.total)}`
          : `Abono de ${formatoMoneda(abono)} · ${cuenta.nombre_cliente} · Saldo: ${formatoMoneda(saldo - abono)}`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   cuenta.sucursal_id ?? null,
        referencia_id: String(cuenta.id),
      })

      toast.success(pagada ? '¡Cuenta liquidada!' : `Abono registrado: ${formatoMoneda(abono)}`)
      onExito()
    } catch (e) {
      toast.error(e.message ?? 'Error al registrar abono')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const cajero   = cuenta.ventas?.cajero?.nombre
  const sucursal = cuenta.sucursales?.nombre

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col gap-5 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-amber-600" strokeWidth={2.5} />
            </div>
            <h2 className="text-lg font-bold text-slate-900">
              {liquidarDirecto ? 'Liquidar cuenta' : 'Registrar abono'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Info del cliente */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{cuenta.nombre_cliente}</p>
                {cajero && <p className="text-xs text-slate-400">Registrado por {cajero}</p>}
              </div>
            </div>
            {sucursal && (
              <span className="text-xs font-medium text-slate-500 bg-slate-200 px-2 py-0.5 rounded-lg">{sucursal}</span>
            )}
          </div>

          {/* Barra de progreso */}
          <div className="flex flex-col gap-1.5">
            <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>{pct}% abonado</span>
              <span className="font-medium">{formatoMoneda(cuenta.abonado)} de {formatoMoneda(cuenta.total)}</span>
            </div>
          </div>

          {/* Totales */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-medium">Total</p>
              <p className="text-sm font-bold text-slate-700">{formatoMoneda(cuenta.total)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-medium">Abonado</p>
              <p className="text-sm font-bold text-emerald-600">{formatoMoneda(cuenta.abonado)}</p>
            </div>
            <div>
              <p className="text-[10px] text-red-400 uppercase font-bold">Saldo</p>
              <p className="text-sm font-bold text-red-600">{formatoMoneda(saldo)}</p>
            </div>
          </div>
        </div>

        {/* Input de monto */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700">Monto del abono</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
            <input
              type="number" min="0.01" step="0.01"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !guardando && guardar(false)}
              placeholder="0.00"
              autoFocus={!liquidarDirecto}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-8 pr-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 placeholder:text-slate-400 transition-all"
            />
          </div>

          {/* Botones rápidos */}
          <div className="flex gap-2 flex-wrap">
            {[50, 100, 200, 500].map(v => (
              <button key={v}
                onClick={() => setMonto(String(Math.min(v, saldo).toFixed(2)))}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                +${v}
              </button>
            ))}
            <button
              onClick={() => setMonto(String(saldo.toFixed(2)))}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors ml-auto">
              Saldo completo
            </button>
          </div>
        </div>

        {/* Nuevo saldo preview */}
        {abonoNum > 0 && abonoNum <= saldo && (
          <div className="bg-primary-50 border border-primary-200 rounded-2xl px-4 py-2.5 flex justify-between items-center">
            <span className="text-sm text-primary-700 font-medium">Nuevo saldo</span>
            <span className="text-sm font-bold text-primary-800">{formatoMoneda(saldo - abonoNum)}</span>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col gap-2">
          <button onClick={() => guardar(true)} disabled={guardando}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-60">
            <CheckCircle2 className="w-4 h-4" />
            Liquidar cuenta completa · {formatoMoneda(saldo)}
          </button>
          <div className="flex gap-2">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button variante="primario" tamano="md" className="flex-1"
              cargando={guardando} onClick={() => guardar(false)} disabled={!abonoNum || abonoNum <= 0}>
              Guardar abono
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta cuenta ───────────────────────────────────────────────────────────

function TarjetaCuenta({ cuenta, onAbonar, onLiquidar }) {
  const saldo    = cuenta.total - cuenta.abonado
  const pct      = Math.min(100, Math.round((cuenta.abonado / cuenta.total) * 100))
  const cajero   = cuenta.ventas?.cajero?.nombre
  const sucursal = cuenta.sucursales?.nombre
  const sinAbono = cuenta.abonado === 0

  // Antigüedad de la cuenta
  const diasPendiente = cuenta.pagada ? 0 : Math.floor(
    (Date.now() - new Date(cuenta.creado_en).getTime()) / 86400000
  )
  const antigüedadColor = diasPendiente > 30 ? 'text-red-600 bg-red-50 border-red-200'
    : diasPendiente > 7 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-slate-400 bg-slate-50 border-slate-200'

  const bordeColor = cuenta.pagada ? 'border-l-emerald-400'
    : sinAbono     ? 'border-l-red-400'
    :                'border-l-amber-400'

  return (
    <div className={cn('flex gap-4 px-5 py-4 border-l-4 transition-colors', bordeColor, !cuenta.pagada && 'hover:bg-slate-50/80')}>
      {/* Icono estado */}
      <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5',
        cuenta.pagada ? 'bg-emerald-100' : sinAbono ? 'bg-red-100' : 'bg-amber-100')}>
        {cuenta.pagada
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
          : sinAbono
          ? <Clock className="w-5 h-5 text-red-500" strokeWidth={2.5} />
          : <Banknote className="w-5 h-5 text-amber-600" strokeWidth={2.5} />
        }
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{cuenta.nombre_cliente}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {sucursal && (
                <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                  <Building2 className="w-3 h-3" />{sucursal}
                </span>
              )}
              {cajero && <span className="text-xs text-slate-400">· {cajero}</span>}
              <span className="text-xs text-slate-400">· {formatoFecha(cuenta.creado_en)}</span>
              {/* Indicador de antigüedad */}
              {!cuenta.pagada && diasPendiente > 0 && (
                <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border', antigüedadColor)}>
                  {diasPendiente > 7 && <AlertTriangle className="w-2.5 h-2.5" />}
                  {diasPendiente}d pendiente
                </span>
              )}
            </div>
          </div>

          {/* Monto derecho */}
          <div className="text-right flex-shrink-0">
            {cuenta.pagada ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                <Check className="w-3 h-3" strokeWidth={3} /> Liquidada
              </span>
            ) : (
              <p className="text-base font-bold text-red-600">-{formatoMoneda(saldo)}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">de {formatoMoneda(cuenta.total)}</p>
          </div>
        </div>

        {/* Barra progreso */}
        <div className="mt-2.5 flex flex-col gap-1">
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all',
              cuenta.pagada ? 'bg-emerald-400' : sinAbono ? 'bg-red-300' : 'bg-amber-400')}
              style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate-400 tabular-nums">
            {formatoMoneda(cuenta.abonado)} abonado · {pct}%
          </p>
        </div>

        {/* Botones acción */}
        {!cuenta.pagada && (
          <div className="flex gap-2 mt-3">
            <button onClick={() => onAbonar(cuenta)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-600 text-white text-xs font-bold hover:bg-primary-700 active:scale-[0.97] transition-all shadow-sm">
              <Banknote className="w-3.5 h-3.5" /> Abonar
            </button>
            <button onClick={() => onLiquidar(cuenta)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 active:scale-[0.97] transition-all shadow-sm">
              <CheckCircle2 className="w-3.5 h-3.5" /> Liquidar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ORDEN_OPTS = [
  { valor: 'reciente',    label: 'Más recientes' },
  { valor: 'mayor_saldo', label: 'Mayor saldo' },
  { valor: 'menor_saldo', label: 'Menor saldo' },
  { valor: 'mas_antigua', label: 'Más antiguas' },
]

export default function CuentasPage() {
  const { esAdmin, sucursalActiva } = useApp()

  const [cuentas,      setCuentas]      = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [busqueda,     setBusqueda]     = useState('')
  const [ordenar,      setOrdenar]      = useState('reciente')
  const [modalCuenta,  setModalCuenta]  = useState(null)
  const [liquidarDirecto, setLiquidarDirecto] = useState(false)
  const [periodo, setPeriodo]           = useState('todo')
  const [fechaDesde, setFechaDesde]     = useState('')
  const [fechaHasta, setFechaHasta]     = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      let q = supabase
        .from('cuentas_pendientes')
        .select(`*, sucursales(nombre), ventas(cajero:perfiles!ventas_usuario_id_fkey(nombre))`)
        .order('creado_en', { ascending: false })

      if (!esAdmin && sucursalActiva?.id) q = q.eq('sucursal_id', sucursalActiva.id)
      if (filtroEstado === 'pendiente') q = q.eq('pagada', false)
      if (filtroEstado === 'pagada')    q = q.eq('pagada', true)

      // Filtro de período
      if (periodo === 'hoy') {
        const hoy = new Date().toISOString().slice(0, 10)
        q = q.gte('creado_en', `${hoy}T00:00:00`)
      } else if (periodo === 'semana') {
        const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0,0,0,0)
        q = q.gte('creado_en', d.toISOString())
      } else if (periodo === 'mes') {
        const hoy = new Date()
        q = q.gte('creado_en', `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01T00:00:00`)
      } else if (periodo === 'personalizado') {
        if (fechaDesde) q = q.gte('creado_en', `${fechaDesde}T00:00:00`)
        if (fechaHasta) q = q.lte('creado_en', `${fechaHasta}T23:59:59`)
      }

      const { data, error } = await q
      if (error) throw error
      setCuentas(data ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar cuentas')
    } finally {
      setCargando(false)
    }
  }, [filtroEstado, esAdmin, sucursalActiva, periodo, fechaDesde, fechaHasta])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  const cuentasFiltradas = useMemo(() => {
    let r = cuentas
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(c => c.nombre_cliente?.toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => {
      if (ordenar === 'mayor_saldo') return (b.total - b.abonado) - (a.total - a.abonado)
      if (ordenar === 'menor_saldo') return (a.total - a.abonado) - (b.total - b.abonado)
      if (ordenar === 'mas_antigua') return new Date(a.creado_en) - new Date(b.creado_en)
      return new Date(b.creado_en) - new Date(a.creado_en) // reciente
    })
  }, [cuentas, busqueda, ordenar])

  const pendientes   = cuentas.filter(c => !c.pagada)
  const totalDeuda   = pendientes.reduce((s, c) => s + (c.total - c.abonado), 0)
  const totalAbonado = cuentas.reduce((s, c) => s + c.abonado, 0)
  const sinAbono     = pendientes.filter(c => c.abonado === 0).length
  const conAbono     = pendientes.filter(c => c.abonado > 0).length

  const abrirAbonar   = (c) => { setLiquidarDirecto(false); setModalCuenta(c) }
  const abrirLiquidar = (c) => { setLiquidarDirecto(true);  setModalCuenta(c) }

  const FILTROS = [
    { valor: 'pendiente', etiqueta: 'Pendientes', badge: pendientes.length },
    { valor: 'pagada',    etiqueta: 'Pagadas' },
    { valor: 'todas',     etiqueta: 'Todas' },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cuentas pendientes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {esAdmin ? 'Todas las sucursales' : sucursalActiva?.nombre ?? '—'}
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <TarjetaKpi titulo="Por cobrar" valor={formatoMoneda(totalDeuda)}
          sub={`${pendientes.length} cliente${pendientes.length !== 1 ? 's' : ''}`} color="red" />
        <TarjetaKpi titulo="Sin abono" valor={sinAbono}
          sub={conAbono > 0 ? `${conAbono} con abono parcial` : 'cuentas nuevas'} color="amber" />
        <TarjetaKpi titulo="Total abonado" valor={formatoMoneda(totalAbonado)}
          sub="de todas las cuentas" color="emerald" />
      </div>

      {/* Filtros + búsqueda + orden */}
      <div className="flex flex-col gap-3">
        {/* Período */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-medium text-slate-500">Período:</span>
          {[
            { v: 'todo',         label: 'Todo'    },
            { v: 'hoy',          label: 'Hoy'     },
            { v: 'semana',       label: '7 días'  },
            { v: 'mes',          label: 'Mes'     },
            { v: 'personalizado',label: 'Fechas'  },
          ].map(p => (
            <button key={p.v} onClick={() => setPeriodo(p.v)}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                periodo === p.v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
              {p.label}
            </button>
          ))}
          {periodo === 'personalizado' && (
            <div className="flex items-center gap-2">
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              <span className="text-slate-400 text-xs">—</span>
              <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {FILTROS.map(f => (
            <button key={f.valor} onClick={() => setFiltroEstado(f.valor)}
              className={cn('inline-flex items-center gap-2 h-10 px-4 rounded-2xl text-sm font-medium border transition-all',
                filtroEstado === f.valor ? 'bg-primary-600 text-white border-primary-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
              {f.etiqueta}
              {f.badge != null && f.badge > 0 && (
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none',
                  filtroEstado === f.valor ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700')}>
                  {f.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Búsqueda */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre de cliente..."
              className="w-full pl-10 pr-10 h-11 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Orden */}
          <div className="relative">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select value={ordenar} onChange={e => setOrdenar(e.target.value)}
              className="h-11 pl-9 pr-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 appearance-none cursor-pointer">
              {ORDEN_OPTS.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : cuentasFiltradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">
              {busqueda ? `Sin resultados para "${busqueda}"` :
               filtroEstado === 'pendiente' ? 'Sin cuentas pendientes' :
               filtroEstado === 'pagada'    ? 'Sin cuentas liquidadas' : 'Sin cuentas'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cuentasFiltradas.map(c => (
              <TarjetaCuenta key={c.id} cuenta={c} onAbonar={abrirAbonar} onLiquidar={abrirLiquidar} />
            ))}
          </div>
        )}
      </div>

      {modalCuenta && (
        <ModalAbono
          cuenta={modalCuenta}
          liquidarDirecto={liquidarDirecto}
          onClose={() => setModalCuenta(null)}
          onExito={() => { setModalCuenta(null); cargar() }}
        />
      )}
    </div>
  )
}
