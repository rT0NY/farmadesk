import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Edit2, Trash2, AlertTriangle, MoreVertical, X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda } from '@/lib/formatos'
import { Table } from '@/components/ui/Table'
import { cn } from '@/lib/clases'

function analizarMargen(precioCompra, precioVenta) {
  const pc = Number(precioCompra) || 0
  const pv = Number(precioVenta) || 0
  if (pc <= 0 || pv <= 0) return { valor: null, clase: 'text-slate-300' }
  const pct = ((pv - pc) / pc) * 100
  if (pct < 15)  return { valor: pct, clase: 'text-red-600 font-semibold'     }
  if (pct < 30)  return { valor: pct, clase: 'text-amber-600 font-semibold'   }
  if (pct < 60)  return { valor: pct, clase: 'text-emerald-600 font-semibold' }
  return           { valor: pct, clase: 'text-emerald-700 font-bold'          }
}

function ModalConfirmar({ titulo, mensaje, variante = 'warning', onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onCancelar} />
      <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full animate-modal-in">
        <div className={cn(
          'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4',
          variante === 'danger' ? 'bg-red-100' : 'bg-amber-100'
        )}>
          <AlertTriangle className={cn('w-6 h-6', variante === 'danger' ? 'text-red-600' : 'text-amber-600')} />
        </div>
        <h3 className="text-center font-semibold text-slate-900 mb-1">{titulo}</h3>
        <p className="text-center text-sm text-slate-500 mb-5">{mensaje}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirmar}
            className={cn(
              'flex-1 py-2.5 rounded-2xl text-sm font-medium text-white transition-colors',
              variante === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'
            )}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FilaProducto({ producto, onEditar, onCambio }) {
  const { perfil, empresa } = useApp()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [posMenu, setPosMenu] = useState({ top: 0, right: 0 })
  const [confirmar, setConfirmar] = useState(null)
  const btnRef = useRef(null)
  const margen = analizarMargen(producto.precio_compra, producto.precio_venta)

  // Calcular posición del menú para que no se corte
  const abrirMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuH = 90
      const abajo = rect.bottom + menuH < window.innerHeight
      setPosMenu({
        top:   abajo ? rect.bottom + 4 : rect.top - menuH - 4,
        right: window.innerWidth - rect.right,
      })
    }
    setMenuAbierto(v => !v)
  }

  useEffect(() => {
    if (!menuAbierto) return
    const cerrar = () => setMenuAbierto(false)
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [menuAbierto])

  const borrarProducto = () => {
    setMenuAbierto(false)
    setConfirmar({
      titulo:  'Eliminar producto',
      mensaje: `¿Está seguro de eliminar "${producto.nombre}"? Esta acción no se puede deshacer. Su historial de ventas se conserva.`,
      variante: 'danger',
      onConfirmar: async () => {
        setConfirmar(null)
        try {
          const { error } = await supabase.rpc('eliminar_producto', {
            p_producto_id: producto.id,
          })
          if (error) throw error
          await logBitacora({
            empresa_id:    empresa?.id,
            tipo:          'producto_eliminado',
            descripcion:   `Producto eliminado: "${producto.nombre}"`,
            usuario_id:    perfil?.id ?? null,
            referencia_id: producto.id,
          })
          toast.success('Producto borrado')
          onCambio?.()
        } catch (err) {
          toast.error(err.message || 'Error al borrar')
        }
      },
    })
  }

  const stockCritico = producto.stock_total === 0 && producto.activo
  const stockBajo    = producto.bajo_stock && producto.activo && !stockCritico

  return (
    <>
      <Table.Row className={cn(
        'border-l-4',
        !producto.activo ? 'opacity-50 border-l-slate-200'
        : stockCritico   ? 'border-l-red-400'
        : stockBajo      ? 'border-l-amber-400'
        : 'border-l-emerald-400'
      )}>

        {/* Producto */}
        <Table.Cell label="Producto">
          <div className="flex flex-col min-w-0">
            {/* El title deja ver el nombre completo al pasar el cursor, ya que
                con la tabla de ancho fijo los largos se recortan. */}
            <p className="font-semibold text-slate-900 truncate" title={producto.nombre}>
              {producto.nombre}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {producto.categoria && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-600">
                  {producto.categoria}
                </span>
              )}
              {producto.codigos?.length > 0 && (
                <span className="text-[10px] text-slate-400 tabular-nums">
                  {producto.codigos.length} código{producto.codigos.length > 1 ? 's' : ''}
                </span>
              )}
              {!producto.activo && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">
                  Archivado
                </span>
              )}
            </div>
          </div>
        </Table.Cell>

        {/* Costo */}
        <Table.Cell label="Costo" align="right" mono>
          {Number(producto.precio_compra) > 0
            ? <span className="text-slate-500">{formatoMoneda(producto.precio_compra)}</span>
            : <span className="text-slate-300">—</span>}
        </Table.Cell>

        {/* Precio venta */}
        <Table.Cell label="Precio" align="right" mono>
          <span className="font-semibold text-slate-900">{formatoMoneda(producto.precio_venta)}</span>
        </Table.Cell>

        {/* Margen */}
        <Table.Cell label="Margen" align="right" mono>
          {margen.valor !== null
            ? <span className={margen.clase}>{margen.valor.toFixed(1)}%</span>
            : <span className="text-slate-300">—</span>}
        </Table.Cell>

        {/* Stock */}
        <Table.Cell label="Stock" align="right" mono>
          <div className="inline-flex items-center gap-1.5">
            {(stockCritico || stockBajo) && (
              <AlertTriangle className={cn('w-3.5 h-3.5 flex-shrink-0', stockCritico ? 'text-red-400' : 'text-amber-400')} />
            )}
            <span className={cn(
              'font-semibold',
              stockCritico ? 'text-red-600' : stockBajo ? 'text-amber-700' : 'text-slate-900'
            )}>
              {producto.stock_total}
            </span>
            <span className="text-xs text-slate-300">/ {producto.stock_minimo}</span>
          </div>
        </Table.Cell>

        {/* Acciones */}
        <Table.Cell label="" align="right">
          <div className="inline-block" onClick={e => e.stopPropagation()}>
            <button
              ref={btnRef}
              onClick={abrirMenu}
              className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </Table.Cell>
      </Table.Row>

      {/* Menú flotante — portal a body para evitar anidamiento inválido dentro de <tbody> */}
      {menuAbierto && createPortal(
        <div
          style={{ position: 'fixed', top: posMenu.top, right: posMenu.right, zIndex: 9999 }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="w-44 bg-white rounded-2xl border border-slate-200 shadow-xl p-1.5">
            <button
              onClick={() => { setMenuAbierto(false); onEditar(producto) }}
              className="w-full text-left px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2 transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Editar
            </button>
            {/* Sin "Reactivar": los eliminados ya no llegan al navegador, así
                que esa rama era inalcanzable y solo confundía sobre si el
                borrado se puede deshacer. No se puede. */}
            <button
              onClick={borrarProducto}
              className="w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de confirmación — portal para evitar <div> dentro de <tbody> */}
      {confirmar && createPortal(
        <ModalConfirmar
          titulo={confirmar.titulo}
          mensaje={confirmar.mensaje}
          variante={confirmar.variante}
          onConfirmar={confirmar.onConfirmar}
          onCancelar={() => setConfirmar(null)}
        />,
        document.body
      )}
    </>
  )
}
