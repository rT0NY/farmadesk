import { useState, useEffect, useRef } from 'react'
import {
  Plus, X, Check, Package, Phone, Mail, User, Truck,
  ChevronRight, Building2, Printer, ClipboardList,
  PackageCheck, MapPin, AlertTriangle, Calendar,
  ScanBarcode, ChevronDown, ChevronUp, RotateCcw,
  Search, Link2, ArrowLeftRight, Ban, Filter,
  ExternalLink, Edit2, MoreVertical, FileText, Trash2,
} from 'lucide-react'
import { Modal, ModalHeader, ModalFooter } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { generarPDF } from './pedidoPDF'

function ModalNuevoPedido({ empresa, proveedor, sucursales, onClose, onGuardado, ocultarCostos = false, sucursalForzada = null }) {
  const { perfil } = useApp()
  const [paso,       setPaso]       = useState(sucursalForzada ? 2 : 1)
  const [sucursalId, setSucursalId] = useState(sucursalForzada ?? '')
  const [productos,  setProductos]  = useState([])
  const [busqProd,   setBusqProd]   = useState('')
  const [seleccion,  setSeleccion]  = useState({})
  const [cantidades, setCantidades] = useState({})
  const [notas,      setNotas]      = useState('')
  const [cargando,   setCargando]   = useState(true)
  const [guardando,  setGuardando]  = useState(false)
  const guardandoRef = useRef(false)
  const [sugeridos,  setSugeridos]  = useState({})

  useEffect(() => {
    const fetchProds = async () => {
      try {
        const { data, error } = await supabase
          .from('producto_proveedores')
          .select('precio_compra, productos!inner(id, nombre, precio_compra, stock_minimo, activo)')
          .eq('proveedor_id', proveedor.id)
          .eq('productos.activo', true)
        if (error) throw error
        // precio_proveedor = último precio recibido de ESTE proveedor (fallback: costo general)
        let prods = (data ?? [])
          .map(r => ({ ...r.productos, precio_proveedor: r.precio_compra }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
        if (sucursalId && sucursales.length > 1) {
          const { data: ps } = await supabase
            .from('productos_sucursales')
            .select('producto_id')
            .eq('sucursal_id', sucursalId)
            .eq('habilitado', false)
          const deshabIds = new Set((ps || []).map(r => r.producto_id))
          prods = prods.filter(p => !deshabIds.has(p.id))
        }
        setProductos(prods)
        // Calcular cantidades sugeridas (stock actual vs stock mínimo)
        const ids = prods.filter(p => (p.stock_minimo || 0) > 0).map(p => p.id)
        if (ids.length > 0) {
          const stockMap = {}
          const { data: lotesData } = await supabase.from('lotes')
            .select('id, producto_id')
            .in('producto_id', ids)
            .eq('empresa_id', empresa.id)
            .eq('activo', true)
          const loteIds = (lotesData || []).map(l => l.id)
          const loteToProduct = {}
          ;(lotesData || []).forEach(l => { loteToProduct[l.id] = l.producto_id })
          if (loteIds.length > 0) {
            let invQ = supabase.from('inventario').select('lote_id, cantidad').in('lote_id', loteIds)
            if (sucursalId) invQ = invQ.eq('sucursal_id', sucursalId)
            const { data: invData } = await invQ
            ;(invData || []).forEach(r => {
              const pid = loteToProduct[r.lote_id]
              if (pid) stockMap[pid] = (stockMap[pid] || 0) + Number(r.cantidad || 0)
            })
          }
          const sug = {}
          prods.forEach(p => {
            if ((p.stock_minimo || 0) > 0) {
              const faltante = p.stock_minimo - (stockMap[p.id] || 0)
              if (faltante > 0) sug[p.id] = faltante
            }
          })
          setSugeridos(sug)
        }
      } catch (e) {
        toast.error(e.message ?? 'Error al cargar productos')
      } finally {
        setCargando(false)
      }
    }
    fetchProds()
  }, [proveedor.id, sucursalId, sucursales.length, empresa.id])

  const setCant = (id, val) => setCantidades(p => ({ ...p, [id]: val }))

  const seleccionIds = Object.keys(seleccion).filter(id => seleccion[id])
  const numSeleccionados = seleccionIds.length
  const productosSeleccionados = productos.filter(p => seleccion[p.id])

  const itemsConCantidad = productos.filter(p => seleccion[p.id] && parseInt(cantidades[p.id] || 0) > 0)
  const totalUnidades = itemsConCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0), 0)
  const totalCosto    = itemsConCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0) * Number(p.precio_proveedor ?? p.precio_compra ?? 0), 0)

  const productosFiltrados = busqProd.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqProd.toLowerCase()))
    : productos

  const toggleSel = (id) => setSeleccion(prev => ({ ...prev, [id]: !prev[id] }))
  const irACantidades = () => {
    setCantidades(prev => {
      const next = { ...prev }
      seleccionIds.forEach(id => {
        if (!next[id] || parseInt(next[id]) <= 0) {
          next[id] = String((!ocultarCostos && sugeridos[id]) ? sugeridos[id] : 1)
        }
      })
      return next
    })
    setPaso(3)
  }

  const guardar = async (conPDF = false) => {
    if (itemsConCantidad.length === 0) return toast.error('Agrega al menos un producto con cantidad')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { data: pedido, error: e1 } = await supabase
        .from('pedidos')
        .insert({
          empresa_id:   empresa.id,
          sucursal_id:  sucursalId || null,
          proveedor_id: proveedor.id,
          notas:        notas.trim() || null,
          total_items:  totalUnidades,
          creado_por:   perfil?.id ?? null,
        })
        .select()
        .single()
      if (e1) throw e1

      const { error: e2 } = await supabase.from('pedido_items').insert(
        itemsConCantidad.map(p => ({
          pedido_id:       pedido.id,
          producto_id:     p.id,
          nombre_producto: p.nombre,
          cantidad_pedida: parseInt(cantidades[p.id]),
        }))
      )
      if (e2) throw e2

      await logBitacora({
        empresa_id:    empresa.id,
        tipo:          'pedido_creado',
        descripcion:   `Pedido #${pedido.id.slice(-6).toUpperCase()} · ${proveedor.nombre} · ${itemsConCantidad.length} productos · ${totalUnidades} uds`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   sucursalId || null,
        referencia_id: String(pedido.id),
      })

      toast.success('Pedido guardado')

      if (conPDF) {
        const sucursal = sucursales.find(s => s.id === sucursalId) ?? null
        generarPDF({
          pedido,
          items: itemsConCantidad.map(p => ({
            nombre_producto: p.nombre,
            cantidad_pedida: parseInt(cantidades[p.id]),
          })),
          empresa,
          proveedor,
          sucursal,
        })
      }

      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-lg">
      <ModalHeader titulo="Nuevo pedido" subtitulo={proveedor.nombre} onClose={onClose} />

      {/* Steps */}
      <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-shrink-0">
        {(sucursalForzada
          ? [{ n: 2, label: 'Productos' }, { n: 3, label: 'Cantidades' }]
          : [{ n: 1, label: 'Destino' }, { n: 2, label: 'Productos' }, { n: 3, label: 'Cantidades' }]
        ).map(({ n, label }) => (
          <div key={n} className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium',
            paso === n ? 'bg-primary-100 text-primary-700' :
            paso > n  ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
          )}>
            {paso > n ? <Check className="w-3 h-3" /> : n}
            {label}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
        {/* ── Paso 1: destino ── */}
        {paso === 1 && (
          <>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              ¿Para qué sucursal es el pedido?
            </p>

            {/* General */}
            <button onClick={() => setSucursalId('')}
              className={cn(
                'flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all',
                sucursalId === ''
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              )}>
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                sucursalId === '' ? 'bg-white/20' : 'bg-primary-100')}>
                <Building2 className={cn('w-4 h-4', sucursalId === '' ? 'text-white' : 'text-primary-600')} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">General</p>
                <p className={cn('text-xs', sucursalId === '' ? 'text-white/70' : 'text-slate-400')}>
                  Para toda la empresa
                </p>
              </div>
              {sucursalId === '' && <Check className="w-4 h-4" />}
            </button>

            {sucursales.map(suc => (
              <button key={suc.id} onClick={() => setSucursalId(suc.id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all',
                  suc.id === sucursalId
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                )}>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                  suc.id === sucursalId ? 'bg-white/20' : 'bg-slate-100')}>
                  <Building2 className={cn('w-4 h-4', suc.id === sucursalId ? 'text-white' : 'text-slate-500')} />
                </div>
                <p className="text-sm font-semibold flex-1">{suc.nombre}</p>
                {suc.id === sucursalId && <Check className="w-4 h-4" />}
              </button>
            ))}
          </>
        )}

        {/* ── Paso 2: seleccionar productos ── */}
        {paso === 2 && (
          <>
            {cargando ? (
              <div className="flex justify-center py-10">
                <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            ) : productos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Package className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">Sin productos asignados</p>
                <p className="text-xs text-slate-400">
                  Asigna este proveedor a productos desde la sección Productos
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Selecciona los productos de {proveedor.nombre}
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
                {productosFiltrados.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Sin resultados para "{busqProd}"</p>
                ) : productosFiltrados.map(prod => (
                  <label key={prod.id} className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-all',
                    seleccion[prod.id] ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-200 hover:border-slate-300'
                  )}>
                    <input type="checkbox" checked={!!seleccion[prod.id]} onChange={() => toggleSel(prod.id)}
                      className="w-4 h-4 accent-primary-600 flex-shrink-0" />
                    <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                      <Package className="w-4 h-4 text-slate-500" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800 truncate flex-1">{prod.nombre}</span>
                  </label>
                ))}
              </>
            )}
          </>
        )}

        {/* ── Paso 3: cantidades ── */}
        {paso === 3 && (
          <>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              ¿Cuánto pedir de cada producto?
            </p>
            {productosSeleccionados.map(prod => (
              <div key={prod.id} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border bg-primary-50 border-primary-200">
                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-primary-500" />
                </div>
                <p className="text-sm font-semibold text-slate-800 flex-1 truncate">{prod.nombre}</p>
                <input
                  type="number" min="0"
                  value={cantidades[prod.id] || ''}
                  onChange={e => setCant(prod.id, e.target.value)}
                  placeholder={!ocultarCostos && sugeridos[prod.id] ? String(sugeridos[prod.id]) : '0'}
                  className="w-20 h-10 px-3 rounded-xl border border-slate-200 text-right text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
                />
              </div>
            ))}

            {/* Notas */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600">Notas del pedido (opcional)</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Indicaciones especiales para el proveedor..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>

            {itemsConCantidad.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-800">
                    <strong>{itemsConCantidad.length} producto{itemsConCantidad.length !== 1 ? 's' : ''}</strong>
                    {' · '}{totalUnidades} uds
                  </p>
                </div>
                {!ocultarCostos && totalCosto > 0 && (
                  <p className="text-sm font-bold text-emerald-700">{formatoMoneda(totalCosto)}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <ModalFooter>
        {paso === 1 && (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button variante="primario" tamano="md" className="flex-1" onClick={() => setPaso(2)}>
              Siguiente
            </Button>
          </div>
        )}
        {paso === 2 && (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={() => sucursalForzada ? onClose() : setPaso(1)}>
              {sucursalForzada ? 'Cancelar' : 'Volver'}
            </Button>
            <Button variante="primario" tamano="md" className="flex-1" disabled={numSeleccionados === 0} onClick={irACantidades}>
              Continuar{numSeleccionados > 0 ? ` (${numSeleccionados})` : ''}
            </Button>
          </div>
        )}
        {paso === 3 && (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={() => setPaso(2)}>
              Volver
            </Button>
            <Button variante="primario" tamano="md" className="flex-1"
              cargando={guardando} disabled={itemsConCantidad.length === 0}
              onClick={() => guardar(true)}>
              <Printer className="w-4 h-4 mr-1.5" />
              Guardar y PDF
            </Button>
          </div>
        )}
      </ModalFooter>
    </Modal>
  )
}

export default ModalNuevoPedido

