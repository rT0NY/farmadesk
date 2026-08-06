import { useState, useEffect } from 'react'
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
import { BadgeEstado } from './BadgeEstado'

// Campos que la vista muestra siempre. Los costos van aparte porque en modo
// solo lectura —o sea, cuando el que abre es cajero— la pantalla ya los oculta
// (el precio por unidad y el total estimado están detrás de `!soloLectura`).
// Pedirlos igual significaba mandárselos al navegador de todos modos.
const COLS_ITEM = 'id, nombre_producto, cantidad_pedida, cantidad_recibida, fecha_caducidad'

function ModalDetallePedido({ pedido, empresa, onClose, onEliminado, onRecibir, onEditar, soloLectura = false }) {
  const { perfil } = useApp()
  const colsItems = soloLectura ? COLS_ITEM : `${COLS_ITEM}, precio_recibido, productos(precio_compra)`
  const [items,       setItems]       = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando,  setEliminando]  = useState(false)
  const [recepcion,   setRecepcion]   = useState(null) // metadatos de la bitácora de recepción

  useEffect(() => {
    const fetch = async () => {
      try {
        const [{ data: itemsData, error }, { data: bitData }] = await Promise.all([
          supabase.from('pedido_items').select(colsItems).eq('pedido_id', pedido.id).order('nombre_producto'),
          // Cargar la bitácora de recepción para ver dónde llegó y distribución
          supabase.from('bitacora')
            .select('metadatos, creado_en')
            .eq('referencia_id', String(pedido.id))
            .in('tipo', ['pedido_recibido', 'pedido_recibido_parcial'])
            .order('creado_en', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (error) throw error
        setItems(itemsData ?? [])
        if (bitData?.metadatos) setRecepcion(bitData.metadatos)
      } catch (e) {
        toast.error(e.message ?? 'Error al cargar')
      } finally {
        setCargando(false)
      }
    }
    fetch()
  }, [pedido.id, colsItems])

  const cancelarPedido = async () => {
    setEliminando(true)
    try {
      const { error } = await supabase.from('pedidos')
        .update({ estado: 'cancelado' }).eq('id', pedido.id)
      if (error) throw error
      await logBitacora({
        empresa_id:    empresa?.id,
        tipo:          'pedido_cancelado',
        descripcion:   `Pedido #${pedido.id.slice(-6).toUpperCase()} cancelado · ${pedido.proveedores?.nombre ?? '—'}`,
        usuario_id:    perfil?.id ?? null,
        referencia_id: String(pedido.id),
      })
      toast.success('Pedido cancelado')
      onEliminado()
    } catch (e) {
      toast.error(e.message ?? 'Error al cancelar')
    } finally {
      setEliminando(false)
    }
  }

  const reimprimir = () => generarPDF({
    pedido,
    items,
    empresa,
    proveedor: pedido.proveedores ?? { nombre: '—' },
    sucursal:  pedido.sucursales ?? null,
  })

  const fecha = new Date(pedido.created_at).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const esPendiente = !pedido.estado || pedido.estado === 'pendiente'
  const esParcial   = pedido.estado === 'parcial'

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader
        titulo={`Pedido #${pedido.id.slice(-6).toUpperCase()}`}
        subtitulo={`${pedido.proveedores?.nombre ?? '—'} · ${fecha}`}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">

        {/* Estado + fecha recepción */}
        <div className="flex items-center gap-3 flex-wrap">
          <BadgeEstado estado={pedido.estado ?? 'pendiente'} />
          {pedido.recibido_en && (
            <span className="text-xs text-slate-400">
              Recibido el {new Date(pedido.recibido_en).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {pedido.creado_por_perfil?.nombre && (
          <p className="text-xs text-slate-400 -mt-1">
            Pedido por <span className="font-semibold text-slate-600">{pedido.creado_por_perfil.nombre}</span>
          </p>
        )}

        {/* Sucursal de llegada / destino */}
        {recepcion ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Llegó a</p>
                <p className="text-sm font-bold text-emerald-800">
                  {recepcion.sucursal_llegada_nombre ?? pedido.sucursales?.nombre ?? '—'}
                </p>
              </div>
            </div>
            {recepcion.items?.some(r => r.destinos?.length > 1) && (
              <div className="border-t border-emerald-200 pt-1.5 flex flex-col gap-1">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Distribución</p>
                {[...new Map(
                  recepcion.items.flatMap(r => r.destinos ?? []).map(d => [d.sucursal_id, d])
                ).values()].map(d => {
                  const totalSuc = recepcion.items.reduce((sum, r) =>
                    sum + ((r.destinos?.find(x => x.sucursal_id === d.sucursal_id)?.cantidad) || 0), 0)
                  return (
                    <div key={d.sucursal_id} className="flex items-center gap-2">
                      <MapPin className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                      <span className="text-xs font-medium text-emerald-700">{d.sucursal_nombre}</span>
                      <span className="text-xs text-emerald-500 ml-auto">{totalSuc} uds</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Destino planeado</p>
              <p className="text-sm font-semibold text-slate-700">
                {pedido.sucursales?.nombre ?? 'General'}
              </p>
            </div>
          </div>
        )}

        {pedido.notas && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
            Nota: {pedido.notas}
          </div>
        )}

        {/* Botón principal de recepción */}
        {!soloLectura && (esPendiente || esParcial) && (
          <Button variante="exito" tamano="lg" className="w-full !h-14 text-base shrink-0"
            onClick={() => { onClose(); onRecibir(pedido) }}>
            <PackageCheck className="w-5 h-5" />
            {esParcial ? 'Completar recepción' : 'Recibir mercancía'}
          </Button>
        )}

        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
          Productos ({items.length})
        </p>

        {cargando ? (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {items.map((item, i) => {
              const recibido = item.cantidad_recibida != null
              const distItem = recepcion?.items?.find(r => r.producto === item.nombre_producto)
              const hayDist  = distItem?.destinos?.length > 1
              return (
                <div key={item.id}
                  className={cn(
                    'rounded-2xl px-4 py-3 border',
                    recibido ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                  )}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-300 w-5 text-center font-mono flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{item.nombre_producto}</p>
                      {recibido && item.fecha_caducidad && (
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Cad. {new Date(item.fecha_caducidad + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {!soloLectura && item.precio_recibido ? ` · ${formatoMoneda(item.precio_recibido)}/u` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {recibido ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <Check className="w-3 h-3" strokeWidth={3} />
                          {item.cantidad_recibida}
                          {item.cantidad_recibida < item.cantidad_pedida && (
                            <span className="text-[10px] text-amber-600">/{item.cantidad_pedida}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm font-bold text-primary-600">{item.cantidad_pedida} ud</span>
                      )}
                    </div>
                  </div>
                  {recibido && hayDist && (
                    <div className="mt-2 ml-8 flex flex-wrap gap-1.5">
                      {distItem.destinos.map(d => (
                        <span key={d.sucursal_id}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">
                          {d.sucursal_nombre}: {d.cantidad} uds
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="bg-primary-50 border border-primary-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-primary-800">Total pedido</p>
              <div className="text-right">
                <p className="text-sm font-bold text-primary-800">
                  {items.reduce((s, i) => s + i.cantidad_pedida, 0)} unidades
                </p>
                {!soloLectura && (() => {
                  const costo = items.reduce((s, i) =>
                    s + i.cantidad_pedida * Number(i.precio_recibido || i.productos?.precio_compra || 0), 0)
                  return costo > 0
                    ? <p className="text-xs text-primary-600">{formatoMoneda(costo)} estimado</p>
                    : null
                })()}
              </div>
            </div>
          </>
        )}
      </div>

      <ModalFooter>
        {confirmando ? (
          <div className="flex flex-col gap-3">
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Ban className="w-4 h-4 text-red-600" />
                <p className="text-sm font-semibold text-red-800">¿Cancelar este pedido?</p>
              </div>
              <p className="text-xs text-red-600">El pedido quedará marcado como cancelado y no se podrá recibir.</p>
            </div>
            <div className="flex gap-3">
              <Button variante="secundario" tamano="md" className="flex-1" onClick={() => setConfirmando(false)}>
                Atrás
              </Button>
              <Button variante="peligro" tamano="md" className="flex-1"
                cargando={eliminando} onClick={cancelarPedido}>
                Sí, cancelar pedido
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-3">
              <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cerrar</Button>
              <Button variante="primario" tamano="md" className="flex-1" onClick={reimprimir}>
                <Printer className="w-4 h-4 mr-1.5" />
                Reimprimir PDF
              </Button>
            </div>
            {!soloLectura && esPendiente && (
              <div className="flex gap-2">
                <Button variante="advertencia" tamano="md" className="flex-1"
                  onClick={() => { onClose(); onEditar?.(pedido) }}>
                  <Edit2 className="w-3.5 h-3.5" /> Editar pedido
                </Button>
                <Button variante="peligro" tamano="md" className="flex-1"
                  onClick={() => setConfirmando(true)}>
                  Cancelar pedido
                </Button>
              </div>
            )}
          </div>
        )}
      </ModalFooter>
    </Modal>
  )
}

export default ModalDetallePedido

