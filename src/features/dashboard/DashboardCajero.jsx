import { useEffect, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingCart, ArrowRight,
  Clock, DollarSign, Store, RefreshCw,
  Receipt, CheckCircle2, X, Search, MapPin,
  Banknote, CreditCard, Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, formatoHora, fechaEnZona } from '@/lib/formatos'
import { cn } from '@/lib/clases'

// ─── Modal existencias en otras sucursales ────────────────────────────────────
function ModalExistencias({ onCerrar }) {
  const { empresa } = useApp()
  const [busqueda,   setBusqueda]   = useState('')
  const [resultados, setResultados] = useState([])
  const [buscando,   setBuscando]   = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    const q = busqueda.trim()
    if (q.length < 2) { setResultados([]); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => buscar(q), 380)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [busqueda]) // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar(q) {
    if (!empresa?.id) return
    setBuscando(true)
    try {
      // 1. Productos que coinciden
      const { data: prods } = await supabase
        .from('productos')
        .select('id, nombre, categoria')
        .eq('empresa_id', empresa.id)
        .eq('activo', true)
        .ilike('nombre', `%${q}%`)
        .order('nombre')
        .limit(8)

      if (!prods?.length) { setResultados([]); setBuscando(false); return }

      // 2. Lotes activos de esos productos
      const { data: lotes } = await supabase
        .from('lotes')
        .select('id, producto_id')
        .in('producto_id', prods.map(p => p.id))
        .eq('activo', true)

      const loteIds    = (lotes ?? []).map(l => l.id)
      const loteAProd  = {}
      ;(lotes ?? []).forEach(l => { loteAProd[l.id] = l.producto_id })

      // 3. Inventario de esos lotes en todas las sucursales
      const { data: inv } = loteIds.length
        ? await supabase
            .from('inventario')
            .select('cantidad, sucursal_id, lote_id, sucursales(id, nombre)')
            .in('lote_id', loteIds)
        : { data: [] }

      // 4. Agregar por producto → sucursal
      const porProd = {}
      prods.forEach(p => { porProd[p.id] = { ...p, sucursales: {} } })
      ;(inv ?? []).forEach(i => {
        const prodId = loteAProd[i.lote_id]
        if (!prodId || !porProd[prodId]) return
        const sid = i.sucursal_id
        if (!porProd[prodId].sucursales[sid]) {
          porProd[prodId].sucursales[sid] = { nombre: i.sucursales?.nombre ?? '—', total: 0 }
        }
        porProd[prodId].sucursales[sid].total += i.cantidad ?? 0
      })

      setResultados(Object.values(porProd))
    } catch { /* silencioso */ } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-sky-100 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Consultar producto en otra farmacia</h3>
              <p className="text-xs text-slate-500">Consultar existencia de un producto en todas las sucursales</p>
            </div>
          </div>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              placeholder="Nombre del medicamento (mínimo 2 letras)..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
            />
            {buscando && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {busqueda.trim().length < 2 ? (
            <p className="text-sm text-slate-400 text-center py-8">Escribe el nombre del producto para buscar</p>
          ) : buscando && resultados.length === 0 ? null : resultados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin resultados para "{busqueda}"</p>
          ) : (
            resultados.map(prod => {
              const sucursales = Object.values(prod.sucursales)
                .sort((a, b) => b.total - a.total)
              const totalGeneral = sucursales.reduce((s, x) => s + x.total, 0)
              return (
                <div key={prod.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{prod.nombre}</p>
                      <p className="text-xs text-slate-400">{prod.categoria || 'Sin categoría'}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-full flex-shrink-0">
                      {totalGeneral} total
                    </span>
                  </div>
                  {sucursales.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-slate-400">Sin stock registrado</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sucursales.map(suc => (
                        <div key={suc.nombre} className="flex items-center justify-between px-4 py-2.5 gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Store className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="text-sm text-slate-700 truncate">{suc.nombre}</span>
                          </div>
                          <span className={cn(
                            'text-xs font-bold px-2.5 py-0.5 rounded-full flex-shrink-0',
                            suc.total === 0 ? 'bg-red-100 text-red-700' :
                            suc.total < 5   ? 'bg-amber-100 text-amber-700' :
                                              'bg-emerald-100 text-emerald-700'
                          )}>
                            {suc.total} uds
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
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
  const [datos,            setDatos]            = useState(null)
  const [cargando,         setCargando]         = useState(true)
  const [modalExistencias, setModalExistencias] = useState(false)

  const cargar = useCallback(async () => {
    if (!empresa?.id || !perfil?.id) { setCargando(false); return }
    setCargando(true)
    try {
      const hoy = fechaEnZona(tz)

      // Resolver sucursal del cajero
      let sucId     = sucursalActiva?.id ?? perfil?.sucursal_id ?? null
      let nombreSuc = sucursalActiva?.nombre ?? null

      if (!sucId) {
        // Rotativo sin sucursal activa: buscar turno abierto propio
        const { data: turnoAbierto } = await supabase
          .from('turnos_caja')
          .select('sucursal_id, sucursales(nombre)')
          .eq('usuario_id', perfil.id)
          .eq('estado', 'abierto')
          .maybeSingle()
        if (turnoAbierto?.sucursal_id) {
          sucId     = turnoAbierto.sucursal_id
          nombreSuc = turnoAbierto.sucursales?.nombre
        } else {
          const { data: prog } = await supabase
            .from('programacion')
            .select('sucursal_id, sucursales(nombre)')
            .eq('usuario_id', perfil.id)
            .eq('fecha', hoy)
            .limit(1)
          const p = prog?.[0]
          if (p?.sucursal_id) { sucId = p.sucursal_id; nombreSuc = p.sucursales?.nombre }
        }
      }
      nombreSuc = nombreSuc ?? 'sin sucursal asignada'

      // Turno activo DEL USUARIO (no de cualquier cajero en la sucursal)
      const { data: turno } = sucId
        ? await supabase
            .from('turnos_caja')
            .select('id, fecha_apertura, monto_apertura')
            .eq('sucursal_id', sucId)
            .eq('usuario_id', perfil.id)
            .eq('estado', 'abierto')
            .maybeSingle()
        : { data: null }

      // Ventas DEL CAJERO en este turno (no de toda la sucursal)
      let ventasTurno = []
      if (turno?.id) {
        const { data: vts } = await supabase
          .from('ventas')
          .select('id, total, creado_en, metodo_pago')
          .eq('turno_id', turno.id)
          .neq('estado', 'cancelada')
          .order('creado_en', { ascending: false })
        ventasTurno = vts ?? []
      } else {
        const { data: vts } = await supabase
          .from('ventas')
          .select('id, total, creado_en, metodo_pago')
          .eq('usuario_id', perfil.id)
          .gte('creado_en', `${hoy}T00:00:00`)
          .neq('estado', 'cancelada')
          .order('creado_en', { ascending: false })
        ventasTurno = vts ?? []
      }

      // Movimientos del turno para calcular efectivo en caja
      let movimientos = []
      if (turno?.id) {
        const { data: movs } = await supabase
          .from('movimientos_caja')
          .select('tipo, monto')
          .eq('turno_id', turno.id)
        movimientos = movs ?? []
      }

      const totalVentas    = ventasTurno.reduce((s, v) => s + Number(v.total || 0), 0)
      const ventasEfectivo = ventasTurno.filter(v => !v.metodo_pago || v.metodo_pago === 'efectivo').reduce((s, v) => s + Number(v.total || 0), 0)
      const ventasTarjeta  = ventasTurno.filter(v => v.metodo_pago === 'tarjeta').reduce((s, v) => s + Number(v.total || 0), 0)
      const entradas       = movimientos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.monto || 0), 0)
      const salidas        = movimientos.filter(m => m.tipo === 'salida').reduce((s, m) => s + Number(m.monto || 0), 0)
      const efectivoEnCaja = Number(turno?.monto_apertura || 0) + ventasEfectivo + entradas - salidas

      setDatos({ turno, ventasTurno, totalVentas, ventasEfectivo, ventasTarjeta, efectivoEnCaja, nombreSuc, sucId })
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }, [empresa?.id, perfil?.id, sucursalActiva?.id, tz])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    const onFocus = () => cargar()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [cargar])

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

      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : d && (
        <>
          {/* Fila: Existencias en red + Efectivo en caja */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setModalExistencias(true)}
              className="bg-sky-600 hover:bg-sky-700 text-white rounded-3xl p-4 flex flex-col gap-3 transition-all active:scale-[0.98] shadow-sm text-left"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                <MapPin className="w-5 h-5" strokeWidth={2.5} />
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">Consultar producto en otra farmacia</p>
                <p className="text-xs opacity-75 mt-0.5">Consultar existencia de un producto en todas las sucursales</p>
              </div>
            </button>

            {d.turno ? (
              <div className="bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-3xl p-4 shadow-sm flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-100" strokeWidth={2} />
                  <p className="text-[11px] font-bold text-emerald-100 uppercase tracking-wider">Efectivo en caja</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums leading-tight">{formatoMoneda(d.efectivoEnCaja)}</p>
                  <p className="text-[10px] text-emerald-200 mt-1">Fondo {formatoMoneda(d.turno.monto_apertura)} + ventas</p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex flex-col justify-center gap-1">
                <p className="text-xs font-bold text-amber-700">Sin turno</p>
                <p className="text-xs text-amber-600">Abre tu turno en Ventas para ver el efectivo</p>
              </div>
            )}
          </div>

          {/* KPIs ventas */}
          <div className="grid grid-cols-2 gap-3">
            <KpiCompacto Icono={ShoppingCart} label="Ventas del turno" color="primary"
              valor={formatoMoneda(d.totalVentas)}
              sub={`${d.ventasTurno.length} venta${d.ventasTurno.length !== 1 ? 's' : ''}`} />
            <KpiCompacto Icono={Receipt} label="Tickets" color="slate"
              valor={String(d.ventasTurno.length)}
              sub={d.ventasTurno.length > 0
                ? `Promedio ${formatoMoneda(d.totalVentas / d.ventasTurno.length)}`
                : 'sin ventas aún'} />
          </div>

          {/* Desglose efectivo / tarjeta — solo si hay turno */}
          {d.turno && (
            <div className="grid grid-cols-2 gap-3">
              <KpiCompacto Icono={Banknote} label="Efectivo" color="emerald"
                valor={formatoMoneda(d.ventasEfectivo)} />
              <KpiCompacto Icono={CreditCard} label="Tarjeta" color="primary"
                valor={formatoMoneda(d.ventasTarjeta)} />
            </div>
          )}


          {/* Últimas ventas — solo del cajero */}
          {d.ventasTurno.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary-500" />
                  <p className="text-sm font-bold text-slate-900">Mis últimas ventas</p>
                </div>
                <Link to="/ventas" className="text-xs text-primary-600 font-semibold hover:text-primary-700">
                  Ir a caja
                </Link>
              </div>
              <div className="divide-y divide-slate-100">
                {d.ventasTurno.slice(0, 6).map((v, idx) => {
                  const minutos = Math.round((Date.now() - new Date(v.creado_en).getTime()) / 60000)
                  const hace = minutos < 1 ? 'ahora' : minutos < 60 ? `hace ${minutos} min` : formatoHora(v.creado_en)
                  return (
                    <div key={v.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {idx === 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                        )}
                        <p className="text-xs text-slate-500 truncate">{hace}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {v.metodo_pago === 'tarjeta' ? (
                          <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <CreditCard className="w-2.5 h-2.5" /> Tarjeta
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Banknote className="w-2.5 h-2.5" /> Efectivo
                          </span>
                        )}
                        <span className="text-sm font-bold text-slate-800">{formatoMoneda(v.total)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {modalExistencias && (
        <ModalExistencias onCerrar={() => setModalExistencias(false)} />
      )}
    </div>
  )
}
