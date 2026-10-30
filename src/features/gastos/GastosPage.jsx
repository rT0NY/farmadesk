import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Receipt, X, ChevronDown, Calendar, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Fab } from '@/components/ui/Fab'
import { Select } from '@/components/ui/Select'
import { Modal, ModalHeader, ModalFooter } from '@/components/ui/Modal'
import { CATEGORIAS_GASTO } from '@/lib/constantes'
import { formatoMoneda, formatoFecha, fechaEnZona } from '@/lib/formatos'
import { mensajeError } from '@/lib/errores'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

const etiquetaCategoria = (valor) =>
  CATEGORIAS_GASTO.find((c) => c.valor === valor)?.etiqueta ?? valor

const resumenGasto = (g) =>
  `${etiquetaCategoria(g.categoria)}: ${g.descripcion} · ${formatoMoneda(g.monto)} · ${formatoFecha(g.fecha)}`

// Con RLS, un UPDATE o DELETE que la política no permite no da error: afecta
// cero filas y ya. Por eso se pide la fila de vuelta (.select) y, si no vuelve
// ninguna, se avisa en lugar de dar el cambio por hecho.
const SIN_PERMISO = 'No tienes permiso para modificar este gasto.'

const claseCampo = cn(
  'bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm',
  'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400',
  'placeholder:text-slate-400'
)

// ─── Modal nuevo / editar gasto ──────────────────────────────────────────────

