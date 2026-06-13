import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, X, Check, Package, Phone, Mail, User, Truck,
  ChevronRight, Building2, Printer, ClipboardList,
  PackageCheck, MapPin, AlertTriangle, Calendar,
  ScanBarcode, ChevronDown, ChevronUp, RotateCcw,
  Search, Link2, ArrowLeftRight, Ban, Filter,
  ExternalLink, Edit2, MoreVertical, FileText, Trash2,
} from 'lucide-react'
import { Table } from '@/components/ui/Table'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { Modal, ModalHeader, ModalFooter } from '@/components/ui/Modal'

// ─── Modal: proveedor ─────────────────────────────────────────────────────────

function ModalProveedor({ proveedor, empresa, onClose, onGuardado }) {
  const esEdit = !!proveedor
  const [form, setForm] = useState({
    nombre:   proveedor?.nombre   ?? '',
    telefono: proveedor?.telefono ?? '',
    email:    proveedor?.email    ?? '',
    contacto: proveedor?.contacto ?? '',
    notas:    proveedor?.notas    ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  // Paso 2 (solo creación): vincular productos al nuevo proveedor
  const [paso,      setPaso]      = useState(1)
  const [productos, setProductos] = useState([])
  const [seleccion, setSeleccion] = useState({}) // { producto_id: true }
  const [busqProd,  setBusqProd]  = useState('')

  useEffect(() => {
    if (esEdit || paso !== 2 || productos.length > 0) return
    supabase.from('productos')
      .select('id, nombre, categoria')
      .eq('empresa_id', empresa.id)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => setProductos(data ?? []))
  }, [paso, esEdit, empresa.id, productos.length])

  const productosFiltrados = busqProd.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqProd.toLowerCase()))
    : productos
  const numSeleccionados = Object.values(seleccion).filter(Boolean).length

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const guardar = async () => {
    if (!form.nombre.trim()) return toast.error('Nombre del proveedor requerido')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      if (esEdit) {
        const { error } = await supabase.from('proveedores').update({
          nombre:   form.nombre.trim(),
          telefono: form.telefono.trim() || null,
          email:    form.email.trim()    || null,
          contacto: form.contacto.trim() || null,
          notas:    form.notas.trim()    || null,
        }).eq('id', proveedor.id)
        if (error) throw error
      } else {
        const { data: nuevo, error } = await supabase.from('proveedores').insert({
          empresa_id: empresa.id,
          nombre:   form.nombre.trim(),
          telefono: form.telefono.trim() || null,
          email:    form.email.trim()    || null,
          contacto: form.contacto.trim() || null,
          notas:    form.notas.trim()    || null,
        }).select('id').single()
        if (error) throw error

        // Vincular productos seleccionados en el paso 2
        const ids = Object.keys(seleccion).filter(id => seleccion[id])
        if (nuevo?.id && ids.length > 0) {
          const { error: errVinc } = await supabase.from('producto_proveedores').insert(
            ids.map(pid => ({ empresa_id: empresa.id, producto_id: pid, proveedor_id: nuevo.id }))
          )
          if (errVinc) throw errVinc
        }
      }
      toast.success(esEdit ? 'Proveedor actualizado' : 'Proveedor creado')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader
        titulo={esEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
        subtitulo={esEdit ? proveedor.nombre : (paso === 1 ? 'Paso 1 de 2 · Datos del proveedor' : 'Paso 2 de 2 · Vincular productos (opcional)')}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
        {(esEdit || paso === 1) && (<>
        {/* Nombre */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Nombre *</label>
          <div className="relative">
            <Truck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={form.nombre} onChange={set('nombre')}
              placeholder="Ej. Distribuidora Farma S.A."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
        </div>

        {/* Contacto */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Persona de contacto</label>
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={form.contacto} onChange={set('contacto')}
              placeholder="Ej. Juan Pérez"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Teléfono</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="tel" value={form.telefono} onChange={set('telefono')}
                placeholder="55 1234 5678"
                className="w-full pl-10 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="email" value={form.email} onChange={set('email')}
                placeholder="ventas@proveedor.com"
                className="w-full pl-10 pr-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>
          </div>
        </div>

        {/* Notas */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Notas</label>
          <textarea value={form.notas} onChange={set('notas')} rows={3}
            placeholder="Condiciones de pago, horarios de entrega, etc."
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
        </div>
        </>)}

        {!esEdit && paso === 2 && (<>
          <p className="text-xs text-slate-500">
            Marca los productos que surte este proveedor. Puedes omitir este paso y vincularlos después.
          </p>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input value={busqProd} onChange={e => setBusqProd(e.target.value)}
              placeholder="Buscar producto..."
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400" />
            {busqProd && (
              <button onClick={() => setBusqProd('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {productos.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Sin productos registrados</p>
            ) : productosFiltrados.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Sin resultados para "{busqProd}"</p>
            ) : (
              productosFiltrados.map(p => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={!!seleccion[p.id]}
                    onChange={() => setSeleccion(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className="w-4 h-4 accent-emerald-600 flex-shrink-0" />
                  <span className="text-sm text-slate-700 truncate flex-1">{p.nombre}</span>
                  {p.categoria && <span className="text-xs text-slate-400 flex-shrink-0">{p.categoria}</span>}
                </label>
              ))
            )}
          </div>
        </>)}
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          {esEdit ? (
            <>
              <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
                Guardar
              </Button>
            </>
          ) : paso === 1 ? (
            <>
              <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
              <Button variante="primario" tamano="md" className="flex-1" onClick={() => {
                if (!form.nombre.trim()) return toast.error('Nombre del proveedor requerido')
                setPaso(2)
              }}>
                Siguiente
              </Button>
            </>
          ) : (
            <>
              <Button variante="secundario" tamano="md" className="flex-1" onClick={() => setPaso(1)}>Atrás</Button>
              <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
                {numSeleccionados > 0 ? `Crear y vincular (${numSeleccionados})` : 'Crear sin productos'}
              </Button>
            </>
          )}
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: productos del proveedor ──────────────────────────────────────────

function ModalProductosProveedor({ proveedor, empresa, onClose, onCambio }) {
  const [productos, setProductos] = useState([]) // vinculados: { pp_id, precio_proveedor, ...producto }
  const [cargando,  setCargando]  = useState(true)
  const [busqueda,  setBusqueda]  = useState('')
  // Vista "vincular más productos"
  const [vinculando, setVinculando] = useState(false)
  const [candidatos, setCandidatos] = useState([])
  const [seleccion,  setSeleccion]  = useState({})
  const [guardando,  setGuardando]  = useState(false)

  const cargar = async () => {
    setCargando(true)
    const { data } = await supabase.from('producto_proveedores')
      .select('id, precio_compra, productos(id, nombre, categoria, precio_venta, activo)')
      .eq('proveedor_id', proveedor.id)
    setProductos((data ?? [])
      .filter(r => r.productos)
      .map(r => ({ pp_id: r.id, precio_proveedor: r.precio_compra, ...r.productos }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setCargando(false)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar() }, [proveedor.id])

  const desvincular = async (v) => {
    const { error } = await supabase.from('producto_proveedores').delete().eq('id', v.pp_id)
    if (error) return toast.error(error.message ?? 'Error al desvincular')
    toast.success(`"${v.nombre}" desvinculado`)
    setProductos(prev => prev.filter(x => x.pp_id !== v.pp_id))
    onCambio?.()
  }

  const abrirVincular = async () => {
    const { data } = await supabase.from('productos')
      .select('id, nombre, categoria')
      .eq('empresa_id', empresa.id)
      .eq('activo', true)
      .order('nombre')
    const yaIds = new Set(productos.map(v => v.id))
    setCandidatos((data ?? []).filter(p => !yaIds.has(p.id)))
    setSeleccion({})
    setBusqueda('')
    setVinculando(true)
  }

  const vincularSeleccionados = async () => {
    const ids = Object.keys(seleccion).filter(id => seleccion[id])
    if (ids.length === 0) return toast.error('Selecciona al menos un producto')
    if (guardando) return
    setGuardando(true)
    try {
      const { error } = await supabase.from('producto_proveedores').insert(
        ids.map(pid => ({ empresa_id: empresa.id, producto_id: pid, proveedor_id: proveedor.id }))
      )
      if (error) throw error
      toast.success(`${ids.length} producto${ids.length !== 1 ? 's' : ''} vinculado${ids.length !== 1 ? 's' : ''}`)
      setVinculando(false)
      setBusqueda('')
      await cargar()
      onCambio?.()
    } catch (e) {
      toast.error(e.message ?? 'Error al vincular')
    } finally {
      setGuardando(false)
    }
  }

  const numSel = Object.values(seleccion).filter(Boolean).length
  const base = vinculando ? candidatos : productos
  const filtrados = busqueda.trim()
    ? base.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : base

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader
        titulo={proveedor.nombre}
        subtitulo={vinculando
          ? 'Selecciona los productos a vincular'
          : `${productos.length} producto${productos.length !== 1 ? 's' : ''} vinculado${productos.length !== 1 ? 's' : ''}`}
        onClose={onClose}
      />
      {!cargando && base.length > 0 && (
        <div className="px-6 pb-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 pb-4 flex flex-col gap-2">
        {cargando ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : base.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 text-center">
            <Package className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-500">{vinculando ? 'Todos los productos ya están vinculados' : 'Sin productos vinculados'}</p>
            {!vinculando && <p className="text-xs text-slate-400">Usa "Vincular productos" para agregarlos desde aquí</p>}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2 text-center">
            <p className="text-sm text-slate-400">Sin resultados para "{busqueda}"</p>
          </div>
        ) : vinculando ? (
          filtrados.map(p => (
            <label key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={!!seleccion[p.id]}
                onChange={() => setSeleccion(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                className="w-4 h-4 accent-emerald-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-800 truncate flex-1">{p.nombre}</span>
              {p.categoria && <span className="text-xs text-slate-400 flex-shrink-0">{p.categoria}</span>}
            </label>
          ))
        ) : (
          filtrados.map(p => (
            <div key={p.id} className={cn(
              'flex items-center gap-3 rounded-2xl px-4 py-3 border',
              p.activo ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
            )}>
              <div className="w-8 h-8 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-primary-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{p.nombre}</p>
                <p className="text-xs text-slate-400">
                  {Number(p.precio_proveedor) > 0 ? `Últ. compra: ${formatoMoneda(p.precio_proveedor)}` : 'Sin compras aún'}
                  {p.categoria ? ` · ${p.categoria}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <div>
                  {p.precio_venta > 0 && (
                    <p className="text-xs font-bold text-slate-700">${Number(p.precio_venta).toFixed(2)}</p>
                  )}
                  {!p.activo && <p className="text-[10px] text-slate-400">Archivado</p>}
                </div>
                <button
                  onClick={() => desvincular(p)}
                  className="p-1.5 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Desvincular producto"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <ModalFooter>
        {vinculando ? (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={() => { setVinculando(false); setBusqueda('') }}>
              Atrás
            </Button>
            <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={vincularSeleccionados}>
              {numSel > 0 ? `Vincular (${numSel})` : 'Vincular'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cerrar</Button>
            <Button variante="primario" tamano="md" className="flex-1" onClick={abrirVincular}>
              + Vincular productos
            </Button>
          </div>
        )}
      </ModalFooter>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const { empresa, perfil, esAdmin } = useApp()
  const [proveedores,     setProveedores]     = useState([])
  const [conteoProductos, setConteoProductos] = useState({})
  const [cargando,        setCargando]        = useState(true)
  const [modalProv,       setModalProv]       = useState(null)
  const [modalProdsProveedor, setModalProdsProveedor] = useState(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)
  const [eliminando,        setEliminando]        = useState(false)
  const [busquedaProv,    setBusquedaProv]    = useState('')

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      const [{ data: provs, error: e1 }, { data: prods }] = await Promise.all([
        supabase.from('proveedores')
          .select('*')
          .eq('empresa_id', empresa.id)
          .eq('activo', true)
          .order('nombre'),
        supabase.from('producto_proveedores')
          .select('proveedor_id, productos!inner(activo)')
          .eq('empresa_id', empresa.id)
          .eq('productos.activo', true),
      ])
      if (e1) throw e1
      setProveedores(provs ?? [])
      const conteo = {}
      ;(prods ?? []).forEach(p => {
        conteo[p.proveedor_id] = (conteo[p.proveedor_id] || 0) + 1
      })
      setConteoProductos(conteo)
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar')
    } finally {
      setCargando(false)
    }
  }, [empresa])

  async function eliminarProveedor(prov) {
    if (eliminando) return
    setEliminando(true)
    try {
      const { error } = await supabase.rpc('archivar_proveedor', { p_proveedor_id: prov.id })
      if (error) { toast.error(error.message || 'Error al eliminar proveedor'); return }
      await logBitacora({
        empresa_id:    empresa?.id,
        tipo:          'proveedor_eliminado',
        descripcion:   `Proveedor "${prov.nombre}" eliminado`,
        usuario_id:    perfil?.id ?? null,
        referencia_id: prov.id,
      })
      toast.success(`Proveedor "${prov.nombre}" eliminado`)
      setConfirmarEliminar(null)
      await cargar()
    } finally {
      setEliminando(false)
    }
  }

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  const proveedoresFiltrados = busquedaProv.trim()
    ? proveedores.filter(p =>
        p.nombre.toLowerCase().includes(busquedaProv.toLowerCase()) ||
        p.contacto?.toLowerCase().includes(busquedaProv.toLowerCase()) ||
        p.email?.toLowerCase().includes(busquedaProv.toLowerCase()))
    : proveedores

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Proveedores</h1>
          <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <Button variante="primario" tamano="sm" onClick={() => setModalProv({})}>
          <Plus className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">Nuevo proveedor</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={busquedaProv}
          onChange={e => setBusquedaProv(e.target.value)}
          placeholder="Buscar por nombre, contacto o correo..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
        />
      </div>

      {/* Loader */}
      {cargando && (
        <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      )}

      {!cargando && (
        proveedoresFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Truck className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">
              {busquedaProv ? 'Sin resultados' : 'Sin proveedores'}
            </p>
            {!busquedaProv && (
              <Button variante="primario" tamano="sm" onClick={() => setModalProv({})}>
                <Plus className="w-4 h-4 mr-1.5" />Crear proveedor
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <Table.Head>
              <Table.HeadCell>Proveedor</Table.HeadCell>
              <Table.HeadCell>Contacto</Table.HeadCell>
              <Table.HeadCell>Teléfono</Table.HeadCell>
              <Table.HeadCell>Correo</Table.HeadCell>
              <Table.HeadCell align="right">Productos</Table.HeadCell>
              <Table.HeadCell align="right">Acciones</Table.HeadCell>
            </Table.Head>
            <Table.Body>
              {proveedoresFiltrados.map(prov => {
                const nProd = conteoProductos[prov.id] || 0
                return (
                  <Table.Row key={prov.id}>
                    <Table.Cell label="Proveedor">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                          <Truck className="w-4 h-4 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{prov.nombre}</p>
                          {prov.notas && <p className="text-xs text-slate-400 truncate">{prov.notas}</p>}
                        </div>
                      </div>
                    </Table.Cell>

                    <Table.Cell label="Contacto">
                      {prov.contacto
                        ? <span className="flex items-center gap-1.5 text-sm text-slate-700"><User className="w-3.5 h-3.5 text-slate-400" />{prov.contacto}</span>
                        : <span className="text-slate-300">—</span>}
                    </Table.Cell>

                    <Table.Cell label="Teléfono">
                      {prov.telefono
                        ? <a href={`tel:${prov.telefono}`} className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline"><Phone className="w-3.5 h-3.5" />{prov.telefono}</a>
                        : <span className="text-slate-300">—</span>}
                    </Table.Cell>

                    <Table.Cell label="Correo">
                      {prov.email
                        ? <a href={`mailto:${prov.email}`} className="flex items-center gap-1.5 text-sm text-primary-600 hover:underline truncate max-w-[180px]"><Mail className="w-3.5 h-3.5 flex-shrink-0" />{prov.email}</a>
                        : <span className="text-slate-300">—</span>}
                    </Table.Cell>

                    <Table.Cell label="Productos" align="right">
                      <button
                        onClick={() => setModalProdsProveedor(prov)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold transition-colors',
                          nProd > 0
                            ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                            : 'text-slate-400 hover:bg-slate-100'
                        )}
                      >
                        <Package className="w-3.5 h-3.5" />
                        {nProd} producto{nProd !== 1 ? 's' : ''}
                      </button>
                    </Table.Cell>

                    <Table.Cell label="" align="right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModalProv(prov)}
                          className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {esAdmin && (
                          <button
                            onClick={() => setConfirmarEliminar(prov)}
                            className="p-1.5 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Eliminar proveedor"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )
              })}
            </Table.Body>
          </Table>
        )
      )}

      {/* Modales */}
      {modalProv !== null && (
        <ModalProveedor
          proveedor={modalProv?.id ? modalProv : null}
          empresa={empresa}
          onClose={() => setModalProv(null)}
          onGuardado={() => { setModalProv(null); cargar() }}
        />
      )}
      {modalProdsProveedor && (
        <ModalProductosProveedor
          proveedor={modalProdsProveedor}
          empresa={empresa}
          onClose={() => setModalProdsProveedor(null)}
          onCambio={cargar}
        />
      )}

      {/* Modal confirmación eliminar proveedor */}
      {confirmarEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => setConfirmarEliminar(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Eliminar proveedor</h3>
                <p className="text-sm text-slate-500">{confirmarEliminar.nombre}</p>
              </div>
            </div>
            <p className="text-sm text-slate-600">
              Los pedidos y compras anteriores se conservarán en el historial.
              Los productos vinculados quedarán sin proveedor asignado.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmarEliminar(null)}
                className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => eliminarProveedor(confirmarEliminar)}
                disabled={eliminando}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {eliminando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

