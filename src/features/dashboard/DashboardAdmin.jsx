import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Package, Wallet, Users,
  Store, RefreshCw, Clock, ArrowRight, Activity,
  CalendarX, AlertTriangle, Lightbulb, ShoppingCart,
  DollarSign, Bell, Receipt, XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, formatoHora, fechaEnZona, addDias, dowEnZona } from '@/lib/formatos'
import { ETIQUETAS_ROL } from '@/lib/constantes'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ titulo, valor, sub, color, Icono, enlace, badge, badgeColor, hero = false }) {
  const iconos = {
    primary: 'bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-500/30',
    emerald: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/30',
    amber:   'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30',
    purple:  'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/30',
    slate:   'bg-slate-100 text-slate-400',
  }
  const icono = hero ? 'bg-white/20 text-white' : (iconos[color] || iconos.primary)
  const inner = (
    <div className={cn(
      'rounded-3xl p-4 h-full flex flex-col gap-2 transition-all duration-200',
      hero
        ? 'bg-gradient-to-br from-primary-600 via-primary-700 to-indigo-700 text-white shadow-lg shadow-primary-500/30'
        : 'bg-white border border-slate-100 shadow-card',
      enlace && (hero ? 'hover:shadow-xl hover:shadow-primary-500/40' : 'hover:shadow-card-hover hover:-translate-y-0.5')
    )}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[10px] font-bold uppercase tracking-wider leading-none', hero ? 'text-white/70' : 'text-slate-400')}>{titulo}</span>
        <div className={cn('w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0', icono)}>
          <Icono className="w-4 h-4" strokeWidth={2.5} />
        </div>
      </div>
      <p className={cn('text-xl sm:text-2xl font-bold leading-none', hero ? 'text-white' : 'text-slate-900')}>{valor}</p>
      <div className="flex items-center gap-2 flex-wrap min-h-[18px]">
        {badge && (
          <span className={cn(
            'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
            hero ? 'bg-white/20 text-white' :
            badgeColor === 'green' ? 'bg-emerald-100 text-emerald-700' :
            badgeColor === 'red'   ? 'bg-red-100 text-red-600'         : 'bg-slate-100 text-slate-400'
          )}>
            {badgeColor === 'green' && <TrendingUp className="w-2.5 h-2.5" />}
            {badgeColor === 'red'   && <TrendingDown className="w-2.5 h-2.5" />}
            {badge}
          </span>
        )}
        {sub && <span className={cn('text-xs', hero ? 'text-white/70' : 'text-slate-400')}>{sub}</span>}
      </div>
    </div>
  )
  return enlace ? <Link to={enlace} className="block h-full">{inner}</Link> : inner
}

