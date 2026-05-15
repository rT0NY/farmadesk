import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Plus, Search, Archive, RefreshCw, AlertTriangle,
  X, Clock, Filter, ChevronDown, Check, Package, Eye,
  PackageCheck, PackageX, Timer, CalendarX, Store,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/clases'
import { CATEGORIAS_PRODUCTO } from '@/lib/constantes'
import { isoEnZona, fechaEnZona, addDias } from '@/lib/formatos'
import ModalAgregarInventario from './ModalAgregarInventario'
import ModalLotes from './ModalLotes'

function DropdownFiltro({ label, icono: Icono, activo, children }) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (!e.target.closest('.dropdown-filtro')) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  return (
    <div className="relative dropdown-filtro">
      <button
        onClick={() => setAbierto(v => !v)}
        className={cn(
          'inline-flex items-center gap-2 h-11 px-4 rounded-2xl text-sm font-medium transition-all border',
          activo
            ? 'bg-primary-50 text-primary-700 border-primary-200'
            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
        )}
      >
        {Icono && <Icono className="w-4 h-4" />}
        {label}
        <ChevronDown className={cn('w-4 h-4 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && (
        <div className="absolute top-full left-0 mt-2 w-60 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5 max-h-[320px] overflow-y-auto">
          {typeof children === 'function' ? children(() => setAbierto(false)) : children}
        </div>
      )}
    </div>
  )
}

