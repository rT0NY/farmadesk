import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Bell, X, CalendarX, Package, AlertTriangle,
  Clock, DollarSign, ArrowRight, RefreshCw, Ban, CreditCard,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, fechaEnZona, addDias, dowEnZona } from '@/lib/formatos'
import { EVENTO_ALERTA, emitirAlerta } from '@/lib/alertas'
import { invalidarStock } from '@/lib/cache'
import { cn } from '@/lib/clases'
import { Link, useNavigate } from 'react-router-dom'

// ─── Hook de conteo (ligero, para el badge) ───────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useAlertaConteo() {
  const { empresa, tz, esAdmin, esEncargado } = useApp()
  const [total, setTotal] = useState(0)

  const calcular = useCallback(async () => {
    if (!empresa?.id) return
    try {
      const en90S = addDias(fechaEnZona(tz), 90)
      const tieneAcceso = esAdmin || esEncargado
      const queries = [
        supabase.from('lotes').select('id').eq('activo', true).not('fecha_caducidad', 'is', null).lte('fecha_caducidad', en90S),
        supabase.from('inventario').select('lote_id, cantidad, lotes!inner(producto_id)'),
        supabase.from('productos').select('id, stock_minimo').eq('empresa_id', empresa.id).eq('activo', true),
      ]
      if (tieneAcceso) {
        queries.push(
          supabase.from('cancelaciones').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id).eq('estado', 'pendiente'),
          supabase.from('cuentas_pendientes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresa.id).eq('pagada', false),
        )
      }
      const results = await Promise.all(queries)
      const [{ data: lotes }, { data: inv }, { data: prods }] = results
      const cancelCount  = tieneAcceso ? (results[3]?.count ?? 0) : 0
      const cuentasCount = tieneAcceso ? (results[4]?.count ?? 0) : 0

      const stockMap  = {}
      const loteMap   = {}
      ;(inv || []).forEach(i => {
        const pid = i.lotes?.producto_id
        if (pid) stockMap[pid] = (stockMap[pid] || 0) + Number(i.cantidad || 0)
        loteMap[i.lote_id] = (loteMap[i.lote_id] || 0) + Number(i.cantidad || 0)
      })
      const lotesConStock = (lotes || []).filter(l => (loteMap[l.id] || 0) > 0).length
      const agotados  = (prods || []).filter(p => p.id in stockMap && stockMap[p.id] === 0).length
      const stockBajo = (prods || []).filter(p => {
        const s = stockMap[p.id]; return s !== undefined && s > 0 && s < (p.stock_minimo ?? 10)
      }).length
      setTotal(lotesConStock + agotados + stockBajo + cancelCount + cuentasCount)
    } catch { /* silencioso */ }
  }, [empresa?.id, esAdmin, esEncargado, tz])

  useEffect(() => {
    calcular()
    // Consulta pesada (lotes + inventario + productos): sondeo espaciado.
    const t = setInterval(calcular, 60_000)
    window.addEventListener(EVENTO_ALERTA, calcular)
    return () => {
      clearInterval(t)
      window.removeEventListener(EVENTO_ALERTA, calcular)
    }
  }, [calcular])

  return total
}

// ─── Hook de badges por item del menú ────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useBadgesMenu() {
  const { empresa, esAdmin, esEncargado } = useApp()
  const tieneAcceso = esAdmin || esEncargado
  const [badges, setBadges] = useState({ cancelaciones: 0, cuentas: 0 })

  const calcular = useCallback(async () => {
    if (!empresa?.id || !tieneAcceso) { setBadges({ cancelaciones: 0, cuentas: 0 }); return }
    try {
      const [{ count: cancelCount }, { count: cuentasCount }] = await Promise.all([
        supabase.from('cancelaciones').select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id).eq('estado', 'pendiente'),
        supabase.from('cuentas_pendientes').select('id', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id).eq('pagada', false),
      ])
      setBadges({ cancelaciones: cancelCount ?? 0, cuentas: cuentasCount ?? 0 })
    } catch { /* silencioso */ }
  }, [empresa?.id, tieneAcceso])

  useEffect(() => {
    calcular()
    // Son dos COUNT con head:true (no traen filas), así que se puede sondear
    // seguido: es la red de seguridad por si Realtime no está activo en la tabla.
    const t = setInterval(calcular, 20_000)
    // Al volver a la ventana/pestaña, recalcular de inmediato
    const alVolver = () => { if (!document.hidden) calcular() }
    window.addEventListener(EVENTO_ALERTA, calcular)
    window.addEventListener('focus', calcular)
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(t)
      window.removeEventListener(EVENTO_ALERTA, calcular)
      window.removeEventListener('focus', calcular)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [calcular])

  return badges
}

