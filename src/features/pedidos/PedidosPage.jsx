import { useState, useEffect, useCallback } from 'react'
import {
  Plus, X, Search, Filter, ChevronRight, Truck,
  ClipboardList, PackageCheck, Ban, Package,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Modal, ModalHeader } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { BadgeEstado } from './BadgeEstado'
import ModalNuevoPedido from './ModalNuevoPedido'
import ModalDetallePedido from './ModalDetallePedido'
import ModalEditarPedido from './ModalEditarPedido'
import ModalRecibirPedido from './ModalRecibirPedido'

// ─── Selector de proveedor (paso previo a crear pedido) ───────────────────────

function SelectorProveedor({ proveedores, onSelect, onClose }) {
  const [busqueda, setBusqueda] = useState('')
  const filtrados = busqueda.trim()
    ? proveedores.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : proveedores

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader titulo="Nuevo pedido" subtitulo="Elige el proveedor" onClose={onClose} />
      <div className="px-6 pb-3">
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar proveedor..." autoFocus
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400" />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-5 flex flex-col gap-2">
        {proveedores.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 text-center">
            <Truck className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-500">Sin proveedores registrados</p>
          </div>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Sin resultados para "{busqueda}"</p>
        ) : filtrados.map(prov => (
          <button key={prov.id} onClick={() => onSelect(prov)}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/50 active:scale-[0.99] transition-all text-left">
            <div className="w-9 h-9 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
              <Truck className="w-4 h-4 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{prov.nombre}</p>
              {prov.contacto && <p className="text-xs text-slate-400 truncate">{prov.contacto}</p>}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          </button>
        ))}
      </div>
    </Modal>
  )
}

// ─── Página de pedidos ────────────────────────────────────────────────────────