function TarjetaResumen({ titulo, valor, icono: Icono, color, activa, onClick }) {
  const colores = {
    emerald: { bg: 'bg-white hover:border-emerald-300',   borde: activa ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200', icono: 'bg-emerald-100 text-emerald-600', texto: 'text-slate-900' },
    red:     { bg: activa ? 'bg-red-50'    : 'bg-red-50/40    hover:border-red-300',    borde: activa ? 'border-red-400    ring-2 ring-red-100'    : 'border-red-200',    icono: 'bg-red-100 text-red-500',      texto: 'text-red-600'    },
    amber:   { bg: activa ? 'bg-amber-50'  : 'bg-amber-50/40  hover:border-amber-300',  borde: activa ? 'border-amber-400  ring-2 ring-amber-100'  : 'border-amber-200',  icono: 'bg-amber-100 text-amber-600',  texto: 'text-amber-700'  },
    orange:  { bg: activa ? 'bg-orange-50' : 'bg-orange-50/40 hover:border-orange-300', borde: activa ? 'border-orange-400 ring-2 ring-orange-100' : 'border-orange-200', icono: 'bg-orange-100 text-orange-600', texto: 'text-orange-700' },
  }
  const c = colores[color]

  return (
    <button
      onClick={onClick}
      className={cn('p-4 rounded-2xl border transition-all text-left w-full hover:shadow-md shadow-sm', c.bg, c.borde)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center', c.icono)}>
          <Icono className="w-4 h-4" strokeWidth={2} />
        </div>
        {activa && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-slate-500">Activo</span>
        )}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', c.texto)}>{valor}</p>
      <p className="text-xs text-slate-400 mt-0.5">{titulo}</p>
    </button>
  )
}

// ─── Vista de caducidad agrupada por urgencia ─────────────────────────────────

function VistaCaducidad({ lotes, cargando }) {
  const { tz } = useApp()
  const hoy     = fechaEnZona(tz)
  const en30str = addDias(hoy, 30)
  const en90str = addDias(hoy, 90)

  const caducados = lotes.filter(l => l.fecha_caducidad < hoy)
  const criticos  = lotes.filter(l => l.fecha_caducidad >= hoy && l.fecha_caducidad <= en30str)
  const proximos  = lotes.filter(l => l.fecha_caducidad > en30str && l.fecha_caducidad <= en90str)

  if (cargando) return (
    <div className="flex justify-center py-10">
      <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )

  if (!lotes.length) return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <CalendarX className="w-8 h-8 text-slate-300" />
      <p className="text-sm font-medium text-slate-500">Sin lotes por caducar en los próximos 3 meses</p>
    </div>
  )

  const Grupo = ({ titulo, items, color }) => {
    if (!items.length) return null
    const cls = {
      red:    { header: 'bg-red-50 border-red-200',    badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    },
      orange: { header: 'bg-orange-50 border-orange-200', badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
      amber:  { header: 'bg-amber-50 border-amber-200',  badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-400'  },
    }[color]
    return (
      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className={`flex items-center justify-between px-4 py-3 border-b ${cls.header}`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cls.dot}`} />
            <p className="text-sm font-bold text-slate-800">{titulo}</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls.badge}`}>{items.length} lote{items.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="divide-y divide-slate-50">
          {items.map(l => {
            const dias = Math.ceil((new Date(l.fecha_caducidad) - new Date(hoy)) / 86400000)
            return (
              <div key={l.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{l.productos?.nombre ?? '—'}</p>
                  {l.productos?.categoria && <p className="text-xs text-slate-400">{l.productos.categoria}</p>}
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-slate-400">Stock</p>
                    <p className="text-sm font-bold text-slate-700">{l.cantidad}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Caduca</p>
                    <p className={`text-sm font-bold ${dias < 0 ? 'text-red-600' : dias <= 30 ? 'text-orange-600' : 'text-amber-600'}`}>
                      {dias < 0
                        ? `hace ${Math.abs(dias)}d`
                        : dias === 0 ? 'Hoy'
                        : `en ${dias}d`}
                    </p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-slate-400">Fecha</p>
                    <p className="text-xs font-medium text-slate-600">
                      {new Date(l.fecha_caducidad + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Grupo titulo="Caducados" items={caducados} color="red" />
      <Grupo titulo="Caducan en menos de 30 días" items={criticos} color="orange" />
      <Grupo titulo="Caducan en 31–90 días" items={proximos} color="amber" />
    </div>
  )
}

export default function InventarioPage() {
  const { sucursales, perfil, sucursalActiva, empresa } = useApp()
  const esCajero  = perfil?.rol === 'cajero'
  // Admin y propietario son globales — no tienen "su" sucursal
  const esGlobal  = perfil?.rol === 'admin' || perfil?.id === empresa?.propietario
  // Sucursal propia del usuario (cajeros/encargados tienen una asignada)
  const sucursalPropia = esGlobal ? null : (sucursalActiva ?? sucursales.find(s => s.id === perfil?.sucursal_id) ?? null)
  const [datos, setDatos] = useState([])
  const [lotesCaducidad, setLotesCaducidad] = useState([])
  const [cargando, setCargando] = useState(true)
  const [cargandoCad, setCargandoCad] = useState(false)
  const [errorCarga, setErrorCarga] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroOtrasSuc, setFiltroOtrasSuc] = useState(false)
  const [categoriaSel, setCategoriaSel] = useState('')
  const [modalAgregar, setModalAgregar] = useState(false)
  const [productoLotes, setProductoLotes] = useState(null)

  const cargar = async () => {
    setCargando(true)
    setErrorCarga(null)
    try {
      const { data, error } = await supabase.rpc('inventario_completo', {
        p_solo_con_stock: false,
        p_solo_bajo_stock: false,
      })
      if (error) throw error
      setDatos(data || [])
    } catch (err) {
      setErrorCarga(err.message ?? 'Error al cargar inventario')
      toast.error('No se pudo cargar el inventario. Verifica la conexión.')
    } finally {
      setCargando(false)
    }
  }

  const cargarCaducidad = useCallback(async () => {
    setCargandoCad(true)
    try {
      const { data: lotes } = await supabase
        .from('lotes')
        .select('id, fecha_caducidad, producto_id, productos(nombre, categoria)')
        .eq('empresa_id', empresa.id)
        .eq('activo', true)
        .not('fecha_caducidad', 'is', null)
        .order('fecha_caducidad', { ascending: true })
      if (!lotes?.length) { setLotesCaducidad([]); return }

      const { data: inv } = await supabase
        .from('inventario')
        .select('lote_id, cantidad')
        .in('lote_id', lotes.map(l => l.id))

      const cantMap = {}
      ;(inv || []).forEach(i => { cantMap[i.lote_id] = (cantMap[i.lote_id] || 0) + Number(i.cantidad || 0) })

      setLotesCaducidad(lotes.map(l => ({ ...l, cantidad: cantMap[l.id] || 0 })).filter(l => l.cantidad > 0))
    } catch (err) {
      toast.error('No se pudieron cargar las caducidades.')
    } finally {
      setCargandoCad(false)
    }
  }, [])

  useEffect(() => { cargar() }, [])
  useEffect(() => { if (filtroEstado === 'por_caducar') cargarCaducidad() }, [filtroEstado, cargarCaducidad])

  const categorias = useMemo(() => {
    const conteos = new Map()
    datos.forEach(p => { if (p.categoria) conteos.set(p.categoria, (conteos.get(p.categoria) || 0) + 1) })
    return CATEGORIAS_PRODUCTO.map(c => ({ nombre: c, total: conteos.get(c) || 0 })).filter(c => c.total > 0)
  }, [datos])

  const conteos = useMemo(() => ({
    todos: datos.length,
    con_stock: datos.filter(p => p.stock_total > 0).length,
    sin_stock: datos.filter(p => p.stock_total === 0).length,
    bajo_stock: datos.filter(p => p.bajo_stock).length,
    por_caducar: datos.filter(p => p.lotes_por_caducar > 0 || p.lotes_caducados > 0).length,
  }), [datos])

  const filtrados = useMemo(() => {
    let r = datos
    if (filtroEstado === 'con_stock') r = r.filter(p => p.stock_total > 0)
    else if (filtroEstado === 'sin_stock') r = r.filter(p => p.stock_total === 0)
    else if (filtroEstado === 'bajo_stock') r = r.filter(p => p.bajo_stock)
    else if (filtroEstado === 'por_caducar') r = r.filter(p => p.lotes_por_caducar > 0 || p.lotes_caducados > 0)

    if (categoriaSel) r = r.filter(p => p.categoria === categoriaSel)

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      const esCodigoBarras = /^\d{6,}$/.test(q)
      r = r.filter(p => {
        if (esCodigoBarras) return p.codigos?.some(c => c === q) || p.producto_nombre?.toLowerCase().includes(q)
        return p.producto_nombre?.toLowerCase().includes(q) || p.categoria?.toLowerCase().includes(q) || p.codigos?.some(c => c.toLowerCase().includes(q))
      })
    }
    return r
  }, [datos, filtroEstado, categoriaSel, busqueda])

  // Filtro extra: productos sin stock en mi sucursal pero con stock en otra
  const filtradosConOtrasSuc = useMemo(() => {
    if (!filtroOtrasSuc || !sucursalPropia) return filtrados
    return filtrados.filter(p => {
      const stockSuc = p.stock_por_sucursal || {}
      const miStock = Number(stockSuc[sucursalPropia.id] || 0)
      const hayEnOtra = sucursales.some(s => s.id !== sucursalPropia.id && Number(stockSuc[s.id] || 0) > 0)
      return miStock === 0 && hayEnOtra
    })
  }, [filtrados, filtroOtrasSuc, sucursalPropia, sucursales])

  const hayFiltros = busqueda || categoriaSel || filtroEstado !== 'todos' || filtroOtrasSuc

  const toggleFiltro = (f) => setFiltroEstado(prev => prev === f ? 'todos' : f)

  const bordeIzq = (p) => {
    if (p.lotes_caducados > 0) return 'border-l-4 border-l-red-500'
    if (p.stock_total === 0)   return 'border-l-4 border-l-red-400'
    // Alguna sucursal en 0 aunque el total global sea positivo
    const stockSuc = p.stock_por_sucursal || {}
    const algunaSinStock = sucursales.some(s => (Number(stockSuc[s.id]) || 0) === 0)
    if (algunaSinStock)        return 'border-l-4 border-l-amber-400'
    if (p.lotes_por_caducar > 0) return 'border-l-4 border-l-orange-400'
    if (p.bajo_stock)          return 'border-l-4 border-l-amber-400'
    return 'border-l-4 border-l-emerald-400'
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Inventario</h1>
          <p className="text-sm text-slate-500 mt-1">{conteos.todos} producto{conteos.todos !== 1 && 's'} en catálogo</p>
        </div>
        {!esCajero && (
          <Button onClick={() => setModalAgregar(true)} iconoIzq={<Plus className="w-4 h-4" />}>
            <span className="hidden sm:inline">Agregar stock</span>
            <span className="sm:hidden">Agregar</span>
          </Button>
        )}
      </div>

      {/* Banner para cajeros: consulta en otras sucursales */}
      {esCajero && sucursales.length > 1 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Store className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-sky-900">Consulta de existencias</p>
              <p className="text-xs text-sky-700">Puedes ver el stock de todas las sucursales. Usa el filtro para encontrar productos disponibles en otras farmacias.</p>
            </div>
          </div>
          <button
            onClick={() => setFiltroOtrasSuc(v => !v)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all flex-shrink-0 border',
              filtroOtrasSuc
                ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                : 'bg-white text-sky-700 border-sky-300 hover:border-sky-400'
            )}
          >
            <Store className="w-3.5 h-3.5" />
            {filtroOtrasSuc ? 'Mostrando otras farmacias' : 'Ver en otras farmacias'}
          </button>
        </div>
      )}

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TarjetaResumen
          titulo="Con stock"
          valor={conteos.con_stock}
          icono={PackageCheck}
          color="emerald"
          activa={filtroEstado === 'con_stock'}
          onClick={() => toggleFiltro('con_stock')}
        />
        <TarjetaResumen
          titulo="Sin stock"
          valor={conteos.sin_stock}
          icono={PackageX}
          color="red"
          activa={filtroEstado === 'sin_stock'}
          onClick={() => toggleFiltro('sin_stock')}
        />
        <TarjetaResumen
          titulo="Stock bajo"
          valor={conteos.bajo_stock}
          icono={AlertTriangle}
          color="amber"
          activa={filtroEstado === 'bajo_stock'}
          onClick={() => toggleFiltro('bajo_stock')}
        />
        <TarjetaResumen
          titulo="Por caducar"
          valor={conteos.por_caducar}
          icono={Timer}
          color="orange"
          activa={filtroEstado === 'por_caducar'}
          onClick={() => toggleFiltro('por_caducar')}
        />
      </div>

      {/* Búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="Buscar por nombre o código de barras..."
            iconoIzq={<Search className="w-5 h-5" />}
            iconoDer={busqueda && (
              <button onClick={() => setBusqueda('')} className="hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <DropdownFiltro label={categoriaSel || 'Categoría'} icono={Filter} activo={!!categoriaSel}>
            {(cerrar) => (
              <>
                <button
                  onClick={() => { setCategoriaSel(''); cerrar() }}
                  className={cn('w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors', !categoriaSel ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700 hover:bg-slate-50')}
                >
                  <span className="flex-1">Todas</span>
                  {!categoriaSel && <Check className="w-4 h-4 text-primary-600" />}
                </button>
                {categorias.map(c => (
                  <button
                    key={c.nombre}
                    onClick={() => { setCategoriaSel(c.nombre); cerrar() }}
                    className={cn('w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors', categoriaSel === c.nombre ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-700 hover:bg-slate-50')}
                  >
                    <span className="flex-1 truncate">{c.nombre}</span>
                    <span className="text-xs text-slate-400">{c.total}</span>
                    {categoriaSel === c.nombre && <Check className="w-4 h-4 text-primary-600" />}
                  </button>
                ))}
              </>
            )}
          </DropdownFiltro>

          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(''); setCategoriaSel(''); setFiltroEstado('todos'); setFiltroOtrasSuc(false) }}
              className="inline-flex items-center gap-1.5 h-11 px-3 rounded-2xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" /> Limpiar
            </button>
          )}

          <button onClick={cargar} disabled={cargando} className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Vista de caducidad detallada */}
      {filtroEstado === 'por_caducar' && (
        <VistaCaducidad lotes={lotesCaducidad} cargando={cargandoCad} />
      )}

      {/* Tabla de productos */}
      {filtroEstado !== 'por_caducar' && (cargando && datos.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : filtradosConOtrasSuc.length === 0 ? (
        <EmptyState
          icono={errorCarga ? AlertTriangle : Archive}
          titulo={
            errorCarga                ? 'Error al cargar inventario'
            : datos.length === 0     ? 'Sin productos'
            : filtroOtrasSuc         ? 'Ningún producto disponible en otras farmacias'
            :                          'Sin resultados'
          }
          descripcion={
            errorCarga                ? 'No se pudo conectar. Verifica tu conexión e intenta de nuevo.'
            : datos.length === 0     ? 'Crea productos primero y luego agrega stock.'
            : filtroOtrasSuc         ? 'Todos los productos que buscas están disponibles en tu sucursal.'
            :                          'Ajusta los filtros o la búsqueda.'
          }
          accion={
            errorCarga
              ? <Button variante="secundario" onClick={cargar} iconoIzq={<RefreshCw className="w-4 h-4" />}>Reintentar</Button>
              : hayFiltros
                ? <Button variante="secundario" onClick={() => { setBusqueda(''); setCategoriaSel(''); setFiltroEstado('todos'); setFiltroOtrasSuc(false) }} iconoIzq={<X className="w-4 h-4" />}>Limpiar filtros</Button>
                : null
          }
        />
      ) : (
        <div className="bg-white border border-slate-200/70 rounded-3xl overflow-hidden shadow-sm">
          {/* Cards móvil */}
          <div className="flex flex-col divide-y divide-slate-100 sm:hidden">
            {filtradosConOtrasSuc.map(p => {
              const stockSuc = p.stock_por_sucursal || {}
              const miStock = sucursalPropia ? Number(stockSuc[sucursalPropia.id] || 0) : null
              return (
                <div key={p.producto_id} className={cn('px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50/60 transition-colors', bordeIzq(p))}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.producto_nombre}</p>
                    {p.categoria && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-600 inline-block mt-0.5">{p.categoria}</span>
                    )}
                    {/* Stock por sucursal — tarjetas claras */}
                    {sucursales.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {sucursales.map(s => {
                          const cant = Number(stockSuc[s.id] || 0)
                          const esMia = sucursalPropia?.id === s.id
                          return (
                            <span key={s.id} className={cn(
                              'flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                              esMia
                                ? cant > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
                                : cant > 0 ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-slate-50 border-slate-200 text-slate-400'
                            )}>
                              {esMia && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
                              {s.nombre}: {cant}
                            </span>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {p.lotes_caducados > 0 && <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">Caducado</span>}
                      {p.lotes_por_caducar > 0 && p.lotes_caducados === 0 && <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">Por caducar</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="text-right">
                      <span className={cn('text-sm font-bold tabular-nums',
                        p.stock_total === 0 ? 'text-red-600' : p.bajo_stock ? 'text-amber-700' : 'text-slate-900')}>{p.stock_total}</span>
                      <span className="text-xs text-slate-400 ml-1">total</span>
                    </div>
                    {!esCajero && (
                      <button onClick={() => setProductoLotes(p)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                        <Eye className="w-3.5 h-3.5" /> Lotes
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {/* Tabla desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50/70 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider min-w-[200px]">Producto</th>
                  {sucursales.map(s => {
                    const esMia = sucursalPropia?.id === s.id
                    return (
                      <th key={s.id} className={cn(
                        'px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider min-w-[90px]',
                        esMia ? 'text-primary-700 bg-primary-50/60' : 'text-slate-500'
                      )}>
                        {esMia && <span className="mr-1">★</span>}{s.nombre}
                      </th>
                    )
                  })}
                  <th className="px-3 py-2.5 text-right text-[11px] font-bold text-primary-700 uppercase tracking-wider bg-primary-50/50 min-w-[90px]">Total</th>
                  {!esCajero && <th className="px-3 py-2.5 w-20"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradosConOtrasSuc.map(p => {
                  const stockSuc = p.stock_por_sucursal || {}
                  return (
                    <tr key={p.producto_id} className={cn('transition-colors hover:bg-slate-50/60', bordeIzq(p))}>
                      <td className="px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{p.producto_nombre}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.categoria && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-600">{p.categoria}</span>
                            )}
                            {p.lotes_caducados > 0 && (
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">Caducado</span>
                            )}
                            {p.lotes_por_caducar > 0 && p.lotes_caducados === 0 && (
                              <span className="text-[10px] font-bold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Timer className="w-3 h-3" /> Por caducar
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {sucursales.map(s => {
                        const cant = Number(stockSuc[s.id] || 0)
                        const esMia = sucursalPropia?.id === s.id
                        return (
                          <td key={s.id} className={cn('px-3 py-2.5 text-right text-sm tabular-nums', esMia && 'bg-primary-50/40')}>
                            <span className={cn(
                              'font-bold',
                              esMia
                                ? cant > 0 ? 'text-emerald-600' : 'text-red-500'
                                : cant === 0 ? 'text-red-400'   : 'text-slate-700'
                            )}>{cant}</span>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 text-right bg-primary-50/30">
                        <span className={cn('text-sm font-bold tabular-nums',
                          p.stock_total === 0 ? 'text-red-600' : p.bajo_stock ? 'text-amber-700' : 'text-slate-900')}>{p.stock_total}</span>
                        <span className="text-xs text-slate-400 ml-1">/ {p.stock_minimo}</span>
                      </td>
                      {!esCajero && (
                        <td className="px-3 py-2.5 text-right">
                          <button onClick={() => setProductoLotes(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                            <Eye className="w-3.5 h-3.5" /> Lotes
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <ModalAgregarInventario abierto={modalAgregar} onCerrar={() => setModalAgregar(false)} onExito={cargar} />
      <ModalLotes producto={productoLotes} onCerrar={() => setProductoLotes(null)} onCambio={cargar} />
    </div>
  )
}