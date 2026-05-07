import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingCart, CreditCard, Package, ArrowRight,
  Clock, DollarSign, AlertTriangle, Store, RefreshCw,
  Receipt, Wallet, CheckCircle2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, formatoHora, fechaEnZona } from '@/lib/formatos'
import { cn } from '@/lib/clases'

// ─── Card de acceso rápido ────────────────────────────────────────────────────
function AccesoRapido({ to, Icono, label, sub, color }) {
  const cls = {
    primary: 'bg-primary-600 hover:bg-primary-700 text-white',
    amber:   'bg-amber-500  hover:bg-amber-600  text-white',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    slate:   'bg-slate-700  hover:bg-slate-800  text-white',
  }[color] ?? 'bg-primary-600 hover:bg-primary-700 text-white'
  return (
    <Link to={to} className={cn('rounded-3xl p-5 flex flex-col gap-3 transition-all active:scale-[0.97] shadow-sm', cls)}>
      <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
        <Icono className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-base font-bold leading-tight">{label}</p>
        {sub && <p className="text-xs opacity-75 mt-0.5">{sub}</p>}
      </div>
      <ArrowRight className="w-4 h-4 opacity-60 self-end" />
    </Link>
  )
}

// ─── KPI compacto ─────────────────────────────────────────────────────────────
function KpiCompacto({ Icono, label, valor, sub, color }) {
  const cls = {
    primary: { icon: 'bg-primary-100 text-primary-600', val: 'text-primary-700' },
    emerald: { icon: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700' },
    amber:   { icon: 'bg-amber-100   text-amber-600',   val: 'text-amber-700'   },
    red:     { icon: 'bg-red-100     text-red-600',     val: 'text-red-700'     },
    slate:   { icon: 'bg-slate-100   text-slate-500',   val: 'text-slate-700'   },
  }[color] ?? { icon: 'bg-slate-100 text-slate-500', val: 'text-slate-700' }
  return (
    <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0', cls.icon)}>
        <Icono className="w-5 h-5" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className={cn('text-xl font-bold tabular-nums leading-tight', cls.val)}>{valor}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Dashboard cajero ─────────────────────────────────────────────────────────
export default function DashboardCajero() {
  const { perfil, empresa, sucursalActiva, tz } = useApp()
  const [datos,    setDatos]    = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) { setCargando(false); return }
    setCargando(true)
    try {
      const hoy        = fechaEnZona(tz)

      // Para rotativos sin sucursal activa: buscar turno abierto hoy o programacion
      let sucId     = sucursalActiva?.id ?? perfil?.sucursal_id ?? null
      let nombreSuc = sucursalActiva?.nombre ?? null

      if (!sucId) {
        const { data: turnoAbierto } = await supabase
          .from('turnos_caja')
          .select('sucursal_id, sucursales(nombre)')
          .eq('usuario_id', perfil.id)
          .eq('estado', 'abierto')
          .maybeSingle()
        if (turnoAbierto?.sucursal_id) {
          sucId = turnoAbierto.sucursal_id
          nombreSuc = turnoAbierto.sucursales?.nombre
        } else {
          const { data: prog } = await supabase
            .from('programacion')
            .select('sucursal_id, sucursales(nombre)')
            .eq('usuario_id', perfil.id)
            .eq('fecha', hoy)
            .maybeSingle()
          if (prog?.sucursal_id) { sucId = prog.sucursal_id; nombreSuc = prog.sucursales?.nombre }
        }
      }
      nombreSuc = nombreSuc ?? 'sin sucursal asignada'

      // Turno activo en la sucursal (misma lógica que VentasPage y AppCtx)
      const { data: turno } = sucId
        ? await supabase
            .from('turnos_caja')
            .select('id, fecha_apertura, monto_apertura')
            .eq('sucursal_id', sucId)
            .eq('estado', 'abierto')
            .maybeSingle()
        : { data: null }

      // Ventas del turno (o del día si no hay turno)
      let ventasTurno = []
      if (turno?.id) {
        const { data: vts } = await supabase
          .from('ventas')
          .select('id, total, creado_en')
          .eq('turno_id', turno.id)
          .neq('estado', 'cancelada')
        ventasTurno = vts ?? []
      } else {
        const { data: vts } = await supabase
          .from('ventas')
          .select('id, total, creado_en')
          .eq('usuario_id', perfil.id)
          .gte('creado_en', `${hoy}T00:00:00`)
          .neq('estado', 'cancelada')
        ventasTurno = vts ?? []
      }

      // (cuentas_pendientes eliminado — cajero no las gestiona)

      // Stock bajo en su sucursal (si tiene sucursal asignada)
      let stockBajo = []
      if (sucId) {
        const { data: inv } = await supabase
          .from('inventario')
          .select('cantidad, lotes!inner(producto_id, productos!inner(id, nombre, stock_minimo))')
          .eq('sucursal_id', sucId)
        const stockMap = {}
        ;(inv ?? []).forEach(i => {
          const p = i.lotes?.productos
          if (!p) return
          stockMap[p.id] = { nombre: p.nombre, stock_minimo: p.stock_minimo ?? 10, total: (stockMap[p.id]?.total ?? 0) + (i.cantidad ?? 0) }
        })
        stockBajo = Object.values(stockMap)
          .filter(p => p.total >= 0 && p.total < p.stock_minimo && p.stock_minimo > 0)
          .sort((a, b) => a.total - b.total)
          .slice(0, 5)
      }

      const totalVentas = ventasTurno.reduce((s, v) => s + Number(v.total || 0), 0)

      setDatos({
        turno, ventasTurno, totalVentas,
        stockBajo, nombreSuc,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }, [empresa?.id, perfil?.id, sucursalActiva?.id, tz])

  useEffect(() => { cargar() }, [cargar])

  const nombre = perfil?.nombre?.split(' ')[0] ?? ''
  const hora   = parseInt(new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()))
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const d      = datos

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{saludo}, {nombre}</h1>
          <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
            <Store className="w-3.5 h-3.5" />
            {d?.nombreSuc ?? '—'}
          </p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="w-9 h-9 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all disabled:opacity-40 flex-shrink-0">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {/* Estado del turno */}
      {!cargando && (
        <div className={cn(
          'rounded-3xl border p-4 flex items-center gap-3',
          d?.turno ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
        )}>
          <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0',
            d?.turno ? 'bg-emerald-100' : 'bg-amber-100')}>
            {d?.turno
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
              : <Clock className="w-5 h-5 text-amber-600" strokeWidth={2.5} />
            }
          </div>
          <div className="flex-1 min-w-0">
            {d?.turno ? (
              <>
                <p className="text-sm font-bold text-emerald-800">Turno abierto</p>
                <p className="text-xs text-emerald-600">
                  Desde {formatoHora(d.turno.fecha_apertura)}
                  {d.turno.monto_apertura > 0 && ` · Apertura: ${formatoMoneda(d.turno.monto_apertura)}`}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-amber-800">Sin turno abierto</p>
                <p className="text-xs text-amber-600">Ve a Ventas para abrir tu turno y comenzar a vender</p>
              </>
            )}
          </div>
          <Link to="/ventas" className={cn('flex items-center gap-1 text-xs font-bold flex-shrink-0',
            d?.turno ? 'text-emerald-700' : 'text-amber-700')}>
            Ir <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Accesos rápidos — siempre visibles para poder navegar */}
      {!cargando && (
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Accesos rápidos</p>
          <div className="grid grid-cols-2 gap-3">
            <AccesoRapido to="/ventas" Icono={ShoppingCart} label="Caja / Ventas"
              sub={d?.turno ? 'Turno abierto' : 'Abrir turno'} color="primary" />
            <AccesoRapido to="/inventario" Icono={Package} label="Inventario" sub="Consultar existencias" color="slate" />
            <AccesoRapido to="/caja" Icono={Wallet} label="Mi caja" sub="Movimientos y corte" color="emerald" />
          </div>
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : d && (
        <>
          {/* KPIs del turno */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCompacto Icono={ShoppingCart} label="Ventas del turno" color="primary"
              valor={formatoMoneda(d.totalVentas)}
              sub={`${d.ventasTurno.length} venta${d.ventasTurno.length !== 1 ? 's' : ''}`} />
            <KpiCompacto Icono={Receipt} label="Tickets" color="slate"
              valor={String(d.ventasTurno.length)}
              sub={d.ventasTurno.length > 0
                ? `Promedio ${formatoMoneda(d.totalVentas / d.ventasTurno.length)}`
                : 'sin ventas aún'} />
            <KpiCompacto Icono={AlertTriangle} label="Stock bajo" color={d.stockBajo.length > 0 ? 'red' : 'slate'}
              valor={String(d.stockBajo.length)}
              sub={d.stockBajo.length > 0 ? 'productos bajo mínimo' : 'todo bien'} />
          </div>


          {/* Stock bajo en su sucursal */}
          {d.stockBajo.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <p className="text-sm font-bold text-slate-900">Stock bajo en tu sucursal</p>
                </div>
                <Link to="/inventario" className="text-xs text-primary-600 font-semibold hover:text-primary-700">
                  Ver inventario
                </Link>
              </div>
              <div className="divide-y divide-slate-100">
                {d.stockBajo.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                        p.total === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                        {p.total} uds
                      </span>
                      <span className="text-xs text-slate-400">/ {p.stock_minimo}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ventas recientes del turno */}
          {d.ventasTurno.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary-500" />
                  <p className="text-sm font-bold text-slate-900">Últimas ventas del turno</p>
                </div>
                <Link to="/ventas" className="text-xs text-primary-600 font-semibold hover:text-primary-700">
                  Ir a caja
                </Link>
              </div>
              <div className="divide-y divide-slate-100">
                {[...d.ventasTurno].slice(0, 5).map(v => (
                  <div key={v.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                    <p className="text-xs text-slate-500">{formatoHora(v.creado_en)}</p>
                    <span className="text-sm font-bold text-slate-800">{formatoMoneda(v.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
