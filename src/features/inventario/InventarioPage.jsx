import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Search, Archive, RefreshCw, AlertTriangle,
  X, Clock, Filter, ChevronDown, Check, Package, Eye,
  PackageCheck, PackageX, Timer, CalendarX, Store, MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { traerTodo, traerTodoPorParLlave } from '@/lib/paginado'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORIAS_PRODUCTO } from '@/lib/constantes'
import { fechaEnZona, addDias } from '@/lib/formatos'
import { invalidarStock } from '@/lib/cache'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
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
    emerald: { icono: 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/30', ring: 'border-emerald-200 ring-2 ring-emerald-500/20', chip: 'text-emerald-700 bg-emerald-50', texto: 'text-slate-900'  },
    red:     { icono: 'bg-gradient-to-br from-red-500 to-rose-600 shadow-md shadow-red-500/30',            ring: 'border-red-200 ring-2 ring-red-500/20',         chip: 'text-red-700 bg-red-50',         texto: 'text-red-600'    },
    amber:   { icono: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/30',      ring: 'border-amber-200 ring-2 ring-amber-500/20',     chip: 'text-amber-700 bg-amber-50',     texto: 'text-amber-700'  },
    orange:  { icono: 'bg-gradient-to-br from-orange-400 to-orange-600 shadow-md shadow-orange-500/30',    ring: 'border-orange-200 ring-2 ring-orange-500/20',   chip: 'text-orange-700 bg-orange-50',   texto: 'text-orange-700' },
  }
  const c = colores[color]
  const sinDatos = !valor

  return (
    <button
      onClick={onClick}
      className={cn(
        'bg-white p-4 rounded-3xl border text-left w-full transition-all duration-200',
        activa
          ? cn(c.ring, 'shadow-card-hover')
          : 'border-slate-100 shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn(
          'w-9 h-9 rounded-2xl flex items-center justify-center',
          sinDatos ? 'bg-slate-100' : c.icono
        )}>
          <Icono className={cn('w-4 h-4', sinDatos ? 'text-slate-400' : 'text-white')} strokeWidth={2} />
        </div>
        {activa && (
          <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full', c.chip)}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Activo
          </span>
        )}
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', sinDatos ? 'text-slate-900' : c.texto)}>{valor}</p>
      <p className="text-xs text-slate-400 mt-0.5">{titulo}</p>
    </button>
  )
}

// ─── Grupo de caducidad ───────────────────────────────────────────────────────

function GrupoCaducidad({ titulo, subtitulo, items, color, hoy }) {
  if (!items.length) return null
  // Mismo lenguaje visual que las tarjetas de arriba: cuadro con degradado y
  // sombra en su color, en vez del puntito suelto que se veía deslavado.
  const cls = {
    red: {
      header: 'bg-gradient-to-r from-red-50 to-transparent border-red-100',
      icono:  'bg-gradient-to-br from-red-500 to-rose-600 shadow-md shadow-red-500/30',
      badge:  'bg-white text-red-700 ring-1 ring-red-200',
      Icono:  CalendarX,
    },
    orange: {
      header: 'bg-gradient-to-r from-orange-50 to-transparent border-orange-100',
      icono:  'bg-gradient-to-br from-orange-400 to-orange-600 shadow-md shadow-orange-500/30',
      badge:  'bg-white text-orange-700 ring-1 ring-orange-200',
      Icono:  AlertTriangle,
    },
    amber: {
      header: 'bg-gradient-to-r from-amber-50 to-transparent border-amber-100',
      icono:  'bg-gradient-to-br from-amber-400 to-amber-500 shadow-md shadow-amber-500/30',
      badge:  'bg-white text-amber-700 ring-1 ring-amber-200',
      Icono:  Clock,
    },
  }[color]
  const Icono = cls.Icono

  return (
    <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-card">
      <div className={cn('flex items-center justify-between gap-3 px-4 py-3.5 border-b', cls.header)}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0', cls.icono)}>
            <Icono className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 leading-tight truncate">{titulo}</p>
            {subtitulo && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitulo}</p>}
          </div>
        </div>
        <span className={cn(
          'text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 tabular-nums',
          cls.badge
        )}>
          {items.length} lote{items.length !== 1 ? 's' : ''}
        </span>
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

  return (
    <div className="flex flex-col gap-4">
      <GrupoCaducidad titulo="Caducados"  subtitulo="Retirar del anaquel"
                      items={caducados} color="red"    hoy={hoy} />
      <GrupoCaducidad titulo="Críticos"   subtitulo="Vencen en menos de 30 días"
                      items={criticos}  color="orange" hoy={hoy} />
      <GrupoCaducidad titulo="Próximos"   subtitulo="Vencen entre 31 y 90 días"
                      items={proximos}  color="amber"  hoy={hoy} />
    </div>
  )
}