export default function PedidosPage() {
  const { empresa, sucursales, tz, esCajero, sucursalActiva } = useApp()
  const puedeGestionar = !esCajero // admin / encargado

  const [proveedores,  setProveedores]  = useState([])
  const [pedidos,      setPedidos]      = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [selector,     setSelector]     = useState(false)   // selector de proveedor
  const [modalNuevo,   setModalNuevo]   = useState(null)    // proveedor elegido
  const [modalDetalle, setModalDetalle] = useState(null)
  const [modalEditar,  setModalEditar]  = useState(null)
  const [modalRecibir, setModalRecibir] = useState(null)

  // Filtros
  const [busquedaPed,     setBusquedaPed]     = useState('')
  const [filtroEstadoPed, setFiltroEstadoPed] = useState('')
  const [filtroProv,      setFiltroProv]      = useState('')
  const [fechaDesde,      setFechaDesde]      = useState('')
  const [fechaHasta,      setFechaHasta]      = useState('')

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      let pedidosQ = supabase
        .from('pedidos')
        .select('*, proveedores(id,nombre,telefono,email,contacto), sucursales(nombre), creado_por_perfil:perfiles!pedidos_creado_por_fkey(nombre)')
        .eq('empresa_id', empresa.id)
        .order('created_at', { ascending: false })

      // El cajero solo ve los pedidos de la sucursal donde está trabajando
      if (esCajero && sucursalActiva?.id) pedidosQ = pedidosQ.eq('sucursal_id', sucursalActiva.id)
      // ...y solo los pendientes/parciales: una vez recibido o cancelado por el dueño,
      // desaparece de su vista (no tiene acceso al historial — info sensible)
      if (esCajero) pedidosQ = pedidosQ.in('estado', ['pendiente', 'parcial'])

      if (filtroEstadoPed) pedidosQ = pedidosQ.eq('estado', filtroEstadoPed)
      if (filtroProv)      pedidosQ = pedidosQ.eq('proveedor_id', filtroProv)
      if (fechaDesde)      pedidosQ = pedidosQ.gte('created_at', fechaDesde + 'T00:00:00')
      if (fechaHasta)      pedidosQ = pedidosQ.lte('created_at', fechaHasta + 'T23:59:59')

      const [{ data: provs, error: e1 }, { data: peds, error: e2 }] = await Promise.all([
        supabase.from('proveedores')
          .select('id, nombre, telefono, email, contacto')
          .eq('empresa_id', empresa.id)
          .eq('activo', true)
          .order('nombre'),
        pedidosQ,
      ])
      if (e1) throw e1
      if (e2) throw e2
      setProveedores(provs ?? [])
      setPedidos(peds ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar')
    } finally {
      setCargando(false)
    }
  }, [empresa, esCajero, sucursalActiva, filtroEstadoPed, filtroProv, fechaDesde, fechaHasta])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  const pedidosFiltrados = pedidos.filter(p => {
    if (busquedaPed.trim()) {
      const q = busquedaPed.toLowerCase()
      return p.proveedores?.nombre?.toLowerCase().includes(q) ||
             p.id.slice(-6).toUpperCase().includes(busquedaPed.toUpperCase())
    }
    return true
  })

  const hayFiltros = busquedaPed || filtroEstadoPed || filtroProv || fechaDesde || fechaHasta

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Pedidos</h1>
          <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">
            {pedidos.length} {esCajero ? 'pendiente' : 'pedido'}{pedidos.length !== 1 ? 's' : ''}
            {esCajero && sucursalActiva ? ` · ${sucursalActiva.nombre}` : ''}
          </p>
        </div>
        <Button variante="primario" tamano="sm" onClick={() => setSelector(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">Nuevo pedido</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {/* Barra de búsqueda + filtros */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busquedaPed}
            onChange={e => setBusquedaPed(e.target.value)}
            placeholder="Buscar por proveedor o número de pedido..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
          />
        </div>

        {!esCajero && (
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {[
            { v: '',          label: 'Todos' },
            { v: 'pendiente', label: 'Pendiente' },
            { v: 'parcial',   label: 'Parcial' },
            { v: 'recibido',  label: 'Recibido' },
            { v: 'cancelado', label: 'Cancelado' },
          ].map(f => (
            <button key={f.v} onClick={() => setFiltroEstadoPed(f.v)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                filtroEstadoPed === f.v
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              )}>
              {f.label}
            </button>
          ))}
          {proveedores.length > 1 && (
            <div className="relative flex-shrink-0">
              <select
                value={filtroProv}
                onChange={e => setFiltroProv(e.target.value)}
                className={cn(
                  'pl-3 pr-8 py-1.5 rounded-xl text-xs font-semibold border appearance-none transition-all cursor-pointer',
                  filtroProv
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-slate-600 border-slate-200'
                )}
              >
                <option value="">Todos los proveedores</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              <Filter className={cn('absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none',
                filtroProv ? 'text-white' : 'text-slate-400')} />
            </div>
          )}
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            title="Desde"
            className="flex-shrink-0 h-8 px-2 rounded-xl text-xs font-semibold border bg-white text-slate-600 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/30 cursor-pointer" />
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            title="Hasta"
            className="flex-shrink-0 h-8 px-2 rounded-xl text-xs font-semibold border bg-white text-slate-600 border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/30 cursor-pointer" />
          {hayFiltros && (
            <button
              onClick={() => { setBusquedaPed(''); setFiltroEstadoPed(''); setFiltroProv(''); setFechaDesde(''); setFechaHasta('') }}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
        )}
      </div>

      {/* Loader */}
      {cargando && (
        <div className="flex flex-col gap-3"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      )}

      {/* Lista */}
      {!cargando && (
        pedidosFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <ClipboardList className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-400">
              {hayFiltros ? 'Sin pedidos con esos filtros'
                : esCajero ? 'No hay pedidos pendientes en tu sucursal'
                : 'Sin pedidos registrados'}
            </p>
            {!hayFiltros && (
              <Button variante="primario" tamano="sm" onClick={() => setSelector(true)}>
                <Plus className="w-4 h-4 mr-1.5" />Crear pedido
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pedidosFiltrados.map(ped => {
              const estado = ped.estado ?? 'pendiente'
              const fecha  = new Date(ped.created_at).toLocaleDateString('es-MX', {
                day: 'numeric', month: 'short', year: 'numeric',
              })
              const bordeL = estado === 'recibido'  ? 'border-l-emerald-400'
                : estado === 'parcial'              ? 'border-l-sky-400'
                : estado === 'cancelado'            ? 'border-l-slate-300'
                :                                     'border-l-amber-400'
              return (
                <button key={ped.id}
                  onClick={() => setModalDetalle(ped)}
                  className={cn(
                    'bg-white border border-slate-100 border-l-4 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left hover:shadow-card-hover hover:border-slate-200 active:scale-[0.99] transition-all shadow-card',
                    estado === 'cancelado' && 'opacity-50',
                    bordeL
                  )}>
                  <div className={cn(
                    'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0',
                    estado === 'recibido'   ? 'bg-emerald-100'
                    : estado === 'parcial'  ? 'bg-sky-100'
                    : estado === 'cancelado'? 'bg-slate-100'
                    : 'bg-amber-100'
                  )}>
                    {estado === 'recibido'
                      ? <PackageCheck className="w-5 h-5 text-emerald-600" />
                      : estado === 'cancelado'
                      ? <Ban className="w-5 h-5 text-slate-400" />
                      : <ClipboardList className={cn('w-5 h-5', estado === 'parcial' ? 'text-sky-600' : 'text-amber-600')} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="text-sm font-bold text-slate-800 truncate">{ped.proveedores?.nombre ?? '—'}</p>
                      <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-lg flex-shrink-0">
                        #{ped.id.slice(-6).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <BadgeEstado estado={estado} />
                      <span className="text-[10px] text-slate-400">
                        {ped.sucursales?.nombre ?? 'General'} · {fecha}
                        {ped.creado_por_perfil?.nombre ? ` · por ${ped.creado_por_perfil.nombre}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-800">{ped.total_items}</p>
                    <p className="text-[10px] text-slate-400">uds</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )
      )}

      {/* ── Modales ── */}
      {selector && (
        <SelectorProveedor
          proveedores={proveedores}
          onClose={() => setSelector(false)}
          onSelect={(prov) => { setSelector(false); setModalNuevo(prov) }}
        />
      )}
      {modalNuevo && (
        <ModalNuevoPedido
          empresa={empresa}
          proveedor={modalNuevo}
          sucursales={sucursales}
          ocultarCostos={esCajero}
          sucursalForzada={esCajero ? (sucursalActiva?.id ?? null) : null}
          onClose={() => setModalNuevo(null)}
          onGuardado={() => { setModalNuevo(null); cargar() }}
        />
      )}
      {modalDetalle && (
        <ModalDetallePedido
          pedido={modalDetalle}
          empresa={empresa}
          soloLectura={esCajero}
          onClose={() => setModalDetalle(null)}
          onEliminado={() => { setModalDetalle(null); cargar() }}
          onRecibir={(ped) => { setModalDetalle(null); setModalRecibir(ped) }}
          onEditar={(ped) => { setModalDetalle(null); setModalEditar(ped) }}
        />
      )}
      {puedeGestionar && modalEditar && (
        <ModalEditarPedido
          pedido={modalEditar}
          empresa={empresa}
          proveedor={modalEditar.proveedores ?? { id: modalEditar.proveedor_id, nombre: '—' }}
          sucursales={sucursales}
          onClose={() => setModalEditar(null)}
          onGuardado={() => { setModalEditar(null); cargar() }}
        />
      )}
      {puedeGestionar && modalRecibir && (
        <ModalRecibirPedido
          pedido={modalRecibir}
          sucursales={sucursales}
          tz={tz}
          onClose={() => setModalRecibir(null)}
          onExito={() => { setModalRecibir(null); cargar() }}
        />
      )}
    </div>
  )
}
