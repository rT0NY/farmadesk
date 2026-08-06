import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Search, Package, Filter, RefreshCw, Archive,
  AlertTriangle, ChevronDown, X, Check, CircleCheck,
  ShoppingBag, Wallet, Layers,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatoMoneda } from '@/lib/formatos'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Table } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { Fab } from '@/components/ui/Fab'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'
import { invalidarStock } from '@/lib/cache'
import ModalProducto from './ModalProducto'
import ModalIngresoMasivo from './ModalIngresoMasivo'
import FilaProducto from './FilaProducto'
import { CATEGORIAS_PRODUCTO } from '@/lib/constantes'

// Dropdown reutilizable para filtros
function DropdownFiltro({ label, icono: Icono, activo, contador, children }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  return (
    <div className="relative" ref={ref}>
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
        {contador !== undefined && contador > 0 && (
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded-full font-semibold',
            activo ? 'bg-primary-200 text-primary-800' : 'bg-slate-100 text-slate-600'
          )}>
            {contador}
          </span>
        )}
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

export default function ProductosPage() {
  const { empresa, perfil } = useApp()
  const esCajero = perfil?.rol === 'cajero'
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activos')
  const [categoriaSel, setCategoriaSel] = useState('')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [modalMasivo,  setModalMasivo]  = useState(false)
  const [productoEditar, setProductoEditar] = useState(null)

  const { data: productos = [], isLoading: cargando, refetch: cargar } = useQuery({
    queryKey:  ['productos', empresa?.id],
    queryFn:   async () => {
      const { data, error } = await supabase.rpc('listar_productos_completo', { p_solo_activos: false })
      if (error) throw error
      return data || []
    },
    staleTime: 10 * 60_000,  // catálogo cambia solo cuando admin edita
    enabled:   !!empresa?.id,
  })

  // Crear/editar/archivar un producto también cambia lo que ve Inventario
  const invalidar = invalidarStock

  const categorias = useMemo(() => {
    const conteos = new Map()
    productos.forEach(p => {
      if (p.categoria && p.activo) {
        conteos.set(p.categoria, (conteos.get(p.categoria) || 0) + 1)
      }
    })
    // Solo devolver categorías que tienen al menos un producto
    return CATEGORIAS_PRODUCTO
      .map(nombre => ({ nombre, total: conteos.get(nombre) || 0 }))
      .filter(c => c.total > 0)
  }, [productos])

  const productosFiltrados = useMemo(() => {
    let r = productos
    if (filtroEstado === 'activos') r = r.filter(p => p.activo)
    else if (filtroEstado === 'archivados') r = r.filter(p => !p.activo)
    else if (filtroEstado === 'bajo_stock') r = r.filter(p => p.activo && p.bajo_stock)

    if (categoriaSel) r = r.filter(p => p.categoria === categoriaSel)

    if (busqueda.trim()) {
      const q = busqueda.toLowerCase().trim()
      // Si parece un código de barras (solo dígitos, 6+ caracteres), busca exacto primero
      const esCodigoBarras = /^\d{6,}$/.test(q)
      r = r.filter(p => {
        if (esCodigoBarras) {
          // Búsqueda exacta de código de barras
          return p.codigos?.some(c => c === q) ||
                 p.nombre?.toLowerCase().includes(q)
        }
        return (
          p.nombre?.toLowerCase().includes(q) ||
          p.categoria?.toLowerCase().includes(q) ||
          p.codigos?.some(c => c.toLowerCase().includes(q))
        )
      })
    }
    return r
  }, [productos, filtroEstado, categoriaSel, busqueda])

  const conteos = useMemo(() => {
    const activos    = productos.filter(p => p.activo)
    const valorTotal = activos.reduce((s, p) => s + (Number(p.stock_total) * Number(p.precio_compra || 0)), 0)
    return {
      activos:        activos.length,
      bajo_stock:     activos.filter(p => p.bajo_stock).length,
      agotados:       activos.filter(p => p.stock_total === 0).length,
      archivados:     productos.filter(p => !p.activo).length,
      valorInventario: valorTotal,
    }
  }, [productos])

  const FILTROS_ESTADO = [
    { v: 'activos', etiqueta: 'Activos', icono: CircleCheck, cantidad: conteos.activos, clase: 'text-emerald-600' },
    { v: 'bajo_stock', etiqueta: 'Stock bajo', icono: AlertTriangle, cantidad: conteos.bajo_stock, clase: 'text-amber-600' },
    { v: 'archivados', etiqueta: 'Archivados', icono: Archive, cantidad: conteos.archivados, clase: 'text-slate-600' },
    { v: 'todos', etiqueta: 'Todos', icono: Package, cantidad: productos.length, clase: 'text-slate-600' },
  ]

  const estadoActivoInfo = FILTROS_ESTADO.find(f => f.v === filtroEstado)

  const abrirEditar = (p) => {
    setProductoEditar(p)
    setModalAbierto(true)
  }

  const abrirNuevo = () => {
    setProductoEditar(null)
    setModalAbierto(true)
  }

  const limpiarFiltros = () => {
    setBusqueda('')
    setCategoriaSel('')
    setFiltroEstado('activos')
  }

  const hayFiltrosActivos = busqueda || categoriaSel || filtroEstado !== 'activos'

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Productos</h1>
          <p className="text-sm text-slate-500 mt-1">Catálogo de productos de la empresa</p>
        </div>
        <div className="flex gap-2">
          {!esCajero && (
            <>
              <Button
                variante="secundario"
                onClick={() => setModalMasivo(true)}
                iconoIzq={<Layers className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">Ingreso masivo</span>
                <span className="sm:hidden">Masivo</span>
              </Button>
              <Button onClick={abrirNuevo} iconoIzq={<Plus className="w-4 h-4" />}>
                <span className="hidden sm:inline">Nuevo producto</span>
                <span className="sm:hidden">Nuevo</span>
              </Button>
            </>
          )}
        </div>
      </div>


      {/* Tarjetas de resumen */}
      {!cargando && productos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

          {/* Activos */}
          <button
            onClick={() => setFiltroEstado('activos')}
            className={cn(
              'bg-white border rounded-3xl p-4 text-left transition-all duration-200',
              filtroEstado === 'activos'
                ? 'border-primary-200 ring-2 ring-primary-500/20 shadow-card-hover'
                : 'border-slate-100 shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-md shadow-blue-500/30 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              {filtroEstado === 'activos' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  Activo
                </span>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{conteos.activos}</p>
            <p className="text-xs text-slate-400 mt-0.5">en catálogo</p>
          </button>

          {/* Agotados */}
          <button
            onClick={() => setFiltroEstado('activos')}
            className="bg-white border border-slate-100 rounded-3xl p-4 text-left transition-all duration-200 shadow-card hover:shadow-card-hover hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                'w-9 h-9 rounded-2xl flex items-center justify-center',
                conteos.agotados > 0
                  ? 'bg-gradient-to-br from-red-500 to-rose-600 shadow-md shadow-red-500/30'
                  : 'bg-slate-100'
              )}>
                <Package className={cn('w-5 h-5', conteos.agotados > 0 ? 'text-white' : 'text-slate-400')} strokeWidth={2} />
              </div>
              {conteos.agotados === 0 && (
                <Check className="w-4 h-4 text-emerald-500" />
              )}
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', conteos.agotados > 0 ? 'text-red-600' : 'text-slate-900')}>
              {conteos.agotados}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {conteos.agotados > 0 ? 'agotados' : 'sin agotados ✓'}
            </p>
          </button>

          {/* Stock bajo */}
          <button
            onClick={() => setFiltroEstado('bajo_stock')}
            className={cn(
              'bg-white border rounded-3xl p-4 text-left transition-all duration-200',
              filtroEstado === 'bajo_stock'
                ? 'border-amber-200 ring-2 ring-amber-500/20 shadow-card-hover'
                : 'border-slate-100 shadow-card hover:shadow-card-hover hover:-translate-y-0.5'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn(
                'w-9 h-9 rounded-2xl flex items-center justify-center',
                conteos.bajo_stock > 0
                  ? 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-md shadow-amber-500/30'
                  : 'bg-slate-100'
              )}>
                <AlertTriangle className={cn('w-5 h-5', conteos.bajo_stock > 0 ? 'text-white' : 'text-slate-400')} strokeWidth={2} />
              </div>
              {filtroEstado === 'bajo_stock' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  Activo
                </span>
              )}
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', conteos.bajo_stock > 0 ? 'text-amber-600' : 'text-slate-900')}>
              {conteos.bajo_stock}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">stock bajo</p>
          </button>

          {/* Valor inventario */}
          <div className="bg-white border border-slate-100 rounded-3xl p-4 shadow-card">
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md shadow-emerald-500/30 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
            </div>
            <p className="text-xl font-bold text-emerald-700 tabular-nums leading-tight">
              {formatoMoneda(conteos.valorInventario)}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">en inventario (costo)</p>
          </div>

        </div>
      )}

      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Búsqueda */}
        <div className="flex-1">
          <Input
            placeholder="Buscar por nombre o código de barras..."
            iconoIzq={<Search className="w-5 h-5" />}
            iconoDer={busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap">
          {/* Dropdown Estado */}
          <DropdownFiltro
            label={estadoActivoInfo?.etiqueta || 'Estado'}
            icono={estadoActivoInfo?.icono}
            activo={filtroEstado !== 'activos'}
          >
            {(cerrar) => (
              <>
                {FILTROS_ESTADO.map(f => {
                  const Icono = f.icono
                  return (
                    <button
                      key={f.v}
                      onClick={() => { setFiltroEstado(f.v); cerrar() }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors',
                        f.v === filtroEstado
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      <Icono className={cn('w-4 h-4', f.clase)} />
                      <span className="flex-1">{f.etiqueta}</span>
                      <span className="text-xs text-slate-400 tabular-nums">{f.cantidad}</span>
                      {f.v === filtroEstado && <Check className="w-4 h-4 text-primary-600" />}
                    </button>
                  )
                })}
              </>
            )}
          </DropdownFiltro>

          {/* Dropdown Categoría */}
          <DropdownFiltro
            label={categoriaSel || 'Categoría'}
            icono={Filter}
            activo={!!categoriaSel}
          >
            {(cerrar) => (
              <>
                <button
                  onClick={() => { setCategoriaSel(''); cerrar() }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors',
                    !categoriaSel
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="flex-1">Todas</span>
                  <span className="text-xs text-slate-400 tabular-nums">{conteos.activos}</span>
                  {!categoriaSel && <Check className="w-4 h-4 text-primary-600" />}
                </button>
                {categorias.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-400 text-center">
                    Sin categorías aún
                  </p>
                ) : (
                  <div className="border-t border-slate-100 mt-1 pt-1">
                    {categorias.map(c => (
                      <button
                        key={c.nombre}
                        onClick={() => { setCategoriaSel(c.nombre); cerrar() }}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors',
                          categoriaSel === c.nombre
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        <span className="flex-1 truncate">{c.nombre}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{c.total}</span>
                        {categoriaSel === c.nombre && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </DropdownFiltro>

          {/* Limpiar filtros */}
          {hayFiltrosActivos && (
            <button
              onClick={limpiarFiltros}
              className="inline-flex items-center gap-1.5 h-11 px-3 rounded-2xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
              Limpiar
            </button>
          )}

          {/* Refrescar */}
          <button
            onClick={cargar}
            disabled={cargando}
            className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition-colors disabled:opacity-50"
            title="Refrescar"
          >
            <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Contenido */}
      {cargando && productos.length === 0 ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : productosFiltrados.length === 0 ? (
        <EmptyState
          icono={Package}
          titulo={productos.length === 0 ? 'Aún no tienes productos' : 'Sin resultados'}
          descripcion={
            productos.length === 0
              ? 'Empieza creando tu primer producto. Puedes capturar el stock inicial al mismo tiempo.'
              : 'Ajusta los filtros o la búsqueda para ver resultados.'
          }
          accion={
            productos.length === 0 ? (
              <Button onClick={abrirNuevo} iconoIzq={<Plus className="w-4 h-4" />}>
                Crear primer producto
              </Button>
            ) : hayFiltrosActivos ? (
              <Button variante="secundario" onClick={limpiarFiltros} iconoIzq={<X className="w-4 h-4" />}>
                Limpiar filtros
              </Button>
            ) : null
          }
        />
      ) : (
        <Table>
          <Table.Head>
            <Table.HeadCell className="w-[40%]">Producto</Table.HeadCell>
            <Table.HeadCell align="right" className="w-[14%]">Costo</Table.HeadCell>
            <Table.HeadCell align="right" className="w-[14%]">Precio</Table.HeadCell>
            <Table.HeadCell align="right" className="w-[14%]">Margen</Table.HeadCell>
            <Table.HeadCell align="right" className="w-[14%]">Stock</Table.HeadCell>
            <Table.HeadCell align="right" className="w-[4%]"></Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {productosFiltrados.map(p => (
              <FilaProducto
                key={p.id}
                producto={p}
                onEditar={abrirEditar}
                onCambio={invalidar}
              />
            ))}
          </Table.Body>
        </Table>
      )}

      <ModalProducto
        abierto={modalAbierto}
        onCerrar={() => { setModalAbierto(false); setProductoEditar(null) }}
        onExito={invalidar}
        productoEditar={productoEditar}
      />

      {modalMasivo && (
        <ModalIngresoMasivo
          onCerrar={() => setModalMasivo(false)}
          onExito={invalidar}
        />
      )}

      <Fab onClick={abrirNuevo} label="Nuevo producto" />

    </div>
  )
}