export default function InventarioPage() {
  const { sucursales, perfil, sucursalActiva, turnoActivo, empresa, tz } = useApp()
  const esCajero  = perfil?.rol === 'cajero'
  // Admin y propietario son globales — no tienen "su" sucursal
  const esGlobal  = perfil?.rol === 'admin' || perfil?.id === empresa?.propietario
  // Sucursal propia del usuario (cajeros/encargados tienen una asignada)
  const sucursalPropia = esGlobal ? null : (sucursalActiva ?? sucursales.find(s => s.id === perfil?.sucursal_id) ?? null)
  const [lotesCaducidad, setLotesCaducidad] = useState([])
  const [cargandoCad, setCargandoCad] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroOtrasSuc, setFiltroOtrasSuc] = useState(false)
  const [categoriaSel, setCategoriaSel] = useState('')
  const [modalAgregar,      setModalAgregar]      = useState(false)
  const [productoLotes,     setProductoLotes]     = useState(null)
  const [modalExistencias,  setModalExistencias]  = useState(false)

  // Para cajero: el stock relevante es solo el de su sucursal
  const stockEnMiSuc = useCallback((p) => {
    if (!sucursalPropia) return p.stock_total
    return Number((p.stock_por_sucursal || {})[sucursalPropia.id] || 0)
  }, [sucursalPropia])

  const { data: datos = [], isLoading: cargando, isFetching, error: errorCarga, dataUpdatedAt, refetch } = useQuery({
    queryKey:  ['inventario_completo', empresa?.id],
    queryFn:   async () => {
      const { data, error } = await supabase.rpc('inventario_completo', {
        p_solo_con_stock:  false,
        p_solo_bajo_stock: false,
      })
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60_000,   // inventario cambia con cada venta — 5 min es razonable
    enabled:   !!empresa?.id,
  })

  // Sin argumentos: refetch() recibiría el evento del click como opciones
  const cargar = useCallback(() => { refetch() }, [refetch])

  // Otro empleado puede mover stock desde su terminal: al volver a la ventana,
  // si los datos ya tienen rato, se recargan solos.
  useFocusRefresh(cargar)

  // Productos deshabilitados en la sucursal del usuario. Sirve para distinguir
  // "0 uds" (se vende aquí, hay que resurtir) de "no se vende en esta sucursal",
  // que son cosas muy distintas para quien está en el mostrador.
  // Clave `${producto_id}|${sucursal_id}`. Se cargan TODAS las sucursales para
  // que también la tabla del admin pueda marcar dónde no se vende cada producto.
  const [noDisponibles, setNoDisponibles] = useState(new Set())
  useEffect(() => {
    if (!empresa?.id) return
    let cancelado = false
    // Por tandas: son 1,926 filas y llegaban solo 1,000. Las 926 que faltaban
    // no salían como error — el producto simplemente se pintaba disponible en
    // sucursales donde no lo está.
    traerTodoPorParLlave(
      () => supabase.from('productos_sucursales'),
      'producto_id, sucursal_id',
      q => q.eq('habilitado', false),
      'producto_id', 'sucursal_id',
    )
      .then(filas => {
        if (!cancelado) setNoDisponibles(new Set(filas.map(r => `${r.producto_id}|${r.sucursal_id}`)))
      })
      .catch(e => console.error('Disponibilidad por sucursal:', e))
    return () => { cancelado = true }
  }, [empresa?.id])

  const noSeVendeEn = useCallback(
    (productoId, sucursalId) => noDisponibles.has(`${productoId}|${sucursalId}`),
    [noDisponibles]
  )

  const cargarCaducidad = useCallback(async () => {
    // La dependencia vacía de antes congelaba `empresa` como estaba en el primer
    // render —o sea nula, porque llega después—, y `empresa.id` reventaba. El
    // error se lo tragaba el catch y la lista quedaba vacía aunque la tarjeta
    // contara 6.
    if (!empresa?.id) return

    setCargandoCad(true)
    try {
      const hoy    = fechaEnZona(tz)
      const limite = addDias(hoy, 90)

      // Acotado a 90 días, que es justo lo que agrupa la vista. Antes traía TODO
      // lote con fecha, sin límite ni paginación, y con el tope de mil filas de
      // Supabase los cercanos podían quedar fuera del corte.
      const lotes = await traerTodo(() => supabase.from('lotes'),
        'id, fecha_caducidad, producto_id, productos(nombre, categoria)',
        q => q.eq('empresa_id', empresa.id)
              .eq('activo', true)
              .not('fecha_caducidad', 'is', null)
              .lte('fecha_caducidad', limite))

      if (!lotes.length) { setLotesCaducidad([]); return }

      const inv = await traerTodo(() => supabase.from('inventario'),
        'id, lote_id, cantidad', q => q.in('lote_id', lotes.map(l => l.id)))

      const cantMap = {}
      inv.forEach(i => { cantMap[i.lote_id] = (cantMap[i.lote_id] || 0) + Number(i.cantidad || 0) })

      setLotesCaducidad(
        lotes.map(l => ({ ...l, cantidad: cantMap[l.id] || 0 }))
             .filter(l => l.cantidad > 0)
             .sort((a, b) => a.fecha_caducidad.localeCompare(b.fecha_caducidad))
      )
    } catch (e) {
      console.error('Caducidades en Inventario:', e)
      toast.error('No se pudieron cargar las caducidades.')
    } finally {
      setCargandoCad(false)
    }
  }, [empresa?.id, tz])

  useEffect(() => { if (filtroEstado === 'por_caducar') cargarCaducidad() }, [filtroEstado, cargarCaducidad])

  const categorias = useMemo(() => {
    const conteos = new Map()
    datos.forEach(p => { if (p.categoria) conteos.set(p.categoria, (conteos.get(p.categoria) || 0) + 1) })
    return CATEGORIAS_PRODUCTO.map(c => ({ nombre: c, total: conteos.get(c) || 0 })).filter(c => c.total > 0)
  }, [datos])

  const conteos = useMemo(() => ({
    todos:       datos.length,
    con_stock:   datos.filter(p => (esCajero ? stockEnMiSuc(p) : p.stock_total) > 0).length,
    sin_stock:   datos.filter(p => (esCajero ? stockEnMiSuc(p) : p.stock_total) === 0).length,
    bajo_stock:  datos.filter(p => esCajero ? (sucursalPropia && stockEnMiSuc(p) < (p.stock_minimo ?? 0) && (p.stock_minimo ?? 0) > 0) : p.bajo_stock).length,
    por_caducar: datos.filter(p => p.lotes_por_caducar > 0 || p.lotes_caducados > 0).length,
  }), [datos, esCajero, stockEnMiSuc, sucursalPropia])

  const filtrados = useMemo(() => {
    let r = datos
    if (filtroEstado === 'con_stock')   r = r.filter(p => (esCajero ? stockEnMiSuc(p) : p.stock_total) > 0)
    else if (filtroEstado === 'sin_stock')  r = r.filter(p => (esCajero ? stockEnMiSuc(p) : p.stock_total) === 0)
    else if (filtroEstado === 'bajo_stock') r = r.filter(p => esCajero ? (sucursalPropia && stockEnMiSuc(p) < (p.stock_minimo ?? 0) && (p.stock_minimo ?? 0) > 0) : p.bajo_stock)
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

  // Cajero sin turno activo → no tiene sucursal asignada, no puede ver inventario
  if (esCajero && !turnoActivo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Abre tu turno primero</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            Para ver el inventario necesitas tener un turno activo. Ve a Ventas y abre tu caja.
          </p>
        </div>
      </div>
    )
  }

  const toggleFiltro = (f) => setFiltroEstado(prev => prev === f ? 'todos' : f)

  const bordeIzq = (p) => {
    if (p.lotes_caducados > 0) return 'border-l-4 border-l-red-500'
    const stock = esCajero ? stockEnMiSuc(p) : p.stock_total
    if (stock === 0) return 'border-l-4 border-l-red-400'
    if (!esCajero) {
      const stockSuc = p.stock_por_sucursal || {}
      const algunaSinStock = sucursales.some(s => (Number(stockSuc[s.id]) || 0) === 0)
      if (algunaSinStock) return 'border-l-4 border-l-amber-400'
    }
    if (p.lotes_por_caducar > 0) return 'border-l-4 border-l-orange-400'
    if (esCajero ? (sucursalPropia && stock < (p.stock_minimo ?? 0) && (p.stock_minimo ?? 0) > 0) : p.bajo_stock) return 'border-l-4 border-l-amber-400'
    return 'border-l-4 border-l-emerald-400'
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Inventario</h1>
          <p className="text-sm text-slate-500 mt-1">
            {conteos.todos} producto{conteos.todos !== 1 && 's'} en catálogo
            {dataUpdatedAt > 0 && (
              <span className="text-slate-400">
                {' · '}
                {isFetching
                  ? 'actualizando…'
                  : `actualizado ${new Date(dataUpdatedAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
              </span>
            )}
          </p>
        </div>
        {!esCajero && (
          <Button onClick={() => setModalAgregar(true)} iconoIzq={<Plus className="w-4 h-4" />}>
            <span className="hidden sm:inline">Agregar stock</span>
            <span className="sm:hidden">Agregar</span>
          </Button>
        )}
      </div>

      {/* Cajero: botón de consulta en otras sucursales */}
      {esCajero && sucursales.length > 1 && (
        <button
          onClick={() => setModalExistencias(true)}
          className="w-full flex items-center gap-3 bg-sky-600 hover:bg-sky-700 active:scale-[0.99] rounded-2xl px-4 py-3.5 transition-all text-left shadow-sm shadow-sky-200"
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Consultar producto en otra farmacia</p>
            <p className="text-xs text-sky-100">Consultar existencia de un producto en todas las sucursales</p>
          </div>
          <Search className="w-4 h-4 text-white/70 flex-shrink-0" />
        </button>
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

          <button onClick={cargar} disabled={isFetching} title="Actualizar existencias"
            className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition-colors disabled:opacity-50">
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Vista de caducidad detallada */}
      {filtroEstado === 'por_caducar' && (
        <VistaCaducidad lotes={lotesCaducidad} cargando={cargandoCad} />
      )}

      {/* Tabla de productos */}
      {filtroEstado !== 'por_caducar' && (cargando && datos.length === 0 ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
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
              ? <Button variante="tinted" onClick={cargar} iconoIzq={<RefreshCw className="w-4 h-4" />}>Reintentar</Button>
              : hayFiltros
                ? <Button variante="secundario" onClick={() => { setBusqueda(''); setCategoriaSel(''); setFiltroEstado('todos'); setFiltroOtrasSuc(false) }} iconoIzq={<X className="w-4 h-4" />}>Limpiar filtros</Button>
                : null
          }
        />
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-card">
          {/* Cards móvil */}
          <div className="flex flex-col divide-y divide-slate-100 sm:hidden">
            {filtradosConOtrasSuc.map(p => {
              const stockSuc = p.stock_por_sucursal || {}
              return (
                <div key={p.producto_id} className={cn('px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50/60 transition-colors', bordeIzq(p))}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.producto_nombre}</p>
                    {p.categoria && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-600 inline-block mt-0.5">{p.categoria}</span>
                    )}
                    {/* Stock por sucursal */}
                    {esCajero ? (
                      // Cajero: solo su sucursal
                      sucursalPropia && (
                        noSeVendeEn(p.producto_id, sucursalPropia?.id) ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border mt-1.5 bg-slate-100 border-slate-200 text-slate-500">
                            No disponible aquí
                          </span>
                        ) : (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border mt-1.5',
                            Number(stockSuc[sucursalPropia.id] || 0) > 0
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-red-50 border-red-200 text-red-600'
                          )}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {Number(stockSuc[sucursalPropia.id] || 0)} uds
                          </span>
                        )
                      )
                    ) : sucursales.length > 1 && (
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
                      {(() => {
                        const s = esCajero ? stockEnMiSuc(p) : p.stock_total
                        const bajo = esCajero ? (sucursalPropia && s < (p.stock_minimo ?? 0) && (p.stock_minimo ?? 0) > 0) : p.bajo_stock
                        return (
                          <span className={cn('text-sm font-bold tabular-nums',
                            s === 0 ? 'text-red-600' : bajo ? 'text-amber-700' : 'text-slate-900')}>{s}</span>
                        )
                      })()}
                      <span className="text-xs text-slate-400 ml-1">uds</span>
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
          {/* table-fixed a proposito: con ancho automatico el navegador ensancha
              la columna hasta que quepa el nombre completo, y `truncate` nunca
              actua porque min-w es un piso, no un techo. Un solo producto de
              nombre largo empujaba las columnas de sucursal fuera de la vista.
              Con ancho fijo, las sucursales mandan y el nombre se recorta. */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full table-fixed min-w-[560px]">
              <thead className="bg-slate-50/70 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Producto</th>
                  {esCajero ? (
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/50 w-[110px]">
                      {sucursalPropia?.nombre ?? 'Tu sucursal'}
                    </th>
                  ) : (
                    <>
                      {sucursales.map(s => {
                        const esMia = sucursalPropia?.id === s.id
                        return (
                          <th key={s.id} className={cn(
                            'px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider w-[100px]',
                            esMia ? 'text-primary-700 bg-primary-50/60' : 'text-slate-500'
                          )}>
                            {esMia && <span className="mr-1">★</span>}{s.nombre}
                          </th>
                        )
                      })}
                      <th className="px-3 py-2.5 text-right text-[11px] font-bold text-primary-700 uppercase tracking-wider bg-primary-50/50 w-[90px]">Total</th>
                      <th className="px-3 py-2.5 w-20"></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradosConOtrasSuc.map(p => {
                  const stockSuc = p.stock_por_sucursal || {}
                  return (
                    <tr key={p.producto_id} className={cn('transition-colors hover:bg-slate-50/60', bordeIzq(p))}>
                      <td className="px-3 py-2.5">
                        <div className="min-w-0">
                          {/* El title deja ver el nombre completo al pasar el
                              cursor, ya que ahora se recorta. */}
                          <p className="text-sm font-semibold text-slate-900 truncate" title={p.producto_nombre}>
                            {p.producto_nombre}
                          </p>
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
                      {esCajero ? (
                        // Cajero: solo su sucursal
                        <td className="px-3 py-2.5 text-right bg-emerald-50/30">
                          {(() => {
                            if (noSeVendeEn(p.producto_id, sucursalPropia?.id)) {
                              return <span className="text-xs font-semibold text-slate-400">No disponible aquí</span>
                            }
                            const cant = sucursalPropia ? Number(stockSuc[sucursalPropia.id] || 0) : p.stock_total
                            const bajo = sucursalPropia && cant < (p.stock_minimo ?? 0) && (p.stock_minimo ?? 0) > 0
                            return (
                              <>
                                <span className={cn('text-sm font-bold tabular-nums',
                                  cant === 0 ? 'text-red-600' : bajo ? 'text-amber-700' : 'text-emerald-700')}>{cant}</span>
                                <span className="text-xs text-slate-400 ml-1">/ {p.stock_minimo}</span>
                              </>
                            )
                          })()}
                        </td>
                      ) : (
                        <>
                          {sucursales.map(s => {
                            const cant = Number(stockSuc[s.id] || 0)
                            const esMia = sucursalPropia?.id === s.id
                            if (noSeVendeEn(p.producto_id, s.id)) {
                              return (
                                <td key={s.id} className={cn('px-3 py-2.5 text-right', esMia && 'bg-primary-50/40')}
                                  title="No se vende en esta sucursal">
                                  <span className="text-xs font-semibold text-slate-300">n/d</span>
                                </td>
                              )
                            }
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
                          <td className="px-3 py-2.5 text-right">
                            <button onClick={() => setProductoLotes(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors">
                              <Eye className="w-3.5 h-3.5" /> Lotes
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <ModalAgregarInventario abierto={modalAgregar} onCerrar={() => setModalAgregar(false)} onExito={invalidarStock} />
      <ModalLotes producto={productoLotes} onCerrar={() => setProductoLotes(null)} onCambio={invalidarStock} />
      {modalExistencias && <ModalExistenciasInv onCerrar={() => setModalExistencias(false)} />}
    </div>
  )
}

// ─── Modal consultar existencias en otras sucursales (para cajero) ────────────
function ModalExistenciasInv({ onCerrar }) {
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
      const { data: prods } = await supabase
        .from('productos').select('id, nombre, categoria')
        .eq('empresa_id', empresa.id).eq('activo', true)
        .ilike('nombre', `%${q}%`).order('nombre').limit(8)
      if (!prods?.length) { setResultados([]); setBuscando(false); return }

      const { data: lotes } = await supabase
        .from('lotes').select('id, producto_id')
        .in('producto_id', prods.map(p => p.id)).eq('activo', true)

      const loteIds   = (lotes ?? []).map(l => l.id)
      const loteAProd = {}
      ;(lotes ?? []).forEach(l => { loteAProd[l.id] = l.producto_id })

      const { data: inv } = loteIds.length
        ? await supabase
            .from('inventario').select('cantidad, sucursal_id, lote_id, sucursales(id, nombre)')
            .in('lote_id', loteIds)
        : { data: [] }

      const porProd = {}
      prods.forEach(p => { porProd[p.id] = { ...p, sucursales: {} } })
      ;(inv ?? []).forEach(i => {
        const prodId = loteAProd[i.lote_id]
        if (!prodId || !porProd[prodId]) return
        const sid = i.sucursal_id
        if (!porProd[prodId].sucursales[sid])
          porProd[prodId].sucursales[sid] = { nombre: i.sucursales?.nombre ?? '—', total: 0 }
        porProd[prodId].sucursales[sid].total += i.cantidad ?? 0
      })
      setResultados(Object.values(porProd))
    } catch { /* silencioso */ } finally { setBuscando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-xl bg-white rounded-none sm:rounded-3xl shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[92dvh] flex flex-col animate-modal-in">

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
              placeholder="Nombre del medicamento..."
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
          ) : !buscando && resultados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin resultados para "{busqueda}"</p>
          ) : (
            resultados.map(prod => {
              const sucursales = Object.values(prod.sucursales).sort((a, b) => b.total - a.total)
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
