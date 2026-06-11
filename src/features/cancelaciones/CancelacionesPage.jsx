import { useState, useEffect, useCallback, useRef } from 'react'
import { Ban, Check, X, AlertTriangle, Building2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoMoneda, formatoFechaHora, fechaEnZona, generarFolio } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

// ─── Badges ───────────────────────────────────────────────────────────────────

const BADGE = {
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  aprobada:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  rechazada: 'bg-red-100 text-red-700 border-red-200',
}
const ETIQUETA = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' }

function Badge({ estado }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border', BADGE[estado] ?? BADGE.pendiente)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {ETIQUETA[estado] ?? estado}
    </span>
  )
}

// ─── Modal Aprobar ────────────────────────────────────────────────────────────

function ModalAprobar({ cancelacion, onClose, onExito }) {
  const { perfil } = useApp()
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)
  const procesandoRef = useRef(false)

  const aprobar = async () => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    setProcesando(true)
    try {
      const { error } = await supabase.rpc('aprobar_cancelacion', {
        p_cancelacion_id: cancelacion.id,
        p_revisado_por:   perfil.id,
        p_nota:           nota.trim() || null,
      })
      if (error) throw error

      await logBitacora({
        empresa_id:    cancelacion.ventas?.empresa_id ?? perfil?.empresa_id,
        tipo:          'cancelacion_aprobada',
        descripcion:   `Cancelación aprobada · ${generarFolio(cancelacion.venta_id, cancelacion.ventas?.sucursales?.nombre)} · ${formatoMoneda(cancelacion.ventas?.total)}`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   cancelacion.ventas?.sucursal_id ?? null,
        referencia_id: String(cancelacion.id),
      })
      toast.success('Cancelación aprobada')
      onExito()
    } catch (e) {
      toast.error(e.message ?? 'Error al aprobar')
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  const productos = cancelacion.ventas?.detalle_ventas ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-modal-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Aprobar cancelación</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-amber-800 font-mono">
              {generarFolio(cancelacion.ventas?.id, cancelacion.ventas?.sucursales?.nombre)} · {formatoMoneda(cancelacion.ventas?.total)}
            </p>
            <Badge estado={cancelacion.estado} />
          </div>
          <p className="text-xs text-amber-600">Motivo: {cancelacion.motivo}</p>
        </div>

        {productos.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Productos</p>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
              {productos.map((d, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <p className="text-sm text-slate-700">{d.productos?.nombre ?? '—'}</p>
                  <p className="text-sm text-slate-500 tabular-nums">
                    {d.cantidad} × {formatoMoneda(d.precio_unitario)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs text-slate-600 space-y-0.5">
          <p>Se restaurará el inventario de todos los productos.</p>
          <p>Se creará un movimiento de entrada en caja por {formatoMoneda(cancelacion.ventas?.total)}.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Nota (opcional)</label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Observaciones..."
            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
          />
        </div>

        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="exito" tamano="md" className="flex-1" cargando={procesando}
            iconoIzq={<Check className="w-4 h-4" />} onClick={aprobar}>
            Aprobar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal Rechazar ───────────────────────────────────────────────────────────

function ModalRechazar({ cancelacion, onClose, onExito }) {
  const { perfil } = useApp()
  const [nota, setNota] = useState('')
  const [procesando, setProcesando] = useState(false)

  const rechazandoRef = useRef(false)
  const rechazar = async () => {
    if (!nota.trim()) return toast.error('Escribe el motivo del rechazo')
    if (rechazandoRef.current) return
    rechazandoRef.current = true
    setProcesando(true)
    try {
      const { error } = await supabase.from('cancelaciones').update({
        estado:        'rechazada',
        revisado_por:  perfil.id,
        nota_revision: nota.trim(),
        revisado_en:   new Date().toISOString(),
      }).eq('id', cancelacion.id)
      if (error) throw error
      await logBitacora({
        empresa_id:    cancelacion.ventas?.empresa_id ?? perfil?.empresa_id,
        tipo:          'cancelacion_rechazada',
        descripcion:   `Cancelación rechazada · ${generarFolio(cancelacion.venta_id, cancelacion.ventas?.sucursales?.nombre)} · Motivo: ${nota.trim()}`,
        usuario_id:    perfil?.id ?? null,
        sucursal_id:   cancelacion.ventas?.sucursal_id ?? null,
        referencia_id: String(cancelacion.id),
      })
      toast.success('Cancelación rechazada')
      onExito()
    } catch (e) {
      toast.error(e.message ?? 'Error al rechazar')
    } finally {
      rechazandoRef.current = false
      setProcesando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-5 animate-modal-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Rechazar cancelación</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-sm font-bold text-red-800 font-mono">
            {generarFolio(cancelacion.ventas?.id, cancelacion.ventas?.sucursales?.nombre)} · {formatoMoneda(cancelacion.ventas?.total)}
          </p>
          <p className="text-xs text-red-600 mt-0.5">Motivo original: {cancelacion.motivo}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Motivo del rechazo *</label>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="¿Por qué se rechaza?"
            autoFocus
            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
          />
        </div>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="peligro" tamano="md" className="flex-1" cargando={procesando}
            iconoIzq={<X className="w-4 h-4" />} onClick={rechazar}>
            Rechazar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Fila cancelación ─────────────────────────────────────────────────────────

function FilaCancelacion({ c, puedeGestionar, onAprobar, onRechazar }) {
  const sucursal  = c.ventas?.sucursales?.nombre
  const solicitante = c.solicitante?.nombre
  const productos = c.ventas?.detalle_ventas ?? []

  return (
    <div className="px-5 py-4 flex flex-col gap-2">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Ban className="w-5 h-5 text-slate-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-900 font-mono">
              {generarFolio(c.ventas?.id, c.ventas?.sucursales?.nombre)} · {formatoMoneda(c.ventas?.total ?? 0)}
            </p>
            <Badge estado={c.estado} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Motivo: {c.motivo}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {sucursal && (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Building2 className="w-3 h-3" />{sucursal}
              </span>
            )}
            {solicitante && <span className="text-xs text-slate-400">· {solicitante}</span>}
            <span className="text-xs text-slate-400">· {formatoFechaHora(c.creado_en)}</span>
          </div>
          {c.nota_revision && (
            <p className="text-xs text-slate-400 mt-0.5 italic">
              Nota: {c.nota_revision}
              {c.revisor?.nombre ? ` (${c.revisor.nombre})` : ''}
            </p>
          )}
        </div>
        {puedeGestionar && c.estado === 'pendiente' && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => onRechazar(c)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 active:scale-95 transition-all text-xs font-bold border border-red-200"
              title="Rechazar cancelación"
            >
              <X className="w-3.5 h-3.5" strokeWidth={3} />
              Rechazar
            </button>
            <button
              onClick={() => onAprobar(c)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all text-xs font-bold shadow-sm"
              title="Aprobar cancelación"
            >
              <Check className="w-3.5 h-3.5" strokeWidth={3} />
              Aprobar
            </button>
          </div>
        )}
      </div>

      {/* Productos de la venta */}
      {productos.length > 0 && (
        <div className="ml-14 bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
          {productos.map((d, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Package className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <p className="text-xs text-slate-700">{d.productos?.nombre ?? '—'}</p>
              </div>
              <p className="text-xs text-slate-500 tabular-nums">
                {d.cantidad} × {formatoMoneda(d.precio_unitario)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PERIODOS = [
  { v: 'hoy',     label: 'Hoy'    },
  { v: 'semana',  label: '7 días' },
  { v: 'mes',     label: 'Mes'    },
  { v: 'todo',    label: 'Todo'   },
]

function fechaDesde(periodo, tz) {
  const hoy = fechaEnZona(tz)
  if (periodo === 'hoy')    return `${hoy}T00:00:00`
  if (periodo === 'semana') {
    const d = new Date(); d.setDate(d.getDate() - 7)
    return d.toISOString()
  }
  if (periodo === 'mes') {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0)
    return d.toISOString()
  }
  return null
}

export default function CancelacionesPage() {
  const { esAdmin, esEncargado, sucursalActiva, tz } = useApp()

  const [todas, setTodas]               = useState([])  // Sin filtro de estado — para conteos
  const [cargando, setCargando]         = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')
  const [periodo, setPeriodo]           = useState('mes')
  const [modalAprobar, setModalAprobar] = useState(null)
  const [modalRechazar, setModalRechazar] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      let q = supabase
        .from('cancelaciones')
        .select(`
          *,
          ventas(
            id, total, sucursal_id, empresa_id, turno_id,
            sucursales(nombre),
            detalle_ventas(cantidad, precio_unitario, productos(nombre))
          ),
          solicitante:perfiles!cancelaciones_solicitado_por_fkey(nombre),
          revisor:perfiles!cancelaciones_revisado_por_fkey(nombre)
        `)
        .order('creado_en', { ascending: false })

      const desde = fechaDesde(periodo, tz)
      if (desde) q = q.gte('creado_en', desde)

      const { data, error } = await q
      if (error) throw error
      setTodas(data ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar cancelaciones')
    } finally {
      setCargando(false)
    }
  }, [periodo, tz])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  // Conteos siempre de TODAS las cancelaciones del periodo
  const conteos = {
    pendiente: todas.filter(c => c.estado === 'pendiente').length,
    aprobada:  todas.filter(c => c.estado === 'aprobada').length,
    rechazada: todas.filter(c => c.estado === 'rechazada').length,
  }
  // Lista filtrada por estado seleccionado
  const cancelaciones = filtroEstado === 'todos'
    ? todas
    : todas.filter(c => c.estado === filtroEstado)

  const totalPendientes = conteos.pendiente

  const puedeGestionar = esAdmin || esEncargado

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Cancelaciones</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {esAdmin ? 'Todas las sucursales' : sucursalActiva?.nombre ?? '—'}
        </p>
      </div>

      {totalPendientes > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 w-fit">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-amber-700">
            {totalPendientes} solicitud{totalPendientes !== 1 ? 'es' : ''} pendiente{totalPendientes !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Filtro de período */}
      <div className="flex gap-2 flex-wrap items-center">
        <span className="text-xs font-medium text-slate-500">Período:</span>
        {PERIODOS.map(p => (
          <button
            key={p.v}
            onClick={() => setPeriodo(p.v)}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
              periodo === p.v
                ? 'bg-gradient-to-b from-primary-600 to-primary-700 text-white border-transparent shadow-md shadow-primary-500/30'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs — usan conteos de TODAS, no del filtro */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {['pendiente', 'aprobada', 'rechazada'].map((estado) => (
          <button
            key={estado}
            onClick={() => setFiltroEstado(estado)}
            className={cn(
              'border rounded-2xl px-4 py-3 text-left transition-all',
              filtroEstado === estado
                ? BADGE[estado] + ' border-current'
                : 'bg-white border-slate-200/60 hover:border-slate-300'
            )}
          >
            <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wide">{ETIQUETA[estado]}</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{conteos[estado]}</p>
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : cancelaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Ban className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Sin cancelaciones</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cancelaciones.map((c) => (
              <FilaCancelacion
                key={c.id}
                c={c}
                puedeGestionar={puedeGestionar}
                onAprobar={setModalAprobar}
                onRechazar={setModalRechazar}
              />
            ))}
          </div>
        )}
      </div>

      {modalAprobar && (
        <ModalAprobar
          cancelacion={modalAprobar}
          onClose={() => setModalAprobar(null)}
          onExito={() => { setModalAprobar(null); cargar() }}
        />
      )}
      {modalRechazar && (
        <ModalRechazar
          cancelacion={modalRechazar}
          onClose={() => setModalRechazar(null)}
          onExito={() => { setModalRechazar(null); cargar() }}
        />
      )}
    </div>
  )
}
