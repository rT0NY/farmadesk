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

function ModalEditarPedido({ pedido, empresa, proveedor, onClose, onGuardado }) {
  const { perfil } = useApp()
  const [prods,      setProds]      = useState([])
  const [cantidades, setCantidades] = useState({})
  const [notas,      setNotas]      = useState(pedido.notas ?? '')
  const [cargando,   setCargando]   = useState(true)
  const [guardando,  setGuardando]  = useState(false)
  const guardandoRef = useRef(false)
  const [busqueda,   setBusqueda]   = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: itemsData }, { data: prodsData }] = await Promise.all([
          supabase.from('pedido_items').select('producto_id, cantidad_pedida').eq('pedido_id', pedido.id),
          supabase.from('producto_proveedores')
            .select('precio_compra, productos!inner(id, nombre, precio_compra, activo)')
            .eq('proveedor_id', proveedor.id)
            .eq('productos.activo', true),
        ])
        setProds((prodsData ?? [])
          .map(r => ({ ...r.productos, precio_proveedor: r.precio_compra }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)))
        const init = {}
        ;(itemsData ?? []).forEach(it => { init[it.producto_id] = String(it.cantidad_pedida) })
        setCantidades(init)
      } catch (e) {
        toast.error(e.message ?? 'Error al cargar')
      } finally {
        setCargando(false)
      }
    }
    load()
  }, [pedido.id, proveedor.id])

  const setCant = (id, val) => setCantidades(p => ({ ...p, [id]: val }))

  const prodsFiltrados = busqueda.trim()
    ? prods.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : prods

  const conCantidad   = prods.filter(p => parseInt(cantidades[p.id] || 0) > 0)
  const totalUnidades = conCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0), 0)
  const totalCostoEd  = conCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0) * Number(p.precio_proveedor ?? p.precio_compra ?? 0), 0)

  const guardar = async () => {
    if (conCantidad.length === 0) return toast.error('Agrega al menos un producto')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { error: delErr } = await supabase.from('pedido_items').delete().eq('pedido_id', pedido.id)
      if (delErr) throw delErr
      const { error: insErr } = await supabase.from('pedido_items').insert(
        conCantidad.map(p => ({
          pedido_id:       pedido.id,
          producto_id:     p.id,
          nombre_producto: p.nombre,
          cantidad_pedida: parseInt(cantidades[p.id]),
        }))
      )
      if (insErr) throw insErr
      const { error: updErr } = await supabase.from('pedidos')
        .update({ total_items: totalUnidades, notas: notas.trim() || null })
        .eq('id', pedido.id)
      if (updErr) throw updErr
      await logBitacora({
        empresa_id:    empresa.id,
        tipo:          'pedido_editado',
        descripcion:   `Pedido #${pedido.id.slice(-6).toUpperCase()} editado · ${proveedor.nombre} · ${conCantidad.length} productos · ${totalUnidades} uds`,
        usuario_id:    perfil?.id ?? null,
        referencia_id: String(pedido.id),
      })
      toast.success('Pedido actualizado')
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
      <ModalHeader
        titulo="Editar pedido"
        subtitulo={`${proveedor.nombre} · #${pedido.id.slice(-6).toUpperCase()}`}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
        {cargando ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar producto..."
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400" />
              {busqueda && (
                <button onClick={() => setBusqueda('')}>
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>

            {prodsFiltrados.map(prod => {
              const cant = parseInt(cantidades[prod.id] || 0)
              return (
                <div key={prod.id} className={cn(
                  'flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all',
                  cant > 0 ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-200'
                )}>
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{prod.nombre}</p>
                    {Number(prod.precio_proveedor ?? prod.precio_compra) > 0 && (
                      <p className="text-xs text-slate-400">{formatoMoneda(prod.precio_proveedor ?? prod.precio_compra)} / ud</p>
                    )}
                  </div>
                  <input
                    type="number" min="0"
                    value={cantidades[prod.id] || ''}
                    onChange={e => setCant(prod.id, e.target.value)}
                    placeholder="0"
                    className="w-20 h-10 px-3 rounded-xl border border-slate-200 text-right text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
                  />
                </div>
              )
            })}

            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-semibold text-slate-600">Notas del pedido</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Indicaciones especiales..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            </div>

            {totalUnidades > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-800">
                    <strong>{conCantidad.length} producto{conCantidad.length !== 1 ? 's' : ''}</strong>
                    {' · '}{totalUnidades} uds
                  </p>
                </div>
                {totalCostoEd > 0 && (
                  <p className="text-sm font-bold text-emerald-700">{formatoMoneda(totalCostoEd)}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1"
            cargando={guardando} disabled={totalUnidades === 0} onClick={guardar}>
            Guardar cambios
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

export default ModalEditarPedido