function ModalGasto({ gasto, onClose, onGuardado, empresa, perfil }) {
  const { tz } = useApp()
  const hoy = fechaEnZona(tz)
  const editando = !!gasto
  const [forma, setForma] = useState(() => editando
    ? { categoria: gasto.categoria, descripcion: gasto.descripcion, monto: String(gasto.monto), fecha: gasto.fecha }
    : { categoria: '', descripcion: '', monto: '', fecha: hoy })
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const cambiar = (campo, valor) => setForma((f) => ({ ...f, [campo]: valor }))

  const guardar = async () => {
    if (!forma.categoria) return toast.error('Selecciona una categoría')
    if (!forma.descripcion.trim()) return toast.error('Escribe una descripción')
    const monto = parseFloat(forma.monto)
    if (!monto || monto <= 0) return toast.error('El monto debe ser mayor a cero')
    if (!forma.fecha) return toast.error('Indica la fecha del gasto')
    if (forma.fecha > hoy) return toast.error('La fecha no puede ser futura')
    if (!empresa?.id) return toast.error('Sin empresa activa')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    const datos = { categoria: forma.categoria, descripcion: forma.descripcion.trim(), monto, fecha: forma.fecha }
    // Cómo estaba antes de guardar, para la Bitácora
    const antes = editando ? { categoria: gasto.categoria, descripcion: gasto.descripcion, monto: Number(gasto.monto), fecha: gasto.fecha } : null
    try {
      if (editando) {
        const { data, error } = await supabase.from('gastos').update(datos).eq('id', gasto.id).select('id')
        if (error) throw error
        if (!data?.length) throw new Error(SIN_PERMISO)
        await logBitacora({
          empresa_id:    empresa.id,
          tipo:          'gasto_editado',
          descripcion:   `Antes: ${resumenGasto(antes)} → Ahora: ${resumenGasto(datos)}`,
          usuario_id:    perfil?.id ?? null,
          referencia_id: String(gasto.id),
          metadatos:     { antes, ahora: datos },
        })
        toast.success('Gasto actualizado')
      } else {
        const { data: nuevo, error } = await supabase
          .from('gastos')
          .insert({ ...datos, empresa_id: empresa.id, sucursal_id: null, turno_id: null, usuario_id: perfil?.id ?? null })
          .select()
          .single()
        if (error) throw error
        await logBitacora({
          empresa_id:    empresa.id,
          tipo:          'gasto_registrado',
          descripcion:   `${etiquetaCategoria(datos.categoria)}: ${datos.descripcion} · $${monto.toFixed(2)}`,
          usuario_id:    perfil?.id ?? null,
          referencia_id: String(nuevo.id),
        })
        toast.success('Gasto registrado')
      }
      onGuardado()
    } catch (e) {
      toast.error(mensajeError(e, 'Error al guardar'))
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-5 animate-modal-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{editando ? 'Editar gasto' : 'Nuevo gasto'}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!editando && (
          <div className="bg-primary-50 border border-primary-200 rounded-2xl px-4 py-3 text-xs text-primary-700">
            Gastos generales de la empresa. Las salidas de caja de sucursal se registran en Caja.
          </div>
        )}

        <Select
          label="Categoría"
          valor={forma.categoria}
          onChange={(v) => cambiar('categoria', v ?? '')}
          opciones={CATEGORIAS_GASTO}
          placeholder="Selecciona una categoría..."
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Descripción</label>
          <input
            type="text"
            value={forma.descripcion}
            onChange={(e) => cambiar('descripcion', e.target.value)}
            placeholder="¿En qué se gastó?"
            className={claseCampo}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Monto</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={forma.monto}
              onChange={(e) => cambiar('monto', e.target.value)}
              placeholder="0.00"
              className={claseCampo}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Fecha</label>
            <input
              type="date"
              max={hoy}
              value={forma.fecha}
              onChange={(e) => cambiar('fecha', e.target.value)}
              className={claseCampo}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
            {editando ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Confirmar eliminación ───────────────────────────────────────────────────

function ModalEliminarGasto({ gasto, onClose, onEliminado, empresa, perfil }) {
  const [eliminando, setEliminando] = useState(false)
  const eliminandoRef = useRef(false)

  const eliminar = async () => {
    if (eliminandoRef.current) return
    eliminandoRef.current = true
    setEliminando(true)
    try {
      const { data, error } = await supabase.from('gastos').delete().eq('id', gasto.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error(SIN_PERMISO)
      await logBitacora({
        empresa_id:    empresa.id,
        tipo:          'gasto_eliminado',
        descripcion:   resumenGasto(gasto),
        usuario_id:    perfil?.id ?? null,
        referencia_id: String(gasto.id),
        metadatos:     { categoria: gasto.categoria, descripcion: gasto.descripcion, monto: Number(gasto.monto), fecha: gasto.fecha, registro: gasto.usuario?.nombre ?? null },
      })
      toast.success('Gasto eliminado')
      onEliminado()
    } catch (e) {
      toast.error(mensajeError(e, 'Error al eliminar'))
    } finally {
      eliminandoRef.current = false
      setEliminando(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-sm">
      <ModalHeader titulo="Eliminar gasto" onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-red-800">Esta acción no se puede deshacer</p>
          <p className="text-xs text-red-700 mt-1">El gasto deja de contar en Gastos y en Reportes. Queda constancia en la Bitácora.</p>
        </div>
        <div className="text-sm text-slate-600 space-y-1">
          <p><span className="text-slate-400">Descripción:</span> <strong>{gasto.descripcion}</strong></p>
          <p><span className="text-slate-400">Categoría:</span> {etiquetaCategoria(gasto.categoria)}</p>
          <p><span className="text-slate-400">Fecha:</span> {formatoFecha(gasto.fecha)}</p>
          <p><span className="text-slate-400">Monto:</span> <strong className="text-red-600">{formatoMoneda(gasto.monto)}</strong></p>
        </div>
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="peligro" tamano="md" className="flex-1" cargando={eliminando} onClick={eliminar}>Eliminar</Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GastosPage() {
  const { perfil, empresa, tz } = useApp()
  // Corregir o borrar gastos: admin y encargado (los mismos que los registran)
  const puedeModificar = perfil?.rol === 'admin' || perfil?.rol === 'encargado'

  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [gastoEditar, setGastoEditar] = useState(null)
  const [gastoEliminar, setGastoEliminar] = useState(null)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [periodo, setPeriodo] = useState('hoy') // hoy | semana | mes | personalizado
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const cargarGastos = useCallback(async () => {
    if (!empresa?.id) { setGastos([]); setCargando(false); return }
    setCargando(true)
    try {
      let q = supabase
        .from('gastos')
        .select('*, usuario:perfiles!usuario_id(nombre)')
        .eq('empresa_id', empresa.id)
        .order('fecha', { ascending: false })
        .order('creado_en', { ascending: false })

      if (periodo === 'hoy') {
        q = q.eq('fecha', fechaEnZona(tz))
      } else if (periodo === 'semana') {
        const desde = new Date(); desde.setDate(desde.getDate() - 6); desde.setHours(0,0,0,0)
        q = q.gte('fecha', desde.toISOString().slice(0,10))
      } else if (periodo === 'mes') {
        const hoy = new Date()
        const inicio = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`
        q = q.gte('fecha', inicio)
      } else if (periodo === 'personalizado') {
        if (fechaDesde) q = q.gte('fecha', fechaDesde)
        if (fechaHasta) q = q.lte('fecha', fechaHasta)
      }

      if (filtroCategoria) q = q.eq('categoria', filtroCategoria)

      const { data, error } = await q
      if (error) throw error
      setGastos(data ?? [])
    } catch (e) {
      toast.error(mensajeError(e, 'Error al cargar gastos'))
    } finally {
      setCargando(false)
    }
  }, [empresa?.id, filtroCategoria, periodo, fechaDesde, fechaHasta, tz])

  useEffect(() => { cargarGastos() }, [cargarGastos])
  useFocusRefresh(cargarGastos)

  const totalGeneral = gastos.reduce((s, g) => s + Number(g.monto), 0)

  const resumenCategorias = CATEGORIAS_GASTO
    .map((c) => ({
      ...c,
      total: gastos.filter((g) => g.categoria === c.valor).reduce((s, g) => s + Number(g.monto), 0),
    }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)

  const cerrarModal = () => { setModalAbierto(false); setGastoEditar(null) }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Gastos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gastos generales de la empresa</p>
        </div>
        {/* En celular lo hace el botón flotante */}
        <Button
          variante="primario"
          tamano="md"
          className="hidden lg:inline-flex"
          iconoIzq={<Plus className="w-4 h-4" />}
          onClick={() => setModalAbierto(true)}
        >
          Nuevo gasto
        </Button>
      </div>

      {/* Resumen total + breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Total */}
        <div className="bg-white border border-slate-100 shadow-card rounded-3xl px-5 py-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
              {{ hoy: 'Total hoy', semana: 'Total 7 días', mes: 'Total del mes', personalizado: 'Total período' }[periodo] ?? 'Total'}
            </p>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatoMoneda(totalGeneral)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {gastos.length} registro{gastos.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Top categorías */}
        {resumenCategorias.slice(0, 2).map((c) => (
          <div key={c.valor} className="bg-white border border-slate-100 shadow-card rounded-3xl px-5 py-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{c.etiqueta}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatoMoneda(c.total)}</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {Math.round((c.total / totalGeneral) * 100)}% del total
            </p>
          </div>
        ))}
      </div>

      {/* Controles de período + categoría */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {/* Período */}
        <div className="flex gap-2 flex-wrap items-center">
          {[
            { v: 'hoy',          label: 'Hoy'    },
            { v: 'semana',       label: '7 días' },
            { v: 'mes',          label: 'Mes'    },
            { v: 'personalizado',label: 'Fechas' },
          ].map(p => (
            <button
              key={p.v}
              onClick={() => setPeriodo(p.v)}
              className={cn(
                'px-3.5 py-2 rounded-full text-xs font-semibold transition-all',
                periodo === p.v
                  ? 'bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-md shadow-primary-500/30'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Rango personalizado */}
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            <span className="text-slate-400 text-sm">—</span>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
        )}
        {/* Categoría */}
        <div className="relative">
          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-2xl px-4 py-2.5 pr-9 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : gastos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Sin gastos registrados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {gastos.map((g) => (
              <div key={g.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4">
                <div className="w-10 h-10 rounded-2xl bg-red-50 hidden sm:flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{g.descripcion}</p>
                  {/* La columna fecha es solo día: con formatoFechaHora se leía
                      como medianoche UTC y en México salía el día anterior. */}
                  <p className="text-xs text-slate-400 truncate">
                    {etiquetaCategoria(g.categoria)}
                    {g.usuario?.nombre ? ` · ${g.usuario.nombre}` : ''}
                    {' · '}
                    {formatoFecha(g.fecha)}
                  </p>
                </div>
                <p className="text-sm font-bold text-red-600 flex-shrink-0 tabular-nums">
                  -{formatoMoneda(g.monto)}
                </p>
                {puedeModificar && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setGastoEditar(g)}
                      aria-label="Editar gasto"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setGastoEliminar(g)}
                      aria-label="Eliminar gasto"
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(modalAbierto || gastoEditar) && (
        <ModalGasto
          gasto={gastoEditar}
          onClose={cerrarModal}
          onGuardado={() => { cerrarModal(); cargarGastos() }}
          empresa={empresa}
          perfil={perfil}
        />
      )}

      {gastoEliminar && (
        <ModalEliminarGasto
          gasto={gastoEliminar}
          onClose={() => setGastoEliminar(null)}
          onEliminado={() => { setGastoEliminar(null); cargarGastos() }}
          empresa={empresa}
          perfil={perfil}
        />
      )}

      <Fab onClick={() => setModalAbierto(true)} label="Nuevo gasto" />
    </div>
  )
}
