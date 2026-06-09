import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Wallet, Plus, X, Clock, DollarSign, Store,
  LogOut, RefreshCw, AlertTriangle, ArrowDownLeft,
  ArrowUpRight, TrendingUp, TrendingDown, Minus, Check,
  User, ChevronDown, CreditCard, Banknote, Printer,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { log as logBitacora } from '@/lib/bitacora'
import { registrarAsistencia } from '@/lib/asistencia'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, formatoHora, formatoFechaHora, fechaEnZona } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/clases'

// ─── Impresión: Electron IPC o web fallback ──────────────────────────────────
async function abrirImpresion(html) {
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
      description: 'No se pudo conectar con la impresora. Verifica que esté encendida y con papel.',
      duration: 8000,
    })
    return false
  }
}

// ─── Modal entrada / salida manual ──────────────────────────────────────────
function ModalEntradaSalida({ tipo, turno, onCerrar, onExito }) {
  const { perfil } = useApp()
  const [concepto, setConcepto]   = useState('')
  const [monto,    setMonto]      = useState('')
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const esEntrada = tipo === 'entrada'
  const montoNum  = parseFloat(monto) || 0

  async function guardar() {
    if (!concepto.trim()) return toast.error('Escribe el concepto')
    if (montoNum <= 0)    return toast.error('El monto debe ser mayor a cero')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { error } = await supabase.from('movimientos_caja').insert({
        turno_id:    turno.id,
        empresa_id:  turno.empresa_id,
        sucursal_id: turno.sucursal_id,
        tipo,
        descripcion: concepto.trim(),
        monto:       montoNum,
      })
      if (error) throw error

      await logBitacora({
        empresa_id:    turno.empresa_id,
        tipo:          esEntrada ? 'caja_entrada_manual' : 'caja_salida_manual',
        descripcion:   `${esEntrada ? 'Entrada' : 'Salida'} manual · ${concepto.trim()} · ${formatoMoneda(montoNum)}`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   turno.sucursal_id,
        referencia_id: String(turno.id),
      })

      toast.success(esEntrada ? 'Entrada registrada' : 'Salida registrada')
      onExito()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-9 h-9 rounded-2xl flex items-center justify-center',
              esEntrada ? 'bg-emerald-100' : 'bg-red-100'
            )}>
              {esEntrada
                ? <ArrowDownLeft className="w-5 h-5 text-emerald-600" strokeWidth={2.5} />
                : <ArrowUpRight  className="w-5 h-5 text-red-600"     strokeWidth={2.5} />
              }
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {esEntrada ? 'Registrar entrada' : 'Registrar salida'}
            </h3>
          </div>
          <button onClick={onCerrar} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Concepto *</label>
            <input
              type="text"
              value={concepto}
              onChange={e => setConcepto(e.target.value)}
              placeholder={esEntrada ? 'Ej: Cambio de billetes' : 'Ej: Compra de gasas, pago de limpieza...'}
              autoFocus
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">Monto *</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
              <input
                type="number" min="0.01" step="0.01"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                placeholder="0.00"
                onKeyDown={e => { if (e.key === 'Enter') guardar() }}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
              />
            </div>
            {/* Botones rápidos */}
            <div className="flex gap-2">
              {[50, 100, 200, 500].map(v => (
                <button key={v} onClick={() => setMonto(String(v))}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                  ${v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onCerrar}>Cancelar</Button>
          <button
            onClick={guardar}
            disabled={guardando || montoNum <= 0}
            className={cn(
              'flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-60',
              esEntrada ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            )}
          >
            {guardando ? '...' : esEntrada ? 'Registrar entrada' : 'Registrar salida'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal cerrar turno ──────────────────────────────────────────────────────
function ModalCerrarTurno({ turno, sucursalNombre, resumen, onCerrar, onExito }) {
  const { empresa } = useApp()
  const [montoContado, setMontoContado] = useState('')
  const [nota,         setNota]         = useState('')
  const [cargando,     setCargando]     = useState(false)
  const [resultado,    setResultado]    = useState(null)

  const efectivoEsperado = resumen?.esperado ?? 0

  function imprimirCorte() {
    if (!resultado) return
    const fm = n => '$' + Number(n || 0).toFixed(2)
    const fh = s => new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
    const fd = s => new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    const aperturaDt = turno?.fecha_apertura ? new Date(turno.fecha_apertura) : new Date()
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{size:80mm auto;margin:0}
      *{margin:0;padding:0;box-sizing:border-box}
      html,body{height:auto}
      body{font-family:'Courier New',monospace;font-size:11px;width:80mm;padding:8px}
      h2{text-align:center;font-size:13px;margin-bottom:2px}
      .sub{text-align:center;font-size:10px;color:#555;margin-bottom:2px}
      .fecha{text-align:center;font-size:10px;color:#555;margin-bottom:6px}
      hr{border:none;border-top:1px dashed #000;margin:5px 0}
      .fila{display:flex;justify-content:space-between;font-size:11px;padding:2px 0}
      .bold{font-weight:bold}.total-box{margin-top:6px;padding:5px;border:1px solid #000;display:flex;justify-content:space-between}
      .sec{font-size:10px;font-weight:bold;text-transform:uppercase;margin:6px 0 2px}
      .neg{color:#cc0000}
    </style></head><body>
      <h2>${empresa?.nombre || 'FARMACIA'}</h2>
      <div class="sub">${sucursalNombre || ''}</div>
      <div class="fecha">Apertura: ${fd(aperturaDt)} ${fh(aperturaDt)}<br>Corte: ${fd(new Date())} ${fh(new Date())}</div>
      ${turno?.perfiles?.nombre ? `<div class="sub">Operador: ${turno.perfiles.nombre}</div>` : ''}
      <hr>
      <p class="sec">Resumen de caja</p>
      <div class="fila"><span>Fondo inicial</span><span>${fm(resultado.apertura)}</span></div>
      <div class="fila"><span>Ventas</span><span>+${fm(resultado.ventas)}</span></div>
      ${Number(resultado.entradas) > 0 ? `<div class="fila"><span>Entradas manuales</span><span>+${fm(resultado.entradas)}</span></div>` : ''}
      ${Number(resultado.salidas)  > 0 ? `<div class="fila neg"><span>Salidas / Gastos</span><span>-${fm(resultado.salidas)}</span></div>` : ''}
      <div class="total-box bold"><span>Efectivo esperado</span><span>${fm(resultado.esperado)}</span></div>
      <hr>
      <div class="fila"><span>Contado físicamente</span><span>${fm(resultado.contado)}</span></div>
      <div class="fila bold ${Number(resultado.diferencia) < 0 ? 'neg' : ''}">
        <span>${Number(resultado.diferencia) === 0 ? 'Cuadre perfecto' : Number(resultado.diferencia) > 0 ? 'Sobrante' : 'Faltante'}</span>
        <span>${Number(resultado.diferencia) > 0 ? '+' : ''}${fm(resultado.diferencia)}</span>
      </div>
      ${resultado.nota ? `<hr><div class="sub" style="font-style:italic">Nota: ${resultado.nota}</div>` : ''}
      <hr><div style="text-align:center;font-size:10px;color:#555;margin-top:6px">Firma: _________________</div>
    </body></html>`
    abrirImpresion(html)
  }

  async function cerrar() {
    const contado = Number(montoContado)
    if (isNaN(contado) || contado < 0) { toast.error('Ingresa el monto contado'); return }
    setCargando(true)
    try {
      const { data, error } = await supabase.rpc('cerrar_turno_caja', {
        p_turno_id:      turno.id,
        p_monto_contado: contado,
        p_nota:          nota.trim() || null,
      })
      if (error) throw error
      await logBitacora({
        empresa_id:    turno.empresa_id,
        tipo:          'caja_cierre',
        descripcion:   `Cierre de caja en ${sucursalNombre} · contado $${contado.toFixed(2)}`,
        usuario_id:    turno.usuario_id ?? null,
        sucursal_id:   turno.sucursal_id,
        referencia_id: String(turno.id),
      })
      setResultado(data)
    } catch (err) {
      toast.error(err.message || 'Error al cerrar turno')
    } finally {
      setCargando(false)
    }
  }

  function finalizar() { onExito?.(); onCerrar() }

  if (!turno) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !resultado && onCerrar()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

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
          <button onClick={() => resultado ? finalizar() : onCerrar()}
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
                  <span className="font-medium text-slate-900">{formatoFechaHora(turno.fecha_apertura)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Fondo inicial</span>
                  <span className="font-bold text-slate-900">{formatoMoneda(turno.monto_apertura)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Operador</span>
                  <span className="font-medium text-slate-900">{turno.perfiles?.nombre || '—'}</span>
                </div>
              </div>

              {/* Desglose de ventas */}
              {resumen && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resumen del turno</p>

                  {/* Ventas por método */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                        <p className="text-[10px] font-bold text-emerald-700 uppercase">Efectivo</p>
                      </div>
                      <p className="text-base font-bold text-emerald-800 tabular-nums">
                        {formatoMoneda(resumen.ventasEfectivo)}
                      </p>
                    </div>
                    <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <CreditCard className="w-3.5 h-3.5 text-sky-600" />
                        <p className="text-[10px] font-bold text-sky-700 uppercase">Tarjeta</p>
                      </div>
                      <p className="text-base font-bold text-sky-800 tabular-nums">
                        {formatoMoneda(resumen.ventasTarjeta)}
                      </p>
                    </div>
                  </div>

                  {/* Movimientos adicionales */}
                  {(resumen.entradas > 0 || resumen.salidas > 0) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 flex flex-col gap-1.5">
                      {resumen.entradas > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" /> Entradas manuales
                          </span>
                          <span className="font-semibold text-emerald-700">+{formatoMoneda(resumen.entradas)}</span>
                        </div>
                      )}
                      {resumen.salidas > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <ArrowUpRight className="w-3.5 h-3.5 text-red-500" /> Salidas / Gastos
                          </span>
                          <span className="font-semibold text-red-600">-{formatoMoneda(resumen.salidas)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Efectivo esperado — el número importante */}
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
                <label className="text-sm font-semibold text-slate-700">
                  ¿Cuánto dinero hay en caja? *
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={montoContado}
                    onChange={e => setMontoContado(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full pl-8 pr-4 py-3.5 text-lg font-bold bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
                  />
                </div>
                <p className="text-xs text-slate-400">Cuenta todo el efectivo físico (no tarjeta).</p>

                {/* Vista previa diferencia */}
                {montoContado !== '' && (
                  <div className={cn(
                    'rounded-2xl p-3 text-center border',
                    Number(montoContado) - efectivoEsperado === 0 ? 'bg-emerald-50 border-emerald-200' :
                    Number(montoContado) - efectivoEsperado > 0  ? 'bg-sky-50 border-sky-200' :
                                                                    'bg-red-50 border-red-200'
                  )}>
                    {(() => {
                      const diff = Number(montoContado) - efectivoEsperado
                      const esOk  = diff === 0
                      const esSob = diff > 0
                      return (
                        <>
                          <p className={cn(
                            'text-xs font-bold uppercase tracking-wider mb-0.5',
                            esOk ? 'text-emerald-700' : esSob ? 'text-sky-700' : 'text-red-700'
                          )}>
                            {esOk ? '¡Cuadre perfecto!' : esSob ? 'Sobrante' : 'Faltante'}
                          </p>
                          <p className={cn(
                            'text-xl font-bold tabular-nums',
                            esOk ? 'text-emerald-600' : esSob ? 'text-sky-600' : 'text-red-600'
                          )}>
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
                  { label: 'Fondo inicial',   valor: resultado.apertura,  Icono: Wallet,       color: 'text-slate-700' },
                  { label: 'Ventas',          valor: resultado.ventas,    Icono: TrendingUp,   color: 'text-emerald-700', signo: '+' },
                  { label: 'Entradas',        valor: resultado.entradas,  Icono: ArrowDownLeft,color: 'text-emerald-700', signo: '+' },
                  { label: 'Salidas',         valor: resultado.salidas,   Icono: ArrowUpRight, color: 'text-red-700',     signo: '-' },
                  { label: 'Gastos',          valor: resultado.gastos,    Icono: TrendingDown, color: 'text-red-700',     signo: '-' },
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
                resultado.diferencia  > 0  ? 'bg-sky-50 border-sky-200' :
                                             'bg-red-50 border-red-200'
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
              <Button variante="secundario" onClick={onCerrar} className="flex-1">Cancelar</Button>
              <Button variante="peligro" onClick={cerrar} cargando={cargando} className="flex-1">
                <LogOut className="w-4 h-4 mr-1.5" />
                Cerrar turno
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              <button
                onClick={imprimirCorte}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Printer className="w-4 h-4 text-slate-500" />
                Imprimir corte
              </button>
              <Button onClick={finalizar} className="w-full bg-primary-600 hover:bg-primary-700 text-white">
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

// ─── Tarjeta de sucursal ─────────────────────────────────────────────────────
// resumen y movimientos vienen del padre (CajaPage.cargar) para que el refresh
// del header o cualquier cambio externo (gastos, ventas) los refleje siempre.
function TarjetaSucursal({ sucursal, turno, esMiTurno, estaEnLinea = false, puedeAbrir = true, resumen, movimientos, onAbrir, onCerrar, onActualizar, sinCabezal = false }) {
  const { perfil, empresa, tz } = useApp()
  const [monto,       setMonto]      = useState('')
  const [abriendo,    setAbriendo]   = useState(false)
  const [mostrarForm, setMostrarForm]= useState(false)
  const [verMovs,     setVerMovs]    = useState(false)
  const [modalEntSal, setModalEntSal]= useState(null) // 'entrada' | 'salida'

  async function abrirTurno() {
    const montoNum = Number(monto) || 0
    if (montoNum < 0) { toast.error('El monto no puede ser negativo'); return }
    setAbriendo(true)
    try {
      await supabase.rpc('abrir_turno_caja', {
        p_sucursal_id:   sucursal.id,
        p_monto_apertura: montoNum,
      })
    } catch { /* verificamos después */ }

    // Filtrar por usuario_id: puede haber varios turnos abiertos en la misma sucursal
    const { data: t } = await supabase
      .from('turnos_caja').select('id')
      .eq('sucursal_id', sucursal.id)
      .eq('usuario_id', perfil?.id)
      .eq('estado', 'abierto')
      .maybeSingle()

    if (t) {
      await logBitacora({
        empresa_id:    sucursal.empresa_id,
        tipo:          'caja_apertura',
        descripcion:   `Apertura de caja en ${sucursal.nombre} · $${montoNum.toFixed(2)}`,
        sucursal_id:   sucursal.id,
        referencia_id: String(t.id),
      })
      toast.success(`Turno abierto en ${sucursal.nombre}`)
      setMostrarForm(false); setMonto('')
      // Auto-registrar asistencia en programacion
      if (perfil?.id && empresa?.id) {
        registrarAsistencia({
          perfilId:   perfil.id,
          empresaId:  empresa.id,
          sucursalId: sucursal.id,
          tz,
        }).catch(() => { /* silencioso */ })
      }
    } else {
      toast.error('No se pudo abrir el turno')
    }
    setAbriendo(false); onAbrir?.()
  }

  // ── Turno abierto ────────────────────────────────────────────────────────────
  if (turno) {
    const totalVentas = (resumen?.ventasEfectivo ?? 0) + (resumen?.ventasTarjeta ?? 0)

    return (
      <>
        <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden border-l-4 border-l-emerald-500 shadow-sm">
          {/* Cabecera */}
          <div className="p-4 pb-3">
            {sinCabezal ? (
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {esMiTurno ? 'Mi turno' : (turno.perfiles?.nombre || 'Empleado')}
                  </p>
                  <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                    Activo desde {formatoHora(turno.fecha_apertura)}
                  </p>
                </div>
                {turno.usuario_id && (
                  <div className={cn(
                    'flex items-center gap-1.5 rounded-xl px-2.5 py-1',
                    estaEnLinea ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-100 border border-slate-200'
                  )}>
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', estaEnLinea ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
                    <p className={cn('text-[11px] font-bold', estaEnLinea ? 'text-emerald-700' : 'text-slate-500')}>
                      {estaEnLinea ? 'Activo' : 'Ausente'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Store className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{sucursal.nombre}</p>
                    <p className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
                      Turno activo desde {formatoHora(turno.fecha_apertura)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {!esMiTurno && turno.perfiles?.nombre && (
                    <p className="text-xs text-slate-500 font-medium">{turno.perfiles.nombre}</p>
                  )}
                  {turno.usuario_id && (
                    <div className={cn(
                      'flex items-center gap-1.5 rounded-xl px-2.5 py-1',
                      estaEnLinea ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-100 border border-slate-200'
                    )}>
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', estaEnLinea ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
                      <p className={cn('text-[11px] font-bold', estaEnLinea ? 'text-emerald-700' : 'text-slate-500')}>
                        {estaEnLinea ? 'Activo' : 'Ausente'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Resumen en vivo */}
            {resumen && (
              <div className="flex flex-col gap-2 mb-3">
                {/* Efectivo esperado — protagonista */}
                <div className="bg-gradient-to-r from-primary-600 to-primary-500 rounded-2xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-primary-100 uppercase tracking-wider">Efectivo esperado</p>
                    <p className="text-2xl font-bold text-white tabular-nums mt-0.5">
                      {formatoMoneda(resumen.esperado)}
                    </p>
                    <p className="text-[10px] text-primary-200 mt-0.5">
                      Fondo {formatoMoneda(turno.monto_apertura)} + ventas + movimientos
                    </p>
                  </div>
                  <Wallet className="w-8 h-8 text-primary-300 flex-shrink-0" />
                </div>

                {/* Grid ventas */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Banknote className="w-3 h-3 text-emerald-600" />
                      <p className="text-[10px] font-bold text-emerald-700 uppercase">Efectivo</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-800 tabular-nums">
                      {formatoMoneda(resumen.ventasEfectivo)}
                    </p>
                  </div>
                  <div className="bg-sky-50 border border-sky-200 rounded-2xl p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <CreditCard className="w-3 h-3 text-sky-600" />
                      <p className="text-[10px] font-bold text-sky-700 uppercase">Tarjeta</p>
                    </div>
                    <p className="text-sm font-bold text-sky-800 tabular-nums">
                      {formatoMoneda(resumen.ventasTarjeta)}
                    </p>
                  </div>
                </div>

                {/* Entradas / Salidas si las hay */}
                {(resumen.entradas > 0 || resumen.salidas > 0) && (
                  <div className="grid grid-cols-2 gap-2">
                    {resumen.entradas > 0 && (
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400">Entradas</p>
                          <p className="text-xs font-bold text-emerald-700">+{formatoMoneda(resumen.entradas)}</p>
                        </div>
                      </div>
                    )}
                    {resumen.salidas > 0 && (
                      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                        <ArrowUpRight className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] text-slate-400">Salidas</p>
                          <p className="text-xs font-bold text-red-600">-{formatoMoneda(resumen.salidas)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Botones de acción */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setModalEntSal('entrada')}
                className="flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all"
              >
                <ArrowDownLeft className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">Entrada</span>
              </button>
              <button
                onClick={() => setModalEntSal('salida')}
                className="flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 active:scale-95 transition-all"
              >
                <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
                <span className="text-[10px] font-bold">Salida</span>
              </button>
              {esMiTurno && onCerrar ? (
                <button
                  onClick={() => onCerrar(turno, resumen)}
                  className="flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
                >
                  <LogOut className="w-4 h-4" strokeWidth={2.5} />
                  <span className="text-[10px] font-bold">Cerrar</span>
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-2xl bg-slate-50 border border-slate-100"
                  title={`Turno abierto por ${turno?.perfiles?.nombre ?? 'otro empleado'}`}>
                  <User className="w-4 h-4 text-slate-300" />
                  <span className="text-[10px] text-slate-300 text-center leading-tight px-1">Otro<br/>empleado</span>
                </div>
              )}
            </div>
          </div>

          {/* Movimientos recientes — desplegable */}
          {movimientos.length > 0 && (
            <div className="border-t border-slate-100">
              <button
                onClick={() => setVerMovs(v => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <span>Movimientos del turno ({movimientos.length})</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', verMovs && 'rotate-180')} />
              </button>
              {verMovs && (
                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {movimientos.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                      {m.tipo === 'entrada'
                        ? <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        : <ArrowUpRight  className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      }
                      <span className="text-xs text-slate-600 flex-1 truncate">
                        {m.descripcion || '—'}
                      </span>
                      <span className={cn(
                        'text-xs font-bold tabular-nums flex-shrink-0',
                        m.tipo === 'entrada' ? 'text-emerald-700' : 'text-red-600'
                      )}>
                        {m.tipo === 'entrada' ? '+' : '-'}{formatoMoneda(m.monto)}
                      </span>
                      <span className="text-[10px] text-slate-300 flex-shrink-0">
                        {formatoHora(m.creado_en)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {modalEntSal && (
          <ModalEntradaSalida
            tipo={modalEntSal}
            turno={turno}
            onCerrar={() => setModalEntSal(null)}
            onExito={() => { setModalEntSal(null); onActualizar() }}
          />
        )}
      </>
    )
  }

  // ── Sin turno ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden border-l-4 border-l-slate-300 shadow-sm">
      <div className="p-4">
        {sinCabezal ? (
          <p className="text-xs font-semibold text-slate-500 mb-3">Abrir mi turno</p>
        ) : (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                <Store className="w-4 h-4 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">{sucursal.nombre}</p>
                <p className="text-xs text-slate-400">Sin turno abierto</p>
              </div>
            </div>
          </div>
        )}

        {!mostrarForm ? (
          puedeAbrir ? (
            <button
              onClick={() => setMostrarForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-primary-700 border border-primary-200 bg-primary-50 hover:bg-primary-100 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4" /> Abrir turno
            </button>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2">Abre el turno desde Ventas</p>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">$</span>
                <input
                  type="number" step="0.01" min="0"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="Fondo inicial (ej. 300)"
                  className="w-full h-11 pl-8 pr-3 rounded-2xl border border-slate-200 bg-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') abrirTurno() }}
                />
              </div>
              <Button onClick={abrirTurno} cargando={abriendo} tamano="sm" variante="primario">
                Abrir
              </Button>
              <button
                onClick={() => { setMostrarForm(false); setMonto('') }}
                className="w-11 h-11 rounded-2xl border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Efectivo disponible para dar cambio. Puede ser $0.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sección de sucursal (agrupación para vista admin) ───────────────────────
function SeccionSucursal({ sucursal, conteoTurnos, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
          <Store className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <span className="text-sm font-bold text-slate-700">{sucursal.nombre}</span>
        {conteoTurnos > 0 ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            {conteoTurnos} abierto{conteoTurnos > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Sin turnos</span>
        )}
      </div>
      <div className="flex flex-col gap-2 ml-2 pl-3 border-l-2 border-slate-100">
        {children}
      </div>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function CajaPage() {
  const { perfil, sucursales, sucursalActiva, recargarTurno, cambiarSucursal, tz, usuariosEnLinea, esRotativo, resetSucursal } = useApp()
  const esCajero    = perfil?.rol === 'cajero'
  const esEncargado = perfil?.rol === 'encargado'
  const sucActId    = sucursalActiva?.id ?? perfil?.sucursal_id ?? null

  // Memoizado para evitar que useCallback se re-ejecute en cada render
  const sucursalesVisibles = useMemo(() => {
    if (esCajero || esEncargado) {
      return sucActId ? sucursales.filter(s => s.id === sucActId) : []
    }
    return sucursales
  }, [esCajero, esEncargado, sucActId, sucursales])

  const location = useLocation()
  // turnosPorSucursal: { [sucursalId]: Turno[] }
  // Admin ve todos los turnos de la sucursal; cajero/encargado solo el suyo.
  const [turnosPorSucursal,  setTurnosPorSucursal]  = useState({})
  // resumenesPorTurno: { [turnoId]: { ventasEfectivo, ventasTarjeta, entradas, salidas, esperado, movimientos } }
  const [resumenesPorTurno,  setResumenesPorTurno]  = useState({})
  const [historial,          setHistorial]           = useState([])
  const [cargando,           setCargando]            = useState(true)
  const [modalCerrar,        setModalCerrar]         = useState(null)

  const cargar = useCallback(async () => {
    // Cajero/encargado sin sucursal aún confirmada: no hay nada que cargar
    if ((esCajero || esEncargado) && sucursalesVisibles.length === 0) {
      setCargando(false)
      return
    }
    setCargando(true)
    try {
      // ── Turnos abiertos ───────────────────────────────────────────────────────
      // Cajero/encargado: solo su propio turno en su sucursal.
      // Admin: TODOS los turnos abiertos en las sucursales visibles (puede haber
      //        varios empleados con turno simultáneo en la misma sucursal).
      let todosTurnos = []
      if (esCajero || esEncargado) {
        const { data } = await supabase
          .from('turnos_caja')
          .select('*, perfiles(nombre)')
          .eq('sucursal_id', sucActId)
          .eq('usuario_id', perfil?.id)
          .eq('estado', 'abierto')
          .maybeSingle()
        if (data) todosTurnos = [data]
      } else if (sucursalesVisibles.length > 0) {
        const { data } = await supabase
          .from('turnos_caja')
          .select('*, perfiles(nombre)')
          .in('sucursal_id', sucursalesVisibles.map(s => s.id))
          .eq('estado', 'abierto')
          .order('fecha_apertura', { ascending: true })
        todosTurnos = data || []
      }

      // Agrupar por sucursal_id para el render
      const abiertos = {}
      for (const t of todosTurnos) {
        if (!abiertos[t.sucursal_id]) abiertos[t.sucursal_id] = []
        abiertos[t.sucursal_id].push(t)
      }
      setTurnosPorSucursal(abiertos)

      // ── Resumen de cada turno abierto (ventas + movimientos) ─────────────────
      // Clave: turno.id (no sucursal_id) porque puede haber varios por sucursal
      const resumenes = {}
      for (const turno of todosTurnos) {
        const [{ data: ventas }, { data: movs }] = await Promise.all([
          supabase.from('ventas')
            .select('total, metodo_pago')
            .eq('turno_id', turno.id)
            .neq('estado', 'cancelada'),
          supabase.from('movimientos_caja')
            .select('tipo, descripcion, monto, creado_en')
            .eq('turno_id', turno.id)
            .order('creado_en', { ascending: false }),
        ])
        const ventasEfectivo = (ventas || [])
          .filter(v => !v.metodo_pago || v.metodo_pago === 'efectivo')
          .reduce((s, v) => s + Number(v.total || 0), 0)
        const ventasTarjeta = (ventas || [])
          .filter(v => v.metodo_pago === 'tarjeta')
          .reduce((s, v) => s + Number(v.total || 0), 0)
        const entradas = (movs || [])
          .filter(m => m.tipo === 'entrada')
          .reduce((s, m) => s + Number(m.monto || 0), 0)
        const salidas = (movs || [])
          .filter(m => m.tipo === 'salida')
          .reduce((s, m) => s + Number(m.monto || 0), 0)
        const esperado = Number(turno.monto_apertura || 0) + ventasEfectivo + entradas - salidas
        resumenes[turno.id] = {
          ventasEfectivo, ventasTarjeta, entradas, salidas, esperado,
          movimientos: movs || [],
        }
      }
      setResumenesPorTurno(resumenes)

      // ── Historial hoy (solo sucursales visibles) ──────────────────────────
      const hoy = fechaEnZona(tz)
      const sucIdsVisibles = sucursalesVisibles.map(s => s.id)
      let histQuery = supabase
        .from('turnos_caja')
        .select('*, perfiles(nombre), sucursales(nombre)')
        .eq('estado', 'cerrado')
        .gte('fecha_apertura', `${hoy}T00:00:00`)
        .order('fecha_cierre', { ascending: false })
        .limit(20)
      if (sucIdsVisibles.length > 0) {
        histQuery = histQuery.in('sucursal_id', sucIdsVisibles)
      }
      // Cajero/encargado: solo sus propios turnos cerrados
      if (esCajero || esEncargado) {
        histQuery = histQuery.eq('usuario_id', perfil?.id)
      }
      const { data: hist } = await histQuery
      setHistorial(hist || [])
    } catch (err) {
      console.error(err)
    } finally {
      setCargando(false)
    }
  }, [sucursalesVisibles, tz])  // recargarTurno excluido para evitar re-creación en loop

  // Carga inicial + cada vez que el usuario navega a esta ruta
  useEffect(() => { cargar() }, [cargar, location.key])

  // También recargar al volver a la pestaña del navegador
  useFocusRefresh(cargar, 3 * 60_000)

  const totalAbiertos = Object.values(turnosPorSucursal).reduce((s, arr) => s + arr.length, 0)

  // Para cajero sin sucursal visible (aún no ha abierto turno), aviso amigable
  if ((esCajero || esEncargado) && sucursalesVisibles.length === 0 && !cargando) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold text-slate-900">Mi caja</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center space-y-2">
          <Wallet className="w-10 h-10 text-amber-400 mx-auto" />
          <p className="text-sm font-semibold text-amber-800">Primero abre tu turno en Ventas</p>
          <p className="text-xs text-amber-600">Selecciona tu sucursal y abre el turno para ver los movimientos de caja.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
            {esCajero ? 'Mi caja' : 'Caja'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {esCajero
              ? (sucursalesVisibles[0]?.nombre ?? '—')
              : totalAbiertos > 0
                ? `${totalAbiertos} turno${totalAbiertos > 1 ? 's' : ''} abierto${totalAbiertos > 1 ? 's' : ''}`
                : 'Sin turnos abiertos'
            }
          </p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 transition-colors disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {/* Sucursales */}
      {cargando && sucursalesVisibles.length === 0 ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(esCajero || esEncargado)
            // ── Cajero / Encargado: solo su propio turno, tarjeta completa ──
            ? sucursalesVisibles.flatMap(s => {
                const turnos  = turnosPorSucursal[s.id] ?? []
                const miTurno = turnos[0] ?? null
                if (miTurno) {
                  const res = resumenesPorTurno[miTurno.id]
                  return [
                    <TarjetaSucursal
                      key={miTurno.id}
                      sucursal={s}
                      turno={miTurno}
                      esMiTurno
                      estaEnLinea={(usuariosEnLinea ?? new Set()).has(miTurno.usuario_id)}
                      puedeAbrir={false}
                      resumen={res}
                      movimientos={res?.movimientos ?? []}
                      onAbrir={cargar}
                      onActualizar={cargar}
                      onCerrar={(t) => setModalCerrar({ turno: t, sucursalNombre: s.nombre, resumen: res })}
                    />,
                  ]
                }
                return [
                  <TarjetaSucursal
                    key={`${s.id}-abrir`}
                    sucursal={s}
                    turno={null}
                    esMiTurno={false}
                    estaEnLinea={false}
                    puedeAbrir
                    resumen={null}
                    movimientos={[]}
                    onAbrir={cargar}
                    onActualizar={cargar}
                    onCerrar={null}
                  />,
                ]
              })
            // ── Admin: vista por sección de sucursal con turnos compactos ──
            : sucursalesVisibles.map(s => {
                const turnos  = turnosPorSucursal[s.id] ?? []
                const miTurno = turnos.find(t => t.usuario_id === perfil?.id)
                return (
                  <SeccionSucursal key={s.id} sucursal={s} conteoTurnos={turnos.length}>
                    {turnos.map(turno => {
                      const res         = resumenesPorTurno[turno.id]
                      const esMio       = turno.usuario_id === perfil?.id
                      const estaEnLinea = turno.usuario_id
                        ? (usuariosEnLinea ?? new Set()).has(turno.usuario_id)
                        : false
                      return (
                        <TarjetaSucursal
                          key={turno.id}
                          sucursal={s}
                          turno={turno}
                          esMiTurno={esMio}
                          estaEnLinea={estaEnLinea}
                          puedeAbrir={false}
                          resumen={res}
                          movimientos={res?.movimientos ?? []}
                          onAbrir={cargar}
                          onActualizar={cargar}
                          onCerrar={esMio
                            ? (t) => setModalCerrar({ turno: t, sucursalNombre: s.nombre, resumen: res })
                            : null}
                          sinCabezal
                        />
                      )
                    })}
                    {!miTurno && (
                      <TarjetaSucursal
                        key={`${s.id}-abrir`}
                        sucursal={s}
                        turno={null}
                        esMiTurno={false}
                        estaEnLinea={false}
                        puedeAbrir
                        resumen={null}
                        movimientos={[]}
                        onAbrir={cargar}
                        onActualizar={cargar}
                        onCerrar={null}
                        sinCabezal
                      />
                    )}
                  </SeccionSucursal>
                )
              })
          }
        </div>
      )}

      {/* Historial de hoy */}
      {historial.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3">Turnos cerrados hoy</h2>
          <div className="flex flex-col gap-3">
            {historial.map(t => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-900">{t.perfiles?.nombre || '—'}</span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{t.sucursales?.nombre || '—'}</span>
                  </div>
                  <span className={cn(
                    'text-xs font-bold px-2.5 py-1 rounded-full border',
                    t.diferencia === 0 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                    t.diferencia  > 0  ? 'bg-sky-100 text-sky-800 border-sky-200' :
                                         'bg-red-100 text-red-800 border-red-200'
                  )}>
                    {t.diferencia === 0 ? '✓ Cuadre' :
                     t.diferencia  > 0  ? `+${formatoMoneda(t.diferencia)}` :
                                          formatoMoneda(t.diferencia)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Apertura',  valor: formatoHora(t.fecha_apertura)  },
                    { label: 'Cierre',    valor: formatoHora(t.fecha_cierre)    },
                    { label: 'Esperado',  valor: formatoMoneda(t.monto_esperado) },
                    { label: 'Contado',   valor: formatoMoneda(t.monto_contado)  },
                  ].map(item => (
                    <div key={item.label} className="bg-slate-50 rounded-xl p-2 text-center">
                      <p className="text-[10px] text-slate-400 uppercase">{item.label}</p>
                      <p className="text-xs font-bold text-slate-700 mt-0.5">{item.valor}</p>
                    </div>
                  ))}
                </div>
                {t.nota && (
                  <p className="text-xs text-slate-400 mt-2 italic">Nota: {t.nota}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {modalCerrar && (
        <ModalCerrarTurno
          turno={modalCerrar.turno}
          sucursalNombre={modalCerrar.sucursalNombre}
          resumen={modalCerrar.resumen}
          onCerrar={() => setModalCerrar(null)}
          onExito={() => {
            setModalCerrar(null)
            if (esRotativo) {
              resetSucursal()
            } else {
              cargar()
            }
          }}
        />
      )}
    </div>
  )
}
