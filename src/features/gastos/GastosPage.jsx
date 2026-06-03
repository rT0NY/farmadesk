import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Receipt, X, ChevronDown, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { CATEGORIAS_GASTO } from '@/lib/constantes'
import { formatoMoneda, formatoFechaHora, fechaEnZona } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

const etiquetaCategoria = (valor) =>
  CATEGORIAS_GASTO.find((c) => c.valor === valor)?.etiqueta ?? valor

// ─── Modal nuevo gasto ───────────────────────────────────────────────────────

function ModalNuevoGasto({ onClose, onGuardado, empresa, perfil }) {
  const { tz } = useApp()
  const [forma, setForma] = useState({ categoria: '', descripcion: '', monto: '' })
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const cambiar = (campo, valor) => setForma((f) => ({ ...f, [campo]: valor }))

  const guardar = async () => {
    if (!forma.categoria) return toast.error('Selecciona una categoría')
    if (!forma.descripcion.trim()) return toast.error('Escribe una descripción')
    const monto = parseFloat(forma.monto)
    if (!monto || monto <= 0) return toast.error('El monto debe ser mayor a cero')
    if (!empresa?.id) return toast.error('Sin empresa activa')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { data: gasto, error: errGasto } = await supabase
        .from('gastos')
        .insert({
          empresa_id:  empresa.id,
          sucursal_id: null,
          turno_id:    null,
          usuario_id:  perfil?.id ?? null,
          categoria:   forma.categoria,
          descripcion: forma.descripcion.trim(),
          monto,
          fecha:       fechaEnZona(tz),
        })
        .select()
        .single()

      if (errGasto) throw errGasto

      await logBitacora({
        empresa_id:    empresa.id,
        tipo:          'gasto_registrado',
        descripcion:   `${etiquetaCategoria(forma.categoria)}: ${forma.descripcion.trim()} · $${monto.toFixed(2)}`,
        usuario_id:    perfil?.id ?? null,
        referencia_id: String(gasto.id),
      })
      toast.success('Gasto registrado')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Nuevo gasto</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-primary-50 border border-primary-200 rounded-2xl px-4 py-3 text-xs text-primary-700">
          Gastos generales de la empresa. Las salidas de caja de sucursal se registran en Caja.
        </div>

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
            className={cn(
              'bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400',
              'placeholder:text-slate-400'
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Monto</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={forma.monto}
            onChange={(e) => cambiar('monto', e.target.value)}
            placeholder="0.00"
            className={cn(
              'bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400',
              'placeholder:text-slate-400'
            )}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GastosPage() {
  const { perfil, empresa, tz } = useApp()

  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
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
      toast.error(e.message ?? 'Error al cargar gastos')
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

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gastos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Gastos generales de la empresa</p>
        </div>
        <Button
          variante="primario"
          tamano="md"
          iconoIzq={<Plus className="w-4 h-4" />}
          onClick={() => setModalAbierto(true)}
        >
          Nuevo gasto
        </Button>
      </div>

      {/* Resumen total + breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Total */}
        <div className="bg-red-50 border border-red-200/60 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            {{ hoy: 'Total hoy', semana: 'Total 7 días', mes: 'Total del mes', personalizado: 'Total período' }[periodo] ?? 'Total'}
          </p>
          <p className="text-2xl font-bold text-red-700 mt-1">{formatoMoneda(totalGeneral)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {gastos.length} registro{gastos.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Top categorías */}
        {resumenCategorias.slice(0, 2).map((c) => (
          <div key={c.valor} className="bg-white border border-slate-200/60 rounded-2xl px-5 py-4">
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
                'px-3 py-2 rounded-2xl text-xs font-medium border transition-all',
                periodo === p.v
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
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
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
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
              <div key={g.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Receipt className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{g.descripcion}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {etiquetaCategoria(g.categoria)}
                    {g.usuario?.nombre ? ` · ${g.usuario.nombre}` : ''}
                    {' · '}
                    {formatoFechaHora(g.fecha)}
                  </p>
                </div>
                <p className="text-sm font-bold text-red-600 flex-shrink-0">
                  -{formatoMoneda(g.monto)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalAbierto && (
        <ModalNuevoGasto
          onClose={() => setModalAbierto(false)}
          onGuardado={() => { setModalAbierto(false); cargarGastos() }}
          empresa={empresa}
          perfil={perfil}
        />
      )}
    </div>
  )
}
