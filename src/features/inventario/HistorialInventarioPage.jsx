import { useState, useCallback, useEffect } from 'react'
import {
  Search, Calendar, Filter, ChevronDown,
  PackageCheck, RefreshCw, TrendingUp, TrendingDown,
  Package, ShoppingCart, ArrowLeftRight, Flame, Minus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { cn } from '@/lib/clases'

// ─── Config motivos ───────────────────────────────────────────────────────────
const MOTIVOS_CFG = {
  entrada:               { label: 'Entrada',               color: 'emerald', Icono: Package        },
  inventario_entrada:    { label: 'Entrada',               color: 'emerald', Icono: Package        },
  entrada_inventario:    { label: 'Entrada inventario',    color: 'emerald', Icono: Package        },
  inicial:               { label: 'Stock inicial',         color: 'emerald', Icono: Package        },
  ajuste:                { label: 'Ajuste',                color: 'amber',   Icono: Package        },
  ajuste_positivo:       { label: 'Ajuste +',              color: 'emerald', Icono: Package        },
  ajuste_negativo:       { label: 'Ajuste −',              color: 'red',     Icono: Package        },
  venta:                 { label: 'Venta',                 color: 'sky',     Icono: ShoppingCart   },
  salida_venta:          { label: 'Venta',                 color: 'sky',     Icono: ShoppingCart   },
  transferencia:         { label: 'Transferencia',         color: 'violet',  Icono: ArrowLeftRight },
  transferencia_entrada: { label: 'Transferencia entrada', color: 'violet',  Icono: ArrowLeftRight },
  transferencia_salida:  { label: 'Transferencia salida',  color: 'violet',  Icono: ArrowLeftRight },
  caducidad:             { label: 'Caducidad',             color: 'red',     Icono: Flame          },
  merma:                 { label: 'Merma',                 color: 'red',     Icono: Flame          },
}

const ICON_BG = {
  emerald: 'bg-emerald-50 text-emerald-600',
  sky:     'bg-sky-50     text-sky-600',
  amber:   'bg-amber-50   text-amber-600',
  red:     'bg-red-50     text-red-500',
  violet:  'bg-violet-50  text-violet-600',
  slate:   'bg-slate-100  text-slate-500',
}
const BADGE_CLS = {
  emerald: 'bg-emerald-100 text-emerald-700',
  sky:     'bg-sky-100     text-sky-700',
  amber:   'bg-amber-100   text-amber-700',
  red:     'bg-red-100     text-red-700',
  violet:  'bg-violet-100  text-violet-700',
  slate:   'bg-slate-100   text-slate-600',
}
const DELTA_CLS = {
  pos:  'text-emerald-600',
  neg:  'text-red-500',
  zero: 'text-slate-400',
}

function motivoCfg(motivo) {
  if (!motivo) return { label: '—', color: 'slate', Icono: Package }
  const key = Object.keys(MOTIVOS_CFG).find(k =>
    motivo.toLowerCase() === k ||
    motivo.toLowerCase().replace(/_/g, '') === k.replace(/_/g, '')
  )
  return MOTIVOS_CFG[key] ?? { label: motivo, color: 'slate', Icono: Package }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const POR_PAGINA = 50

export default function HistorialInventarioPage() {
  const { empresa, sucursales } = useApp()

  const [registros,    setRegistros]    = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [totalCount,   setTotalCount]   = useState(0)
  const [pagina,       setPagina]       = useState(0)
  const [error,        setError]        = useState(null)

  const [busqueda,     setBusqueda]     = useState('')
  const [fechaDesde,   setFechaDesde]   = useState('')
  const [fechaHasta,   setFechaHasta]   = useState('')
  const [sucFiltro,    setSucFiltro]    = useState('')
  const [motivoFiltro, setMotivoFiltro] = useState('')

  const cargar = useCallback(async (pg = 0) => {
    if (!empresa?.id) return
    setCargando(true)
    setError(null)
    try {
      let q = supabase
        .from('registros_stock')
        .select(
          `id, cantidad_anterior, cantidad_nueva, diferencia, motivo, creado_en,
           perfiles(nombre),
           sucursales(nombre),
           lotes(codigo_lote, productos(nombre))`,
          { count: 'exact' }
        )
        .eq('empresa_id', empresa.id)
        .order('creado_en', { ascending: false })
        .range(pg * POR_PAGINA, pg * POR_PAGINA + POR_PAGINA - 1)

      if (fechaDesde)   q = q.gte('creado_en', fechaDesde + 'T00:00:00')
      if (fechaHasta)   q = q.lte('creado_en', fechaHasta + 'T23:59:59')
      if (sucFiltro)    q = q.eq('sucursal_id', sucFiltro)
      if (motivoFiltro) q = q.ilike('motivo', `%${motivoFiltro}%`)

      const { data, error: err, count } = await q
      if (err) { setError(err.message); return }
      setRegistros(data ?? [])
      setTotalCount(count ?? 0)
      setPagina(pg)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [empresa?.id, fechaDesde, fechaHasta, sucFiltro, motivoFiltro])

  useEffect(() => { cargar(0) }, [cargar])
  useEffect(() => {
    const onFocus = () => cargar(0)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [cargar])

  const filtrados = busqueda.trim()
    ? registros.filter(r => {
        const q = busqueda.toLowerCase()
        return (
          (r.lotes?.productos?.nombre ?? '').toLowerCase().includes(q) ||
          (r.lotes?.codigo_lote        ?? '').toLowerCase().includes(q) ||
          (r.sucursales?.nombre        ?? '').toLowerCase().includes(q)
        )
      })
    : registros

  // Agrupar por día
  const grupos = filtrados.reduce((acc, r) => {
    const dia = new Date(r.creado_en).toLocaleDateString('es-MX', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    if (!acc[dia]) acc[dia] = []
    acc[dia].push(r)
    return acc
  }, {})

  const hayFiltros = fechaDesde || fechaHasta || sucFiltro || motivoFiltro
  const motivosUnicos = [...new Set(Object.keys(MOTIVOS_CFG))]

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Historial de inventario</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalCount > 0
              ? `${totalCount.toLocaleString('es-MX')} movimientos registrados`
              : 'Movimientos de stock'}
          </p>
        </div>
        <button onClick={() => cargar(pagina)} disabled={cargando}
          className="w-9 h-9 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 flex-shrink-0">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {/* Panel de filtros */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por producto, lote o sucursal..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>

          {sucursales.length > 1 && (
            <div className="relative">
              <select value={sucFiltro} onChange={e => setSucFiltro(e.target.value)}
                className="w-full px-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 appearance-none">
                <option value="">Todas las sucursales</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}

          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select value={motivoFiltro} onChange={e => setMotivoFiltro(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 appearance-none">
              <option value="">Todos los motivos</option>
              {motivosUnicos.map(m => (
                <option key={m} value={m}>{MOTIVOS_CFG[m].label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {(hayFiltros || busqueda) && (
          <button
            onClick={() => { setFechaDesde(''); setFechaHasta(''); setSucFiltro(''); setMotivoFiltro(''); setBusqueda('') }}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 self-start">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Contenido */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <PackageCheck className="w-6 h-6 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">No se pudo cargar el historial</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">{error}</p>
          </div>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <PackageCheck className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            {hayFiltros || busqueda ? 'Sin resultados con estos filtros' : 'Aún no hay movimientos de inventario'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(grupos).map(([dia, items]) => (
            <div key={dia}>
              {/* Separador de día */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider capitalize">{dia}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
                <div className="divide-y divide-slate-100">
                  {items.map(r => {
                    const delta = r.diferencia ?? (Number(r.cantidad_nueva ?? 0) - Number(r.cantidad_anterior ?? 0))
                    const cfg   = motivoCfg(r.motivo)
                    const { Icono } = cfg
                    const isPos = delta > 0
                    const isNeg = delta < 0

                    return (
                      <div key={r.id} className="flex items-center gap-4 px-5 py-4">
                        <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0', ICON_BG[cfg.color] ?? ICON_BG.slate)}>
                          <Icono className="w-5 h-5" strokeWidth={2} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {r.lotes?.productos?.nombre ?? '—'}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {r.lotes?.codigo_lote && (
                              <span className="font-mono">{r.lotes.codigo_lote}</span>
                            )}
                            {r.sucursales?.nombre && ` · ${r.sucursales.nombre}`}
                            {r.perfiles?.nombre   && ` · ${r.perfiles.nombre}`}
                          </p>
                        </div>

                        {/* Badge motivo — solo en sm+ */}
                        <span className={cn('hidden sm:inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0', BADGE_CLS[cfg.color] ?? BADGE_CLS.slate)}>
                          {cfg.label}
                        </span>

                        {/* Delta + hora */}
                        <div className="flex-shrink-0 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isPos && <TrendingUp  className="w-3 h-3 text-emerald-500" strokeWidth={2.5} />}
                            {isNeg && <TrendingDown className="w-3 h-3 text-red-400"    strokeWidth={2.5} />}
                            {!isPos && !isNeg && <Minus className="w-3 h-3 text-slate-300" strokeWidth={2.5} />}
                            <span className={cn('text-sm font-bold tabular-nums', isPos ? DELTA_CLS.pos : isNeg ? DELTA_CLS.neg : DELTA_CLS.zero)}>
                              {isPos ? `+${delta}` : delta}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {new Date(r.creado_en).toLocaleTimeString('es-MX',
                              { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Paginación */}
          {totalCount > POR_PAGINA && (
            <div className="flex items-center justify-center gap-3">
              <button disabled={pagina === 0} onClick={() => cargar(pagina - 1)}
                className="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Anterior
              </button>
              <span className="text-sm text-slate-500">
                {pagina + 1} / {Math.ceil(totalCount / POR_PAGINA)}
              </span>
              <button disabled={(pagina + 1) * POR_PAGINA >= totalCount} onClick={() => cargar(pagina + 1)}
                className="px-4 py-2 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
