import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Search, ShoppingCart, X, Plus, Minus, Trash2, Check,
  DollarSign, CreditCard, Store, Clock, Receipt, BarChart3,
  Eye, Printer, Ban, User, Package, Wallet, LogOut,
  ChevronDown, AlertTriangle, ScanBarcode,
  Banknote, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { registrarAsistencia } from '@/lib/asistencia'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, formatoHora, formatoFechaHora, fechaEnZona, generarFolio, inicioDiaUtc } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { invalidarStock } from '@/lib/cache'
import { emitirAlerta } from '@/lib/alertas'
import { traerTodo } from '@/lib/paginado'

// Consulta embebida reutilizable: inventario CON stock en una sucursal + su lote.
// Solo trae lo que tiene existencias aquí (no todo el inventario histórico).
const SELECT_INV_LOTES = 'id, lote_id, sucursal_id, cantidad, lotes!inner(id, producto_id, codigo_lote, fecha_caducidad, activo)'

// Columnas explícitas en vez de `*`. Con `*` la respuesta incluía
// `precio_compra`, así que el cajero recibía el costo de todo el catálogo en el
// navegador aunque la interfaz nunca se lo mostrara. Solo lo necesitan quienes
// pueden mover precios: el aviso de "precio menor al costo" es de admin y
// encargado. RLS es por fila, no por columna — esto se decide aquí.
const COLS_PRODUCTO       = 'id, nombre, categoria, precio_venta, precio_mayoreo, cantidad_mayoreo, activo'
const COLS_PRODUCTO_COSTO = `${COLS_PRODUCTO}, precio_compra`

// Cada cuánto se vuelve a bajar el catálogo completo estando la página abierta
const CATALOGO_MS = 15 * 60_000

// Deriva los arrays planos de inventario y lotes desde la consulta embebida
function derivarInvLotes(rows) {
  const inv = []
  const lotesMap = new Map()
  ;(rows || []).forEach(r => {
    inv.push({ id: r.id, lote_id: r.lote_id, sucursal_id: r.sucursal_id, cantidad: r.cantidad })
    if (r.lotes && !lotesMap.has(r.lotes.id)) lotesMap.set(r.lotes.id, r.lotes)
  })
  return { inv, lot: [...lotesMap.values()] }
}

