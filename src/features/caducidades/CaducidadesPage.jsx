import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  CalendarX, RefreshCw, ChevronDown, ArrowRight,
  AlertTriangle, Timer, Store, Filter, Flame, Clock,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { fechaEnZona, addDias } from '@/lib/formatos'
import { cn } from '@/lib/clases'

// ─── Fila individual de lote ──────────────────────────────────────────────────
function FilaLote({ lote, sucursales, hoy }) {
  const dias = Math.ceil(
    (new Date(lote.fecha_caducidad + 'T12:00:00Z') - new Date(hoy + 'T12:00:00Z')) / 86400000
  )
  const stockSuc = lote.stock ?? {}

  const diasLabel = dias < 0
    ? `Hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? 's' : ''}`
    : dias === 0 ? 'Vence hoy'
    : `En ${dias} día${dias !== 1 ? 's' : ''}`

  const diasCls = dias < 0         ? 'text-red-600'
    : dias <= 15                   ? 'text-red-500'
    : dias <= 30                   ? 'text-orange-500'
    : 'text-amber-600'

  const iconBg = dias < 0          ? 'bg-red-100'
    : dias <= 15                   ? 'bg-red-50'
    : dias <= 30                   ? 'bg-orange-50'
    : 'bg-amber-50'

  const iconClr = dias < 0         ? 'text-red-500'
    : dias <= 15                   ? 'text-red-400'
    : dias <= 30                   ? 'text-orange-500'
    : 'text-amber-500'

  // Info de stock por sucursal (solo las que tienen stock)
  const sucConStock = sucursales.filter(s => Number(stockSuc[s.id] || 0) > 0)

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0', iconBg)}>
        <CalendarX className={cn('w-5 h-5', iconClr)} strokeWidth={2} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">
          {lote.productos?.nombre ?? '—'}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          <span className="font-mono">{lote.codigo_lote}</span>
          {lote.productos?.categoria && ` · ${lote.productos.categoria}`}
          {sucursales.length > 1 && sucConStock.length > 0 && (
            ` · ${sucConStock.map(s => `${s.nombre} (${stockSuc[s.id]})`).join(', ')}`
          )}
        </p>
      </div>

      <div className="flex-shrink-0 text-right">
        <p className={cn('text-sm font-bold', diasCls)}>{diasLabel}</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {new Date(lote.fecha_caducidad + 'T12:00:00').toLocaleDateString('es-MX',
            { day: '2-digit', month: 'short', year: '2-digit' })}
          {' · '}
          <span className="font-medium text-slate-500">{lote.stock?.total ?? 0} uds</span>
        </p>
      </div>
    </div>
  )
}