// ─── Hook de realtime (toasts automáticos) ────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useRealtimeAlertas(onCambio) {
  const { empresa, esAdmin, esEncargado, perfil, sucursales } = useApp()
  const navigate = useNavigate()
  const onCambioRef = useRef(onCambio)
  onCambioRef.current = onCambio
  // navigate cambia de identidad en cada render; con ref el efecto no se re-suscribe
  const navRef = useRef(navigate)
  navRef.current = navigate

  useEffect(() => {
    if (!empresa?.id || !perfil?.id) return

    const channels = []

    // Los eventos llegan en ráfaga (una venta de 5 productos = 5 UPDATE en
    // inventario). Sin agrupar, cada uno dispararía el recálculo completo de
    // alertas en TODAS las terminales conectadas. Se juntan en uno solo.
    let timerNotif = null
    const notificar = () => {
      if (timerNotif) clearTimeout(timerNotif)
      timerNotif = setTimeout(() => {
        timerNotif = null
        invalidarStock()          // el stock cambió en otra terminal
        emitirAlerta()            // badges del menú
        onCambioRef.current?.()
      }, 1200)
    }

    // window.location.href rompe el HashRouter de Electron: navegar por el router
    const irA = (ruta) => ({ label: 'Ver', onClick: () => navRef.current(ruta) })

    // ── Admin/Encargado: cancelaciones ──────────────────────────────────────
    // El badge del menú lo ven ambos roles, así que ambos necesitan el realtime.
    // Se escucha INSERT (nueva solicitud) y UPDATE/DELETE (ya se atendió): sin el
    // UPDATE el contador se quedaba en 1 después de aprobar hasta el siguiente sondeo.
    if (esAdmin || esEncargado) {
      channels.push(
        supabase.channel(`rt-cancel-${empresa.id}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'cancelaciones',
            filter: `empresa_id=eq.${empresa.id}`,
          }, (payload) => {
            toast('Solicitud de cancelación', {
              description: payload.new?.motivo
                ? `Motivo: ${payload.new.motivo}`
                : 'Un cajero solicita cancelar una venta',
              icon: '🚫',
              action: irA('/cancelaciones'),
            })
            notificar()
          })
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'cancelaciones',
            filter: `empresa_id=eq.${empresa.id}`,
          }, notificar)
          .on('postgres_changes', {
            event: 'DELETE', schema: 'public', table: 'cancelaciones',
          }, notificar)
          .subscribe()
      )
    }

    // ── Admin/Encargado: cuenta pendiente nueva o pagada ───────────────────────
    if (esAdmin || esEncargado) {
      channels.push(
        supabase.channel(`rt-cuentas-${empresa.id}`)
          .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'cuentas_pendientes',
            filter: `empresa_id=eq.${empresa.id}`,
          }, (payload) => {
            toast('Cuenta pendiente registrada', {
              description: payload.new?.nombre_cliente
                ? `Cliente: ${payload.new.nombre_cliente} · ${formatoMoneda(payload.new.total ?? 0)}`
                : 'Se registró una cuenta pendiente',
              icon: '💳',
              action: irA('/cuentas'),
            })
            notificar()
          })
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'cuentas_pendientes',
            filter: `empresa_id=eq.${empresa.id}`,
          }, notificar)
          .subscribe()
      )
    }

    // ── Admin: pedido recibido ──────────────────────────────────────────────
    if (esAdmin) {
      channels.push(
        supabase.channel(`rt-pedidos-${empresa.id}`)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'pedidos',
            filter: `empresa_id=eq.${empresa.id}`,
          }, (payload) => {
            const estado = payload.new?.estado
            if (estado === 'recibido' || estado === 'parcial') {
              const sucNombre = sucursales.find(s => s.id === payload.new?.sucursal_id)?.nombre ?? ''
              toast(estado === 'recibido' ? 'Mercancía recibida' : 'Recepción parcial', {
                description: sucNombre ? `Recibido en ${sucNombre}` : 'Pedido a proveedor actualizado',
                icon: '📦',
                action: irA('/pedidos'),
              })
              notificar()
            }
          })
          .subscribe()
      )
    }

    // ── Todos: producto agotado en tiempo real ──────────────────────────────
    // Escucha cambios en inventario; si llega a 0 en alguna sucursal avisa
    channels.push(
      supabase.channel(`rt-inv-${empresa.id}-${perfil.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'inventario',
          filter: `empresa_id=eq.${empresa.id}`,
        }, async (payload) => {
          const nuevaCant = payload.new?.cantidad
          if (nuevaCant !== 0) { notificar(); return }

          // Solo toast si llegó exactamente a 0 en esta sucursal
          const loteId = payload.new?.lote_id
          if (!loteId) return
          try {
            const { data: lote } = await supabase
              .from('lotes')
              .select('producto_id, productos(nombre, stock_minimo)')
              .eq('id', loteId)
              .maybeSingle()
            if (!lote) return

            // Verificar si el TOTAL del producto sigue en 0
            const { data: totales } = await supabase
              .from('inventario')
              .select('cantidad, lote_id')
              .eq('empresa_id', empresa.id)
              .in('lote_id',
                await supabase.from('lotes').select('id').eq('producto_id', lote.producto_id)
                  .then(r => (r.data || []).map(l => l.id))
              )
            const totalStock = (totales || []).reduce((s, i) => s + (i.cantidad || 0), 0)
            const nombre = lote.productos?.nombre ?? 'Producto'

            if (totalStock === 0) {
              toast.error(`Sin stock: ${nombre}`, {
                description: 'El producto se agotó en todas las sucursales',
                action: irA('/inventario'),
              })
            }
          } catch { /* silencioso */ }
          notificar()
        })
        .subscribe()
    )

    return () => {
      if (timerNotif) clearTimeout(timerNotif)
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [empresa?.id, esAdmin, esEncargado, perfil?.id, sucursales])
}

// ─── Fila de alerta ───────────────────────────────────────────────────────────
function FilaAlerta({ Icono, label, sub, color, to, badge }) {
  const cls = {
    red:    { icon: 'bg-red-100 text-red-600',      badge: 'bg-red-100 text-red-700'      },
    orange: { icon: 'bg-orange-100 text-orange-600', badge: 'bg-orange-100 text-orange-700'},
    amber:  { icon: 'bg-amber-100 text-amber-600',  badge: 'bg-amber-100 text-amber-700'  },
    violet: { icon: 'bg-violet-100 text-violet-600', badge: 'bg-violet-100 text-violet-700'},
  }[color] || { icon: 'bg-slate-100 text-slate-500', badge: 'bg-slate-100 text-slate-500' }

  return (
    <Link to={to}
      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors rounded-2xl">
      <div className={cn('w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0', cls.icon)}>
        <Icono className="w-4 h-4" strokeWidth={2.5} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge !== undefined && (
          <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', cls.badge)}>{badge}</span>
        )}
        <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
      </div>
    </Link>
  )
}

function Seccion({ titulo, children }) {
  return (
    <div>
      <p className="px-4 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{titulo}</p>
      {children}
    </div>
  )
}

// ─── Drawer de notificaciones (controlado externamente) ───────────────────────
export function NotificacionesDrawer({ abierto, onClose }) {
  const { empresa, tz, esAdmin, esEncargado } = useApp()
  const [datos,    setDatos]    = useState(null)
  const [cargando, setCargando] = useState(false)

  const cargarDetalle = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      const hoyS  = fechaEnZona(tz)
      const en30S = addDias(hoyS, 30)
      const en90S = addDias(hoyS, 90)

      const baseQueries = [
        supabase.from('lotes')
          .select('id, fecha_caducidad, producto_id, productos(nombre)')
          .eq('activo', true)
          .not('fecha_caducidad', 'is', null)
          .lte('fecha_caducidad', en90S)
          .order('fecha_caducidad', { ascending: true }),
        supabase.from('inventario').select('lote_id, cantidad, lotes!inner(producto_id)'),
        supabase.from('productos').select('id, nombre, stock_minimo').eq('empresa_id', empresa.id).eq('activo', true),
      ]
      const tieneAcceso = esAdmin || esEncargado
      if (tieneAcceso) {
        baseQueries.push(
          supabase.from('cancelaciones')
            .select('id, motivo, creado_en, ventas(id, total)')
            .eq('empresa_id', empresa.id)
            .eq('estado', 'pendiente')
            .order('creado_en', { ascending: false })
            .limit(5),
          supabase.from('cuentas_pendientes')
            .select('id, nombre_cliente, total, abonado, creado_en')
            .eq('empresa_id', empresa.id)
            .eq('pagada', false)
            .order('creado_en', { ascending: false })
            .limit(5),
        )
      }

      const results = await Promise.all(baseQueries)
      const [{ data: lotes }, { data: inv }, { data: prods }] = results
      const cancelaciones = tieneAcceso ? (results[3]?.data ?? []) : []
      const cuentasPend   = tieneAcceso ? (results[4]?.data ?? []) : []

      const stockMap = {}
      ;(inv || []).forEach(i => {
        const pid = i.lotes?.producto_id
        if (pid) stockMap[pid] = (stockMap[pid] || 0) + Number(i.cantidad || 0)
      })
      const loteMap = {}
      ;(inv || []).forEach(i => { loteMap[i.lote_id] = (loteMap[i.lote_id] || 0) + Number(i.cantidad || 0) })

      const caducados = (lotes || []).filter(l => l.fecha_caducidad < hoyS && (loteMap[l.id] || 0) > 0)
      const criticos  = (lotes || []).filter(l => l.fecha_caducidad >= hoyS && l.fecha_caducidad <= en30S && (loteMap[l.id] || 0) > 0)
      const proximos  = (lotes || []).filter(l => l.fecha_caducidad > en30S && (loteMap[l.id] || 0) > 0)
      // Solo alertar productos que alguna vez tuvieron inventario (están en stockMap)
      const agotados  = (prods || []).filter(p => p.id in stockMap && stockMap[p.id] === 0)
      const bajStock  = (prods || []).filter(p => { const s = stockMap[p.id]; return s !== undefined && s > 0 && s < (p.stock_minimo ?? 10) })

      const dow = dowEnZona(hoyS)
      let salarios = null
      if (dow === (empresa?.dia_pago ?? 5)) {
        const { data: semsPend } = await supabase.from('semanas_salario').select('usuario_id, total_calculado').eq('pagado', false)
        const pend  = [...new Set((semsPend ?? []).map(s => s.usuario_id))].length
        const total = (semsPend ?? []).reduce((s, x) => s + (x.total_calculado ?? 0), 0)
        salarios = pend > 0 ? { pend, total } : null
      }

      let horario = false
      if (dow === 6 || dow === 0) {
        const diff   = dow === 0 ? 1 : 2
        const lunesS = addDias(hoyS, diff)
        const domS   = addDias(lunesS, 6)
        const { count: asig } = await supabase.from('programacion')
          .select('*', { count: 'exact', head: true })
          .eq('empresa_id', empresa.id).gte('fecha', lunesS).lte('fecha', domS)
        horario = (asig ?? 0) === 0
      }

      setDatos({ caducados, criticos, proximos, agotados, bajStock, salarios, horario, cancelaciones, cuentasPend })
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }, [empresa?.id])

  useEffect(() => { if (abierto) cargarDetalle() }, [abierto, cargarDetalle])

  const fmtFecha = s =>
    new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })

  const hayAlgo = datos && (
    datos.caducados.length || datos.criticos.length || datos.proximos.length ||
    datos.agotados.length  || datos.bajStock.length || datos.salarios || datos.horario ||
    datos.cancelaciones?.length || datos.cuentasPend?.length
  )

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:w-96 bg-white h-full shadow-2xl flex flex-col sm:rounded-l-3xl overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-700" strokeWidth={2.5} />
            <h2 className="text-base font-bold text-slate-900">Notificaciones</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cargarDetalle} disabled={cargando}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40">
              <RefreshCw className={cn('w-3.5 h-3.5', cargando && 'animate-spin')} />
            </button>
            <button onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto py-3">
          {cargando ? (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : !hayAlgo ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <Bell className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Todo en orden</p>
              <p className="text-xs text-slate-400">Sin alertas en este momento</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-1">
              {datos.cancelaciones?.length > 0 && (
                <Seccion titulo={`Cancelaciones pendientes (${datos.cancelaciones.length})`}>
                  {datos.cancelaciones.map(c => (
                    <FilaAlerta key={c.id} Icono={Ban} color="red"
                      label={`Cancelación #${String(c.ventas?.id ?? c.id).slice(-6).toUpperCase()}`}
                      sub={c.motivo ? c.motivo.slice(0, 60) : 'Sin motivo'}
                      badge={c.ventas?.total ? formatoMoneda(c.ventas.total) : undefined}
                      to="/cancelaciones" />
                  ))}
                </Seccion>
              )}
              {datos.cuentasPend?.length > 0 && (
                <Seccion titulo={`Cuentas pendientes (${datos.cuentasPend.length})`}>
                  {datos.cuentasPend.map(c => (
                    <FilaAlerta key={c.id} Icono={CreditCard} color="amber"
                      label={c.nombre_cliente}
                      sub={`Pendiente: ${formatoMoneda((c.total ?? 0) - (c.abonado ?? 0))} de ${formatoMoneda(c.total ?? 0)}`}
                      badge={formatoMoneda((c.total ?? 0) - (c.abonado ?? 0))}
                      to="/cuentas" />
                  ))}
                </Seccion>
              )}
              {(datos.caducados.length > 0 || datos.criticos.length > 0 || datos.proximos.length > 0) && (
                <Seccion titulo="Caducidad">
                  {datos.caducados.slice(0, 5).map(l => (
                    <FilaAlerta key={l.id} Icono={CalendarX} color="red"
                      label={l.productos?.nombre ?? '—'}
                      sub={`Venció el ${fmtFecha(l.fecha_caducidad)}`}
                      badge="Caducado" to="/caducidades" />
                  ))}
                  {datos.caducados.length > 5 && (
                    <p className="px-4 text-xs text-red-500 font-semibold">+{datos.caducados.length - 5} más caducados</p>
                  )}
                  {datos.criticos.slice(0, 5).map(l => {
                    const dias = Math.ceil((new Date(l.fecha_caducidad) - new Date()) / 86400000)
                    return (
                      <FilaAlerta key={l.id} Icono={CalendarX} color="orange"
                        label={l.productos?.nombre ?? '—'}
                        sub={`Caduca en ${dias} día${dias !== 1 ? 's' : ''} · ${fmtFecha(l.fecha_caducidad)}`}
                        badge={`${dias}d`} to="/caducidades" />
                    )
                  })}
                  {datos.proximos.slice(0, 3).map(l => {
                    const dias = Math.ceil((new Date(l.fecha_caducidad) - new Date()) / 86400000)
                    return (
                      <FilaAlerta key={l.id} Icono={CalendarX} color="amber"
                        label={l.productos?.nombre ?? '—'}
                        sub={`Caduca el ${fmtFecha(l.fecha_caducidad)}`}
                        badge={`${dias}d`} to="/caducidades" />
                    )
                  })}
                  {datos.proximos.length > 3 && (
                    <Link to="/caducidades" onClick={onClose} className="px-4 text-xs text-amber-600 font-semibold hover:underline">
                      Ver {datos.proximos.length - 3} más →
                    </Link>
                  )}
                </Seccion>
              )}

              {(datos.agotados.length > 0 || datos.bajStock.length > 0) && (
                <Seccion titulo="Stock">
                  {datos.agotados.slice(0, 5).map(p => (
                    <FilaAlerta key={p.id} Icono={Package} color="red"
                      label={p.nombre} sub="Sin unidades disponibles" badge="Agotado" to="/inventario" />
                  ))}
                  {datos.agotados.length > 5 && (
                    <p className="px-4 text-xs text-red-500 font-semibold">+{datos.agotados.length - 5} más agotados</p>
                  )}
                  {datos.bajStock.slice(0, 5).map(p => (
                    <FilaAlerta key={p.id} Icono={AlertTriangle} color="amber"
                      label={p.nombre} sub={`Mínimo: ${p.stock_minimo ?? 10} uds`} badge="Bajo" to="/inventario" />
                  ))}
                  {datos.bajStock.length > 5 && (
                    <Link to="/inventario" onClick={onClose} className="px-4 text-xs text-amber-600 font-semibold hover:underline">
                      Ver {datos.bajStock.length - 5} más →
                    </Link>
                  )}
                </Seccion>
              )}

              {(datos.salarios || datos.horario) && (
                <Seccion titulo="Operación">
                  {datos.salarios && (
                    <FilaAlerta Icono={DollarSign} color="amber"
                      label="Día de pago de salarios"
                      sub={`${datos.salarios.pend} empleado${datos.salarios.pend > 1 ? 's' : ''} · ${formatoMoneda(datos.salarios.total)}`}
                      to="/salarios" />
                  )}
                  {datos.horario && (
                    <FilaAlerta Icono={Clock} color="violet"
                      label="Horario sin programar"
                      sub="La próxima semana no tiene turnos asignados"
                      to="/horarios" />
                  )}
                </Seccion>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