// ─── Fila de alerta (para dashboard) ─────────────────────────────────────────
function AlertaFila({ Icono, label, count, color, to }) {
  const cls = {
    red:    { row: 'hover:bg-red-50',    icon: 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-sm shadow-red-500/30',       badge: 'bg-red-100 text-red-700'     },
    orange: { row: 'hover:bg-orange-50', icon: 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-sm shadow-orange-500/30', badge: 'bg-orange-100 text-orange-700' },
    amber:  { row: 'hover:bg-amber-50',  icon: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-sm shadow-amber-500/30',   badge: 'bg-amber-100 text-amber-700' },
    violet: { row: 'hover:bg-violet-50', icon: 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm shadow-violet-500/30', badge: 'bg-violet-100 text-violet-700' },
  }[color] || {}
  return (
    <Link to={to}
      className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors', cls.row)}>
      <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0', cls.icon)}>
        <Icono className="w-3.5 h-3.5" strokeWidth={2.5} />
      </div>
      <span className="text-sm text-slate-700 flex-1">{label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {count !== undefined && (
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', cls.badge)}>{count}</span>
        )}
        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
      </div>
    </Link>
  )
}

// ─── Recomendación ────────────────────────────────────────────────────────────
function Recomendacion({ icono: Icono, color, titulo, desc, accion, to }) {
  const cls = {
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  icon: 'bg-amber-100 text-amber-700'   },
    red:    { bg: 'bg-red-50',    border: 'border-red-200',    icon: 'bg-red-100 text-red-700'        },
    blue:   { bg: 'bg-sky-50',    border: 'border-sky-200',    icon: 'bg-sky-100 text-sky-700'        },
    purple: { bg: 'bg-violet-50', border: 'border-violet-200', icon: 'bg-violet-100 text-violet-700'  },
  }
  const c = cls[color] || cls.amber
  return (
    <div className={cn('rounded-2xl border p-3.5 flex items-start gap-3', c.bg, c.border)}>
      <div className={cn('w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5', c.icon)}>
        <Icono className="w-4 h-4" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{titulo}</p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
      {accion && to && (
        <Link to={to} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 flex-shrink-0 mt-0.5">
          {accion} <ArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Empleado en turno ────────────────────────────────────────────────────────
function EmpleadoCard({ turno }) {
  return (
    <div className="flex items-center gap-2.5 bg-slate-50 rounded-2xl px-3 py-2.5">
      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-primary-700">{turno.usuario_nombre?.charAt(0)?.toUpperCase() || '?'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 truncate">{turno.usuario_nombre}</p>
        <p className="text-[11px] text-slate-400">{turno.sucursal_nombre}</p>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
        <Clock className="w-3 h-3" />
        {formatoHora(turno.fecha_apertura)}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardAdmin() {
  const { perfil, empresa, sucursales, tz } = useApp()
  const [datos, setDatos]       = useState(null)
  const [cargando, setCargando] = useState(true)
  const intervaloRef = useRef(null)

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      const hoyS  = fechaEnZona(tz)
      const ayerS = addDias(hoyS, -1)
      const en30S = addDias(hoyS, 30)
      const en90S = addDias(hoyS, 90)

      // Queries en paralelo
      const [
        { data: ventasHoy },
        { data: ventasAyer },
        { data: activos },
        { data: lotesAlert },
        { data: invData },
        { data: productosData },
        { data: gastosHoy },
        { count: cancelacionesPend },
      ] = await Promise.all([
        supabase.from('ventas')
          .select('id, total, sucursal_id, creado_en')
          .neq('estado', 'cancelada')
          .gte('creado_en', `${hoyS}T00:00:00`)
          .lte('creado_en', `${hoyS}T23:59:59`),
        supabase.from('ventas')
          .select('total')
          .neq('estado', 'cancelada')
          .gte('creado_en', `${ayerS}T00:00:00`)
          .lte('creado_en', `${ayerS}T23:59:59`),
        supabase.rpc('empleados_activos_por_sucursal'),
        supabase.from('lotes')
          .select('id, fecha_caducidad, producto_id, productos(nombre)')
          .eq('activo', true)
          .not('fecha_caducidad', 'is', null)
          .lte('fecha_caducidad', en90S),
        supabase.from('inventario')
          .select('lote_id, cantidad, sucursal_id, lotes!inner(producto_id, activo, fecha_caducidad)')
          .gt('cantidad', 0),
        supabase.from('productos')
          .select('id, nombre, stock_minimo')
          .eq('empresa_id', empresa.id).eq('activo', true),
        supabase.from('gastos')
          .select('monto')
          .eq('empresa_id', empresa.id)
          .eq('fecha', hoyS),
        supabase.from('cancelaciones')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id)
          .eq('estado', 'pendiente'),
      ])

      // Detalle ventas hoy → ganancia + top productos
      const ventaIdsHoy = (ventasHoy || []).map(v => v.id)
      let detallesHoy = []
      if (ventaIdsHoy.length > 0) {
        const { data: dets } = await supabase
          .from('detalle_ventas')
          .select('venta_id, producto_id, cantidad, precio_unitario, costo_unitario, productos(nombre, precio_compra)')
          .in('venta_id', ventaIdsHoy)
        detallesHoy = dets || []
      }

      // Mapa venta→sucursal
      const ventaMap = {}
      ;(ventasHoy || []).forEach(v => { ventaMap[v.id] = v.sucursal_id })

      // ── Métricas globales ──────────────────────────────────────────────────
      const montoHoy  = (ventasHoy  || []).reduce((s, v) => s + Number(v.total || 0), 0)
      const montoAyer = (ventasAyer || []).reduce((s, v) => s + Number(v.total || 0), 0)
      const varPct    = montoAyer > 0 ? ((montoHoy - montoAyer) / montoAyer) * 100 : null
      const totalGastosHoy = (gastosHoy || []).reduce((s, g) => s + Number(g.monto || 0), 0)

      // Ganancia total del día
      const gananciaHoy = detallesHoy.reduce((s, d) => {
        const costo = Number(d.costo_unitario ?? d.productos?.precio_compra ?? 0)
        return s + (d.precio_unitario - costo) * (d.cantidad ?? 0)
      }, 0)
      const gananciaNeta = gananciaHoy - totalGastosHoy
      const margenHoy    = montoHoy > 0 ? (gananciaHoy / montoHoy) * 100 : 0

      // ── Por sucursal ───────────────────────────────────────────────────────
      const sucursalesData = sucursales.map(suc => {
        const ventasSuc = (ventasHoy || []).filter(v => v.sucursal_id === suc.id)
        const montoSuc  = ventasSuc.reduce((s, v) => s + Number(v.total || 0), 0)
        const countSuc  = ventasSuc.length
        const detsSuc   = detallesHoy.filter(d => ventaMap[d.venta_id] === suc.id)
        const gananciaSuc = detsSuc.reduce((s, d) => {
          const costo = Number(d.costo_unitario ?? d.productos?.precio_compra ?? 0)
          return s + (d.precio_unitario - costo) * (d.cantidad ?? 0)
        }, 0)
        return { id: suc.id, nombre: suc.nombre, monto: montoSuc, count: countSuc, ganancia: gananciaSuc }
      }).sort((a, b) => b.monto - a.monto)

      const mejorSuc = sucursalesData[0]?.monto > 0 ? sucursalesData[0] : null
      const maxMonto = Math.max(...sucursalesData.map(s => s.monto), 1)

      // ── Top productos del día ──────────────────────────────────────────────
      const prodMap = {}
      detallesHoy.forEach(d => {
        const id = d.producto_id
        if (!prodMap[id]) prodMap[id] = { nombre: d.productos?.nombre ?? '—', cantidad: 0, total: 0 }
        prodMap[id].cantidad += d.cantidad ?? 0
        prodMap[id].total    += (d.precio_unitario ?? 0) * (d.cantidad ?? 0)
      })
      const topProductos = Object.values(prodMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

      // ── Stock — solo lotes ACTIVOS con cantidad > 0 ────────────────────────
      const stockMap    = {} // producto_id → stock total global
      const stockSucMap = {} // producto_id → Set de sucursal_ids con stock > 0
      const loteMap     = {} // lote_id → cantidad
      ;(invData || []).forEach(i => {
        if (!i.lotes?.activo) return
        const pid = i.lotes?.producto_id
        const sid = i.sucursal_id
        if (pid) {
          stockMap[pid] = (stockMap[pid] || 0) + Number(i.cantidad || 0)
          if (!stockSucMap[pid]) stockSucMap[pid] = new Set()
          if (sid) stockSucMap[pid].add(sid)
        }
        loteMap[i.lote_id] = (loteMap[i.lote_id] || 0) + Number(i.cantidad || 0)
      })

      const totalSucursales = sucursales.length

      // Solo alertar productos con stock_minimo > 0
      const conMinimo = (productosData || []).filter(p => (p.stock_minimo ?? 0) > 0)
      // Agotados: sin stock en NINGUNA sucursal
      const agotados  = conMinimo.filter(p => (stockMap[p.id] ?? 0) === 0).length
      // Bajo stock: stock global insuficiente O alguna sucursal en 0
      const stockBajo = conMinimo.filter(p => {
        const s = stockMap[p.id] ?? 0
        if (s === 0) return false // ya contado en agotados
        const sucConStock = stockSucMap[p.id]?.size ?? 0
        const algunaSin   = totalSucursales > 1 && sucConStock < totalSucursales
        return s < p.stock_minimo || algunaSin
      }).length

      // ── Caducidad — por PRODUCTO (no por lote individual) ─────────────────
      // Si el producto tiene stock suficiente en lotes NO caducados, no alertar.
      // Solo alerta si hay stock en el lote que caduca Y ese producto no tiene
      // suficiente stock en lotes frescos para cubrir el mínimo.
      const stockNoExpMap = {} // producto_id → stock en lotes que NO están por caducar (>90d)
      ;(invData || []).forEach(i => {
        if (!i.lotes?.activo) return
        const fc = i.lotes?.fecha_caducidad
        if (fc && fc > en90S) { // lote fresco (caduca después de 90d)
          const pid = i.lotes?.producto_id
          if (pid) stockNoExpMap[pid] = (stockNoExpMap[pid] || 0) + Number(i.cantidad || 0)
        }
      })
      const caducados = (lotesAlert || []).filter(l => {
        if (l.fecha_caducidad >= hoyS) return false
        return (loteMap[l.id] || 0) > 0 // vencido y con stock
      }).length
      const criticos = (lotesAlert || []).filter(l => {
        if (l.fecha_caducidad < hoyS || l.fecha_caducidad > en30S) return false
        if ((loteMap[l.id] || 0) === 0) return false // sin stock en este lote
        // Usar nombre único por producto: no duplicar si ya hay otro lote del mismo producto alertado
        return true
      }).length

      // ── Alertas condicionales ──────────────────────────────────────────────
      const dow = dowEnZona(hoyS)
      let alertaSalarios = null
      if (dow === (empresa?.dia_pago ?? 5)) {
        const { data: semsPend } = await supabase
          .from('semanas_salario')
          .select('usuario_id, total_calculado')
          .eq('empresa_id', empresa.id)
          .eq('pagado', false)
        const pend  = [...new Set((semsPend ?? []).map(s => s.usuario_id))].length
        const total = (semsPend ?? []).reduce((s, x) => s + (x.total_calculado ?? 0), 0)
        alertaSalarios = pend > 0 ? { pend, total } : null
      }
      let alertaHorario = false
      if (dow === 6 || dow === 0) {
        const diff   = dow === 0 ? 1 : 2
        const lunesS = addDias(hoyS, diff)
        const domS   = addDias(lunesS, 6)
        const { count: asig } = await supabase.from('programacion')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id).gte('fecha', lunesS).lte('fecha', domS)
        alertaHorario = (asig ?? 0) === 0
      }

      // ── Recomendaciones ────────────────────────────────────────────────────
      const recs = []

      // Lotes críticos por caducar (<30d) con stock > 0
      const hoyRef = new Date(hoyS + 'T12:00:00Z')
      const lotesCrit = (lotesAlert || []).filter(l => {
        const dias = Math.ceil((new Date(l.fecha_caducidad + 'T12:00:00Z') - hoyRef) / 86400000)
        return dias >= 0 && dias <= 30 && (loteMap[l.id] || 0) > 0
      })
      const productosCrit = {}
      lotesCrit.forEach(l => {
        if (!productosCrit[l.producto_id]) productosCrit[l.producto_id] = { nombre: l.productos?.nombre, minDias: 999 }
        const dias = Math.ceil((new Date(l.fecha_caducidad + 'T12:00:00Z') - hoyRef) / 86400000)
        if (dias < productosCrit[l.producto_id].minDias) productosCrit[l.producto_id].minDias = dias
      })
      Object.values(productosCrit).slice(0, 2).forEach(p => {
        recs.push({
          icono: CalendarX, color: 'red',
          titulo: `${p.nombre} caduca en ${p.minDias} día${p.minDias !== 1 ? 's' : ''}`,
          desc: sucursales.length > 1
            ? 'Considera transferirlo a la sucursal con mayor demanda o aplicar un descuento.'
            : 'Aplica un descuento para liquidarlo antes de que expire.',
          to: sucursales.length > 1 ? '/transferencias' : '/inventario',
          accion: sucursales.length > 1 ? 'Transferir' : 'Ver',
        })
      })

      // Productos agotados
      ;(productosData || []).filter(p => (stockMap[p.id] || 0) === 0).slice(0, 1).forEach(p => {
        recs.push({
          icono: Package, color: 'amber',
          titulo: `${p.nombre} sin stock`,
          desc: 'Sin unidades disponibles. Considera reabastecer pronto para no perder ventas.',
          to: '/inventario', accion: 'Ver',
        })
      })

      // Ventas bajas vs ayer
      if (varPct !== null && varPct < -40 && montoAyer > 0) {
        recs.push({
          icono: TrendingDown, color: 'purple',
          titulo: 'Ventas bajas hoy',
          desc: `${Math.abs(varPct).toFixed(0)}% menos que ayer. Verifica si hay algún problema en caja.`,
          to: '/caja', accion: 'Ver caja',
        })
      }

      // Sucursal sin actividad cuando las demás sí tienen
      if (sucursales.length > 1 && montoHoy > 0) {
        const sinVentas = sucursalesData.filter(s => s.monto === 0)
        if (sinVentas.length > 0) {
          recs.push({
            icono: Store, color: 'blue',
            titulo: `${sinVentas[0].nombre} sin ventas`,
            desc: 'Esta sucursal no ha registrado ventas hoy. Verifica que la caja esté abierta.',
            to: '/caja', accion: 'Ver caja',
          })
        }
      }

      setDatos({
        montoHoy, montoAyer, varPct,
        ventasCount: (ventasHoy || []).length,
        gananciaHoy, gananciaNeta, margenHoy,
        totalGastosHoy,
        mejorSuc, sucursalesData, maxMonto,
        topProductos,
        enTurno: (activos || []).filter(a => a.turno_id).length,
        empleadosActivos: (activos || []).filter(a => a.turno_id),
        caducados, criticos, agotados, stockBajo,
        cancelacionesPend: cancelacionesPend || 0,
        alertaSalarios, alertaHorario,
        recomendaciones: recs.slice(0, 3),
      })
    } catch (err) {
      console.error('Error en dashboard:', err)
    } finally {
      setCargando(false)
    }
  }, [empresa?.id, sucursales])

  useEffect(() => { cargar() }, [cargar])

  // Polling cada 30s como fallback
  useEffect(() => {
    intervaloRef.current = setInterval(cargar, 30_000)
    return () => clearInterval(intervaloRef.current)
  }, [cargar])

  // Realtime: actualizar al instante cuando llegan ventas o cancelaciones nuevas
  useEffect(() => {
    if (!empresa?.id) return
    const channel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ventas' }, cargar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ventas' }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cancelaciones' }, cargar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cancelaciones' }, cargar)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gastos' }, cargar)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [empresa?.id, cargar])

  const nombreCorto = perfil?.nombre?.split(' ')[0] || 'usuario'
  const hora        = parseInt(new Intl.DateTimeFormat('es-MX', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()))
  const saludo      = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const fecha       = new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const d           = datos

  const hayAlertas = d && (d.caducados > 0 || d.criticos > 0 || d.agotados > 0 || d.alertaSalarios || d.alertaHorario || d.stockBajo > 0 || d.cancelacionesPend > 0)

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{saludo}, {nombreCorto}</h1>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{fecha}</p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="w-9 h-9 rounded-full bg-white border border-slate-100 shadow-card flex items-center justify-center text-slate-500 hover:text-slate-700 hover:shadow-card-hover transition-all disabled:opacity-40 flex-shrink-0">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {cargando && !d ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-40" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
        </div>
      ) : d && (
        <>
          {/* KPIs — 2×2 móvil, 4 col desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              titulo="Ventas hoy" Icono={ShoppingCart} color="primary" enlace="/ventas" hero
              valor={formatoMoneda(d.montoHoy)}
              sub={`${d.ventasCount} venta${d.ventasCount !== 1 ? 's' : ''}`}
              badge={d.varPct !== null ? `${d.varPct >= 0 ? '+' : ''}${d.varPct.toFixed(0)}% vs ayer` : undefined}
              badgeColor={d.varPct === null ? 'neutral' : d.varPct >= 0 ? 'green' : 'red'}
            />
            <KpiCard
              titulo="Ganancia hoy" Icono={DollarSign} color="emerald" enlace="/reportes"
              valor={formatoMoneda(d.gananciaHoy)}
              sub={`${d.margenHoy.toFixed(1)}% margen bruto`}
            />
            <KpiCard
              titulo="Gastos del día" Icono={Receipt} color={d.totalGastosHoy > 0 ? 'amber' : 'slate'} enlace="/gastos"
              valor={formatoMoneda(d.totalGastosHoy)}
              sub={d.totalGastosHoy > 0 ? `Neto: ${formatoMoneda(d.gananciaNeta)}` : 'sin gastos registrados'}
            />
            <KpiCard
              titulo="En turno" Icono={Users} color={d.enTurno > 0 ? 'purple' : 'slate'}
              valor={String(d.enTurno)}
              sub={`empleado${d.enTurno !== 1 ? 's' : ''} activo${d.enTurno !== 1 ? 's' : ''}`}
            />
          </div>

          {/* Alertas — filas intuivas */}
          {hayAlertas && (
            <div className="bg-white border border-slate-100 rounded-3xl p-3 shadow-card">
              <div className="flex items-center gap-2 px-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Alertas</p>
                <span className="ml-auto text-[10px] text-slate-400">Toca para ver detalle</span>
              </div>
              <div className="flex flex-col">
                {d.caducados  > 0 && <AlertaFila Icono={CalendarX}     label={`${d.caducados} lote${d.caducados > 1 ? 's' : ''} caducado${d.caducados > 1 ? 's' : ''}`}     count={d.caducados}  color="red"    to="/caducidades" />}
                {d.criticos   > 0 && <AlertaFila Icono={CalendarX}     label={`${d.criticos} lote${d.criticos > 1 ? 's' : ''} caducan en menos de 30 días`}                 count={d.criticos}   color="orange" to="/caducidades" />}
                {d.agotados   > 0 && <AlertaFila Icono={Package}       label={`${d.agotados} producto${d.agotados > 1 ? 's' : ''} agotado${d.agotados > 1 ? 's' : ''}`}     count={d.agotados}   color="red"    to="/inventario" />}
                {d.stockBajo  > 0 && <AlertaFila Icono={AlertTriangle} label={`${d.stockBajo} producto${d.stockBajo > 1 ? 's' : ''} con stock bajo`}                        count={d.stockBajo}  color="amber"  to="/inventario" />}
                {d.cancelacionesPend > 0 && <AlertaFila Icono={XCircle} label={`${d.cancelacionesPend} cancelación${d.cancelacionesPend > 1 ? 'es' : ''} pendiente${d.cancelacionesPend > 1 ? 's' : ''} de aprobar`} count={d.cancelacionesPend} color="red" to="/cancelaciones" />}
                {d.alertaSalarios  && <AlertaFila Icono={Bell}          label={`Salarios — ${d.alertaSalarios.pend} empleado${d.alertaSalarios.pend > 1 ? 's' : ''} pendiente${d.alertaSalarios.pend > 1 ? 's' : ''}`} color="amber" to="/salarios"  />}
                {d.alertaHorario   && <AlertaFila Icono={Clock}         label="Horario de próxima semana sin programar"                                                                          color="violet" to="/horarios" />}
              </div>
            </div>
          )}

          {/* Ventas por sucursal */}
          <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-sm shadow-blue-500/30 flex items-center justify-center">
                  <Store className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-sm font-bold text-slate-900">Rendimiento por sucursal</p>
              </div>
              <span className="text-xs text-slate-400">hoy</span>
            </div>

            {d.sucursalesData.every(s => s.monto === 0) ? (
              <p className="text-xs text-slate-400 text-center py-4">Sin ventas registradas hoy</p>
            ) : (
              <div className="flex flex-col gap-3">
                {d.sucursalesData.map((suc, i) => {
                  const margenSuc = suc.monto > 0 ? (suc.ganancia / suc.monto) * 100 : 0
                  const pct = (suc.monto / d.maxMonto) * 100
                  return (
                    <div key={suc.id}>
                      {/* Nombre + números */}
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {sucursales.length > 1 && i === 0 && (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">TOP</span>
                          )}
                          <span className="text-sm font-semibold text-slate-800 truncate">{suc.nombre}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">{suc.count} venta{suc.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 text-right">
                          <div>
                            <p className="text-xs text-slate-400 leading-none">Ganancia</p>
                            <p className={cn('text-sm font-bold leading-none mt-0.5', suc.ganancia >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                              {formatoMoneda(suc.ganancia)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400 leading-none">Ventas</p>
                            <p className="text-sm font-bold text-slate-800 leading-none mt-0.5">{formatoMoneda(suc.monto)}</p>
                          </div>
                        </div>
                      </div>
                      {/* Barra de progreso */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all"
                            style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-semibold text-slate-400 w-10 text-right flex-shrink-0">
                          {margenSuc.toFixed(0)}% margen
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top productos + Personal en turno */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top productos del día */}
            <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-sm shadow-sky-500/30 flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                  </div>
                  <p className="text-sm font-bold text-slate-900">Top productos hoy</p>
                </div>
                <Link to="/reportes" className="text-xs text-slate-400 hover:text-primary-600 transition-colors">
                  Ver más
                </Link>
              </div>

              {d.topProductos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-1.5">
                  <ShoppingCart className="w-6 h-6 text-slate-200" />
                  <p className="text-xs text-slate-400">Sin ventas registradas hoy</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {d.topProductos.map((prod, i) => {
                    const maxTotal = d.topProductos[0].total
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold text-slate-300 w-3 flex-shrink-0">{i + 1}</span>
                            <span className="text-sm text-slate-700 truncate">{prod.nombre}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-slate-400">{prod.cantidad} uds</span>
                            <span className="text-sm font-semibold text-slate-800">{formatoMoneda(prod.total)}</span>
                          </div>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden ml-5">
                          <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
                            style={{ width: `${(prod.total / maxTotal) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Personal en turno */}
            <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-sm shadow-emerald-500/30 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5 text-white" />
                  </div>
                  <p className="text-sm font-bold text-slate-900">Personal en turno</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {d.enTurno > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                  <span className="text-xs text-slate-400">{d.enTurno} activo{d.enTurno !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {d.empleadosActivos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-1.5">
                  <Users className="w-6 h-6 text-slate-200" />
                  <p className="text-xs text-slate-400">Ningún empleado con turno abierto</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {d.empleadosActivos.map(t => <EmpleadoCard key={t.turno_id} turno={t} />)}
                </div>
              )}
            </div>
          </div>

          {/* Recomendaciones */}
          {d.recomendaciones.length > 0 && (
            <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-card">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-sm shadow-amber-500/30 flex items-center justify-center">
                  <Lightbulb className="w-3.5 h-3.5 text-white" />
                </div>
                <p className="text-sm font-bold text-slate-900">Recomendaciones</p>
              </div>
              <div className="flex flex-col gap-2">
                {d.recomendaciones.map((r, i) => <Recomendacion key={i} {...r} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