// ─── Sección de grupo ─────────────────────────────────────────────────────────
function SeccionGrupo({ titulo, lotes, color, Icono, sucursales, hoy }) {
  if (!lotes.length) return null

  const headerCls = {
    red:    'text-red-600',
    orange: 'text-orange-600',
    amber:  'text-amber-600',
  }[color]

  const badgeCls = {
    red:    'bg-red-100 text-red-700',
    orange: 'bg-orange-100 text-orange-700',
    amber:  'bg-amber-100 text-amber-700',
  }[color]

  return (
    <div>
      {/* Separador de sección */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="flex items-center gap-1.5">
          <Icono className={cn('w-3 h-3', headerCls)} strokeWidth={2.5} />
          <span className={cn('text-[11px] font-bold uppercase tracking-wider', headerCls)}>{titulo}</span>
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', badgeCls)}>{lotes.length}</span>
        </div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {lotes.map(l => (
            <FilaLote key={l.id} lote={l} sucursales={sucursales} hoy={hoy} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CaducidadesPage() {
  const { empresa, sucursales, tz, perfil, sucursalActiva, turnoActivo } = useApp()

  const esCajero     = perfil?.rol === 'cajero'
  const sucursalPropia = esCajero
    ? (sucursalActiva ?? sucursales.find(s => s.id === perfil?.sucursal_id) ?? null)
    : null

  const [lotes,       setLotes]       = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [diasAlerta,  setDiasAlerta]  = useState(90)
  const [sucFiltro,   setSucFiltro]   = useState('')
  const [catFiltro,   setCatFiltro]   = useState('')
  const [grupoActivo, setGrupoActivo] = useState('')   // '' | 'caducados' | 'criticos' | 'proximos'

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      const hoy    = fechaEnZona(tz)
      const limite = addDias(hoy, diasAlerta)

      const { data: lotesData, error } = await supabase
        .from('lotes')
        .select('id, codigo_lote, fecha_caducidad, producto_id, productos(nombre, categoria)')
        .eq('empresa_id', empresa.id)
        .eq('activo', true)
        .not('fecha_caducidad', 'is', null)
        .lte('fecha_caducidad', limite)
        .order('fecha_caducidad', { ascending: true })

      if (error) throw error
      if (!lotesData?.length) { setLotes([]); return }

      const { data: inv } = await supabase
        .from('inventario')
        .select('lote_id, cantidad, sucursal_id')
        .in('lote_id', lotesData.map(l => l.id))

      const stockMap = {}
      ;(inv || []).forEach(i => {
        if (!stockMap[i.lote_id]) stockMap[i.lote_id] = { total: 0 }
        if (i.sucursal_id) {
          stockMap[i.lote_id][i.sucursal_id] = (stockMap[i.lote_id][i.sucursal_id] || 0) + Number(i.cantidad || 0)
        }
        stockMap[i.lote_id].total = (stockMap[i.lote_id].total || 0) + Number(i.cantidad || 0)
      })

      setLotes(
        lotesData
          .map(l => ({ ...l, stock: stockMap[l.id] ?? { total: 0 } }))
          .filter(l => l.stock.total > 0)
      )
    } catch (err) {
      toast.error('No se pudieron cargar las caducidades. Verifica la conexión.')
    } finally {
      setCargando(false)
    }
  }, [empresa?.id, diasAlerta, tz])

  useEffect(() => { cargar() }, [cargar])

  // Cajero sin turno activo → pedir que abra turno
  if (esCajero && !turnoActivo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Abre tu turno primero</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            Para ver las caducidades necesitas tener un turno activo. Ve a Ventas y abre tu caja.
          </p>
        </div>
      </div>
    )
  }

  const hoy  = fechaEnZona(tz)
  const en30 = addDias(hoy, 30)

  const filtrados = lotes.filter(l => {
    // Cajero: solo ver lotes con stock en su sucursal
    if (esCajero && sucursalPropia && !(l.stock[sucursalPropia.id] > 0)) return false
    if (!esCajero && sucFiltro && !(l.stock[sucFiltro] > 0)) return false
    if (catFiltro && l.productos?.categoria !== catFiltro) return false
    return true
  })

  const caducados = filtrados.filter(l => l.fecha_caducidad <  hoy)
  const criticos  = filtrados.filter(l => l.fecha_caducidad >= hoy && l.fecha_caducidad <= en30)
  const proximos  = filtrados.filter(l => l.fecha_caducidad >  en30)

  const visibles = {
    caducados: grupoActivo === '' || grupoActivo === 'caducados' ? caducados : [],
    criticos:  grupoActivo === '' || grupoActivo === 'criticos'  ? criticos  : [],
    proximos:  grupoActivo === '' || grupoActivo === 'proximos'  ? proximos  : [],
  }

  const categorias = [...new Set(lotes.map(l => l.productos?.categoria).filter(Boolean))]
  const hayFiltros = sucFiltro || catFiltro || grupoActivo

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Caducidades</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {lotes.length > 0
              ? `${lotes.length} lote${lotes.length !== 1 ? 's' : ''} con existencias por vencer`
              : 'Control de vencimientos de inventario'}
          </p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="w-9 h-9 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40 flex-shrink-0">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'caducados', label: 'Caducados',    sub: 'con stock',    count: caducados.length, bg: 'bg-red-50',    border: 'border-red-200/60',    num: 'text-red-700',    act: 'ring-2 ring-red-400'    },
          { key: 'criticos',  label: 'Críticos',     sub: '≤ 30 días',    count: criticos.length,  bg: 'bg-orange-50', border: 'border-orange-200/60', num: 'text-orange-700', act: 'ring-2 ring-orange-400' },
          { key: 'proximos',  label: 'Próximos',     sub: `≤ ${diasAlerta}d`, count: proximos.length, bg: 'bg-amber-50', border: 'border-amber-200/60', num: 'text-amber-700', act: 'ring-2 ring-amber-400'  },
        ].map(c => (
          <button key={c.key}
            onClick={() => setGrupoActivo(g => g === c.key ? '' : c.key)}
            className={cn(
              'rounded-2xl border px-4 py-3 text-left transition-all hover:shadow-sm',
              c.bg, c.border,
              grupoActivo === c.key && c.act
            )}>
            <p className={cn('text-2xl font-bold tabular-nums', c.num)}>{c.count}</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">{c.label}</p>
            <p className="text-[11px] text-slate-400">{c.sub}</p>
          </button>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Ventana */}
        <div className="relative">
          <Timer className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select value={diasAlerta} onChange={e => setDiasAlerta(Number(e.target.value))}
            className="appearance-none bg-white border border-slate-200 rounded-2xl pl-8 pr-7 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
            <option value={30}>30 días</option>
            <option value={60}>60 días</option>
            <option value={90}>90 días</option>
            <option value={180}>6 meses</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        </div>

        {/* Sucursal — oculto para cajero (solo ve la suya) */}
        {!esCajero && sucursales.length > 1 && (
          <div className="relative">
            <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select value={sucFiltro} onChange={e => setSucFiltro(e.target.value)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-8 pr-7 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
              <option value="">Todas las sucursales</option>
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        )}
        {/* Cajero: indicador de sucursal fija */}
        {esCajero && sucursalPropia && (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-2xl text-sm text-slate-600">
            <Store className="w-3.5 h-3.5 text-slate-400" />
            {sucursalPropia.nombre}
          </div>
        )}

        {/* Categoría */}
        {categorias.length > 0 && (
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
              className="appearance-none bg-white border border-slate-200 rounded-2xl pl-8 pr-7 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30">
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        )}

        {hayFiltros && (
          <button onClick={() => { setSucFiltro(''); setCatFiltro(''); setGrupoActivo('') }}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 px-1">
            Limpiar
          </button>
        )}
      </div>

      {/* Banner caducados */}
      {!cargando && caducados.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200/60 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-800 flex-1">
            <strong>{caducados.length} lote{caducados.length !== 1 ? 's' : ''} vencido{caducados.length !== 1 ? 's' : ''}</strong>{' '}
            con existencias — dar de baja para evitar ventas de producto caducado.
          </p>
          <Link to="/inventario" className="flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900 flex-shrink-0">
            Inventario <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Lista */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <CalendarX className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            {lotes.length === 0 ? `Sin vencimientos en los próximos ${diasAlerta} días` : 'Sin resultados'}
          </p>
          {hayFiltros && (
            <button onClick={() => { setSucFiltro(''); setCatFiltro(''); setGrupoActivo('') }}
              className="text-xs font-semibold text-primary-600 hover:text-primary-700">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <SeccionGrupo titulo="Caducados" Icono={Flame}
            lotes={visibles.caducados} color="red" sucursales={sucursales} hoy={hoy} />
          <SeccionGrupo titulo="Críticos — menos de 30 días" Icono={AlertTriangle}
            lotes={visibles.criticos} color="orange" sucursales={sucursales} hoy={hoy} />
          <SeccionGrupo titulo={`Próximos — hasta ${diasAlerta} días`} Icono={Clock}
            lotes={visibles.proximos} color="amber" sucursales={sucursales} hoy={hoy} />
        </div>
      )}
    </div>
  )
}
