import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, X, Check, Package, Phone, Mail, User, Truck,
  ChevronRight, Building2, Printer, ClipboardList,
  PackageCheck, MapPin, AlertTriangle, Calendar,
  ScanBarcode, ChevronDown, ChevronUp, RotateCcw,
  Search, Link2, ArrowLeftRight, Ban, Filter,
  ExternalLink, Edit2, MoreVertical, FileText,
} from 'lucide-react'
import { Table } from '@/components/ui/Table'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoMoneda, fechaEnZona, addDias } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

// ─── Modal base ───────────────────────────────────────────────────────────────

function Modal({ children, onClose, maxWidth = 'sm:max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        'relative w-full bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]',
        maxWidth
      )}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ titulo, subtitulo, onClose }) {
  return (
    <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors -mt-1 -mr-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ModalFooter({ children }) {
  return (
    <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
      {children}
    </div>
  )
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

function generarPDF({ pedido, items, empresa, proveedor, sucursal }) {
  const fechaObj  = new Date(pedido.created_at ?? Date.now())
  const fecha     = fechaObj.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const fechaISO  = fechaObj.toISOString().slice(0, 10)           // YYYY-MM-DD para el nombre
  const numPedido = pedido.id.slice(-6).toUpperCase()
  const total     = items.reduce((s, i) => s + i.cantidad_pedida, 0)
  const VERDE     = '#16a34a'
  const VERDE_OSCURO = '#14532d'

  // Nombre del archivo: "Pedido_NombreProveedor_2026-04-28"
  const nombreArchivo = `Pedido_${proveedor.nombre.replace(/[^a-zA-Z0-9À-ÿ]/g, '_')}_${fechaISO}`

  const dirSucursal = (() => {
    if (!sucursal) return null
    const linea1 = [sucursal.calle, sucursal.colonia].filter(Boolean).join(', ')
    const linea2 = [sucursal.ciudad, sucursal.estado].filter(Boolean).join(', ')
    const cp = sucursal.codigo_postal ? `C.P. ${sucursal.codigo_postal}` : ''
    return [linea1, [linea2, cp].filter(Boolean).join(' ')].filter(Boolean)
  })()

  // Rellenar hasta mínimo 12 filas para que la tabla se vea completa
  const minFilas = Math.max(items.length, 12)
  const filas = Array.from({ length: minFilas }, (_, i) => {
    const item = items[i]
    return item
      ? `<tr>
          <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:11px;color:#374151">${item.nombre_producto}</td>
          <td style="border:1px solid #d1d5db;padding:6px 8px;text-align:center;font-size:11px;font-weight:700;color:#111827">${item.cantidad_pedida}</td>
         </tr>`
      : `<tr>
          <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:11px">&nbsp;</td>
          <td style="border:1px solid #d1d5db;padding:6px 8px">&nbsp;</td>
         </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${nombreArchivo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;padding:36px 44px;font-size:12px;line-height:1.4}
  @media print{body{padding:16px 22px}@page{margin:.5cm;size:A4}}
</style>
</head>
<body>

<!-- ENCABEZADO -->
<table style="width:100%;border-collapse:collapse;margin-bottom:18px">
  <tr>
    <td style="vertical-align:top;width:55%">
      <div style="font-size:18px;font-weight:900;color:#111827;margin-bottom:4px">${empresa?.nombre ?? '—'}</div>
      ${dirSucursal ? dirSucursal.map(l => `<div style="font-size:11px;color:#6b7280">${l}</div>`).join('') : ''}
      ${sucursal?.telefono ? `<div style="font-size:11px;color:#6b7280">Tel: ${sucursal.telefono}</div>` : ''}
    </td>
    <td style="vertical-align:top;text-align:right">
      <div style="font-size:22px;font-weight:900;color:${VERDE};letter-spacing:-.3px">Nota de Pedido Interno</div>
      <table style="margin-top:8px;margin-left:auto;border-collapse:collapse">
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:2px 8px 2px 0">Fecha</td>
          <td style="font-size:11px;font-weight:700;color:#111827;padding:2px 0">${fecha}</td>
        </tr>
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:2px 8px 2px 0">No.</td>
          <td style="font-size:11px;font-weight:700;color:#111827;padding:2px 0">${numPedido}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- BARRA PROVEEDOR / SOLICITANTE -->
<table style="width:100%;border-collapse:collapse;margin-bottom:0">
  <tr>
    <td style="background:${VERDE};color:#fff;font-size:13px;font-weight:700;padding:8px 14px;width:50%">Proveedor:</td>
    <td style="background:${VERDE};color:#fff;font-size:13px;font-weight:700;padding:8px 14px">Solicitante:</td>
  </tr>
  <tr>
    <td style="border:1px solid #d1d5db;border-top:none;padding:10px 14px;vertical-align:top">
      <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:4px">${proveedor.nombre}</div>
      ${proveedor.contacto ? `<div style="font-size:11px;color:#6b7280">Contacto: ${proveedor.contacto}</div>` : ''}
      ${proveedor.telefono ? `<div style="font-size:11px;color:#6b7280">Tel: ${proveedor.telefono}</div>` : ''}
      ${proveedor.email    ? `<div style="font-size:11px;color:#6b7280">${proveedor.email}</div>` : ''}
    </td>
    <td style="border:1px solid #d1d5db;border-top:none;border-left:none;padding:10px 14px;vertical-align:top">
      <table style="border-collapse:collapse">
        <tr><td style="font-size:11px;color:#6b7280;padding-bottom:3px;width:70px">Empresa</td><td style="font-size:11px;color:#111827;font-weight:600">${empresa?.nombre ?? '—'}</td></tr>
        <tr><td style="font-size:11px;color:#6b7280;padding-bottom:3px">Destino</td><td style="font-size:11px;color:#111827;font-weight:600">${sucursal ? sucursal.nombre : 'General'}</td></tr>
        <tr><td style="font-size:11px;color:#6b7280;padding-bottom:3px">Fecha</td><td style="font-size:11px;color:#111827">${fecha}</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- TABLA PRODUCTOS -->
<table style="width:100%;border-collapse:collapse;margin-top:18px">
  <thead>
    <tr style="background:${VERDE}">
      <th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;border:1px solid ${VERDE_OSCURO};text-align:left">Descripción</th>
      <th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;border:1px solid ${VERDE_OSCURO};text-align:center;width:110px">Cantidad</th>
    </tr>
  </thead>
  <tbody>
    ${filas}
  </tbody>
</table>

<!-- PARTE INFERIOR -->
<table style="width:100%;border-collapse:collapse;margin-top:16px">
  <tr>
    <!-- Instrucciones / notas -->
    <td style="vertical-align:top;width:55%;padding-right:20px">
      <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Instrucciones / Notas</div>
      <div style="border:1px solid #d1d5db;padding:10px 12px;min-height:56px;font-size:11px;color:#374151;border-radius:2px">
        ${pedido.notas ?? ''}
      </div>
    </td>
    <!-- Totales -->
    <td style="vertical-align:top">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:5px 10px 5px 0;border-bottom:1px solid #e5e7eb">Total unidades</td>
          <td style="font-size:13px;font-weight:900;color:${VERDE};text-align:right;padding:5px 0;border-bottom:1px solid #e5e7eb">${total}</td>
        </tr>
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:5px 10px 5px 0;border-bottom:1px solid #e5e7eb">Productos distintos</td>
          <td style="font-size:12px;font-weight:700;color:#111827;text-align:right;padding:5px 0;border-bottom:1px solid #e5e7eb">${items.length}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- FIRMA -->
<div style="margin-top:32px;padding-top:36px">
  <div style="border-top:1px solid #9ca3af;width:220px;padding-top:5px">
    <span style="font-size:10px;color:#6b7280">Autorizado por:</span>
  </div>
</div>

<div style="margin-top:20px;font-size:9px;color:#d1d5db;text-align:right">
  Farmadesk · ${new Date().toLocaleDateString('es-MX')} · #${numPedido}
</div>

</body></html>`

  // Usar iframe oculto para no abrir ventana nueva.
  // El <title> del documento se convierte en el nombre de archivo sugerido
  // cuando el usuario elige "Guardar como PDF" en el diálogo de impresión.
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()

  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    // Limpiar el iframe tras el diálogo (2 s dan tiempo suficiente)
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }, 400)
}

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
        const { error } = await supabase.from('proveedores').insert({
          empresa_id: empresa.id,
          nombre:   form.nombre.trim(),
          telefono: form.telefono.trim() || null,
          email:    form.email.trim()    || null,
          contacto: form.contacto.trim() || null,
          notas:    form.notas.trim()    || null,
        })
        if (error) throw error
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
        subtitulo={esEdit ? proveedor.nombre : 'Agrega los datos del proveedor'}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
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
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
            {esEdit ? 'Guardar' : 'Crear proveedor'}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: nuevo pedido ──────────────────────────────────────────────────────

function ModalNuevoPedido({ empresa, proveedor, sucursales, onClose, onGuardado }) {
  const { perfil } = useApp()
  const [paso,       setPaso]       = useState(1)
  const [sucursalId, setSucursalId] = useState('')
  const [productos,  setProductos]  = useState([])
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
          .from('productos')
          .select('id, nombre, precio_compra, stock_minimo')
          .eq('proveedor_id', proveedor.id)
          .eq('activo', true)
          .order('nombre')
        if (error) throw error
        let prods = data ?? []
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

  const itemsConCantidad = productos.filter(p => parseInt(cantidades[p.id] || 0) > 0)
  const totalUnidades = itemsConCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0), 0)
  const totalCosto    = itemsConCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0) * Number(p.precio_compra || 0), 0)

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
        {[{ n: 1, label: 'Destino' }, { n: 2, label: 'Productos' }].map(({ n, label }) => (
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

        {/* ── Paso 2: productos ── */}
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
                  Productos de {proveedor.nombre}
                </p>
                {productos.map(prod => {
                  const cant = parseInt(cantidades[prod.id] || 0)
                  return (
                    <div key={prod.id} className={cn(
                      'flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all',
                      cant > 0 ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-200'
                    )}>
                      <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Package className="w-4 h-4 text-slate-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800 flex-1 truncate">{prod.nombre}</p>
                      <input
                        type="number" min="0"
                        value={cantidades[prod.id] || ''}
                        onChange={e => setCant(prod.id, e.target.value)}
                        placeholder={sugeridos[prod.id] ? String(sugeridos[prod.id]) : '0'}
                        className="w-20 h-10 px-3 rounded-xl border border-slate-200 text-right text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
                      />
                    </div>
                  )
                })}

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
                    {totalCosto > 0 && (
                      <p className="text-sm font-bold text-emerald-700">{formatoMoneda(totalCosto)}</p>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ModalFooter>
        {paso === 1 ? (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button variante="primario" tamano="md" className="flex-1" onClick={() => setPaso(2)}>
              Siguiente
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={() => setPaso(1)}>
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

// ─── Modal: editar pedido pendiente ──────────────────────────────────────────

function ModalEditarPedido({ pedido, empresa, proveedor, sucursales, onClose, onGuardado }) {
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
          supabase.from('productos').select('id, nombre, precio_compra').eq('proveedor_id', proveedor.id).eq('activo', true).order('nombre'),
        ])
        setProds(prodsData ?? [])
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
  const totalCostoEd  = conCantidad.reduce((s, p) => s + parseInt(cantidades[p.id] || 0) * Number(p.precio_compra || 0), 0)

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
                    {prod.precio_compra > 0 && (
                      <p className="text-xs text-slate-400">{formatoMoneda(prod.precio_compra)} / ud</p>
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

// ─── Badge estado pedido ──────────────────────────────────────────────────────

const ESTADO_BADGE = {
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  recibido:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  parcial:   'bg-sky-100 text-sky-700 border-sky-200',
  cancelado: 'bg-slate-100 text-slate-500 border-slate-200',
}
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  recibido:  'Recibido',
  parcial:   'Parcial',
  cancelado: 'Cancelado',
}
function BadgeEstado({ estado }) {
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide',
      ESTADO_BADGE[estado] ?? ESTADO_BADGE.pendiente
    )}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  )
}

// ─── Modal: recibir mercancía ─────────────────────────────────────────────────

// Estado por producto: 'pendiente' | 'confirmado' | 'omitido'
function ModalRecibirPedido({ pedido, sucursales, tz, onClose, onExito }) {
  const { perfil, empresa } = useApp()

  const [paso,       setPaso]      = useState(1)
  const [items,      setItems]     = useState([])
  const [cargando,   setCargando]  = useState(true)
  const [guardando,  setGuardando] = useState(false)
  const guardandoRef = useRef(false)
  // Map: producto_id → Set de sucursal_ids deshabilitadas
  const [deshabPorProducto, setDeshabPorProducto] = useState({})
  // Map: producto_id → lista de lotes activos existentes
  const [lotesMap, setLotesMap] = useState({})
  const [sucursalId, setSucursalId]= useState(
    sucursales.length === 1 ? sucursales[0].id : (pedido.sucursal_id ?? '')
  )
  // { [id]: { estado, cantidad_recibida, precio_recibido, fecha_caducidad, expandido } }
  const [lineas, setLineas] = useState({})
  // Escáner de código de barras
  const normalizarCodigo = (s) => (s || '').replace(/[\x00-\x1F\x7F]/g, '').trim().toUpperCase()
  const [modalVincular,setModalVincular]= useState(null)  // { codigo }
  const [searchVinc,   setSearchVinc]  = useState('')
  const [guardandoVinc,setGuardandoVinc]= useState(false)
  const guardandoVincRef = useRef(false)
  const [busquedaItem, setBusquedaItem]= useState('')

  const hoy      = fechaEnZona(tz)
  const unAnio   = addDias(hoy, 365)
  const sucursal = sucursales.find(s => s.id === sucursalId)

  useEffect(() => {
    supabase.from('pedido_items')
      .select('*, productos(nombre, precio_compra, codigos_barras(codigo))')
      .eq('pedido_id', pedido.id).order('nombre_producto')
      .then(async ({ data, error }) => {
        if (error) { toast.error(error.message); return }
        const its = data ?? []
        setItems(its)

        const productIds = [...new Set(its.map(i => i.producto_id).filter(Boolean))]
        if (productIds.length > 0) {
          // Cargar sucursales deshabilitadas y lotes existentes en paralelo
          const [{ data: ps }, { data: lotesData }] = await Promise.all([
            supabase.from('productos_sucursales')
              .select('producto_id, sucursal_id, habilitado')
              .in('producto_id', productIds)
              .eq('habilitado', false),
            supabase.from('lotes')
              .select('id, codigo_lote, fecha_caducidad, producto_id')
              .in('producto_id', productIds)
              .eq('empresa_id', empresa?.id ?? pedido.empresa_id)
              .eq('activo', true)
              .order('fecha_caducidad'),
          ])

          const dmap = {}
          ;(ps || []).forEach(r => {
            if (!dmap[r.producto_id]) dmap[r.producto_id] = new Set()
            dmap[r.producto_id].add(r.sucursal_id)
          })
          setDeshabPorProducto(dmap)

          const lmap = {}
          ;(lotesData || []).forEach(l => {
            if (!lmap[l.producto_id]) lmap[l.producto_id] = []
            lmap[l.producto_id].push(l)
          })
          setLotesMap(lmap)
        }

        const init = {}
        its.forEach(it => {
          const yaRecibido = it.cantidad_recibida != null
          init[it.id] = {
            estado:            yaRecibido ? 'recibido_previo' : 'pendiente',
            bloqueado:         yaRecibido,
            cantidad_recibida: yaRecibido ? String(it.cantidad_recibida) : String(it.cantidad_pedida),
            precio_recibido:   String(it.precio_recibido ?? it.productos?.precio_compra ?? ''),
            fecha_caducidad:   yaRecibido ? (it.fecha_caducidad ?? unAnio) : unAnio,
            expandido:         !yaRecibido,
            recibido_en:       it.updated_at ?? null,
          }
        })
        setLineas(init)
        setCargando(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido.id])

  const setLinea = (id, campo, valor) =>
    setLineas(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }))

  // Devuelve el lote existente si la fecha coincide exactamente, o null
  const detectarLoteExistente = (productoId, fecha) => {
    if (!fecha || !productoId) return null
    return (lotesMap[productoId] ?? []).find(l => l.fecha_caducidad === fecha) ?? null
  }

  const confirmarItem = (id) => {
    const it   = items.find(i => i.id === id)
    const l    = lineas[id] ?? {}
    const cant = parseInt(l.cantidad_recibida) || 0
    if (cant <= 0) { toast.error(`Ingresa la cantidad de "${it.nombre_producto}"`); return }
    if (!l.fecha_caducidad) {
      toast.error(`Ingresa la fecha de caducidad de "${it.nombre_producto}"`); return
    }
    if (l.distribucion) {
      const suma = Object.values(l.distribucion).reduce((acc, v) => acc + (parseInt(v) || 0), 0)
      if (suma !== cant) { toast.error(`La distribución suma ${suma}, pero la cantidad es ${cant}`); return }
    }
    setLinea(id, 'estado', 'confirmado')
    setLinea(id, 'expandido', false)
  }

  const toggleDistribucion = (id) => {
    const l = lineas[id] ?? {}
    if (l.distribucion) {
      setLinea(id, 'distribucion', undefined)
    } else {
      const cant = parseInt(l.cantidad_recibida) || 0
      const it = items.find(i => i.id === id)
      const deshab = deshabPorProducto[it?.producto_id] ?? new Set()
      const sucHab = sucursales.filter(s => !deshab.has(s.id))
      const dist = {}
      sucHab.forEach(s => { dist[s.id] = s.id === sucursalId ? String(cant) : '0' })
      setLinea(id, 'distribucion', dist)
    }
  }

  const setDistSuc = (id, sucId, valor) => {
    setLineas(prev => ({
      ...prev,
      [id]: { ...prev[id], distribucion: { ...prev[id].distribucion, [sucId]: valor } },
    }))
  }

  const omitirItem   = (id) => setLineas(p => ({ ...p, [id]: { ...p[id], estado: 'omitido',   expandido: false } }))
  const deshacerItem = (id) => setLineas(p => ({ ...p, [id]: { ...p[id], estado: 'pendiente', expandido: true  } }))
  const toggleExpandido = (id) => setLinea(id, 'expandido', !lineas[id]?.expandido)

  // Confirmar todos los pendientes de golpe (excluye los ya recibidos en entregas previas)
  // Escaneo por producto: vincula un código directamente al producto de la fila
  const procesarScanProducto = async (it, raw) => {
    const codigo = normalizarCodigo(raw)
    if (!codigo) return
    setLinea(it.id, 'scanProd', '')
    try {
      const { data: existente } = await supabase
        .from('codigos_barras')
        .select('producto_id, productos(nombre)')
        .ilike('codigo', codigo)
        .maybeSingle()

      if (existente) {
        if (existente.producto_id === it.producto_id) {
          setLinea(it.id, 'scanEstado', 'ya_existe')
          toast.success(`El código ya estaba vinculado a "${it.nombre_producto}"`)
        } else {
          setLinea(it.id, 'scanEstado', 'error')
          toast.error(`Ese código pertenece a "${existente.productos?.nombre ?? 'otro producto'}"`)
        }
        return
      }

      // No existe → vincular automáticamente
      await supabase.from('codigos_barras').insert({
        empresa_id:  empresa?.id ?? pedido.empresa_id,
        producto_id: it.producto_id,
        codigo,
      })
      setItems(prev => prev.map(i => i.id !== it.id ? i : {
        ...i,
        productos: {
          ...i.productos,
          codigos_barras: [...(i.productos?.codigos_barras ?? []), { codigo }],
        },
      }))
      setLinea(it.id, 'scanEstado', 'vinculado')
      toast.success(`Código "${codigo}" vinculado a "${it.nombre_producto}"`)
    } catch (err) {
      toast.error(err.message ?? 'Error al vincular')
    }
  }

  const handleScanProducto = (e, it) => {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    if (e.key === 'Tab') e.preventDefault()
    const val = (lineas[it.id]?.scanProd || '').trim()
    if (val) procesarScanProducto(it, val)
  }

  // Debounce para escáneres sin Enter o con Tab: dispara cuando scanProd lleva 300ms sin cambiar
  useEffect(() => {
    const timers = []
    items.forEach(it => {
      const val = (lineas[it.id]?.scanProd || '').trim()
      if (!val || val.length < 3) return
      const t = setTimeout(() => procesarScanProducto(it, val), 300)
      timers.push(t)
    })
    return () => timers.forEach(clearTimeout)
  }, [lineas])

  const confirmarTodo = () => {
    setLineas(prev => {
      const next = { ...prev }
      items.forEach(it => {
        if (next[it.id]?.estado === 'pendiente' && !next[it.id]?.bloqueado) {
          next[it.id] = { ...next[it.id], estado: 'confirmado', expandido: false }
        }
      })
      return next
    })
  }

  // Escáner: buscar el producto por código de barras
  // Vincular código de barras desconocido a un producto del pedido
  const guardarVincular = async (it) => {
    if (!modalVincular?.codigo) return
    const codigoNorm = normalizarCodigo(modalVincular.codigo)
    if (guardandoVincRef.current) return
    guardandoVincRef.current = true
    setGuardandoVinc(true)
    try {
      // Evitar duplicar si el código ya está vinculado a este producto
      const { data: existe } = await supabase.from('codigos_barras')
        .select('id').ilike('codigo', codigoNorm).eq('producto_id', it.producto_id).maybeSingle()
      if (existe) {
        toast.success(`El código ya estaba vinculado a "${it.nombre_producto}"`)
        setLineas(prev => ({ ...prev, [it.id]: { ...prev[it.id], estado: 'pendiente', expandido: true } }))
        setModalVincular(null); setSearchVinc('')
        return
      }
      await supabase.from('codigos_barras').insert({
        empresa_id: empresa?.id ?? pedido.empresa_id,
        producto_id: it.producto_id,
        codigo: codigoNorm,
      })
      // Actualizar los codigos del item en memoria
      setItems(prev => prev.map(i => i.id !== it.id ? i : {
        ...i,
        productos: {
          ...i.productos,
          codigos_barras: [...(i.productos?.codigos_barras ?? []), { codigo: codigoNorm }],
        },
      }))
      toast.success(`Código vinculado a "${it.nombre_producto}"`)
      setLineas(prev => ({ ...prev, [it.id]: { ...prev[it.id], estado: 'pendiente', expandido: true } }))
      setModalVincular(null)
      setSearchVinc('')
      setTimeout(() => document.getElementById(`cant-${it.id}`)?.focus(), 100)
    } catch (err) {
      toast.error(err.message ?? 'Error al vincular')
    } finally {
      guardandoVincRef.current = false
      setGuardandoVinc(false)
    }
  }

  // Ítems de ESTA entrega (excluye los bloqueados de entregas previas)
  const itemsEsta    = items.filter(it => !lineas[it.id]?.bloqueado)
  const previosCount = items.length - itemsEsta.length
  const confirmados  = itemsEsta.filter(it => lineas[it.id]?.estado === 'confirmado').length
  const omitidos     = itemsEsta.filter(it => lineas[it.id]?.estado === 'omitido').length
  const pendientes   = itemsEsta.length - confirmados - omitidos
  // Progreso sobre el total del pedido (incluyendo previos ya confirmados)
  const totalConfirmados = confirmados + previosCount
  const pct = items.length > 0 ? Math.round((totalConfirmados / items.length) * 100) : 0

  const puedeRegistrar = sucursalId && confirmados > 0

  const registrar = async () => {
    if (!sucursalId) return toast.error('Selecciona la sucursal de destino')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      // Validar que todos los confirmados tienen fecha de caducidad
      for (const it of items) {
        const l = lineas[it.id] ?? {}
        if (l.bloqueado || l.estado !== 'confirmado') continue
        if (!l.fecha_caducidad) throw new Error(`Falta caducidad de "${it.nombre_producto}"`)
      }

      // Construir payload para el RPC atómico
      const itemsPayload = items
        .filter(it => {
          const l = lineas[it.id] ?? {}
          return !l.bloqueado && l.estado === 'confirmado' && (parseInt(l.cantidad_recibida) || 0) > 0
        })
        .map(it => {
          const l = lineas[it.id]
          const cant = parseInt(l.cantidad_recibida) || 0
          const loteExistente = detectarLoteExistente(it.producto_id, l.fecha_caducidad)
          const entradas = l.distribucion
            ? Object.entries(l.distribucion).filter(([, v]) => (parseInt(v) || 0) > 0).map(([sId, v]) => ({ sucursal_id: sId, cantidad: parseInt(v) }))
            : [{ sucursal_id: sucursalId, cantidad: cant }]
          return {
            pedido_item_id:    it.id,
            producto_id:       it.producto_id,
            lote_id_existente: loteExistente?.id ?? null,
            fecha_caducidad:   l.fecha_caducidad,
            cantidad_total:    cant,
            precio_unitario:   parseFloat(l.precio_recibido) || 0,
            entradas,
          }
        })

      const todoRecibido = omitidos === 0 && confirmados === itemsEsta.length
      const nuevoEstado  = todoRecibido ? 'recibido' : 'parcial'

      const { error } = await supabase.rpc('recibir_pedido', {
        p_pedido_id:    pedido.id,
        p_empresa_id:   empresa?.id ?? pedido.empresa_id,
        p_usuario_id:   perfil?.id ?? null,
        p_sucursal_id:  sucursalId,
        p_nuevo_estado: nuevoEstado,
        p_items:        itemsPayload,
      })
      if (error) throw error

      // Construir resumen de distribución para guardar en bitácora
      const resumenDistribucion = items
        .filter(it => !lineas[it.id]?.bloqueado && lineas[it.id]?.estado === 'confirmado')
        .map(it => {
          const l = lineas[it.id]
          const destinos = l.distribucion
            ? Object.entries(l.distribucion)
                .filter(([, v]) => (parseInt(v) || 0) > 0)
                .map(([sId, v]) => ({
                  sucursal_id:     sId,
                  sucursal_nombre: sucursales.find(s => s.id === sId)?.nombre ?? sId,
                  cantidad:        parseInt(v),
                }))
            : [{ sucursal_id: sucursalId, sucursal_nombre: sucursal?.nombre, cantidad: parseInt(l.cantidad_recibida) || 0 }]
          return {
            producto:       it.nombre_producto,
            cantidad_total: parseInt(l.cantidad_recibida) || 0,
            precio:         parseFloat(l.precio_recibido) || null,
            caducidad:      l.fecha_caducidad,
            destinos,
          }
        })

      await logBitacora({
        empresa_id:    empresa?.id ?? pedido.empresa_id,
        tipo:          todoRecibido ? 'pedido_recibido' : 'pedido_recibido_parcial',
        descripcion:   `Pedido #${pedido.id.slice(-6).toUpperCase()} · ${pedido.proveedores?.nombre ?? '—'} · ${confirmados} producto${confirmados !== 1 ? 's' : ''} recibido${confirmados !== 1 ? 's' : ''} en ${sucursal?.nombre}`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   sucursalId,
        referencia_id: String(pedido.id),
        metadatos: {
          sucursal_llegada_id:   sucursalId,
          sucursal_llegada_nombre: sucursal?.nombre,
          items: resumenDistribucion,
        },
      })

      // Toast detallado con distribución
      const hayDistribucion = resumenDistribucion.some(r => r.destinos.length > 1)
      if (hayDistribucion) {
        const resumenTexto = [...new Set(
          resumenDistribucion.flatMap(r => r.destinos.map(d => `${d.sucursal_nombre}: ${d.cantidad} uds`))
        )].join(' · ')
        toast.success(`Mercancía recibida en ${sucursal?.nombre} y distribuida → ${resumenTexto}`, { duration: 5000 })
      } else {
        toast.success(`${confirmados} producto${confirmados !== 1 ? 's' : ''} recibido${confirmados !== 1 ? 's' : ''} — stock actualizado en ${sucursal?.nombre}`)
      }
      onExito()
    } catch (e) {
      toast.error(e.message ?? 'Error al registrar recepción')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  // Helpers para renderizar cada tarjeta de producto (paso 3)
  const renderTarjetaProducto = (it) => {
    const l        = lineas[it.id] ?? {}
    const estado   = l.estado ?? 'pendiente'
    const cant     = parseInt(l.cantidad_recibida) || 0
    const diff     = cant - it.cantidad_pedida
    const expandido = l.expandido ?? true

    // ── Entrega previa ──────────────────────────────────────────────────────────
    if (l.bloqueado) {
      return (
        <div key={it.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
            <PackageCheck className="w-4 h-4 text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-400 truncate">{it.nombre_producto}</p>
            <p className="text-xs text-slate-400">
              {l.cantidad_recibida} uds
              {l.fecha_caducidad ? ` · Cad. ${new Date(l.fecha_caducidad + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}` : ''}
            </p>
          </div>
          <span className="text-[9px] font-bold tracking-widest text-slate-300 bg-slate-100 px-2.5 py-1 rounded-full flex-shrink-0">PREVIA</span>
        </div>
      )
    }

    // ── Confirmado ─────────────────────────────────────────────────────────────
    if (estado === 'confirmado') {
      const distEntradas = l.distribucion ? Object.entries(l.distribucion).filter(([, v]) => (parseInt(v) || 0) > 0) : null
      const loteDetectado = detectarLoteExistente(it.producto_id, l.fecha_caducidad)
      return (
        <div key={it.id} className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl overflow-hidden shadow-sm shadow-emerald-100">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-300">
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-900 truncate">{it.nombre_producto}</p>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  {l.cantidad_recibida} uds
                  {diff !== 0 && <span className={cn('ml-1', diff > 0 ? 'text-emerald-600' : 'text-red-500')}>({diff > 0 ? '+' : ''}{diff})</span>}
                </span>
                {Number(l.precio_recibido) > 0 && (
                  <span className="text-xs font-semibold text-teal-700 bg-teal-100 px-2 py-0.5 rounded-full">{formatoMoneda(l.precio_recibido)}/u</span>
                )}
                {l.fecha_caducidad && (
                  <span className="text-xs text-emerald-600 bg-white/60 px-2 py-0.5 rounded-full border border-emerald-100">
                    {loteDetectado
                      ? (loteDetectado.codigo_lote || 'Lote existente')
                      : `Cad. ${new Date(l.fecha_caducidad + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}`}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => deshacerItem(it.id)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-emerald-400 hover:bg-emerald-200 transition-colors flex-shrink-0"
              title="Deshacer">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          {distEntradas && distEntradas.length > 0 && (
            <div className="px-4 pb-3 pt-0.5 flex flex-wrap gap-1.5 border-t border-emerald-100/60">
              {distEntradas.map(([sId, v]) => (
                <span key={sId} className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  <MapPin className="w-2.5 h-2.5" />
                  {sucursales.find(s => s.id === sId)?.nombre ?? sId} · {v} uds
                </span>
              ))}
            </div>
          )}
          {!distEntradas && sucursal && (
            <div className="px-4 pb-3 pt-0.5 border-t border-emerald-100/60">
              <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 w-fit">
                <MapPin className="w-2.5 h-2.5" />
                {sucursal.nombre} · {l.cantidad_recibida} uds
              </span>
            </div>
          )}
        </div>
      )
    }

    // ── Omitido ────────────────────────────────────────────────────────────────
    if (estado === 'omitido') {
      return (
        <div key={it.id} className="flex items-center gap-3 border border-slate-200 bg-slate-50 rounded-2xl px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
            <Ban className="w-4 h-4 text-slate-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-400 truncate line-through">{it.nombre_producto}</p>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">No llegó</p>
          </div>
          <button onClick={() => deshacerItem(it.id)}
            className="text-xs font-semibold text-primary-600 px-3 py-1.5 rounded-xl bg-white border border-primary-200 hover:bg-primary-50 transition-colors flex-shrink-0">
            Deshacer
          </button>
        </div>
      )
    }

    // ── Pendiente ──────────────────────────────────────────────────────────────
    const deshab  = deshabPorProducto[it.producto_id] ?? new Set()
    const distSum = l.distribucion ? Object.entries(l.distribucion).filter(([sid]) => !deshab.has(sid)).reduce((a, [, v]) => a + (parseInt(v) || 0), 0) : null
    const distOk  = distSum === null || distSum === cant

    return (
      <div key={it.id} className="border border-slate-200 bg-white rounded-2xl overflow-hidden shadow-sm">

        {/* Header colapsable */}
        <button
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/80 transition-colors text-left"
          onClick={() => toggleExpandido(it.id)}
        >
          <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{it.nombre_producto}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-slate-400">
                Pedido: <span className="font-semibold text-slate-600">{it.cantidad_pedida} uds</span>
              </span>
              {!l.distribucion && sucursal && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 border border-primary-100">
                  <MapPin className="w-2.5 h-2.5" /> {sucursal.nombre}
                </span>
              )}
              {l.distribucion && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                  <ArrowLeftRight className="w-2.5 h-2.5" /> Distribución
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Pendiente
            </span>
            {expandido
              ? <ChevronUp className="w-4 h-4 text-slate-300" />
              : <ChevronDown className="w-4 h-4 text-slate-300" />}
          </div>
        </button>

        {/* Escáner — siempre visible */}
        <div className="px-4 pb-3 border-b border-slate-100" onClick={e => e.stopPropagation()}>
          <div className={cn(
            'flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition-all',
            l.scanEstado === 'vinculado' ? 'bg-emerald-50 border-emerald-300' :
            l.scanEstado === 'ya_existe' ? 'bg-sky-50 border-sky-200' :
            l.scanEstado === 'error'     ? 'bg-red-50 border-red-300' :
            'bg-slate-50 border-slate-200 focus-within:border-primary-300 focus-within:bg-white focus-within:shadow-sm'
          )}>
            <ScanBarcode className={cn('w-4 h-4 flex-shrink-0',
              l.scanEstado === 'vinculado' ? 'text-emerald-500' :
              l.scanEstado === 'ya_existe' ? 'text-sky-500' :
              l.scanEstado === 'error'     ? 'text-red-400' : 'text-primary-400'
            )} />
            <input
              value={l.scanProd || ''}
              onChange={e => setLinea(it.id, 'scanProd', e.target.value)}
              onKeyDown={e => handleScanProducto(e, it)}
              onFocus={() => { if (!expandido) setLinea(it.id, 'expandido', true) }}
              placeholder={
                l.scanEstado === 'vinculado' ? '✓ Vinculado — escanea otro si hay más' :
                l.scanEstado === 'ya_existe' ? 'Ya registrado — escanea otro si hay más' :
                l.scanEstado === 'error'     ? 'Código de otro producto — verifica' :
                'Escanear código de barras…'
              }
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400 text-slate-700"
            />
            {l.scanEstado === 'vinculado' && <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" strokeWidth={3} />}
          </div>
        </div>

        {/* Contenido expandido */}
        {expandido && (
          <div className="px-4 pb-4 pt-3.5 flex flex-col gap-3.5">

            {/* Cantidad + Precio */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cantidad recibida</label>
                <input
                  id={`cant-${it.id}`}
                  type="number" min="0"
                  value={l.cantidad_recibida ?? ''}
                  onChange={e => setLinea(it.id, 'cantidad_recibida', e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border-2 border-slate-200 text-center text-2xl font-bold text-slate-900 focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15 bg-white transition-all"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Precio compra</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold pointer-events-none">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={l.precio_recibido ?? ''}
                    onChange={e => setLinea(it.id, 'precio_recibido', e.target.value)}
                    className="w-full h-12 pl-7 pr-2 rounded-xl border-2 border-slate-200 text-sm font-bold focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15 bg-white transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Fecha de caducidad */}
            {(() => {
              const loteDetectado = detectarLoteExistente(it.producto_id, l.fecha_caducidad)
              return (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Fecha de caducidad
                  </label>
                  <input
                    type="date" min={hoy}
                    value={l.fecha_caducidad ?? ''}
                    onChange={e => setLinea(it.id, 'fecha_caducidad', e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border-2 border-slate-200 text-sm font-bold focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15 bg-white transition-all"
                  />
                  {l.fecha_caducidad && loteDetectado && (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                      <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" strokeWidth={3} />
                      <p className="text-xs font-semibold text-emerald-700">
                        Se sumará al lote existente{loteDetectado.codigo_lote ? ` · ${loteDetectado.codigo_lote}` : ''}
                      </p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Distribuir entre sucursales */}
            {sucursales.length > 1 && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => toggleDistribucion(it.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all',
                    l.distribucion
                      ? 'bg-violet-50 border-violet-200 text-violet-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>{l.distribucion ? 'Distribución activa' : 'Distribuir entre sucursales'}</span>
                  </div>
                  {l.distribucion
                    ? <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', distOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600')}>
                        {distSum}/{cant} uds
                      </span>
                    : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {l.distribucion && (
                  <div className="border-2 border-violet-100 rounded-xl overflow-hidden bg-violet-50/30">
                    {sucursales.filter(s => !deshab.has(s.id)).map((s, idx, arr) => (
                      <div key={s.id} className={cn(
                        'flex items-center gap-3 px-4 py-2.5 bg-white',
                        idx < arr.length - 1 ? 'border-b border-slate-100' : ''
                      )}>
                        <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-3.5 h-3.5 text-primary-400" />
                        </div>
                        <span className="text-sm font-medium text-slate-700 flex-1 truncate">{s.nombre}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <input
                            type="number" min="0"
                            value={l.distribucion[s.id] ?? '0'}
                            onChange={e => setDistSuc(it.id, s.id, e.target.value)}
                            className="w-20 h-9 px-2 rounded-xl border-2 border-slate-200 text-center text-sm font-bold focus:outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15 bg-white"
                          />
                          <span className="text-xs text-slate-400 w-5">uds</span>
                        </div>
                      </div>
                    ))}
                    <div className={cn(
                      'flex items-center justify-between px-4 py-2.5 text-xs font-bold border-t',
                      distOk ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'
                    )}>
                      <span>Total distribuido</span>
                      <span>{distSum} / {cant} uds {distOk ? '✓' : `— faltan ${cant - (distSum ?? 0)}`}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Acciones */}
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={() => omitirItem(it.id)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:border-slate-300 active:scale-[0.97] transition-all"
              >
                <Ban className="w-3.5 h-3.5" /> No llegó
              </button>
              <button
                onClick={() => confirmarItem(it.id)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 active:scale-[0.98] transition-all shadow-md shadow-emerald-200"
              >
                <Check className="w-4 h-4" strokeWidth={3} /> Confirmar recibido
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-2xl">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <PackageCheck className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Recibir mercancía</h2>
              <p className="text-xs text-slate-400 mt-0.5">#{pedido.id.slice(-6).toUpperCase()} · {pedido.proveedores?.nombre ?? '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0 -mt-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Indicador de pasos */}
        <div className="mt-4 flex items-center gap-2">
          {[{ n: 1, label: 'Pedido' }, { n: 2, label: 'Destino' }, { n: 3, label: 'Recepción' }].map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap',
                paso > n  ? 'bg-emerald-50 text-emerald-700' :
                paso === n ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400'
              )}>
                {paso > n ? <Check className="w-3 h-3" strokeWidth={3} /> : <span>{n}</span>}
                {label}
              </div>
              {i < 2 && <div className={cn('flex-1 h-0.5 rounded-full', paso > n ? 'bg-emerald-300' : 'bg-slate-200')} />}
            </div>
          ))}
        </div>

        {/* Barra de progreso — solo en paso 3 */}
        {paso === 3 && !cargando && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-3">
                {totalConfirmados > 0 && (
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />{totalConfirmados} confirmado{totalConfirmados !== 1 ? 's' : ''}
                    {previosCount > 0 && <span className="font-normal text-emerald-400">({previosCount} previos)</span>}
                  </span>
                )}
                {pendientes > 0 && (
                  <span className="flex items-center gap-1.5 font-semibold text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />{pendientes} pendiente{pendientes !== 1 ? 's' : ''}
                  </span>
                )}
                {omitidos > 0 && (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-slate-300" />{omitidos} no llegaron
                  </span>
                )}
              </div>
              <span className="font-bold text-slate-500">{pct}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Contenido por paso ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">

        {/* ── PASO 1: Resumen del pedido ── */}
        {paso === 1 && (
          <>
            {/* Origen del pedido */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Origen del pedido</p>
                <p className="text-sm font-semibold text-slate-700">
                  {pedido.sucursales?.nombre ?? 'General'}
                </p>
              </div>
            </div>

            {pedido.notas && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800">
                <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{pedido.notas}</span>
              </div>
            )}

            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Productos del pedido {!cargando && `(${items.length})`}
            </p>

            {cargando ? (
              <div className="flex justify-center py-10">
                <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((it, i) => {
                  const yaRecibido = lineas[it.id]?.bloqueado
                  return (
                    <div key={it.id} className={cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-3 border',
                      yaRecibido ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200'
                    )}>
                      <span className="text-xs text-slate-300 font-mono w-5 text-center flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{it.nombre_producto}</p>
                        {yaRecibido && (
                          <p className="text-xs text-slate-400">Ya recibido · {lineas[it.id]?.cantidad_recibida} uds</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary-600">{it.cantidad_pedida}</p>
                          <p className="text-[10px] text-slate-400">uds</p>
                        </div>
                        {yaRecibido && <PackageCheck className="w-4 h-4 text-emerald-400" />}
                      </div>
                    </div>
                  )
                })}
                {items.length > 0 && (
                  <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-2xl px-4 py-2.5">
                    <p className="text-xs font-bold text-primary-700">Total</p>
                    <p className="text-sm font-bold text-primary-800">{items.reduce((s, i) => s + i.cantidad_pedida, 0)} unidades</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── PASO 2: Sucursal destino ── */}
        {paso === 2 && (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-800">¿En qué sucursal llega la mercancía?</p>
              <p className="text-xs text-slate-400 mt-0.5">Después podrás distribuir a otras sucursales desde cada producto.</p>
            </div>

            {sucursales.length === 1 ? (
              <div className="flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-2xl px-5 py-4">
                <div className="w-10 h-10 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-primary-800">{sucursal?.nombre}</p>
                  <p className="text-xs text-primary-600">Única sucursal</p>
                </div>
                <Check className="w-5 h-5 text-primary-500 flex-shrink-0" strokeWidth={2.5} />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {sucursales.map(suc => (
                  <button key={suc.id} onClick={() => setSucursalId(suc.id)}
                    className={cn(
                      'flex items-center gap-3 px-5 py-4 rounded-2xl border text-left transition-all',
                      suc.id === sucursalId
                        ? 'bg-primary-600 border-primary-600 text-white shadow-sm shadow-primary-500/20'
                        : 'bg-white border-slate-200 hover:border-primary-300 hover:bg-primary-50/50 text-slate-700'
                    )}>
                    <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0', suc.id === sucursalId ? 'bg-white/20' : 'bg-slate-100')}>
                      <Building2 className={cn('w-5 h-5', suc.id === sucursalId ? 'text-white' : 'text-slate-500')} />
                    </div>
                    <p className="font-semibold flex-1">{suc.nombre}</p>
                    {suc.id === sucursalId && <Check className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── PASO 3: Recepción ── */}
        {paso === 3 && (
          <>
            {previosCount > 0 && (
              <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-2.5">
                <PackageCheck className="w-4 h-4 text-sky-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-sky-700">
                  {previosCount} producto{previosCount > 1 ? 's' : ''} ya recibido{previosCount > 1 ? 's' : ''} en entrega anterior
                </p>
              </div>
            )}

            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2">
              <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <input value={busquedaItem ?? ''} onChange={e => setBusquedaItem(e.target.value)} placeholder="Buscar producto en este pedido…"
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-slate-400" />
              {busquedaItem && <button onClick={() => setBusquedaItem('')} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>}
            </div>

            <div className="flex flex-col gap-2">
              {items
                .filter(it => !busquedaItem || it.nombre_producto.toLowerCase().includes(busquedaItem.toLowerCase()))
                .map(it => renderTarjetaProducto(it))}
            </div>
          </>
        )}
      </div>

      {/* ── Footer por paso ── */}
      <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
        {paso === 1 && (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button tamano="md" className="flex-1" onClick={() => setPaso(2)} disabled={cargando}>
              Siguiente
            </Button>
          </div>
        )}

        {paso === 2 && (
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" onClick={() => setPaso(1)}>← Volver</Button>
            <Button tamano="md" className="flex-1" disabled={!sucursalId} onClick={() => setPaso(3)}>
              Siguiente
            </Button>
          </div>
        )}

        {paso === 3 && (
          <div className="flex flex-col gap-2.5">
            {pendientes > 0 && (
              <button onClick={confirmarTodo} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-700 hover:bg-emerald-100 active:scale-[0.99] transition-all">
                <PackageCheck className="w-4 h-4" />
                Aceptar todo como pedido · {pendientes} pendiente{pendientes !== 1 ? 's' : ''}
              </button>
            )}
            <div className="flex gap-3">
              <Button variante="secundario" tamano="md" onClick={() => setPaso(2)}>← Destino</Button>
              <Button tamano="md"
                className={cn('flex-1 font-bold', puedeRegistrar ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20' : '')}
                cargando={guardando} disabled={!puedeRegistrar} onClick={registrar}>
                <PackageCheck className="w-4 h-4 mr-1.5" />
                Registrar {confirmados > 0 ? `· ${confirmados} producto${confirmados !== 1 ? 's' : ''}` : 'recepción'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Sub-modal: vincular código desconocido ── */}
      {modalVincular && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => { setModalVincular(null); setSearchVinc('') }} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Código no registrado</h3>
                <p className="text-xs font-mono text-amber-700 mt-0.5 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg inline-block">{modalVincular.codigo}</p>
              </div>
              <button onClick={() => { setModalVincular(null); setSearchVinc('') }} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-sm text-slate-600">¿A qué producto de este pedido pertenece?</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={searchVinc} onChange={e => setSearchVinc(e.target.value)} placeholder="Buscar producto…" autoFocus
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                {items.filter(it => !searchVinc || it.nombre_producto.toLowerCase().includes(searchVinc.toLowerCase())).map(it => (
                  <button key={it.id} disabled={guardandoVinc} onClick={() => guardarVincular(it)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-primary-50 text-left transition-colors disabled:opacity-50">
                    <Link2 className="w-4 h-4 text-primary-500 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800">{it.nombre_producto}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => { setModalVincular(null); setSearchVinc('') }} className="text-xs text-slate-400 hover:text-slate-600 text-center py-1 transition-colors">
                Cancelar — ignorar código
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── Modal: productos del proveedor ──────────────────────────────────────────

function ModalProductosProveedor({ proveedor, empresa, onClose }) {
  const [productos, setProductos] = useState([])
  const [cargando,  setCargando]  = useState(true)
  const [busqueda,  setBusqueda]  = useState('')

  useEffect(() => {
    supabase.from('productos')
      .select('id, nombre, categoria, precio_compra, precio_venta, activo')
      .eq('empresa_id', empresa.id)
      .eq('proveedor_id', proveedor.id)
      .order('nombre')
      .then(({ data }) => { setProductos(data ?? []); setCargando(false) })
  }, [proveedor.id, empresa.id])

  const filtrados = busqueda.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productos

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader
        titulo={proveedor.nombre}
        subtitulo={`${productos.length} producto${productos.length !== 1 ? 's' : ''} vinculado${productos.length !== 1 ? 's' : ''}`}
        onClose={onClose}
      />
      {!cargando && productos.length > 0 && (
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
        ) : productos.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2 text-center">
            <Package className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-500">Sin productos vinculados</p>
            <p className="text-xs text-slate-400">Asigna este proveedor desde la sección Productos → Editar</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2 text-center">
            <p className="text-sm text-slate-400">Sin resultados para "{busqueda}"</p>
          </div>
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
                {p.categoria && <p className="text-xs text-slate-400">{p.categoria}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                {p.precio_venta > 0 && (
                  <p className="text-xs font-bold text-slate-700">${Number(p.precio_venta).toFixed(2)}</p>
                )}
                {!p.activo && <p className="text-[10px] text-slate-400">Archivado</p>}
              </div>
            </div>
          ))
        )}
      </div>
      <ModalFooter>
        <Button variante="secundario" tamano="md" className="w-full" onClick={onClose}>Cerrar</Button>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: detalle pedido ────────────────────────────────────────────────────

function ModalDetallePedido({ pedido, empresa, sucursales, tz, onClose, onEliminado, onRecibir, onEditar }) {
  const { perfil } = useApp()
  const [items,       setItems]       = useState([])
  const [cargando,    setCargando]    = useState(true)
  const [confirmando, setConfirmando] = useState(false)
  const [eliminando,  setEliminando]  = useState(false)
  const [recepcion,   setRecepcion]   = useState(null) // metadatos de la bitácora de recepción

  useEffect(() => {
    const fetch = async () => {
      try {
        const [{ data: itemsData, error }, { data: bitData }] = await Promise.all([
          supabase.from('pedido_items').select('*, productos(precio_compra)').eq('pedido_id', pedido.id).order('nombre_producto'),
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
  }, [pedido.id])

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
        {(esPendiente || esParcial) && (
          <Button variante="exito" tamano="md" className="w-full"
            onClick={() => { onClose(); onRecibir(pedido) }}>
            <PackageCheck className="w-4 h-4" />
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
                          {item.precio_recibido ? ` · ${formatoMoneda(item.precio_recibido)}/u` : ''}
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
                {(() => {
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
              <Button tamano="md" className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                cargando={eliminando} onClick={cancelarPedido}>
                Sí, cancelar pedido
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-3">
              <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cerrar</Button>
              <Button tamano="md" className="flex-1" onClick={reimprimir}>
                <Printer className="w-4 h-4 mr-1.5" />
                Reimprimir PDF
              </Button>
            </div>
            {esPendiente && (
              <div className="flex gap-2">
                <Button variante="secundario" tamano="md" className="flex-1"
                  onClick={() => { onClose(); onEditar?.(pedido) }}>
                  <Edit2 className="w-3.5 h-3.5" /> Editar pedido
                </Button>
                <Button variante="secundario" tamano="md"
                  className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const { empresa, sucursales, tz } = useApp()
  const [tab,             setTab]             = useState('proveedores')
  const [proveedores,     setProveedores]     = useState([])
  const [pedidos,         setPedidos]         = useState([])
  const [conteoProductos, setConteoProductos] = useState({})
  const [modalRecibir,    setModalRecibir]    = useState(null)
  const [cargando,        setCargando]        = useState(true)
  const [modalProv,       setModalProv]       = useState(null)
  const [modalPedido,     setModalPedido]     = useState(null)
  const [modalDetalle,    setModalDetalle]    = useState(null)
  const [modalProdsProveedor, setModalProdsProveedor] = useState(null)
  const [modalEditar,     setModalEditar]     = useState(null)
  // Filtros proveedores
  const [busquedaProv,    setBusquedaProv]    = useState('')
  // Filtros pedidos
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
        .select('*, proveedores(id,nombre,telefono,email,contacto), sucursales(nombre)')
        .eq('empresa_id', empresa.id)
        .order('created_at', { ascending: false })

      if (filtroEstadoPed) pedidosQ = pedidosQ.eq('estado', filtroEstadoPed)
      if (filtroProv)      pedidosQ = pedidosQ.eq('proveedor_id', filtroProv)
      if (fechaDesde)      pedidosQ = pedidosQ.gte('created_at', fechaDesde + 'T00:00:00')
      if (fechaHasta)      pedidosQ = pedidosQ.lte('created_at', fechaHasta + 'T23:59:59')

      const [{ data: provs, error: e1 }, { data: peds, error: e2 }, { data: prods }] = await Promise.all([
        supabase.from('proveedores')
          .select('*')
          .eq('empresa_id', empresa.id)
          .eq('activo', true)
          .order('nombre'),
        pedidosQ,
        supabase.from('productos')
          .select('proveedor_id')
          .eq('empresa_id', empresa.id)
          .eq('activo', true)
          .not('proveedor_id', 'is', null),
      ])
      if (e1) throw e1
      if (e2) throw e2
      setProveedores(provs ?? [])
      setPedidos(peds ?? [])
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
  }, [empresa, filtroEstadoPed, filtroProv, fechaDesde, fechaHasta])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  const proveedoresFiltrados = busquedaProv.trim()
    ? proveedores.filter(p =>
        p.nombre.toLowerCase().includes(busquedaProv.toLowerCase()) ||
        p.contacto?.toLowerCase().includes(busquedaProv.toLowerCase()) ||
        p.email?.toLowerCase().includes(busquedaProv.toLowerCase()))
    : proveedores

  const pedidosFiltrados = pedidos.filter(p => {
    if (busquedaPed.trim()) {
      const q = busquedaPed.toLowerCase()
      return p.proveedores?.nombre?.toLowerCase().includes(q) ||
             p.id.slice(-6).toUpperCase().includes(busquedaPed.toUpperCase())
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">
            {proveedores.length} proveedor{proveedores.length !== 1 ? 'es' : ''}
            {' · '}{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variante="primario" tamano="sm" onClick={() => setModalProv({})}>
          <Plus className="w-4 h-4 mr-1.5" />
          <span className="hidden sm:inline">Nuevo proveedor</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { v: 'proveedores', label: 'Proveedores' },
          { v: 'pedidos',     label: `Pedidos${pedidos.length > 0 ? ` (${pedidos.length})` : ''}` },
        ].map(t => (
          <button key={t.v} onClick={() => setTab(t.v)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold transition-all',
              tab === t.v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Loader */}
      {cargando && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      )}

      {/* ── Tab: proveedores ── */}
      {!cargando && tab === 'proveedores' && (
        <>
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

          {proveedoresFiltrados.length === 0 ? (
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
                              onClick={() => setModalPedido(prov)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />Pedido
                            </button>
                            <button
                              onClick={() => setModalProv(prov)}
                              className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table>
          )}
        </>
      )}

      {/* ── Tab: pedidos ── */}
      {!cargando && tab === 'pedidos' && (
        <>
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

            {/* Filtros de estado */}
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
              {(busquedaPed || filtroEstadoPed || filtroProv || fechaDesde || fechaHasta) && (
                <button
                  onClick={() => { setBusquedaPed(''); setFiltroEstadoPed(''); setFiltroProv(''); setFechaDesde(''); setFechaHasta('') }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {pedidosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <ClipboardList className="w-8 h-8 text-slate-300" />
              <p className="text-sm text-slate-400">
                {(busquedaPed || filtroEstadoPed || filtroProv) ? 'Sin pedidos con esos filtros' : 'Sin pedidos registrados'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pedidosFiltrados.map(ped => {
                const estado  = ped.estado ?? 'pendiente'
                const fecha   = new Date(ped.created_at).toLocaleDateString('es-MX', {
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
                      'bg-white border border-slate-200 border-l-4 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left hover:shadow-md hover:border-slate-300 active:scale-[0.99] transition-all shadow-sm',
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
          )}
        </>
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
      {modalPedido && (
        <ModalNuevoPedido
          empresa={empresa}
          proveedor={modalPedido}
          sucursales={sucursales}
          onClose={() => setModalPedido(null)}
          onGuardado={() => { setModalPedido(null); cargar() }}
        />
      )}
      {modalDetalle && (
        <ModalDetallePedido
          pedido={modalDetalle}
          empresa={empresa}
          sucursales={sucursales}
          tz={tz}
          onClose={() => setModalDetalle(null)}
          onEliminado={() => { setModalDetalle(null); cargar() }}
          onRecibir={(ped) => { setModalDetalle(null); setModalRecibir(ped) }}
          onEditar={(ped) => { setModalDetalle(null); setModalEditar(ped) }}
        />
      )}
      {modalEditar && (
        <ModalEditarPedido
          pedido={modalEditar}
          empresa={empresa}
          proveedor={modalEditar.proveedores ?? { id: modalEditar.proveedor_id, nombre: '—' }}
          sucursales={sucursales}
          onClose={() => setModalEditar(null)}
          onGuardado={() => { setModalEditar(null); cargar() }}
        />
      )}
      {modalRecibir && (
        <ModalRecibirPedido
          pedido={modalRecibir}
          sucursales={sucursales}
          tz={tz}
          onClose={() => setModalRecibir(null)}
          onExito={() => { setModalRecibir(null); cargar() }}
        />
      )}
      {modalProdsProveedor && (
        <ModalProductosProveedor
          proveedor={modalProdsProveedor}
          empresa={empresa}
          onClose={() => setModalProdsProveedor(null)}
        />
      )}
    </div>
  )
}