// ─── Modal Ver Ticket ───────────────────────────────────────
function ModalVerTicket({ venta, detalles, productos, sucursalNombre, onCerrar }) {
  if (!venta) return null
  const items  = detalles.filter(d => d.venta_id === venta.id)
  const folio  = generarFolio(venta.id, sucursalNombre)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-md bg-white rounded-none sm:rounded-3xl shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[92dvh] overflow-hidden flex flex-col animate-modal-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900 font-mono">{folio}</h3>
            <p className="text-xs text-slate-500">{formatoFechaHora(venta.creado_en)}</p>
          </div>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {items.map(d => {
              const prod = productos.find(p => p.id === d.producto_id)
              return (
                <div key={d.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{prod?.nombre || '—'}</p>
                    <p className="text-xs text-slate-500">{d.cantidad} x {formatoMoneda(d.precio_unitario)}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-900 tabular-nums">{formatoMoneda(d.cantidad * d.precio_unitario)}</p>
                </div>
              )
            })}
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-600">Total</span>
          <span className="text-xl font-bold text-primary-700">{formatoMoneda(venta.total)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Cancelar Venta ───────────────────────────────────
function ModalCancelar({ venta, sucursalNombre, onCerrar, onExito }) {
  const { empresa } = useApp()
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const enviandoRef = useRef(false)

  async function solicitar() {
    if (!motivo.trim()) { toast.error('Escribe un motivo'); return }
    if (enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    try {
      const userId = (await supabase.auth.getUser()).data.user.id
      const { error } = await supabase.from('cancelaciones').insert([{
        empresa_id: empresa.id,
        venta_id: venta.id,
        solicitado_por: userId,
        motivo: motivo.trim(),
        estado: 'pendiente',
      }])
      if (error) throw error
      await logBitacora({
        empresa_id:    empresa.id,
        tipo:          'cancelacion_solicitada',
        descripcion:   `Solicitud de cancelación · ${generarFolio(venta.id, sucursalNombre)} · ${formatoMoneda(venta.total)} · Motivo: ${motivo.trim()}`,
        usuario_id:    userId,
        sucursal_id:   venta.sucursal_id ?? null,
        referencia_id: String(venta.id),
      })
      emitirAlerta()
      toast.success('Cancelación solicitada')
      onExito?.()
      onCerrar()
    } catch (err) {
      toast.error(err.message || 'Error')
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  if (!venta) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl animate-modal-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-red-700">Solicitar cancelación</h3>
          <button onClick={onCerrar} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
            <p className="text-sm text-red-800 font-mono font-bold">{generarFolio(venta.id, sucursalNombre)}</p>
            <p className="text-sm text-red-700 mt-0.5">{formatoMoneda(venta.total)}</p>
          </div>
          <Input label="Motivo *" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="¿Por qué se cancela?" autoFocus />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 justify-end">
          <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
          <Button variante="peligro" onClick={solicitar} cargando={enviando}>Solicitar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Helper: abrir ventana de impresión con manejo de errores ────────────────
async function abrirImpresion(html) {
  // ── Electron: usar IPC para imprimir con diálogo nativo de Windows ──
  if (window.electronAPI) {
    try {
      const impresoras = await window.electronAPI.obtenerImpresoras()
      if (!impresoras || impresoras.length === 0) {
        toast.error('Sin impresora', {
          description: 'No hay impresoras instaladas. Instala el driver de tu impresora de tickets e intenta de nuevo.',
          duration: 8000,
        })
        return false
      }
      const { success, errorType } = await window.electronAPI.imprimirTicket(html)
      if (!success && errorType !== 'cancelled') {
        toast.error('Error al imprimir', {
          description: `No se pudo enviar a la impresora (${errorType ?? 'desconocido'}).`,
          duration: 6000,
        })
      }
      return success
    } catch (e) {
      toast.error('Error al imprimir', { description: e?.message ?? 'Error inesperado', duration: 6000 })
      return false
    }
  }

  // ── Web: usar window.open ──
  try {
    const win = window.open('', '_blank', 'width=320,height=600')
    if (!win || win.closed) {
      toast.error('Impresión bloqueada', {
        description: 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.',
        duration: 8000,
      })
      return false
    }
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
    return true
  } catch {
    toast.error('Error al imprimir', {
      description: 'No se pudo conectar con la impresora. Verifica que esté encendida y con papel, luego reimprime desde Historial.',
      duration: 8000,
    })
    return false
  }
}

// ─── Helper: escapar texto interpolado en HTML de tickets ────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ─── Helper: construir HTML del ticket ───────────────────────────────────────
function buildTicketHtml({ folio, items, total, montoRecibido, cambio, sucursalNombre, sucursal, empresaNombre, fecha }) {
  const suc    = sucursal || {}
  const partes = [suc.calle, suc.colonia, suc.ciudad, suc.estado].filter(Boolean)
  const dir    = partes.length
    ? partes.join(', ') + (suc.codigo_postal ? ` C.P. ${suc.codigo_postal}` : '')
    : ''
  const f      = fecha instanceof Date ? fecha : new Date()
  const fStr   = f.toLocaleDateString('es-MX',  { day: '2-digit', month: 'long', year: 'numeric' })
  const hStr   = f.toLocaleTimeString('es-MX',  { hour: '2-digit', minute: '2-digit', hour12: false })
  const rows   = items.map(i =>
    `<tr><td>${esc(i.nombre)}</td><td style="text-align:center">${i.cantidad}</td><td style="text-align:right">$${(i.precio * i.cantidad).toFixed(2)}</td></tr>`
  ).join('')
  const pagoHtml = montoRecibido > 0
    ? `<div class="fila"><span>Recibido</span><span>$${Number(montoRecibido).toFixed(2)}</span></div><div class="fila cambio"><span>Cambio</span><span>$${Number(cambio).toFixed(2)}</span></div>`
    : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:0}*{margin:0;padding:0;box-sizing:border-box}html,body{height:auto}body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:8px}h2{text-align:center;font-size:14px;margin-bottom:2px}.sub{text-align:center;font-size:10px;color:#555;margin-bottom:2px}.dir{text-align:center;font-size:9px;color:#777;margin-bottom:2px}.fecha{text-align:center;font-size:10px;color:#555;margin-bottom:4px}.folio{text-align:center;font-size:12px;font-weight:bold;letter-spacing:2px;margin-bottom:4px}hr{border:none;border-top:1px dashed #000;margin:6px 0}table{width:100%;border-collapse:collapse}th{font-size:10px;padding:2px 0;border-bottom:1px solid #000}td{padding:2px 0;font-size:10px}.total{display:flex;justify-content:space-between;font-weight:bold;font-size:14px;margin-top:6px}.fila{display:flex;justify-content:space-between;font-size:11px;margin-top:3px;color:#333}.cambio{font-weight:bold;color:#000}.footer{text-align:center;font-size:10px;color:#555;margin-top:10px}</style></head><body><h2>${esc(empresaNombre) || 'FARMACIA'}</h2><div class="sub">${esc(sucursalNombre)}</div>${dir ? `<div class="dir">${esc(dir)}</div>` : ''}<div class="fecha">${fStr} &nbsp; ${hStr}</div><div class="folio">${esc(folio)}</div><hr><table><thead><tr><th>Producto</th><th style="text-align:center">Cant</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><hr><div class="total"><span>TOTAL</span><span>$${Number(total).toFixed(2)}</span></div>${pagoHtml}<div class="footer">Gracias por su compra</div></body></html>`
}

// ─── Modal: cerrar turno ────────────────────────────────────
function ModalCierreTurno({ turnoActual, resumenTurno, sucursalNombre, onImprimir, onClose, onCerrado }) {
  const [montoContado, setMontoContado] = useState('')
  const [nota,         setNota]         = useState('')
  const [cerrando,     setCerrando]     = useState(false)
  const [resultado,    setResultado]    = useState(null)

  const efectivoEsperado = resumenTurno?.esperado ?? 0

  async function cerrar() {
    if (montoContado === '') { toast.error('Ingresa el efectivo contado'); return }
    const contado = Number(montoContado)
    if (isNaN(contado) || contado < 0) { toast.error('Monto no válido'); return }
    setCerrando(true)
    try {
      const { data, error } = await supabase.rpc('cerrar_turno_caja', {
        p_turno_id:      turnoActual.id,
        p_monto_contado: contado,
        p_nota:          nota.trim() || null,
      })
      if (error) throw error
      setResultado(data)
      onImprimir?.()
    } catch (err) {
      toast.error(err.message || 'Error al cerrar turno')
    } finally {
      setCerrando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => !resultado && onClose()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-none sm:rounded-3xl shadow-2xl h-[100dvh] sm:h-auto sm:max-h-[92dvh] overflow-hidden flex flex-col animate-modal-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-red-100 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {resultado ? 'Resumen del turno' : 'Cerrar turno'}
              </h3>
              <p className="text-xs text-slate-500">{sucursalNombre}</p>
            </div>
          </div>
          <button onClick={() => resultado ? onCerrado() : onClose()}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {!resultado ? (
            <>
              {/* Info del turno */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Apertura</span>
                  <span className="font-medium text-slate-900">{formatoFechaHora(turnoActual.fecha_apertura)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fondo inicial</span>
                  <span className="font-bold text-slate-900">{formatoMoneda(turnoActual.monto_apertura)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Operador</span>
                  <span className="font-medium text-slate-900">{turnoActual.perfiles?.nombre || '—'}</span>
                </div>
              </div>

              {/* Desglose de ventas */}
              {resumenTurno && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resumen del turno</p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                        <p className="text-[10px] font-bold text-emerald-700 uppercase">Efectivo</p>
                      </div>
                      <p className="text-base font-bold text-emerald-800 tabular-nums">
                        {formatoMoneda(resumenTurno.ventasEf)}
                      </p>
                    </div>
                    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                        <p className="text-[10px] font-bold text-sky-700 uppercase">Tarjeta</p>
                      </div>
                      <p className="text-base font-bold text-sky-800 tabular-nums">
                        {formatoMoneda(resumenTurno.ventasTar)}
                      </p>
                    </div>
                  </div>

                  {(resumenTurno.entradas > 0 || resumenTurno.salidas > 0) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-1.5">
                      {resumenTurno.entradas > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" /> Entradas manuales
                          </span>
                          <span className="font-semibold text-emerald-700">+{formatoMoneda(resumenTurno.entradas)}</span>
                        </div>
                      )}
                      {resumenTurno.salidas > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <ArrowUpRight className="w-3.5 h-3.5 text-red-500" /> Salidas / Gastos
                          </span>
                          <span className="font-semibold text-red-600">-{formatoMoneda(resumenTurno.salidas)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-primary-50 border-2 border-primary-300 rounded-2xl p-4 text-center">
                    <p className="text-xs font-bold text-primary-600 uppercase tracking-wider mb-1">
                      Efectivo esperado en caja
                    </p>
                    <p className="text-3xl font-bold text-primary-800 tabular-nums">
                      {formatoMoneda(efectivoEsperado)}
                    </p>
                    <p className="text-xs text-primary-500 mt-1">
                      Fondo + ventas efectivo + entradas − salidas
                    </p>
                  </div>
                </div>
              )}

              {/* Input contado */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">¿Cuánto dinero hay en caja? *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={montoContado}
                    onChange={e => setMontoContado(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && cerrar()}
                    placeholder="0.00"
                    autoFocus
                    className="w-full pl-8 pr-4 py-3.5 text-lg font-bold bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  />
                </div>
                <p className="text-xs text-slate-400">Cuenta todo el efectivo físico (no tarjeta).</p>

                {montoContado !== '' && (
                  <div className={cn(
                    'rounded-2xl p-3 text-center border',
                    Number(montoContado) - efectivoEsperado === 0 ? 'bg-emerald-50 border-emerald-200' :
                    Number(montoContado) - efectivoEsperado  > 0  ? 'bg-sky-50 border-sky-200' :
                                                                     'bg-red-50 border-red-200'
                  )}>
                    {(() => {
                      const diff = Number(montoContado) - efectivoEsperado
                      const esOk  = diff === 0
                      const esSob = diff > 0
                      return (
                        <>
                          <p className={cn('text-xs font-bold uppercase tracking-wider mb-0.5',
                            esOk ? 'text-emerald-700' : esSob ? 'text-sky-700' : 'text-red-700')}>
                            {esOk ? '¡Cuadre perfecto!' : esSob ? 'Sobrante' : 'Faltante'}
                          </p>
                          <p className={cn('text-xl font-bold tabular-nums',
                            esOk ? 'text-emerald-600' : esSob ? 'text-sky-600' : 'text-red-600')}>
                            {diff > 0 ? '+' : ''}{formatoMoneda(diff)}
                          </p>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>

              <Input
                label="Nota (opcional)"
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="Observaciones del turno..."
              />
            </>
          ) : (
            /* ─── Resultado ─── */
            <>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Fondo inicial', valor: resultado.apertura,  Icono: Wallet,        color: 'text-slate-700'    },
                  { label: 'Ventas',        valor: resultado.ventas,    Icono: TrendingUp,    color: 'text-emerald-700', signo: '+' },
                  { label: 'Entradas',      valor: resultado.entradas,  Icono: ArrowDownLeft, color: 'text-emerald-700', signo: '+' },
                  { label: 'Salidas',       valor: resultado.salidas,   Icono: ArrowUpRight,  color: 'text-red-700',     signo: '-' },
                  { label: 'Gastos',        valor: resultado.gastos,    Icono: TrendingDown,  color: 'text-red-700',     signo: '-' },
                ].map(({ label, valor, Icono, color, signo }) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Icono className={cn('w-4 h-4', color)} />
                      <span className="text-sm text-slate-600">{label}</span>
                    </div>
                    <span className={cn('text-sm font-semibold tabular-nums', color)}>
                      {signo || ''}{formatoMoneda(valor)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Se vendió, pero ese dinero no está en el cajón */}
              {Number(resultado.credito) > 0 && (
                <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-amber-800">Ventas a crédito</span>
                    <span className="text-sm font-bold text-amber-800 tabular-nums">{formatoMoneda(resultado.credito)}</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-0.5">
                    No entra al corte: el cliente todavía no paga.
                  </p>
                </div>
              )}

              <div className="border-t border-slate-200 pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Esperado</span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">{formatoMoneda(resultado.esperado)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900">Contado</span>
                  <span className="text-lg font-bold text-primary-700 tabular-nums">{formatoMoneda(resultado.contado)}</span>
                </div>
              </div>

              <div className={cn(
                'rounded-2xl p-4 text-center border',
                resultado.diferencia === 0 ? 'bg-emerald-50 border-emerald-200' :
                resultado.diferencia  > 0  ? 'bg-sky-50 border-sky-200' : 'bg-red-50 border-red-200'
              )}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{
                  color: resultado.diferencia === 0 ? '#065f46' : resultado.diferencia > 0 ? '#1e40af' : '#991b1b'
                }}>
                  {resultado.diferencia === 0 ? 'Cuadre perfecto' : resultado.diferencia > 0 ? 'Sobrante' : 'Faltante'}
                </p>
                <p className="text-3xl font-bold tabular-nums" style={{
                  color: resultado.diferencia === 0 ? '#059669' : resultado.diferencia > 0 ? '#2563eb' : '#dc2626'
                }}>
                  {resultado.diferencia > 0 ? '+' : ''}{formatoMoneda(resultado.diferencia)}
                </p>
                {resultado.nota && (
                  <p className="text-xs text-slate-500 mt-2 italic">"{resultado.nota}"</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          {!resultado ? (
            <>
              <Button variante="secundario" onClick={onClose} className="flex-1" disabled={cerrando}>Cancelar</Button>
              <Button variante="peligro" onClick={cerrar} cargando={cerrando} disabled={montoContado === ''} className="flex-1">
                <LogOut className="w-4 h-4 mr-1.5" />
                Cerrar turno
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={onImprimir}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                Reimprimir corte
              </button>
              <Button onClick={onCerrado} className="w-full bg-primary-600 hover:bg-primary-700 text-white">
                <Check className="w-4 h-4 mr-1.5" />
                Entendido
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Página principal de Ventas ─────────────────────────────
export default function VentasPage() {
  const { perfil, empresa, sucursales, sucursalActiva, turnoActivo, cambiarSucursal, recargarTurno, tz, esRotativo, resetSucursal } = useApp()
  const esAdmin   = perfil?.rol === 'admin'
  const esCajero  = perfil?.rol === 'cajero'
  const colsProducto = esCajero ? COLS_PRODUCTO : COLS_PRODUCTO_COSTO

  // Sucursal seleccionada — rotativos empiezan sin sucursal hasta que eligen en el selector
  const [sucursalId, setSucursalId] = useState(
    sucursalActiva?.id || (esAdmin ? sucursales[0]?.id : '') || ''
  )
  const sucursalActual = sucursales.find(s => s.id === sucursalId)

  // Datos
  const [productos, setProductos] = useState([])
  const [lotes, setLotes] = useState([])
  const [inventario, setInventario] = useState([])
  const [codigosCat, setCodigosCat] = useState([])
  const [ventasHoy, setVentasHoy] = useState([])
  const [detallesHoy, setDetallesHoy] = useState([])
  const [cuentasHoy, setCuentasHoy] = useState([])
  // Una venta a crédito NO mete dinero al cajón: el cliente paga después. Si se
  // cuenta como efectivo, el corte pide dinero que nunca entró y el cajero
  // aparece con faltante. El cobro se registra el día que realmente ocurre.
  const idsCredito = useMemo(
    () => new Set((cuentasHoy || []).map(c => c.venta_id)),
    [cuentasHoy]
  )
  // Cuenta por venta, para saber cuánto de lo fiado ya se cobró. Sin esto el
  // corte mostraba siempre el total original aunque el cliente ya hubiera pagado.
  const cuentaPorVenta = useMemo(() => {
    const m = new Map()
    ;(cuentasHoy || []).forEach(c => m.set(c.venta_id, c))
    return m
  }, [cuentasHoy])
  const esEfectivoEnCaja = useCallback(
    (v) => (!v.metodo_pago || v.metodo_pago === 'efectivo') && !idsCredito.has(v.id),
    [idsCredito]
  )
  const [turnoActual, setTurnoActual] = useState(null)
  const [loading, setLoading] = useState(true)

  // Carrito
  const [carrito, setCarrito] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState([])
  const [resultadosOtras, setResultadosOtras] = useState([])
  const [deshabilitados, setDeshabilitados] = useState(new Set())
  const [precios, setPrecios] = useState({})
  const [modosMayoreo, setModosMayoreo] = useState({})
  const [cantidadesInput, setCantidadesInput] = useState({}) // string temporal mientras el user escribe
  const [warnings, setWarnings] = useState({})
  const [procesando, setProcesando] = useState(false)
  const procesandoRef  = useRef(false)
  const refreshingRef  = useRef(false)   // guard para refreshDynamic
  const ultimoCatalogoRef = useRef(0)    // última carga del catálogo (ver refrescarEnFoco)
  const [ofertasVigentes, setOfertasVigentes] = useState([])

  // Cobro
  const [montoRecibido, setMontoRecibido] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [esCuentaPendiente, setEsCuentaPendiente] = useState(false)
  const [clienteNombre, setClienteNombre] = useState('')

  // Escáner
  const [barcodeInput, setBarcodeInput] = useState('')
  const barcodeRef = useRef(null)
  const searchRef = useRef(false)

  // Modales
  const [modalTicket,  setModalTicket]  = useState(null)
  const [modalCancelar, setModalCancelar] = useState(null)


  // Tab
  const [tab, setTab] = useState('caja')

  // Abrir turno
  const [montoApertura, setMontoApertura] = useState('')
  const [abriendoTurno, setAbriendoTurno] = useState(false)
  const abriendoRef = useRef(false)
  // Cerrar turno
  const [modalCierre,    setModalCierre]    = useState(false)
  const [resumenTurno,   setResumenTurno]   = useState(null)
  const [cargandoResumen,setCargandoResumen]= useState(false)
  // Todas las ventas del turno activo (puede abarcar varios días)
  const [ventasTurno,       setVentasTurno]       = useState([])
  const [movimientosTurno,  setMovimientosTurno]  = useState([])

  // ── Cargar datos ──────────────────────────────────────────
  const perfilId = perfil?.id ?? null
  const fetchData = useCallback(async () => {
    if (!sucursalId) { setLoading(false); return }
    setLoading(true)
    try {
      const hoy = fechaEnZona(tz)
      const [prod, invRows, cod, { data: ventasConDet }, { data: turno, error: errTurnoQ }, { data: ofVig }, { data: cuentas }, prodSuc] = await Promise.all([
        // Catálogo por tandas. Los códigos de barras iban en 966 de un tope de
        // 1,000: al cruzarlo, la pistola dejaría de encontrar productos en caja
        // sin dar un solo error. El orden alfabético se aplica más abajo, en
        // memoria — aquí se pagina por id, que es lo único estable.
        traerTodo(() => supabase.from('productos'), colsProducto,
          q => q.eq('activo', true)),
        traerTodo(() => supabase.from('inventario'), SELECT_INV_LOTES,
          q => q.eq('sucursal_id', sucursalId).gt('cantidad', 0).eq('lotes.activo', true)),
        traerTodo(() => supabase.from('codigos_barras'),
          'producto_id, codigo, unidades_por_empaque'),
        supabase.from('ventas').select('*, detalle_ventas(*)').eq('sucursal_id', sucursalId).gte('creado_en', inicioDiaUtc(hoy, tz)).order('creado_en', { ascending: false }),
        perfilId
          ? supabase.from('turnos_caja').select('*, perfiles(nombre)').eq('sucursal_id', sucursalId).eq('usuario_id', perfilId).eq('estado', 'abierto').maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.rpc('ofertas_vigentes'),
        supabase.from('cuentas_pendientes').select('venta_id, nombre_cliente, total, abonado, pagada').eq('sucursal_id', sucursalId).gte('creado_en', inicioDiaUtc(hoy, tz)),
        // La política ps_select deja leer esta tabla a cualquier empleado de la
        // empresa, cajeros incluidos. Antes se les pasaba un conjunto vacío, y
        // con eso la validación de "producto no disponible" nunca se disparaba:
        // el cajero podía vender productos deshabilitados en su sucursal.
        // Filtrada por sucursal, así que producto_id no se repite y sirve de
        // llave para avanzar.
        traerTodo(() => supabase.from('productos_sucursales'), 'producto_id',
          q => q.eq('sucursal_id', sucursalId).eq('habilitado', false),
          'producto_id'),
      ])
      const disabledSet = new Set((prodSuc || []).map(ps => ps.producto_id))
      setDeshabilitados(disabledSet)
      const vts = (ventasConDet ?? []).map(({ detalle_ventas: _dv, ...v }) => v)
      const det = (ventasConDet ?? []).flatMap(v => v.detalle_ventas ?? [])
      const { inv, lot } = derivarInvLotes(invRows)
      setProductos((prod ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setLotes(lot); setInventario(inv)
      setCodigosCat(cod || []); setVentasHoy(vts); setDetallesHoy(det)
      setCuentasHoy(cuentas || [])
      // Solo actualizar turnoActual si la query fue exitosa y tenemos usuario identificado.
      // Si hay error (e.g. PGRST116 por múltiples filas, sesión expirada) o si perfilId
      // es null (cierre de sesión en curso), preservar el turno ya cargado.
      if (!errTurnoQ && perfilId) setTurnoActual(turno)
      setOfertasVigentes(ofVig || [])

      if (turno?.id) {
        const { data: vtsTurno } = await supabase
          .from('ventas')
          .select('id, total, metodo_pago, creado_en, monto_recibido, cambio')
          .eq('turno_id', turno.id)
          .neq('estado', 'cancelada')
          .order('creado_en', { ascending: false })
        setVentasTurno(vtsTurno || [])
      } else {
        setVentasTurno([])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false); ultimoCatalogoRef.current = Date.now() }
  }, [sucursalId, tz, perfilId, colsProducto])

  // Recarga ligera post-venta: solo datos que cambian con cada operación.
  // No recarga catálogo estático (productos, lotes, codigos_barras).
  const refreshDynamic = useCallback(async () => {
    if (!sucursalId || !perfilId) return
    if (refreshingRef.current) return
    refreshingRef.current = true
    try {
      const hoy = fechaEnZona(tz)
      const [invRows, { data: ventasConDet }, { data: turno, error: errTurnoQ }, { data: cuentas }] = await Promise.all([
        traerTodo(() => supabase.from('inventario'), SELECT_INV_LOTES,
          q => q.eq('sucursal_id', sucursalId).gt('cantidad', 0).eq('lotes.activo', true)),
        supabase.from('ventas').select('*, detalle_ventas(*)').eq('sucursal_id', sucursalId).gte('creado_en', inicioDiaUtc(hoy, tz)).order('creado_en', { ascending: false }),
        supabase.from('turnos_caja').select('*, perfiles(nombre)').eq('sucursal_id', sucursalId).eq('usuario_id', perfilId).eq('estado', 'abierto').maybeSingle(),
        supabase.from('cuentas_pendientes').select('venta_id, nombre_cliente, total, abonado, pagada').eq('sucursal_id', sucursalId).gte('creado_en', inicioDiaUtc(hoy, tz)),
      ])
      const vts = (ventasConDet ?? []).map(({ detalle_ventas: _dv, ...v }) => v)
      const det = (ventasConDet ?? []).flatMap(v => v.detalle_ventas ?? [])
      const { inv, lot } = derivarInvLotes(invRows)
      setInventario(inv); setLotes(lot)
      setVentasHoy(vts)
      setDetallesHoy(det)
      setCuentasHoy(cuentas || [])
      if (!errTurnoQ) setTurnoActual(turno)
      if (turno?.id) {
        const { data: vtsTurno } = await supabase
          .from('ventas').select('id, total, metodo_pago, creado_en, monto_recibido, cambio')
          .eq('turno_id', turno.id).neq('estado', 'cancelada').order('creado_en', { ascending: false })
        setVentasTurno(vtsTurno || [])
      } else {
        setVentasTurno([])
      }
    } catch (err) { console.error(err) }
    finally { refreshingRef.current = false }
  }, [sucursalId, tz, perfilId])

  useEffect(() => { fetchData() }, [fetchData])

  // Recargar al volver a la pestaña para detectar turnos abiertos/cerrados
  // desde otra pestaña o dispositivo. Cooldown de 3 min para no repetir fetches.
  //
  // Al volver el foco basta con lo volátil —inventario, ventas, turno, cuentas—,
  // que es justo lo que hace refreshDynamic. Antes se llamaba fetchData, y eso
  // arrastraba el catálogo entero (productos + códigos de barras) cada 3
  // minutos por cada caja abierta, cuando ese catálogo casi no cambia durante
  // un turno. Se sigue recargando completo cada 15 min para no quedarse ciego
  // ante un producto que un admin dio de alta desde otro dispositivo.
  const refrescarEnFoco = useCallback(() => {
    const catalogoViejo = Date.now() - ultimoCatalogoRef.current > CATALOGO_MS
    // Sin perfilId, refreshDynamic se sale sin hacer nada: ahí sí va la completa.
    if (catalogoViejo || !perfilId) fetchData()
    else refreshDynamic()
  }, [perfilId, fetchData, refreshDynamic])

  useFocusRefresh(refrescarEnFoco, 3 * 60_000)

  // Actualizar ofertas en tiempo real cuando un admin crea, edita o elimina una oferta
  // desde otro dispositivo, sin necesidad de recargar la página.
  useEffect(() => {
    const channel = supabase
      .channel('ofertas-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ofertas' }, async () => {
        const { data } = await supabase.rpc('ofertas_vigentes')
        setOfertasVigentes(data || [])
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  // Sincronizar turnoActual desde el contexto cuando el componente regresa por navegación.
  // turnoActivo en el contexto sobrevive a navegación entre páginas; turnoActual (local)
  // se pierde al desmontar. Sin esto, al volver a Ventas se muestra "abrir caja" durante
  // el tiempo que tarda fetchData, o permanentemente si sucursalId queda vacío.
  useEffect(() => {
    if (turnoActual || !turnoActivo) return
    // Solo aplicar si hay sucursal activa y el turno del contexto es para ella
    if (!sucursalId || turnoActivo.sucursal_id !== sucursalId) return
    setTurnoActual(turnoActivo)
  }, [turnoActivo?.id, sucursalId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'corte' || !turnoActual?.id) return
    supabase
      .from('movimientos_caja')
      .select('tipo, descripcion, monto, creado_en')
      .eq('turno_id', turnoActual.id)
      .order('creado_en', { ascending: true })
      .then(({ data }) => setMovimientosTurno(data || []))
  }, [tab, turnoActual?.id])

  // Escáner auto-focus — solo roba foco si ningún otro input está activo
  // y el usuario lleva al menos 600ms sin interactuar (teclado o mouse/touch)
  useEffect(() => {
    if (!turnoActual || tab !== 'caja') return
    let ultimaInteraccion = 0
    const marcarInteraccion = () => { ultimaInteraccion = Date.now() }
    document.addEventListener('keydown', marcarInteraccion)
    document.addEventListener('mousedown', marcarInteraccion)
    document.addEventListener('pointerdown', marcarInteraccion)

    const iv = setInterval(() => {
      if (!barcodeRef.current) return
      const active = document.activeElement
      const otroInputActivo = active &&
        active !== barcodeRef.current && (
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable
        )
      const graciaPasada = Date.now() - ultimaInteraccion > 600
      if (!otroInputActivo && graciaPasada) barcodeRef.current.focus()
    }, 300)

    return () => {
      clearInterval(iv)
      document.removeEventListener('keydown', marcarInteraccion)
      document.removeEventListener('mousedown', marcarInteraccion)
      document.removeEventListener('pointerdown', marcarInteraccion)
    }
  }, [turnoActual, tab])

  // ── Helpers de stock ──────────────────────────────────────
  function stockEnSucursal(productoId) {
    const loteIds = new Set(lotes.filter(l => l.producto_id === productoId).map(l => l.id))
    return inventario.filter(i => loteIds.has(i.lote_id) && i.sucursal_id === sucursalId)
      .reduce((a, i) => a + (i.cantidad || 0), 0)
  }

  function loteFEFO(productoId) {
    return lotes
      .filter(l => l.producto_id === productoId && l.activo !== false)
      .filter(l => {
        const inv = inventario.find(i => i.lote_id === l.id && i.sucursal_id === sucursalId)
        return (inv?.cantidad || 0) > 0
      })
      .sort((a, b) => new Date(a.fecha_caducidad) - new Date(b.fecha_caducidad))[0] || null
  }
  // Obtener oferta vigente para un producto (carritoActual permite pasar estado futuro del carrito)
  function ofertaDeProducto(productoId, categoria, carritoActual = carrito) {
    // Ofertas directas (no cruzadas)
    const porProducto = ofertasVigentes.find(o => o.producto_id === productoId && !o.producto_trigger_id)
    if (porProducto) return porProducto
    if (categoria) {
      const porCategoria = ofertasVigentes.find(o => o.categoria === categoria && !o.producto_trigger_id)
      if (porCategoria) return porCategoria
    }
    // Oferta cruzada: este producto es el beneficio y el trigger está en el carrito
    const cruzada = ofertasVigentes.find(o =>
      o.producto_id === productoId &&
      o.producto_trigger_id &&
      carritoActual.some(item =>
        item.producto.id === o.producto_trigger_id &&
        item.cantidad >= (o.cantidad_minima || 1)
      )
    )
    return cruzada || null
  }

  function precioConOferta(precioVenta, oferta, cantidad = 1) {
    if (!oferta) return { precioFinal: precioVenta, tieneOferta: false, desc: '' }
    if (oferta.tipo === 'descuento_porcentaje') return { precioFinal: precioVenta * (1 - oferta.valor / 100), tieneOferta: true, desc: `${oferta.valor}% OFF` }
    if (oferta.tipo === 'descuento_monto') return { precioFinal: Math.max(0, precioVenta - oferta.valor), tieneOferta: true, desc: `-${formatoMoneda(oferta.valor)}` }
    if (oferta.tipo === 'precio_fijo') return { precioFinal: oferta.valor, tieneOferta: true, desc: 'Precio especial' }
    if (oferta.tipo === 'nxm' && cantidad >= oferta.n_compra) {
      const grupos = Math.floor(cantidad / oferta.n_compra)
      const sueltos = cantidad % oferta.n_compra
      const totalConOferta = (grupos * oferta.m_paga * precioVenta) + (sueltos * precioVenta)
      return { precioFinal: totalConOferta / cantidad, tieneOferta: true, desc: `${oferta.n_compra}x${oferta.m_paga}`, esNxM: true, totalNxM: totalConOferta }
    }
    if (oferta.tipo === 'nxm') return { precioFinal: precioVenta, tieneOferta: true, desc: `${oferta.n_compra}x${oferta.m_paga} (faltan ${oferta.n_compra - cantidad})`, pendiente: true }
    return { precioFinal: precioVenta, tieneOferta: false, desc: '' }
  }

  // ── Carrito ───────────────────────────────────────────────
  function agregarAlCarrito(producto, cantidadAgregar = 1) {
    if (deshabilitados.has(producto.id)) { toast.error('Producto no disponible en esta sucursal'); return }
    const stock = stockEnSucursal(producto.id)
    if (stock === 0) { toast.error('Sin stock en esta sucursal'); return }
    const lote = loteFEFO(producto.id)
    if (!lote) return

    // Computar el nuevo carrito antes de setear estado (para detectar ofertas cruzadas)
    const existe = carrito.find(i => i.producto.id === producto.id)
    if (existe && existe.cantidad >= stock) return

    // Limitar la cantidad a no superar el stock disponible
    const cantReal = Math.min(cantidadAgregar, stock - (existe?.cantidad ?? 0))
    if (cantReal <= 0) return

    let nuevoCarrito
    if (existe) {
      nuevoCarrito = carrito.map(i =>
        i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + cantReal, stockMax: stock } : i
      )
    } else {
      nuevoCarrito = [...carrito, { producto, lote, cantidad: cantReal, precio: producto.precio_venta, stockMax: stock, oferta: null }]
    }

    // Recalcular oferta para el producto recién agregado con el nuevo carrito
    const oferta = ofertaDeProducto(producto.id, producto.categoria, nuevoCarrito)
    nuevoCarrito = nuevoCarrito.map(i =>
      i.producto.id === producto.id ? { ...i, oferta } : i
    )

    const nuevosPrecios = { ...precios }
    const nuevaCant = existe ? existe.cantidad + cantReal : cantReal

    // Auto-mayoreo: si la cantidad alcanza el mínimo configurado, aplicar precio mayoreo
    const pm = Number(producto.precio_mayoreo) || 0
    const cm = Number(producto.cantidad_mayoreo) || 0
    if (pm > 0 && cm > 0 && nuevaCant >= cm) {
      nuevosPrecios[producto.id] = String(pm)
      setModosMayoreo(m => ({ ...m, [producto.id]: true }))
    } else if (oferta && oferta.tipo !== 'nxm') {
      const { precioFinal } = precioConOferta(producto.precio_venta, oferta, nuevaCant)
      nuevosPrecios[producto.id] = precioFinal.toFixed(2)
    } else if (oferta?.tipo === 'nxm') {
      const { precioFinal, esNxM } = precioConOferta(producto.precio_venta, oferta, nuevaCant)
      if (esNxM) nuevosPrecios[producto.id] = precioFinal.toFixed(2)
    } else {
      nuevosPrecios[producto.id] = String(producto.precio_venta)
      // Si baja de la cantidad mínima, quitar mayoreo
      if (pm > 0 && cm > 0) setModosMayoreo(m => ({ ...m, [producto.id]: false }))
    }

    // Verificar si este producto activa ofertas cruzadas para items ya en el carrito
    const ofertasCruzadasQueActiva = ofertasVigentes.filter(o =>
      o.producto_trigger_id === producto.id
    )
    ofertasCruzadasQueActiva.forEach(o => {
      const benefitIdx = nuevoCarrito.findIndex(i => i.producto.id === o.producto_id)
      if (benefitIdx < 0) return
      const cantTrigger = nuevoCarrito.find(i => i.producto.id === producto.id)?.cantidad || 1
      if (cantTrigger >= (o.cantidad_minima || 1)) {
        const benefitProd = nuevoCarrito[benefitIdx].producto
        const { precioFinal } = precioConOferta(benefitProd.precio_venta, o)
        nuevosPrecios[benefitProd.id] = precioFinal.toFixed(2)
        nuevoCarrito = nuevoCarrito.map((item, idx) =>
          idx === benefitIdx ? { ...item, oferta: o } : item
        )
        toast.success(`¡Oferta activada! ${o.nombre}`)
      }
    })

    setCarrito(nuevoCarrito)
    setPrecios(nuevosPrecios)
    setResultados([]); setBusqueda('')
    // Al elegir producto también hay que apagar la búsqueda de otras sucursales:
    // limpiar la lista visible no bastaba, la consulta seguía en camino.
    if (otrasSucRef.current) clearTimeout(otrasSucRef.current)
    busquedaVigenteRef.current = ''
    setResultadosOtras([])
  }

  function setCantidadItem(prodId, val) {
    const num = Math.max(1, parseInt(val) || 1)
    const item = carrito.find(i => i.producto.id === prodId)
    if (!item) return
    const nuevaCant = Math.min(num, item.stockMax)
    const nuevosPrecios = { ...precios }

    let nuevoCarrito = carrito.map(i => {
      if (i.producto.id !== prodId) return i
      const pm = Number(i.producto.precio_mayoreo) || 0
      const cm = Number(i.producto.cantidad_mayoreo) || 0
      if (pm > 0 && cm > 0) {
        const activar = nuevaCant >= cm
        setModosMayoreo(m => ({ ...m, [prodId]: activar }))
        nuevosPrecios[prodId] = activar ? String(pm) : String(i.producto.precio_venta)
      } else if (i.oferta?.tipo === 'nxm') {
        const { precioFinal, esNxM } = precioConOferta(i.producto.precio_venta, i.oferta, nuevaCant)
        nuevosPrecios[prodId] = esNxM ? precioFinal.toFixed(2) : String(i.producto.precio_venta)
      }
      return { ...i, cantidad: nuevaCant }
    })

    // Re-evaluar ofertas cruzadas donde este item es el trigger
    ofertasVigentes.filter(o => o.producto_trigger_id === prodId).forEach(o => {
      const benefitIdx = nuevoCarrito.findIndex(i => i.producto.id === o.producto_id)
      if (benefitIdx < 0) return
      const benefit = nuevoCarrito[benefitIdx]
      if (nuevaCant >= (o.cantidad_minima || 1)) {
        if (benefit.oferta?.id !== o.id) {
          const { precioFinal } = precioConOferta(benefit.producto.precio_venta, o)
          nuevosPrecios[benefit.producto.id] = precioFinal.toFixed(2)
          nuevoCarrito = nuevoCarrito.map((it, idx) => idx === benefitIdx ? { ...it, oferta: o } : it)
        }
      } else if (benefit.oferta?.id === o.id) {
        nuevosPrecios[benefit.producto.id] = String(benefit.producto.precio_venta)
        nuevoCarrito = nuevoCarrito.map((it, idx) => idx === benefitIdx ? { ...it, oferta: null } : it)
      }
    })

    setCarrito(nuevoCarrito)
    setPrecios(nuevosPrecios)
  }

  function setPrecioItem(prodId, val) {
    if (!/^(\d*\.?\d*)?$/.test(val)) return
    setPrecios(p => ({ ...p, [prodId]: val }))
    const np = parseFloat(val) || 0
    const prod = carrito.find(i => i.producto.id === prodId)?.producto
    setWarnings(w => ({ ...w, [prodId]: np > 0 && prod && np < prod.precio_compra }))
  }

  function quitarItem(prodId) {
    // Revertir ofertas cruzadas donde este producto era el trigger
    const revertir = ofertasVigentes.filter(o => o.producto_trigger_id === prodId)
    const nuevosPrecios = { ...precios }
    let nuevoCarrito = carrito.filter(i => i.producto.id !== prodId).map(item => {
      const ofertaARevertir = revertir.find(o => o.producto_id === item.producto.id && item.oferta?.id === o.id)
      if (ofertaARevertir) {
        nuevosPrecios[item.producto.id] = String(item.producto.precio_venta)
        return { ...item, oferta: null }
      }
      return item
    })
    setCarrito(nuevoCarrito)
    setPrecios(nuevosPrecios)
    setWarnings(w => { const n = { ...w }; delete n[prodId]; return n })
  }

  const total = carrito.reduce((a, i) => a + (parseFloat(precios[i.producto.id] ?? i.precio) || 0) * i.cantidad, 0)
  const cambio = Number(montoRecibido) >= total ? Number(montoRecibido) - total : 0
  const falta = Number(montoRecibido) > 0 && Number(montoRecibido) < total ? total - Number(montoRecibido) : 0

  // ── Búsqueda ──────────────────────────────────────────────
  // Mapa producto_id → códigos en minúsculas, para filtrar rápido sin recorrer todo el catálogo
  const codigosPorProducto = useMemo(() => {
    const m = new Map()
    codigosCat.forEach(bc => {
      const arr = m.get(bc.producto_id) || []
      arr.push((bc.codigo || '').toLowerCase())
      m.set(bc.producto_id, arr)
    })
    return m
  }, [codigosCat])

  const otrasSucRef = useRef(null)
  // Qué se está buscando ahora mismo. La consulta de otras sucursales tarda
  // ~300 ms más la red, y sin este testigo su respuesta se pintaba aunque el
  // usuario ya hubiera elegido el producto: por eso "En otras sucursales"
  // aparecía de la nada con el carrito lleno y la búsqueda vacía.
  const busquedaVigenteRef = useRef('')

  function buscarProducto(q) {
    if (otrasSucRef.current) clearTimeout(otrasSucRef.current)
    busquedaVigenteRef.current = q
    if (!q.trim()) { setResultados([]); setResultadosOtras([]); return }
    const q2 = q.toLowerCase()
    const todos = productos.filter(p => {
      if (p.nombre.toLowerCase().includes(q2)) return true
      return (codigosPorProducto.get(p.id) || []).some(c => c.includes(q2))
    })

    // Se muestran también los deshabilitados, pero marcados: "sin stock aquí" y
    // "no se vende aquí" son cosas distintas y el mostrador necesita verlas.
    const disponibles = todos.slice(0, 8)
    setResultados(disponibles)

    // Otras sucursales: candidatos = deshabilitado aquí o sin stock local.
    // El stock de OTRAS sucursales ya no está precargado → se consulta bajo demanda (debounced).
    if (sucursales.length <= 1) { setResultadosOtras([]); return }
    // Sin excluir los que ya salieron arriba. Antes se descartaban, y como la
    // lista principal muestra los primeros 8, un producto sin stock aquí casi
    // siempre caía ahí: la pantalla avisaba "no disponible en esta sucursal" y
    // enseguida se negaba a decir dónde sí estaba. Justo lo que hay que saber
    // en el mostrador con el cliente enfrente.
    const candidatos = todos
      .filter(p => deshabilitados.has(p.id) || stockEnSucursal(p.id) === 0)
      .slice(0, 12)
    if (candidatos.length === 0) { setResultadosOtras([]); return }
    const candIds = candidatos.map(p => p.id)
    otrasSucRef.current = setTimeout(async () => {
      const { data } = await supabase.from('inventario')
        .select('cantidad, sucursal_id, lotes!inner(producto_id)')
        .neq('sucursal_id', sucursalId)
        .gt('cantidad', 0)
        .in('lotes.producto_id', candIds)
      const porProd = {}
      ;(data || []).forEach(r => {
        const pid = r.lotes?.producto_id
        if (!pid) return
        porProd[pid] = porProd[pid] || {}
        porProd[pid][r.sucursal_id] = (porProd[pid][r.sucursal_id] || 0) + (r.cantidad || 0)
      })
      const nombreSuc = id => sucursales.find(s => s.id === id)?.nombre ?? ''
      const otras = candidatos
        .map(p => ({
          ...p,
          sucursalesConStock: Object.entries(porProd[p.id] || {})
            .map(([sid, stock]) => ({ nombre: nombreSuc(sid), stock }))
            .filter(s => s.stock > 0),
        }))
        .filter(p => p.sucursalesConStock.length > 0)
        .slice(0, 3)
      // Si mientras viajaba la consulta el usuario ya eligió producto o cambió
      // lo que busca, este resultado es viejo y no se pinta.
      if (busquedaVigenteRef.current !== q) return
      setResultadosOtras(otras)
    }, 300)
  }

  // Normaliza el código: quita chars de control (prefijos AIM ID), espacios, y convierte a mayúsculas
  // eslint-disable-next-line no-control-regex
  const normalizarCodigo = (s) => (s || '').replace(/[\x00-\x1F]/g, '').trim().toUpperCase()

  function procesarBarcode(val) {
    val = normalizarCodigo(val)
    if (!val) return
    const bc = codigosCat.find(b => normalizarCodigo(b.codigo) === val)
    if (bc) {
      const prod = productos.find(p => p.id === bc.producto_id && !deshabilitados.has(p.id))
      if (prod) { agregarAlCarrito(prod, bc.unidades_por_empaque || 1); setBarcodeInput(''); return }
    }
    setBusqueda(val); buscarProducto(val); setBarcodeInput('')
  }

  // Enter o Tab inmediato (escáneres configurados con cualquier sufijo)
  function handleBarcode(e) {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    if (e.key === 'Tab') e.preventDefault()
    procesarBarcode(barcodeInput)
  }

  // Auto-procesar 300ms después del último carácter (escáneres sin Enter o Bluetooth)
  useEffect(() => {
    const val = barcodeInput.trim()
    if (!val || val.length < 3) return
    const t = setTimeout(() => procesarBarcode(val), 300)
    return () => clearTimeout(t)
  }, [barcodeInput]) // eslint-disable-line react-hooks/exhaustive-deps

  
  // ── Confirmar venta ───────────────────────────────────────
  async function confirmarVenta() {
    if (carrito.length === 0) return
    if (!esCuentaPendiente && Number(montoRecibido) > 0 && Number(montoRecibido) < total) {
      toast.error('El monto recibido es menor al total'); return
    }
    if (procesandoRef.current) return
    procesandoRef.current = true
    setProcesando(true)
    try {
      // Verificar que el turno sigue abierto antes de registrar la venta
      if (turnoActual?.id) {
        const { data: turnoCheck } = await supabase
          .from('turnos_caja')
          .select('estado')
          .eq('id', turnoActual.id)
          .maybeSingle()
        if (!turnoCheck || turnoCheck.estado !== 'abierto') {
          toast.error('Tu turno fue cerrado', {
            description: 'El turno ya no está activo. Abre un nuevo turno para continuar.',
            duration: 8000,
          })
          setTurnoActual(null)
          fetchData()
          setProcesando(false)
          return
        }
      }

      const items = carrito.map(i => ({
        producto_id: i.producto.id,
        lote_id: i.lote.id,
        cantidad: i.cantidad,
        precio_unitario: parseFloat(precios[i.producto.id] ?? i.precio) || 0,
      }))

      const { data, error } = await supabase.rpc('registrar_venta', {
        p_sucursal_id:         sucursalId,
        p_turno_id:            turnoActual?.id || null,
        p_items:               items,
        p_total:               total,
        p_metodo_pago:         metodoPago,
        p_monto_recibido:      Number(montoRecibido) || null,
        p_cambio:              cambio,
        p_es_cuenta_pendiente: esCuentaPendiente,
        p_cliente_nombre:      esCuentaPendiente ? clienteNombre.trim() : null,
      })
      if (error) throw error

      // El stock se descuenta dentro de registrar_venta (transacción atómica)
      invalidarStock()

      const folio = generarFolio(data?.venta_id, sucursalActual?.nombre)
      // Sin `await` a propósito: la bitácora es un registro lateral, nada de lo
      // que sigue depende de ella y ya se traga sus propios errores. Esperarla
      // le sumaba un viaje de red completo al tiempo que el cajero ve entre
      // apretar "Confirmar" y que salga el ticket, en cada venta.
      logBitacora({
        empresa_id:    empresa.id,
        tipo:          esCuentaPendiente ? 'venta_cuenta_pendiente' : 'venta_completada',
        descripcion:   esCuentaPendiente
          ? `Cuenta pendiente ${folio}: ${clienteNombre} · ${formatoMoneda(total)}`
          : `${folio} · ${formatoMoneda(total)} · ${carrito.length} producto${carrito.length !== 1 ? 's' : ''}`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   sucursalId,
        referencia_id: String(data?.venta_id ?? ''),
      })
      // Imprimir ticket automáticamente (antes de limpiar carrito)
      if (!esCuentaPendiente) {
        abrirImpresion(buildTicketHtml({
          folio,
          items: carrito.map(i => ({
            nombre:   i.producto.nombre,
            cantidad: i.cantidad,
            precio:   parseFloat(precios[i.producto.id] ?? i.precio) || 0,
          })),
          total, cambio: Number(cambio),
          montoRecibido:  Number(montoRecibido) || 0,
          metodoPago,
          cajeroNombre:   perfil?.nombre ?? '',
          sucursalNombre: sucursalActual?.nombre ?? '',
          sucursal:       sucursalActual,
          empresaNombre:  empresa?.nombre ?? '',
          fecha:          new Date(),
        }))
      }

      // Toast de confirmación — desaparece solo en 1.5 s, sin click
      toast.success(
        esCuentaPendiente ? `Cuenta pendiente: ${clienteNombre}` : `${folio} · ${formatoMoneda(total)}`,
        { duration: 1500 }
      )

      setCarrito([]); setPrecios({}); setWarnings({}); setModosMayoreo({})
      setMontoRecibido(''); setMetodoPago('efectivo'); setEsCuentaPendiente(false); setClienteNombre('')
      refreshDynamic()
    } catch (err) {
      toast.error(err.message || 'Error al registrar venta')
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  // ── Abrir turno ───────────────────────────────────────────
  async function abrirTurno() {
    if (abriendoRef.current) return
    abriendoRef.current = true
    // Limpiar estado de cierre por si quedó algo pendiente de la sesión anterior
    setModalCierre(false)
    setResumenTurno(null)
    const sucId = sucursalId
    setAbriendoTurno(true)

    // Anti-duplicado: buscar el turno abierto del USUARIO en esta sucursal.
    // Filtrar por usuario_id es crítico cuando hay varios empleados con turnos
    // abiertos en la misma sucursal — sin este filtro, maybeSingle() falla con
    // múltiples filas y el error silencioso creaba un turno extra.
    const { data: turnoExistente, error: errAntiDup } = await supabase
      .from('turnos_caja')
      .select('id, fecha_apertura, monto_apertura')
      .eq('sucursal_id', sucId)
      .eq('usuario_id', perfil?.id)
      .eq('estado', 'abierto')
      .maybeSingle()

    // Si la sesión expiró, el error llega aquí; cerramos sesión limpiamente
    if (errAntiDup?.status === 401 || errAntiDup?.message?.toLowerCase().includes('jwt') || errAntiDup?.message?.toLowerCase().includes('token')) {
      toast.error('Tu sesión expiró. Inicia sesión de nuevo.')
      abriendoRef.current = false
      setAbriendoTurno(false)
      await supabase.auth.signOut()
      return
    }

    if (!turnoExistente) {
      // No existe → crear via RPC
      try {
        await supabase.rpc('abrir_turno_caja', {
          p_sucursal_id: sucId,
          p_monto_apertura: Number(montoApertura) || 0,
        })
      } catch { /* el RPC puede rechazar si ya existe por condición de carrera */ }
    }

    // Leer el turno resultante del USUARIO (nuevo o el ya existente)
    const { data: turno, error: errTurno } = await supabase
      .from('turnos_caja')
      .select('*, perfiles(nombre)')
      .eq('sucursal_id', sucId)
      .eq('usuario_id', perfil?.id)
      .eq('estado', 'abierto')
      .maybeSingle()

    if (turno) {
      setTurnoActual(turno)
      setMontoApertura('')
      toast.success(turnoExistente ? 'Turno ya estaba abierto' : 'Turno activo')

      // Bitácora solo si es un turno recién abierto (no uno ya existente)
      if (!turnoExistente) {
        try {
          const sucNombre = sucursales.find(s => s.id === sucId)?.nombre ?? sucId
          await logBitacora({
            empresa_id:    empresa.id,
            tipo:          'caja_apertura',
            descripcion:   `Apertura de caja en ${sucNombre} · $${(Number(montoApertura) || 0).toFixed(2)}`,
            usuario_id:    perfil?.id ?? null,
            sucursal_id:   sucId,
            referencia_id: String(turno.id),
          })
        } catch { /* silencioso */ }
      }

      // ── Auto-registrar asistencia en programacion ─────────
      if (perfil?.id) {
        try {
          await registrarAsistencia({
            perfilId:    perfil.id,
            empresaId:   empresa.id,
            sucursalId:  sucId,
            tz,
          })
        } catch { /* silencioso — nunca bloquear apertura de turno */ }
      }
      // Recargar datos de la sucursal
      const hoy = fechaEnZona(tz)
      const [prod, invRows, cod, { data: ventasConDet2 }, { data: ofVig }, ps2] = await Promise.all([
        // Mismo criterio que fetchData: el catálogo va por tandas.
        traerTodo(() => supabase.from('productos'), colsProducto,
          q => q.eq('activo', true)),
        traerTodo(() => supabase.from('inventario'), SELECT_INV_LOTES,
          q => q.eq('sucursal_id', sucId).gt('cantidad', 0).eq('lotes.activo', true)),
        traerTodo(() => supabase.from('codigos_barras'),
          'producto_id, codigo, unidades_por_empaque'),
        supabase.from('ventas').select('*, detalle_ventas(*)').eq('sucursal_id', sucId).gte('creado_en', inicioDiaUtc(hoy, tz)).order('creado_en', { ascending: false }),
        supabase.rpc('ofertas_vigentes'),
        traerTodo(() => supabase.from('productos_sucursales'), 'producto_id',
          q => q.eq('sucursal_id', sucId).eq('habilitado', false),
          'producto_id'),
      ])
      const vts2 = (ventasConDet2 ?? []).map(({ detalle_ventas: _dv, ...v }) => v)
      const det2 = (ventasConDet2 ?? []).flatMap(v => v.detalle_ventas ?? [])
      const { inv, lot } = derivarInvLotes(invRows)
      setDeshabilitados(new Set((ps2 || []).map(p => p.producto_id)))
      setProductos((prod ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre)))
      setLotes(lot); setInventario(inv)
      setCodigosCat(cod || []); setVentasHoy(vts2); setDetallesHoy(det2)
      setOfertasVigentes(ofVig || [])
      recargarTurno()
    } else {
      // Si el error es de sesión expirada, cerrar limpiamente
      if (errTurno?.status === 401 || errTurno?.message?.toLowerCase().includes('jwt') || errTurno?.message?.toLowerCase().includes('token')) {
        toast.error('Tu sesión expiró. Inicia sesión de nuevo.')
        await supabase.auth.signOut()
      } else {
        toast.error('No se pudo abrir el turno')
      }
    }
    abriendoRef.current = false
    setAbriendoTurno(false)
  }

  // ── Preparar cierre: cargar resumen antes de mostrar form ─
  async function prepararCierre() {
    if (!turnoActual) return
    setCargandoResumen(true)
    try {
      // Ventas ya cargadas en ventasTurno — solo falta cargar movimientos
      const { data: movs } = await supabase
        .from('movimientos_caja')
        .select('tipo, descripcion, monto')
        .eq('turno_id', turnoActual.id)

      const ventasEf  = ventasTurno.filter(esEfectivoEnCaja).reduce((s, v) => s + Number(v.total || 0), 0)
      const ventasTar = ventasTurno.filter(v => v.metodo_pago === 'tarjeta').reduce((s, v) => s + Number(v.total || 0), 0)
      const entradas  = (movs || []).filter(m => m.tipo === 'entrada').reduce((s, m) => s + Number(m.monto || 0), 0)
      const salidas   = (movs || []).filter(m => m.tipo === 'salida').reduce((s, m) => s + Number(m.monto || 0), 0)
      const esperado  = Number(turnoActual.monto_apertura || 0) + ventasEf + entradas - salidas
      setResumenTurno({ ventasEf, ventasTar, entradas, salidas, esperado })
    } catch { /* silencioso */ }
    setCargandoResumen(false)
    setModalCierre(true)
  }

  // ── Reimprimir ticket desde historial ────────────────────────
  function imprimirTicket(venta) {
    const items = detallesHoy.filter(d => d.venta_id === venta.id)
    abrirImpresion(buildTicketHtml({
      folio:          generarFolio(venta.id, sucursalActual?.nombre),
      items:          items.map(i => ({
        nombre:   productos.find(p => p.id === i.producto_id)?.nombre || '—',
        cantidad: i.cantidad,
        precio:   i.precio_unitario,
      })),
      total:          Number(venta.total),
      montoRecibido:  Number(venta.monto_recibido) || 0,
      cambio:         Number(venta.cambio) || 0,
      metodoPago:     venta.metodo_pago,
      cajeroNombre:   '',
      sucursalNombre: sucursalActual?.nombre ?? '',
      sucursal:       sucursalActual,
      empresaNombre:  empresa?.nombre ?? '',
      fecha:          new Date(venta.creado_en),
    }))
  }

  // ── Imprimir corte de turno ───────────────────────────────
  function imprimirCorte() {
    const ef       = ventasTurno.filter(esEfectivoEnCaja)
    const tar      = ventasTurno.filter(v => v.metodo_pago === 'tarjeta')
    const totalEf  = ef.reduce((s, v) => s + Number(v.total || 0), 0)
    const totalTar = tar.reduce((s, v) => s + Number(v.total || 0), 0)
    const entradas = movimientosTurno.filter(m => m.tipo === 'entrada')
    const salidas  = movimientosTurno.filter(m => m.tipo === 'salida')
    const totalEnt = entradas.reduce((s, m) => s + Number(m.monto || 0), 0)
    const totalSal = salidas.reduce((s, m) => s + Number(m.monto || 0), 0)
    const apertura = Number(turnoActual?.monto_apertura || 0)
    const esperado = apertura + totalEf + totalEnt - totalSal
    const fm = n => '$' + Number(n || 0).toFixed(2)
    const fh = s => new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    const fd = s => new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const vtHtml = ventasTurno.map(v =>
      `<tr><td class="mono">${generarFolio(v.id, sucursalActual?.nombre)}</td><td>${fh(v.creado_en)}</td><td>${v.metodo_pago === 'tarjeta' ? 'Tarjeta' : 'Efectivo'}</td><td class="r">${fm(v.total)}</td></tr>`
    ).join('')
    const entHtml = entradas.map(m =>
      `<tr><td>${esc(m.descripcion) || '—'}</td><td class="r">${fm(m.monto)}</td></tr>`
    ).join('')
    const salHtml = salidas.map(m =>
      `<tr><td>${esc(m.descripcion) || '—'}</td><td class="r">${fm(m.monto)}</td></tr>`
    ).join('')
    const aperturaDt = turnoActual?.fecha_apertura ? new Date(turnoActual.fecha_apertura) : new Date()
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',monospace;font-size:11px;width:80mm;padding:8px}
      h2{text-align:center;font-size:13px;margin-bottom:2px}
      .sub{text-align:center;font-size:10px;color:#555;margin-bottom:2px}
      .fecha{text-align:center;font-size:10px;color:#555;margin-bottom:6px}
      hr{border:none;border-top:1px dashed #000;margin:5px 0}
      table{width:100%;border-collapse:collapse}
      th{font-size:10px;padding:2px 0;border-bottom:1px solid #000;text-align:left}
      td{padding:2px 0;font-size:10px}
      .r{text-align:right}.mono{font-family:'Courier New',monospace}
      .fila{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}
      .bold{font-weight:bold}.total-box{margin-top:6px;padding:5px;border:1px solid #000;display:flex;justify-content:space-between}
      .sec{font-size:10px;font-weight:bold;text-transform:uppercase;margin:6px 0 2px}
      .neg{color:#cc0000}
    </style></head><body>
      <h2>${esc(empresa?.nombre) || 'FARMACIA'}</h2>
      <div class="sub">${esc(sucursalActual?.nombre)}</div>
      <div class="fecha">Apertura: ${fd(aperturaDt)} ${fh(aperturaDt)}<br>Corte: ${fd(new Date())} ${fh(new Date())}</div>
      ${turnoActual?.perfiles?.nombre ? `<div class="sub">Cajero: ${esc(turnoActual.perfiles.nombre)}</div>` : ''}
      <hr>
      <p class="sec">Resumen de caja</p>
      <div class="fila"><span>Monto inicial</span><span>${fm(apertura)}</span></div>
      <div class="fila"><span>Ventas efectivo (${ef.length})</span><span>+${fm(totalEf)}</span></div>
      <div class="fila"><span>Ventas tarjeta (${tar.length})</span><span>+${fm(totalTar)}</span></div>
      ${totalEnt > 0 ? `<div class="fila"><span>Entradas manuales</span><span>+${fm(totalEnt)}</span></div>` : ''}
      ${totalSal > 0 ? `<div class="fila neg"><span>Salidas manuales</span><span>-${fm(totalSal)}</span></div>` : ''}
      <div class="total-box bold"><span>Efectivo esperado</span><span>${fm(esperado)}</span></div>
      <hr>
      <p class="sec">Ventas del turno (${ventasTurno.length})</p>
      ${ventasTurno.length === 0 ? '<p style="font-size:10px;color:#888">Sin ventas</p>' : `
      <table><thead><tr><th>Folio</th><th>Hora</th><th>Método</th><th class="r">Total</th></tr></thead>
      <tbody>${vtHtml}</tbody></table>`}
      ${entradas.length > 0 ? `<hr><p class="sec">Entradas manuales</p>
      <table><thead><tr><th>Concepto</th><th class="r">Monto</th></tr></thead>
      <tbody>${entHtml}</tbody></table>` : ''}
      ${salidas.length > 0 ? `<hr><p class="sec">Salidas manuales</p>
      <table><thead><tr><th>Concepto</th><th class="r">Monto</th></tr></thead>
      <tbody>${salHtml}</tbody></table>` : ''}
      <hr><div style="text-align:center;font-size:10px;color:#555;margin-top:6px">Firma cajero: _________________</div>
    </body></html>`
    abrirImpresion(html)
  }

  // ── Datos del día ─────────────────────────────────────────
  // Las canceladas no cuentan. Dashboard, Reportes y el corte de caja ya las
  // excluían; este resumen era el único que las seguía sumando.
  // El cajero solo responde por SU turno. Mostrarle el día completo de la
  // sucursal contradecía al historial de junto, acotado al turno, y le mezclaba
  // ventas de otros. Admin y encargado sí ven el día entero.
  const resumenSoloTurno = esCajero && !!turnoActual
  const ventasResumen = resumenSoloTurno
    ? ventasTurno.filter(v => v.estado !== 'cancelada')
    : ventasHoy.filter(v => v.estado !== 'cancelada')
  const totalHoy   = ventasResumen.reduce((a, v) => a + (v.total || 0), 0)
  const ticketsHoy = ventasResumen.length
  // Parte de esas ventas se fio: cuenta como venta, pero no como dinero en caja
  // Saldo REAL por cobrar: hay que restar lo abonado. Si se sumara el total de
  // la venta, una cuenta ya liquidada seguiría apareciendo como pendiente.
  const creditoHoy = ventasResumen.reduce((a, v) => {
    const c = cuentaPorVenta.get(v.id)
    if (!c || c.pagada) return a
    return a + Math.max(0, Number(c.total || 0) - Number(c.abonado || 0))
  }, 0)

  // ── Cambiar sucursal (admin) ──────────────────────────────
  function cambiarSuc(sId) {
    setSucursalId(sId)
    setCarrito([]); setPrecios({}); setWarnings({}); setModosMayoreo({})
    setMontoRecibido(''); setTab('caja')
    const suc = sucursales.find(s => s.id === sId)
    if (suc) cambiarSucursal(suc)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-[300px]">
      <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // SI NO HAY TURNO ABIERTO → Pantalla de apertura
  // ══════════════════════════════════════════════════════════
  if (!turnoActual) {
    return (
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Ventas</h1>
            <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5" />
              {sucursalActual?.nombre}
            </p>
          </div>
          {esAdmin && sucursales.length > 1 && (
            <div className="flex gap-2">
              {sucursales.map(s => (
                <button key={s.id} onClick={() => cambiarSuc(s.id)} className={cn('px-3 py-2 rounded-2xl text-sm font-medium border transition-all', s.id === sucursalId ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-700 border-slate-200')}>
                  {s.nombre}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-w-md mx-auto mt-8">
          <div className="bg-white border border-slate-100 rounded-3xl p-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Abre tu turno para vender</h2>
            <p className="text-sm text-slate-500 mb-6">Ingresa el monto inicial de la caja (monedas de cambio)</p>
            <div className="flex items-center gap-2 mb-3">
              <Input
                type="number" step="0.01" min="0"
                iconoIzq={<DollarSign className="w-5 h-5" />}
                value={montoApertura}
                onChange={e => setMontoApertura(e.target.value)}
                placeholder="300.00"
                onKeyDown={e => e.key === 'Enter' && abrirTurno()}
              />
            </div>
            <Button onClick={() => abrirTurno()} cargando={abriendoTurno} className="w-full" iconoIzq={<Plus className="w-4 h-4" />}>
              Abrir turno
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════
  // TURNO ABIERTO → POS completo
  // ══════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Ventas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {sucursalActual?.nombre} · {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
        </div>
        {esAdmin && sucursales.length > 1 && (
          <div className="flex gap-2">
            {sucursales.map(s => (
              <button key={s.id} onClick={() => cambiarSuc(s.id)} className={cn('px-3 py-2 rounded-2xl text-sm font-medium border transition-all', s.id === sucursalId ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-700 border-slate-200')}>
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: 'caja', label: 'Caja', icono: ShoppingCart },
          { id: 'historial', label: 'Historial', icono: Receipt },
          { id: 'corte', label: 'Corte de caja', icono: BarChart3 },
        ].map(t => {
          const Ic = t.icono
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={cn(
              'flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border transition-all',
              tab === t.id ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            )}>
              <Ic className="w-4 h-4" />{t.label}
            </button>
          )
        })}
      </div>

      {/* ══ TAB CAJA ══ */}
      {tab === 'caja' && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4 items-start">
          {/* Columna izquierda: búsqueda + carrito */}
          <div className="space-y-4">
            {/* Input oculto escáner */}
            <input ref={barcodeRef} value={barcodeInput} onChange={e => setBarcodeInput(e.target.value)} onKeyDown={handleBarcode} className="absolute opacity-0 pointer-events-none w-px h-px" tabIndex={-1} />

            {/* Búsqueda */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <ScanBarcode className="w-4 h-4" /> Buscar producto
              </div>
              <Input
                placeholder="Nombre o código de barras (escáner automático)"
                iconoIzq={<Search className="w-5 h-5" />}
                value={busqueda}
                onChange={e => { setBusqueda(e.target.value); buscarProducto(e.target.value) }}
                onFocus={() => { searchRef.current = true }}
                onBlur={() => { searchRef.current = false }}
              />
              {(resultados.length > 0 || resultadosOtras.length > 0) && (
                <div className="space-y-1.5">
                  {resultados.map(p => {
                    const stock = stockEnSucursal(p.id)
                    const noSeVende = deshabilitados.has(p.id)
                    const sinStock = stock === 0
                    const bloqueado = noSeVende || sinStock
                    const tieneMayoreo = Number(p.precio_mayoreo) > 0
                    return (
                      <button key={p.id} onClick={() => !bloqueado && agregarAlCarrito(p)} disabled={bloqueado}
                        className={cn('w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between', bloqueado ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50' : 'border-slate-200 hover:border-primary-300 bg-white')}>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-slate-900 truncate">{p.nombre}</p>
                            {tieneMayoreo && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 flex-shrink-0">
                                MAY {p.cantidad_mayoreo ? `×${p.cantidad_mayoreo}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {p.categoria} · {(() => {
                              const of = ofertaDeProducto(p.id, p.categoria)
                              if (of) {
                                const { precioFinal, desc } = precioConOferta(p.precio_venta, of)
                                return <><span className="line-through">{formatoMoneda(p.precio_venta)}</span> <span className="text-emerald-600 font-bold text-sm">{formatoMoneda(precioFinal)}</span> <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded-md">{desc}</span></>
                              }
                              if (tieneMayoreo) return <><span className="text-slate-700 font-semibold">{formatoMoneda(p.precio_venta)}</span> <span className="text-amber-600">· may {formatoMoneda(p.precio_mayoreo)}</span></>
                              return <span className="text-slate-700 font-semibold">{formatoMoneda(p.precio_venta)}</span>
                            })()}
                          </p>
                        </div>
                        {noSeVende ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 bg-slate-200 text-slate-600 text-center leading-tight">
                            No disponible<br />en esta sucursal
                          </span>
                        ) : (
                          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0', sinStock ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>{stock} uds</span>
                        )}
                      </button>
                    )
                  })}

                  {/* En otras sucursales */}
                  {resultadosOtras.length > 0 && (
                    <div className="pt-1 space-y-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
                        <Store className="w-3 h-3" /> En otras sucursales
                      </p>
                      {resultadosOtras.map(p => (
                        <div key={p.id} className="p-3 rounded-2xl border border-amber-100 bg-amber-50/50 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-700 truncate">{p.nombre}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {p.sucursalesConStock.map(s => (
                                <span key={s.nombre} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                  {s.nombre}: {s.stock} uds
                                </span>
                              ))}
                            </div>
                          </div>
                          <Store className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Carrito */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary-600" />
                  <span className="text-sm font-bold text-slate-900">Carrito</span>
                  {carrito.length > 0 && <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-bold">{carrito.length}</span>}
                </div>
                {carrito.length > 0 && (
                  <button onClick={() => { setCarrito([]); setPrecios({}); setWarnings({}); setModosMayoreo({}); setMontoRecibido('') }} className="text-xs text-red-600 font-semibold hover:text-red-700">Vaciar</button>
                )}
              </div>

              {carrito.length === 0 ? (
                <div className="p-8 text-center">
                  <ShoppingCart className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Escanea o busca un producto</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {carrito.map(item => {
                    const precioActual = parseFloat(precios[item.producto.id] ?? item.precio) || 0
                    const subtotal = precioActual * item.cantidad
                    const bajoCosto = warnings[item.producto.id]
                    const esMayoreo = modosMayoreo[item.producto.id]
                    return (
                      <div key={item.producto.id} className={cn('p-3', bajoCosto && 'bg-red-50/50')}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900 truncate">{item.producto.nombre}</p>
                              {esMayoreo && (
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  MAYOREO
                                </span>
                              )}
                              {!esMayoreo && item.oferta && (
                                <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  {precioConOferta(item.producto.precio_venta, item.oferta, item.cantidad).desc}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              Lote: <span className="font-mono">{item.lote.codigo_lote}</span> · Max: {item.stockMax}
                              {item.oferta && <> · <span className="line-through">{formatoMoneda(item.producto.precio_venta)}</span></>}
                            </p>
                          </div>
                          <button onClick={() => quitarItem(item.producto.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 flex-shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="mt-2 space-y-1.5">
                          {/* Fila 1: cantidad + subtotal */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setCantidadItem(item.producto.id, item.cantidad - 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Minus className="w-3.5 h-3.5" /></button>
                              <input
                                type="text" inputMode="numeric"
                                value={cantidadesInput[item.producto.id] ?? String(item.cantidad)}
                                onFocus={e => {
                                  setCantidadesInput(p => ({ ...p, [item.producto.id]: String(item.cantidad) }))
                                  e.target.select()
                                }}
                                onChange={e => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '')
                                  setCantidadesInput(p => ({ ...p, [item.producto.id]: raw }))
                                  const num = parseInt(raw)
                                  if (num > 0) setCantidadItem(item.producto.id, num)
                                }}
                                onBlur={() => {
                                  const num = parseInt(cantidadesInput[item.producto.id]) || 1
                                  setCantidadItem(item.producto.id, num)
                                  setCantidadesInput(p => { const n = {...p}; delete n[item.producto.id]; return n })
                                }}
                                className="w-12 h-8 text-center text-sm font-bold border border-slate-200 rounded-lg" />
                              <button onClick={() => setCantidadItem(item.producto.id, item.cantidad + 1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"><Plus className="w-3.5 h-3.5" /></button>
                            </div>
                            <p className="text-sm font-bold text-slate-900 tabular-nums">{formatoMoneda(subtotal)}</p>
                          </div>
                          {/* Fila 2: precio editable + toggle mayoreo (oculto para cajero) */}
                          {(esAdmin || (!esCajero && Number(item.producto.precio_mayoreo) > 0)) && (
                            <div className="flex items-center justify-end gap-2">
                              {!esCajero && Number(item.producto.precio_mayoreo) > 0 && (
                                <button onClick={() => {
                                  const activar = !esMayoreo
                                  setModosMayoreo(m => ({ ...m, [item.producto.id]: activar }))
                                  setPrecioItem(item.producto.id, activar
                                    ? String(item.producto.precio_mayoreo)
                                    : String(item.producto.precio_venta))
                                }} className={cn('text-[10px] font-bold px-2 py-1 rounded-lg border transition-all',
                                  esMayoreo
                                    ? 'bg-purple-100 border-purple-300 text-purple-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-purple-200 hover:text-purple-600')}>
                                  {esMayoreo ? `MAY ${formatoMoneda(item.producto.precio_mayoreo)}` : 'MEN'}
                                </button>
                              )}
                              {esAdmin && (
                                <input type="text" inputMode="decimal"
                                  value={precios[item.producto.id] ?? String(item.precio)}
                                  onChange={e => setPrecioItem(item.producto.id, e.target.value)}
                                  className={cn('w-24 h-8 text-right text-sm font-bold border rounded-lg px-2',
                                    bajoCosto ? 'border-red-300 bg-red-50' : esMayoreo ? 'border-purple-200 bg-purple-50' : 'border-slate-200')} />
                              )}
                              {!esAdmin && (
                                <span className={cn('text-sm font-bold tabular-nums',
                                  esMayoreo ? 'text-purple-700' : 'text-slate-600')}>
                                  {formatoMoneda(parseFloat(precios[item.producto.id] ?? item.precio) || 0)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Hint de mayoreo */}
                        {(() => {
                          const pm = Number(item.producto.precio_mayoreo) || 0
                          const cm = Number(item.producto.cantidad_mayoreo) || 0
                          if (esMayoreo) return null
                          if (pm > 0 && cm > 0 && item.cantidad < cm) {
                            const faltan = cm - item.cantidad
                            return (
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 font-medium">
                                <span className="w-3 h-3 inline-flex items-center justify-center rounded-full bg-purple-100 font-bold text-[8px] text-purple-700 flex-shrink-0">M</span>
                                {faltan === 1
                                  ? `1 más para precio mayoreo (${formatoMoneda(pm)})`
                                  : `Desde ${cm} uds → mayoreo ${formatoMoneda(pm)} · faltan ${faltan}`}
                              </div>
                            )
                          }
                          if (pm > 0 && cm === 0) {
                            return (
                              <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-600 font-medium">
                                <span className="w-3 h-3 inline-flex items-center justify-center rounded-full bg-purple-100 font-bold text-[8px] text-purple-700 flex-shrink-0">M</span>
                                Precio mayoreo disponible: {formatoMoneda(pm)}
                              </div>
                            )
                          }
                          if (pm === 0 && esAdmin) {
                            return (
                              <div className="mt-1 text-[10px] text-slate-400">
                                Sin precio mayoreo · configúralo en Productos → Editar
                              </div>
                            )
                          }
                          return null
                        })()}

                        {bajoCosto && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-red-700 font-semibold">
                            <AlertTriangle className="w-3 h-3" /> Precio menor al costo ({formatoMoneda(item.producto.precio_compra)})
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Columna derecha: resumen + cobro */}
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">

              {/* Total destacado */}
              <div className="bg-primary-600 rounded-2xl px-4 py-4 text-center">
                <p className="text-xs font-semibold text-primary-200 uppercase tracking-wider mb-1">Total a cobrar</p>
                <p className="text-4xl font-bold text-white tabular-nums">{formatoMoneda(total)}</p>
                {carrito.length > 0 && (
                  <p className="text-xs text-primary-200 mt-1">{carrito.length} producto{carrito.length !== 1 ? 's' : ''} · {sucursalActual?.nombre}</p>
                )}
              </div>

              {/* Método de pago */}
              {!esCuentaPendiente && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setMetodoPago('efectivo'); setMontoRecibido('') }}
                    className={cn('flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                      metodoPago === 'efectivo' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    )}
                  >
                    <DollarSign className="w-4 h-4" /> Efectivo
                  </button>
                  <button
                    onClick={() => { setMetodoPago('tarjeta'); setMontoRecibido('') }}
                    className={cn('flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                      metodoPago === 'tarjeta' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    )}
                  >
                    <CreditCard className="w-4 h-4" /> Tarjeta
                  </button>
                </div>
              )}

              {/* Monto recibido — solo efectivo */}
              {!esCuentaPendiente && metodoPago === 'efectivo' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Monto recibido</label>
                  <input
                    type="text" inputMode="decimal" value={montoRecibido}
                    onChange={e => { if (/^(\d*\.?\d*)?$/.test(e.target.value)) setMontoRecibido(e.target.value) }}
                    placeholder="0.00"
                    className="w-full h-12 rounded-xl border border-slate-200 px-3 text-right text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  />
                  {/* Botones rápidos */}
                  <div className="grid grid-cols-5 gap-1.5">
                    <button
                      onClick={() => setMontoRecibido(String(total.toFixed(2)))}
                      className="col-span-2 py-2 rounded-xl text-xs font-bold bg-primary-50 text-primary-700 border border-primary-200 hover:bg-primary-100 transition-colors"
                    >
                      Exacto
                    </button>
                    {[50, 100, 200, 500].map(m => (
                      <button key={m} onClick={() => setMontoRecibido(String(m))}
                        className="py-2 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors">
                        ${m}
                      </button>
                    ))}
                  </div>
                  {/* Cambio / Falta */}
                  {Number(montoRecibido) > 0 && (
                    <div className={cn('rounded-xl px-4 py-3 flex items-center justify-between border',
                      Number(montoRecibido) >= total ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200')}>
                      <span className={cn('text-sm font-bold', Number(montoRecibido) >= total ? 'text-emerald-800' : 'text-red-800')}>
                        {Number(montoRecibido) >= total ? 'Cambio' : 'Falta'}
                      </span>
                      <span className={cn('text-2xl font-bold tabular-nums', Number(montoRecibido) >= total ? 'text-emerald-700' : 'text-red-700')}>
                        {formatoMoneda(Number(montoRecibido) >= total ? cambio : falta)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Cuenta pendiente — solo admin/encargado */}
              {!esCajero && <div className={cn('rounded-2xl border p-3', esCuentaPendiente ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Cuenta pendiente</p>
                    <p className="text-xs text-slate-500">El cliente paga después</p>
                  </div>
                  <button onClick={() => { setEsCuentaPendiente(v => !v); setClienteNombre('') }}
                    style={{
                      position: 'relative', width: 44, height: 24,
                      borderRadius: 9999, border: 'none', cursor: 'pointer',
                      backgroundColor: esCuentaPendiente ? '#f59e0b' : '#cbd5e1',
                      transition: 'background-color 0.2s', flexShrink: 0,
                    }}>
                    <span style={{
                      position: 'absolute',
                      top: 4, left: esCuentaPendiente ? 24 : 4,
                      width: 16, height: 16,
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
                {esCuentaPendiente && (
                  <input value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} placeholder="Nombre del cliente *"
                    className="w-full h-10 mt-3 rounded-xl border border-amber-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30" />
                )}
              </div>}

              {Object.values(warnings).some(Boolean) && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-xs text-red-800 font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Hay productos con precio menor al costo
                </div>
              )}

              <Button onClick={confirmarVenta} className="w-full" tamano="lg"
                disabled={carrito.length === 0 || procesando || (esCuentaPendiente && !clienteNombre.trim())}
                cargando={procesando}
                iconoIzq={<Check className="w-5 h-5" />}>
                Confirmar venta
              </Button>
            </div>

            {/* Mini resumen */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                {resumenSoloTurno ? 'Resumen de tu turno' : 'Resumen del día'}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xl font-bold text-primary-700 tabular-nums">{formatoMoneda(totalHoy)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Ventas</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xl font-bold text-emerald-700 tabular-nums">{ticketsHoy}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Tickets</p>
                </div>
              </div>
              {/* El cajero no puede fiar ni cobrar abonos: ese dato no le sirve
                  y le llegaba de ventas ajenas. En el corte sí lo ve, porque ahí
                  explica por qué el efectivo esperado es menor. */}
              {!esCajero && creditoHoy > 0 && (
                <p className="text-xs font-semibold text-amber-600 mt-2">
                  Por cobrar: {formatoMoneda(creditoHoy)} — no entra a caja
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB HISTORIAL ══ */}
      {tab === 'historial' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-primary-600" />
              <span className="text-sm font-bold text-slate-900">Ventas del turno</span>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{ventasTurno.length} tickets</span>
          </div>
          {ventasTurno.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">Sin ventas en este turno</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {ventasTurno.map(v => {
                const items = detallesHoy.filter(d => d.venta_id === v.id)
                const numProds = items.reduce((a, i) => a + i.cantidad, 0)
                const cuentaPendiente = cuentasHoy.find(c => c.venta_id === v.id)
                return (
                  <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-xs text-slate-400 w-12 flex-shrink-0 tabular-nums">{formatoHora(v.creado_en)}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-slate-900 font-mono">{generarFolio(v.id, sucursalActual?.nombre)}</p>
                          {/* Una vez liquidada deja de estar pendiente: el badge
                              tiene que seguir el estado real de la cuenta */}
                          {cuentaPendiente && (
                            cuentaPendiente.pagada ? (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Liquidada</span>
                            ) : (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>
                            )
                          )}
                          {v.metodo_pago === 'tarjeta' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-0.5">
                              <CreditCard className="w-2.5 h-2.5" /> Tarjeta
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">{numProds} unidad{numProds !== 1 ? 'es' : ''}{cuentaPendiente ? ` · ${cuentaPendiente.nombre_cliente}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary-700 tabular-nums">{formatoMoneda(v.total)}</span>
                      <button onClick={() => setModalTicket(v)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><Eye className="w-4 h-4" /></button>
                      <button onClick={() => imprimirTicket(v)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"><Printer className="w-4 h-4" /></button>
                      <button onClick={() => setModalCancelar(v)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50"><Ban className="w-4 h-4" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB CORTE ══ */}
      {tab === 'corte' && (() => {
        const ef       = ventasTurno.filter(esEfectivoEnCaja)
        const tar      = ventasTurno.filter(v => v.metodo_pago === 'tarjeta')
        const totalEf  = ef.reduce((s, v) => s + Number(v.total || 0), 0)
        const totalTar = tar.reduce((s, v) => s + Number(v.total || 0), 0)
        const entradas = movimientosTurno.filter(m => m.tipo === 'entrada')
        const salidas  = movimientosTurno.filter(m => m.tipo === 'salida')
        const totalEnt = entradas.reduce((s, m) => s + Number(m.monto || 0), 0)
        const totalSal = salidas.reduce((s, m) => s + Number(m.monto || 0), 0)
        const apertura = Number(turnoActual?.monto_apertura || 0)
        const esperado = apertura + totalEf + totalEnt - totalSal
        const ventasFiadas  = ventasTurno.filter(v => idsCredito.has(v.id))
        const creditoTurno  = ventasFiadas.reduce((s, v) => s + Number(v.total || 0), 0)
        // Lo que el cliente ya pagó (al dueño, no al cajón) se descuenta del aviso
        const creditoCobrado = ventasFiadas.reduce(
          (s, v) => s + Number(cuentaPorVenta.get(v.id)?.abonado || 0), 0)
        const creditoPendiente = Math.max(0, creditoTurno - creditoCobrado)
        const diasTurno = turnoActual?.fecha_apertura
          ? Math.ceil((Date.now() - new Date(turnoActual.fecha_apertura).getTime()) / 86400000)
          : 0
        return (
        <div className="space-y-4">

          {/* Aviso turno multi-día */}
          {diasTurno > 1 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs font-semibold text-amber-800">
                Este turno lleva <strong>{diasTurno} días</strong> abierto. Se muestran todas las ventas del turno completo.
              </p>
            </div>
          )}

          {/* ── Resumen de caja ── */}
          <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-900">Corte de turno</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {sucursalActual?.nombre}
                  {turnoActual?.perfiles?.nombre && ` · ${turnoActual.perfiles.nombre}`}
                  {' · Apertura: '}{formatoHora(turnoActual?.fecha_apertura)}
                </p>
              </div>
              <button onClick={imprimirCorte}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Imprimir
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {/* Apertura */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-4 h-4 text-slate-500" />
                  </div>
                  <span className="text-sm text-slate-600">Monto inicial (apertura)</span>
                </div>
                <span className="text-sm font-semibold text-slate-700 tabular-nums">{formatoMoneda(apertura)}</span>
              </div>

              {/* Ventas efectivo */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-sm text-slate-700">Ventas en efectivo</span>
                    <span className="text-xs text-slate-400 ml-1.5">{ef.length} ticket{ef.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-emerald-700 tabular-nums">+{formatoMoneda(totalEf)}</span>
              </div>

              {/* Ventas tarjeta */}
              <div className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-sky-600" />
                  </div>
                  <div>
                    <span className="text-sm text-slate-700">Ventas con tarjeta</span>
                    <span className="text-xs text-slate-400 ml-1.5">{tar.length} ticket{tar.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-sky-700 tabular-nums">+{formatoMoneda(totalTar)}</span>
              </div>

              {/* Ventas fiadas: se listan para que cuadre con el historial, pero
                  no suman al esperado porque ese dinero no llegó al cajón */}
              {creditoTurno > 0 && (
                <div className="flex items-center justify-between px-5 py-3 bg-amber-50/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <span className="text-sm text-amber-800 font-medium">Ventas a crédito</span>
                      <p className="text-xs text-amber-600">
                        No entra a caja
                        {creditoCobrado > 0 && creditoPendiente === 0
                          ? ' — ya liquidada, se cobró fuera del cajón'
                          : creditoCobrado > 0
                            ? ` — ${formatoMoneda(creditoCobrado)} ya abonados, quedan ${formatoMoneda(creditoPendiente)}`
                            : ' — el cliente paga después'}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-amber-700 tabular-nums">{formatoMoneda(creditoTurno)}</span>
                </div>
              )}

              {/* Entradas manuales — solo si existen */}
              {totalEnt > 0 && (
                <div className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-4 h-4 text-violet-600" />
                    </div>
                    <span className="text-sm text-slate-700">Entradas manuales</span>
                  </div>
                  <span className="text-sm font-semibold text-violet-700 tabular-nums">+{formatoMoneda(totalEnt)}</span>
                </div>
              )}

              {/* Salidas manuales — solo si existen */}
              {totalSal > 0 && (
                <div className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Receipt className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="text-sm text-slate-700">Salidas manuales</span>
                  </div>
                  <span className="text-sm font-semibold text-red-600 tabular-nums">-{formatoMoneda(totalSal)}</span>
                </div>
              )}
            </div>

            {/* Efectivo esperado */}
            <div className="bg-primary-600 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-primary-200 uppercase tracking-wider">Efectivo esperado en caja</p>
                <p className="text-2xl font-bold text-white tabular-nums mt-0.5">{formatoMoneda(esperado)}</p>
              </div>
              <DollarSign className="w-7 h-7 text-primary-300" />
            </div>
          </div>

          {/* ── Entradas manuales — solo si existen ── */}
          {entradas.length > 0 && (
            <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                <div className="w-7 h-7 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <p className="text-sm font-bold text-slate-900">Entradas manuales</p>
              </div>
              <div className="divide-y divide-slate-100">
                {entradas.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
                    <p className="text-sm text-slate-700 truncate flex-1">{m.descripcion || '—'}</p>
                    <p className="text-sm font-semibold text-violet-700 tabular-nums flex-shrink-0">
                      +{formatoMoneda(m.monto)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Salidas manuales — solo si existen ── */}
          {salidas.length > 0 && (
            <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
                <div className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-3.5 h-3.5 text-red-500" />
                </div>
                <p className="text-sm font-bold text-slate-900">Salidas manuales</p>
              </div>
              <div className="divide-y divide-slate-100">
                {salidas.map((m, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
                    <p className="text-sm text-slate-700 truncate flex-1">{m.descripcion || '—'}</p>
                    <p className="text-sm font-semibold text-red-600 tabular-nums flex-shrink-0">
                      -{formatoMoneda(m.monto)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Acciones del turno ── */}
          {(
            <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
                <div className="p-4">
                  <Button variante="peligro" onClick={prepararCierre} cargando={cargandoResumen} className="w-full">
                    <LogOut className="w-4 h-4 mr-1.5" />
                    Cerrar turno
                  </Button>
                </div>

            </div>
          )}
        </div>
      )
      })()}

      {/* Modales */}
      {modalTicket && <ModalVerTicket venta={modalTicket} detalles={detallesHoy} productos={productos} sucursalNombre={sucursalActual?.nombre} onCerrar={() => setModalTicket(null)} />}
      {modalCancelar && <ModalCancelar venta={modalCancelar} sucursalNombre={sucursalActual?.nombre} onCerrar={() => setModalCancelar(null)} onExito={fetchData} />}
      {modalCierre && resumenTurno && (
        <ModalCierreTurno
          turnoActual={turnoActual}
          resumenTurno={resumenTurno}
          sucursalNombre={sucursalActual?.nombre ?? ''}
          onImprimir={imprimirCorte}
          onClose={() => { setModalCierre(false); setResumenTurno(null) }}
          onCerrado={() => {
            setModalCierre(false); setResumenTurno(null); setTab('caja')
            setTurnoActual(null); setVentasTurno([])
            if (esRotativo) {
              resetSucursal()
            }
            recargarTurno()
          }}
        />
      )}
    </div>
  )
}
