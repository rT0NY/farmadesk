import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus, Tag, Search, X, Edit2, Trash2, Calendar,
  Clock, Package, RefreshCw, Percent, DollarSign,
  ToggleLeft, ToggleRight, AlertTriangle, Gift,
  ArrowRight, ChevronDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, formatoFecha, fechaEnZona } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { CATEGORIAS_PRODUCTO } from '@/lib/constantes'
import { cn } from '@/lib/clases'

const TIPOS_OFERTA = [
  { valor: 'descuento_porcentaje', etiqueta: 'Descuento %', desc: 'Ej: 20% de descuento', icono: Percent },
  { valor: 'descuento_monto', etiqueta: 'Descuento $', desc: 'Ej: $10 menos', icono: DollarSign },
  { valor: 'precio_fijo', etiqueta: 'Precio fijo', desc: 'Ej: a $50 esta semana', icono: Tag },
  { valor: 'nxm', etiqueta: 'NxM (2x1, 3x2...)', desc: 'Compra N, paga M', icono: Gift },
]

const DIAS = [
  { valor: 0, etiqueta: 'Dom' }, { valor: 1, etiqueta: 'Lun' }, { valor: 2, etiqueta: 'Mar' },
  { valor: 3, etiqueta: 'Mié' }, { valor: 4, etiqueta: 'Jue' }, { valor: 5, etiqueta: 'Vie' }, { valor: 6, etiqueta: 'Sáb' },
]

function estadoOferta(o) {
  const hoy = new Date()
  const inicio = new Date(o.fecha_inicio + 'T00:00:00')
  const fin = o.fecha_fin ? new Date(o.fecha_fin + 'T23:59:59') : null
  if (!o.activa) return { label: 'Inactiva', cls: 'bg-slate-100 text-slate-600 border-slate-200' }
  if (inicio > hoy) return { label: 'Programada', cls: 'bg-blue-100 text-blue-700 border-blue-200' }
  if (fin && fin < hoy) return { label: 'Expirada', cls: 'bg-red-100 text-red-700 border-red-200' }
  return { label: 'Activa', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

function descOferta(o) {
  const base = (() => {
    if (o.tipo === 'descuento_porcentaje') return `${o.valor}% de descuento`
    if (o.tipo === 'descuento_monto') return `${formatoMoneda(o.valor)} de descuento`
    if (o.tipo === 'precio_fijo') return `Precio fijo: ${formatoMoneda(o.valor)}`
    if (o.tipo === 'nxm') return `Compra ${o.n_compra}, paga ${o.m_paga}`
    return ''
  })()
  if (o.producto_trigger_id && o.trigger?.nombre) {
    const cant = o.cantidad_minima > 1 ? `${o.cantidad_minima}x ` : ''
    return `Lleva ${cant}${o.trigger.nombre} → ${base}`
  }
  return base
}

function IndicadorImpacto({ tipo, valor, nCompra, mPaga, precioVenta, precioCompra }) {
  const pv = Number(precioVenta) || 0
  const pc = Number(precioCompra) || 0
  if (pv <= 0) return null

  let precioFinal = pv

  if (tipo === 'descuento_porcentaje' && Number(valor) > 0) {
    precioFinal = pv * (1 - Number(valor) / 100)
  } else if (tipo === 'descuento_monto' && Number(valor) > 0) {
    precioFinal = Math.max(0, pv - Number(valor))
  } else if (tipo === 'precio_fijo' && Number(valor) > 0) {
    precioFinal = Number(valor)
  } else if (tipo === 'nxm' && Number(nCompra) > 0 && Number(mPaga) > 0) {
    precioFinal = (pv * Number(mPaga)) / Number(nCompra)
  } else {
    return null
  }

  const descuento = pv - precioFinal
  const descuentoPct = pv > 0 ? (descuento / pv) * 100 : 0
  const ganancia = precioFinal - pc
  const esPerdida = pc > 0 && precioFinal < pc
  const esGratis = precioFinal <= 0
  const esCasiPerdida = pc > 0 && ganancia > 0 && ganancia < (pc * 0.1)

  let colorFondo, colorBorde
  if (esGratis || esPerdida) { colorFondo = 'bg-red-50'; colorBorde = 'border-red-200' }
  else if (esCasiPerdida) { colorFondo = 'bg-amber-50'; colorBorde = 'border-amber-200' }
  else { colorFondo = 'bg-emerald-50'; colorBorde = 'border-emerald-200' }

  return (
    <div className={cn('rounded-2xl border p-4 space-y-2 transition-all', colorFondo, colorBorde)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Precio venta</p>
          <p className="text-sm font-semibold text-slate-500 line-through tabular-nums">{formatoMoneda(pv)}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Descuento</p>
          <p className="text-sm font-bold text-primary-700 tabular-nums">-{descuentoPct.toFixed(0)}%</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Precio oferta</p>
          <p className={cn('text-xl font-bold tabular-nums', esGratis || esPerdida ? 'text-red-700' : esCasiPerdida ? 'text-amber-700' : 'text-emerald-700')}>
            {esGratis ? 'GRATIS' : formatoMoneda(precioFinal)}
          </p>
        </div>
      </div>

      <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
        <div className={cn('absolute left-0 top-0 h-full rounded-full transition-all',
          esPerdida || esGratis ? 'bg-red-500' : esCasiPerdida ? 'bg-amber-500' : 'bg-emerald-500'
        )} style={{ width: `${Math.max(2, Math.min(100, (precioFinal / pv) * 100))}%` }} />
        {pc > 0 && (
          <div className="absolute top-0 h-full w-0.5 bg-red-400" style={{ left: `${Math.min(100, (pc / pv) * 100)}%` }} />
        )}
      </div>

      {pc > 0 && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-400">$0</span>
          <span className="text-red-500 font-semibold">Costo: {formatoMoneda(pc)}</span>
          <span className="text-slate-400">{formatoMoneda(pv)}</span>
        </div>
      )}

      {pc > 0 && (
        <div className={cn('flex items-center gap-2 pt-1 border-t', esPerdida ? 'border-red-200' : esCasiPerdida ? 'border-amber-200' : 'border-emerald-200')}>
          {esPerdida || esGratis ? (
            <><AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" /><p className="text-xs font-bold text-red-700">{esGratis ? 'El producto será gratis' : `Pérdida de ${formatoMoneda(Math.abs(ganancia))} por unidad`}</p></>
          ) : esCasiPerdida ? (
            <><AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" /><p className="text-xs font-bold text-amber-700">Ganancia mínima: {formatoMoneda(ganancia)} / ud</p></>
          ) : (
            <p className="text-xs font-semibold text-emerald-700">Ganancia: {formatoMoneda(ganancia)} / ud ({((ganancia / pc) * 100).toFixed(1)}% sobre costo)</p>
          )}
        </div>
      )}
    </div>
  )
}

function TipoDescuentoSelector({ form, setForm }) {
  const tipos = form.esCruzada
    ? TIPOS_OFERTA.filter(t => t.valor !== 'nxm')
    : TIPOS_OFERTA

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {tipos.map(t => {
          const sel = form.tipo === t.valor
          const Ic = t.icono
          return (
            <button key={t.valor}
              onClick={() => setForm(f => ({ ...f, tipo: t.valor, valor: '', n_compra: '2', m_paga: '1' }))}
              className={cn('text-left p-3 rounded-2xl border transition-all',
                sel ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
              )}>
              <div className="flex items-center gap-2 mb-0.5">
                <Ic className={cn('w-4 h-4', sel ? 'text-purple-600' : 'text-slate-400')} />
                <span className={cn('text-sm font-semibold', sel ? 'text-purple-900' : 'text-slate-700')}>{t.etiqueta}</span>
              </div>
              <p className="text-[10px] text-slate-500">{t.desc}</p>
            </button>
          )
        })}
      </div>

      {form.tipo === 'nxm' ? (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Compra (N) *" type="number" min="2" value={form.n_compra}
            onChange={e => setForm(f => ({ ...f, n_compra: e.target.value }))} placeholder="2" />
          <Input label="Paga (M) *" type="number" min="1" value={form.m_paga}
            onChange={e => setForm(f => ({ ...f, m_paga: e.target.value }))} placeholder="1" />
        </div>
      ) : (
        <Input
          label={
            form.tipo === 'descuento_porcentaje' ? 'Porcentaje de descuento *'
            : form.tipo === 'descuento_monto' ? 'Monto a descontar *'
            : 'Precio fijo de venta *'
          }
          type="number" step="0.01" min="0"
          iconoIzq={form.tipo === 'descuento_porcentaje' ? <Percent className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
          value={form.valor}
          onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
          placeholder={form.tipo === 'descuento_porcentaje' ? '20' : '50.00'}
        />
      )}
    </div>
  )
}

const TIPOS_UI = [
  { id: 'descuento_porcentaje', icono: Percent,     titulo: '% Descuento',    desc: 'Quita un porcentaje del precio',     ejemplo: 'Ej: 20% OFF',              color: 'purple' },
  { id: 'descuento_monto',      icono: DollarSign,  titulo: '$ Descuento',    desc: 'Quita una cantidad fija del precio', ejemplo: 'Ej: $30 menos',            color: 'purple' },
  { id: 'precio_fijo',          icono: Tag,         titulo: 'Precio especial', desc: 'Fija el precio exacto del producto', ejemplo: 'Ej: a $50 esta semana',    color: 'purple' },
  { id: 'nxm',                  icono: Gift,        titulo: '2x1 / NxM',      desc: 'Compra N piezas y paga solo M',     ejemplo: 'Ej: lleva 3, paga 2',      color: 'purple' },
  { id: 'cruzada',              icono: ArrowRight,  titulo: 'Oferta cruzada', desc: 'Al llevar A, descuento en B',       ejemplo: 'Ej: lleva Ibuprofeno → 20% en Vitamina C', color: 'blue'   },
]

function sugerirNombre(form, prodSeleccionado, triggerSeleccionado) {
  const target = prodSeleccionado?.nombre || form.categoria || 'productos'
  if (form.esCruzada && triggerSeleccionado && prodSeleccionado) {
    const desc = form.tipo === 'descuento_porcentaje' && form.valor ? `${form.valor}% en ${prodSeleccionado.nombre}`
      : form.tipo === 'descuento_monto' && form.valor ? `$${form.valor} menos en ${prodSeleccionado.nombre}`
      : form.tipo === 'precio_fijo' && form.valor ? `${prodSeleccionado.nombre} a $${form.valor}`
      : `Descuento en ${prodSeleccionado.nombre}`
    const cant = Number(form.cantidad_minima) > 1 ? `${form.cantidad_minima}x ` : ''
    return `Lleva ${cant}${triggerSeleccionado.nombre} → ${desc}`
  }
  if (form.tipo === 'descuento_porcentaje' && form.valor) return `${form.valor}% en ${target}`
  if (form.tipo === 'descuento_monto' && form.valor)      return `$${form.valor} menos en ${target}`
  if (form.tipo === 'precio_fijo' && form.valor)          return `${target} a $${form.valor}`
  if (form.tipo === 'nxm' && form.n_compra && form.m_paga) return `${form.n_compra}x${form.m_paga} en ${target}`
  return ''
}

function ModalOferta({ abierto, onCerrar, onExito, ofertaEditar }) {
  const { empresa, tz, perfil } = useApp()
  const esEdicion = !!ofertaEditar

  const FORM_VACIO = {
    nombre: '', alcance: 'producto', producto_id: '', categoria: '',
    tipo: '', valor: '', n_compra: '2', m_paga: '1',
    fecha_inicio: fechaEnZona(tz), fecha_fin: '',
    dias_semana: [0,1,2,3,4,5,6], todosLosDias: true,
    hora_inicio: '', hora_fin: '', todoElDia: true,
    esCruzada: false, producto_trigger_id: '', cantidad_minima: '1',
  }

  const [paso, setPaso]       = useState(1)
  const [form, setForm]       = useState(FORM_VACIO)
  const [productos, setProductos]       = useState([])
  const [busquedaProd, setBusquedaProd] = useState('')
  const [busquedaTrigger, setBusquedaTrigger] = useState('')
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    cargarProductos()
    if (esEdicion) {
      const o = ofertaEditar
      setForm({
        nombre: o.nombre || '', alcance: o.producto_id ? 'producto' : 'categoria',
        producto_id: o.producto_id || '', categoria: o.categoria || '',
        tipo: o.tipo, valor: String(o.valor || ''),
        n_compra: String(o.n_compra || 2), m_paga: String(o.m_paga || 1),
        fecha_inicio: o.fecha_inicio || fechaEnZona(tz), fecha_fin: o.fecha_fin || '',
        dias_semana: o.dias_semana || [0,1,2,3,4,5,6], todosLosDias: JSON.stringify(o.dias_semana) === '[0,1,2,3,4,5,6]',
        hora_inicio: o.hora_inicio || '', hora_fin: o.hora_fin || '', todoElDia: !o.hora_inicio,
        esCruzada: !!o.producto_trigger_id,
        producto_trigger_id: o.producto_trigger_id || '',
        cantidad_minima: String(o.cantidad_minima || 1),
      })
      setPaso(2)
    } else {
      setForm(FORM_VACIO)
      setPaso(1)
    }
    setBusquedaProd('')
    setBusquedaTrigger('')
  }, [abierto, ofertaEditar, esEdicion])

  async function cargarProductos() {
    const { data } = await supabase.from('productos').select('id, nombre, categoria, precio_venta, precio_compra').eq('activo', true).order('nombre')
    setProductos(data || [])
  }

  const prodsFiltrados = busquedaProd.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busquedaProd.toLowerCase()))
    : productos.slice(0, 15)

  const triggerFiltrados = busquedaTrigger.trim()
    ? productos.filter(p => p.nombre.toLowerCase().includes(busquedaTrigger.toLowerCase()) && p.id !== form.producto_id)
    : productos.filter(p => p.id !== form.producto_id).slice(0, 15)

  const prodSeleccionado    = productos.find(p => p.id === form.producto_id)
  const triggerSeleccionado = productos.find(p => p.id === form.producto_trigger_id)

  function toggleDia(dia) {
    setForm(f => {
      const dias = f.dias_semana.includes(dia) ? f.dias_semana.filter(d => d !== dia) : [...f.dias_semana, dia].sort()
      return { ...f, dias_semana: dias, todosLosDias: dias.length === 7 }
    })
  }

  async function guardar() {
    if (!form.nombre.trim()) { toast.error('El nombre de la oferta es requerido'); return }
    if (!form.tipo) { toast.error('Selecciona un tipo de oferta'); return }
    if (form.dias_semana.length === 0) { toast.error('Selecciona al menos un día'); return }

    if (form.tipo === 'descuento_porcentaje') {
      const pct = Number(form.valor)
      if (pct <= 0) { toast.error('El porcentaje debe ser mayor a 0'); return }
      if (pct > 100) { toast.error('El descuento no puede superar el 100%'); return }
    }
    if (form.tipo === 'nxm') {
      const n = Number(form.n_compra)
      const m = Number(form.m_paga)
      if (n < 2) { toast.error('El cliente debe comprar al menos 2 unidades'); return }
      if (m < 1) { toast.error('El cliente debe pagar al menos 1 unidad'); return }
      if (m >= n) { toast.error(`El cliente paga (${m}) debe ser menor a lo que compra (${n})`); return }
    }

    if (form.alcance === 'producto') {
      const { data: existente } = await supabase.from('ofertas').select('id, nombre')
        .eq('producto_id', form.producto_id).eq('activa', true)
        .neq('id', ofertaEditar?.id || '00000000-0000-0000-0000-000000000000').maybeSingle()
      if (existente) { toast.error(`Ya tiene oferta activa: "${existente.nombre}"`); return }
    }

    setCargando(true)
    try {
      const datos = {
        empresa_id: empresa.id, nombre: form.nombre.trim(), tipo: form.tipo,
        valor: form.tipo === 'nxm' ? 0 : Number(form.valor),
        n_compra: form.tipo === 'nxm' ? Number(form.n_compra) : null,
        m_paga: form.tipo === 'nxm' ? Number(form.m_paga) : null,
        producto_id: form.alcance === 'producto' ? form.producto_id : null,
        categoria: form.alcance === 'categoria' ? form.categoria : null,
        fecha_inicio: form.fecha_inicio, fecha_fin: form.fecha_fin || null,
        dias_semana: form.todosLosDias ? [0,1,2,3,4,5,6] : form.dias_semana,
        hora_inicio: form.todoElDia ? null : form.hora_inicio || null,
        hora_fin: form.todoElDia ? null : form.hora_fin || null,
        activa: true,
        producto_trigger_id: form.esCruzada ? form.producto_trigger_id : null,
        cantidad_minima: form.esCruzada ? Number(form.cantidad_minima) || 1 : 1,
      }
      if (esEdicion) {
        const { error } = await supabase.from('ofertas').update(datos).eq('id', ofertaEditar.id)
        if (error) throw error
        await logBitacora({
          empresa_id:    empresa.id,
          tipo:          'oferta_editada',
          descripcion:   `Oferta editada: "${form.nombre.trim()}"`,
          usuario_id:    perfil?.id ?? null,
          referencia_id: ofertaEditar.id,
        })
        toast.success('Oferta actualizada')
      } else {
        const { data: nueva, error } = await supabase.from('ofertas').insert([datos]).select().single()
        if (error) throw error
        await logBitacora({
          empresa_id:    empresa.id,
          tipo:          'oferta_creada',
          descripcion:   `Oferta creada: "${form.nombre.trim()}" · tipo ${form.tipo}`,
          usuario_id:    perfil?.id ?? null,
          referencia_id: nueva?.id ?? null,
        })
        toast.success('Oferta creada')
      }
      onExito?.(); onCerrar()
    } catch (err) { toast.error(err.message || 'Error') }
    finally { setCargando(false) }
  }

  // Validación por paso
  function puedeAvanzar() {
    if (paso === 1) return !!form.tipo
    if (paso === 2) {
      if (form.tipo === 'nxm') {
        const n = Number(form.n_compra), m = Number(form.m_paga)
        if (n < 2 || m < 1 || m >= n) return false
      }
      if (!form.esCruzada) {
        if (form.alcance === 'producto' && !form.producto_id) return false
        if (form.alcance === 'categoria' && !form.categoria) return false
        if (form.tipo !== 'nxm' && (!form.valor || Number(form.valor) <= 0)) return false
        if (form.tipo === 'descuento_porcentaje' && Number(form.valor) > 100) return false
      } else {
        if (!form.producto_trigger_id || !form.producto_id) return false
        if (!form.valor || Number(form.valor) <= 0) return false
        if (form.tipo === 'descuento_porcentaje' && Number(form.valor) > 100) return false
        if (form.producto_trigger_id === form.producto_id) return false
      }
      return true
    }
    return true
  }

  function avanzar() {
    if (!puedeAvanzar()) {
      if (paso === 1) toast.error('Selecciona un tipo de oferta')
      else if (paso === 2) {
        if (!form.esCruzada) {
          if (!form.producto_id && form.alcance === 'producto') toast.error('Selecciona un producto')
          else if (!form.categoria && form.alcance === 'categoria') toast.error('Selecciona una categoría')
          else toast.error('Ingresa el valor del descuento')
        } else {
          if (!form.producto_trigger_id) toast.error('Selecciona el producto que activa la oferta')
          else if (!form.producto_id) toast.error('Selecciona el producto con descuento')
          else if (form.producto_trigger_id === form.producto_id) toast.error('Los dos productos deben ser diferentes')
          else toast.error('Ingresa el valor del descuento')
        }
      }
      return
    }
    if (paso === 2 && !form.nombre) {
      const sugerido = sugerirNombre(form, prodSeleccionado, triggerSeleccionado)
      if (sugerido) setForm(f => ({ ...f, nombre: sugerido }))
    }
    setPaso(p => p + 1)
  }

  if (!abierto) return null

  const PASOS_LABELS = ['Tipo', 'Configurar', 'Finalizar']
  const tipoInfo = TIPOS_UI.find(t => t.id === (form.esCruzada ? 'cruzada' : form.tipo))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !cargando && onCerrar()} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-9 h-9 rounded-2xl flex items-center justify-center',
                tipoInfo?.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100')}>
                {tipoInfo
                  ? (() => { const Ic = tipoInfo.icono; return <Ic className={cn('w-5 h-5', tipoInfo.color === 'blue' ? 'text-blue-600' : 'text-purple-600')} /> })()
                  : <Tag className="w-5 h-5 text-slate-400" />}
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{esEdicion ? 'Editar oferta' : 'Nueva oferta'}</h3>
                <p className="text-xs text-slate-400">{tipoInfo?.titulo || 'Elige el tipo'}</p>
              </div>
            </div>
            <button onClick={onCerrar} disabled={cargando}
              className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1">
            {PASOS_LABELS.map((label, i) => {
              const n = i + 1
              const hecho  = paso > n
              const activo = paso === n
              return (
                <div key={n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      hecho  ? 'bg-emerald-500 text-white' :
                      activo ? 'bg-purple-600 text-white' :
                               'bg-slate-100 text-slate-400')}>
                      {hecho ? '✓' : n}
                    </div>
                    <span className={cn('text-[9px] font-semibold whitespace-nowrap',
                      activo ? 'text-purple-600' : hecho ? 'text-emerald-600' : 'text-slate-400')}>
                      {label}
                    </span>
                  </div>
                  {i < PASOS_LABELS.length - 1 && (
                    <div className={cn('flex-1 h-0.5 mx-1.5 mb-4 rounded-full transition-colors',
                      paso > n ? 'bg-emerald-400' : 'bg-slate-200')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-5">

          {/* ══ PASO 1: Tipo de oferta ══ */}
          {paso === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">¿Qué tipo de descuento quieres crear?</p>
              <div className="grid grid-cols-1 gap-2.5">
                {TIPOS_UI.map(t => {
                  const Ic = t.icono
                  const sel = form.esCruzada ? t.id === 'cruzada' : form.tipo === t.id
                  return (
                    <button key={t.id}
                      onClick={() => {
                        if (t.id === 'cruzada') {
                          setForm(f => ({ ...f, esCruzada: true, alcance: 'producto', tipo: 'descuento_porcentaje', categoria: '' }))
                        } else {
                          setForm(f => ({ ...f, esCruzada: false, tipo: t.id, producto_trigger_id: '', cantidad_minima: '1' }))
                        }
                      }}
                      className={cn('flex items-center gap-4 p-4 rounded-2xl border text-left transition-all',
                        sel
                          ? t.color === 'blue'
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20'
                            : 'bg-purple-50 border-purple-300 ring-2 ring-purple-500/20'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                      )}>
                      <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0',
                        sel
                          ? t.color === 'blue' ? 'bg-blue-100' : 'bg-purple-100'
                          : 'bg-slate-100')}>
                        <Ic className={cn('w-5 h-5', sel
                          ? t.color === 'blue' ? 'text-blue-600' : 'text-purple-600'
                          : 'text-slate-400')} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-bold', sel
                          ? t.color === 'blue' ? 'text-blue-900' : 'text-purple-900'
                          : 'text-slate-800')}>{t.titulo}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t.desc}</p>
                        <p className={cn('text-[10px] font-semibold mt-1',
                          sel ? t.color === 'blue' ? 'text-blue-500' : 'text-purple-500' : 'text-slate-400')}>
                          {t.ejemplo}
                        </p>
                      </div>
                      {sel && (
                        <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0',
                          t.color === 'blue' ? 'bg-blue-600' : 'bg-purple-600')}>✓</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ══ PASO 2: Configuración ══ */}
          {paso === 2 && !form.esCruzada && (
            <div className="space-y-4">
              {form.tipo !== 'nxm' && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">¿En qué aplica?</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[{ id: 'producto', label: 'Producto específico' }, { id: 'categoria', label: 'Categoría completa' }].map(opt => (
                      <button key={opt.id} onClick={() => setForm(f => ({ ...f, alcance: opt.id, producto_id: '', categoria: '' }))}
                        className={cn('py-2.5 px-3 rounded-xl text-sm font-semibold transition-all border',
                          form.alcance === opt.id ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Picker producto */}
              {(form.alcance === 'producto' || form.tipo === 'nxm') && (
                prodSeleccionado ? (
                  <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-2xl px-4 py-3">
                    <Package className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-purple-900 truncate">{prodSeleccionado.nombre}</p>
                      <p className="text-xs text-purple-600">Venta: {formatoMoneda(prodSeleccionado.precio_venta)} · Costo: {formatoMoneda(prodSeleccionado.precio_compra)}</p>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, producto_id: '' }))} className="text-purple-400 hover:text-purple-700"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input placeholder="Buscar producto..." iconoIzq={<Search className="w-5 h-5" />}
                      value={busquedaProd} onChange={e => setBusquedaProd(e.target.value)} />
                    <div className="max-h-44 overflow-y-auto space-y-0.5 rounded-xl border border-slate-100 bg-slate-50 p-1">
                      {prodsFiltrados.map(p => (
                        <button key={p.id} onClick={() => { setForm(f => ({ ...f, producto_id: p.id })); setBusquedaProd('') }}
                          className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-white transition-colors flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-700 truncate">{p.nombre}</span>
                          <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">{formatoMoneda(p.precio_venta)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* Picker categoría */}
              {form.alcance === 'categoria' && form.tipo !== 'nxm' && (
                <Select valor={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v || '' }))}
                  opciones={CATEGORIAS_PRODUCTO.map(c => ({ valor: c, etiqueta: c }))} placeholder="Seleccionar categoría..." />
              )}

              {/* Valor */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {form.tipo === 'nxm' ? 'Configura el NxM' : 'Valor del descuento'}
                </p>
                {form.tipo === 'nxm' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">El cliente compra (N)</label>
                      <input type="number" min="2" max="999" value={form.n_compra}
                        onChange={e => setForm(f => ({ ...f, n_compra: e.target.value }))}
                        className="w-full h-11 px-3 text-center text-lg font-bold border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/30" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">El cliente paga (M)</label>
                      <input type="number" min="1" max={Math.max(1, Number(form.n_compra) - 1) || 1} value={form.m_paga}
                        onChange={e => setForm(f => ({ ...f, m_paga: e.target.value }))}
                        className="w-full h-11 px-3 text-center text-lg font-bold border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/30" />
                    </div>
                  </div>
                ) : (
                  <Input
                    label={form.tipo === 'descuento_porcentaje' ? 'Porcentaje de descuento *'
                      : form.tipo === 'descuento_monto' ? 'Monto a descontar *'
                      : 'Precio fijo de venta *'}
                    type="number" step="0.01" min="0"
                    max={form.tipo === 'descuento_porcentaje' ? '100' : undefined}
                    iconoIzq={form.tipo === 'descuento_porcentaje' ? <Percent className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                    value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    placeholder={form.tipo === 'descuento_porcentaje' ? '20' : '50.00'}
                  />
                )}
              </div>

              {/* Impact */}
              {prodSeleccionado && (
                <IndicadorImpacto tipo={form.tipo} valor={form.valor} nCompra={form.n_compra} mPaga={form.m_paga}
                  precioVenta={prodSeleccionado.precio_venta} precioCompra={prodSeleccionado.precio_compra} />
              )}
            </div>
          )}

          {/* ══ PASO 2: Oferta cruzada ══ */}
          {paso === 2 && form.esCruzada && (
            <div className="space-y-3">
              {/* Trigger */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-600 flex items-center justify-center text-white text-xs font-bold">1</div>
                  <div>
                    <p className="text-sm font-bold text-blue-900">El cliente lleva...</p>
                    <p className="text-xs text-blue-500">Producto que activa la oferta</p>
                  </div>
                </div>
                {triggerSeleccionado ? (
                  <div className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-3 py-2.5">
                    <Package className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-blue-900 truncate">{triggerSeleccionado.nombre}</p>
                      <p className="text-xs text-blue-500">{formatoMoneda(triggerSeleccionado.precio_venta)}</p>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, producto_trigger_id: '' }))} className="text-blue-400 hover:text-blue-700"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input placeholder="Buscar producto..." iconoIzq={<Search className="w-5 h-5" />}
                      value={busquedaTrigger} onChange={e => setBusquedaTrigger(e.target.value)} />
                    <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-xl border border-blue-100 bg-white p-1">
                      {triggerFiltrados.map(p => (
                        <button key={p.id} onClick={() => { setForm(f => ({ ...f, producto_trigger_id: p.id })); setBusquedaTrigger('') }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-700 truncate">{p.nombre}</span>
                          <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">{formatoMoneda(p.precio_venta)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-blue-700 flex-shrink-0">Cantidad mínima:</label>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setForm(f => ({ ...f, cantidad_minima: String(Math.max(1, Number(f.cantidad_minima) - 1)) }))}
                      className="w-7 h-7 rounded-lg bg-white border border-blue-200 text-blue-700 font-bold flex items-center justify-center hover:bg-blue-100 text-sm">−</button>
                    <input type="number" min="1" value={form.cantidad_minima}
                      onChange={e => setForm(f => ({ ...f, cantidad_minima: e.target.value }))}
                      className="w-12 h-7 text-center text-sm font-bold border border-blue-200 rounded-lg bg-white focus:outline-none" />
                    <button onClick={() => setForm(f => ({ ...f, cantidad_minima: String(Number(f.cantidad_minima) + 1) }))}
                      className="w-7 h-7 rounded-lg bg-white border border-blue-200 text-blue-700 font-bold flex items-center justify-center hover:bg-blue-100 text-sm">+</button>
                    <span className="text-xs text-blue-500">unidades</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full">
                  entonces obtiene <ArrowRight className="w-3.5 h-3.5" />
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Beneficio */}
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-purple-600 flex items-center justify-center text-white text-xs font-bold">2</div>
                  <div>
                    <p className="text-sm font-bold text-purple-900">Descuento en...</p>
                    <p className="text-xs text-purple-500">Producto que recibe el beneficio</p>
                  </div>
                </div>
                {prodSeleccionado ? (
                  <div className="flex items-center gap-3 bg-white border border-purple-200 rounded-xl px-3 py-2.5">
                    <Package className="w-4 h-4 text-purple-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-purple-900 truncate">{prodSeleccionado.nombre}</p>
                      <p className="text-xs text-purple-500">Venta: {formatoMoneda(prodSeleccionado.precio_venta)} · Costo: {formatoMoneda(prodSeleccionado.precio_compra)}</p>
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, producto_id: '' }))} className="text-purple-400 hover:text-purple-700"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Input placeholder="Buscar producto con descuento..." iconoIzq={<Search className="w-5 h-5" />}
                      value={busquedaProd} onChange={e => setBusquedaProd(e.target.value)} />
                    <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-xl border border-purple-100 bg-white p-1">
                      {prodsFiltrados.map(p => (
                        <button key={p.id} onClick={() => { setForm(f => ({ ...f, producto_id: p.id })); setBusquedaProd('') }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-purple-50 transition-colors flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-700 truncate">{p.nombre}</span>
                          <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">{formatoMoneda(p.precio_venta)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t border-purple-100 pt-3 space-y-3">
                  <p className="text-xs font-semibold text-purple-700">Tipo de descuento en el beneficio</p>
                  <div className="grid grid-cols-3 gap-2">
                    {TIPOS_UI.filter(t => !['nxm','cruzada'].includes(t.id)).map(t => {
                      const Ic = t.icono; const sel = form.tipo === t.id
                      return (
                        <button key={t.id} onClick={() => setForm(f => ({ ...f, tipo: t.id, valor: '' }))}
                          className={cn('p-2.5 rounded-xl border text-center transition-all',
                            sel ? 'bg-purple-100 border-purple-400 text-purple-800' : 'bg-white border-slate-200 text-slate-600 hover:border-purple-200')}>
                          <Ic className={cn('w-4 h-4 mx-auto mb-1', sel ? 'text-purple-600' : 'text-slate-400')} />
                          <p className="text-[10px] font-bold leading-tight">{t.titulo}</p>
                        </button>
                      )
                    })}
                  </div>
                  <Input
                    label={form.tipo === 'descuento_porcentaje' ? 'Porcentaje *'
                      : form.tipo === 'descuento_monto' ? 'Monto a descontar *'
                      : 'Precio fijo *'}
                    type="number" step="0.01" min="0"
                    iconoIzq={form.tipo === 'descuento_porcentaje' ? <Percent className="w-5 h-5" /> : <DollarSign className="w-5 h-5" />}
                    value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    placeholder={form.tipo === 'descuento_porcentaje' ? '20' : '50.00'}
                  />
                  {prodSeleccionado && (
                    <IndicadorImpacto tipo={form.tipo} valor={form.valor} nCompra={form.n_compra} mPaga={form.m_paga}
                      precioVenta={prodSeleccionado.precio_venta} precioCompra={prodSeleccionado.precio_compra} />
                  )}
                </div>
              </div>

              {/* Resumen */}
              {triggerSeleccionado && prodSeleccionado && form.valor && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-slate-200 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Resumen de la oferta</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1.5 rounded-xl">
                      {Number(form.cantidad_minima) > 1 ? `${form.cantidad_minima}x ` : ''}{triggerSeleccionado.nombre}
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="bg-purple-100 text-purple-800 text-xs font-bold px-3 py-1.5 rounded-xl">
                      {form.tipo === 'descuento_porcentaje' ? `${form.valor}% OFF ` : ''}
                      {form.tipo === 'descuento_monto' ? `-$${form.valor} ` : ''}
                      {form.tipo === 'precio_fijo' ? `$${form.valor} ` : ''}
                      en {prodSeleccionado.nombre}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ PASO 3: Nombre y programación ══ */}
          {paso === 3 && (
            <div className="space-y-4">
              <Input label="Nombre de la oferta *" value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: 20% en Vitaminas, Oferta cruzada Ibuprofeno..." autoFocus />
              {!form.nombre && sugerirNombre(form, prodSeleccionado, triggerSeleccionado) && (
                <button
                  onClick={() => setForm(f => ({ ...f, nombre: sugerirNombre(f, prodSeleccionado, triggerSeleccionado) }))}
                  className="text-xs text-purple-600 hover:text-purple-800 font-semibold underline">
                  Usar sugerencia: "{sugerirNombre(form, prodSeleccionado, triggerSeleccionado)}"
                </button>
              )}

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Fecha inicio *" type="date" iconoIzq={<Calendar className="w-5 h-5" />}
                  value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
                <Input label="Fecha fin (opcional)" type="date" iconoIzq={<Calendar className="w-5 h-5" />}
                  value={form.fecha_fin} onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))} />
              </div>
              <p className="text-xs text-slate-400 -mt-1">Sin fecha fin = oferta indefinida</p>

              {/* Días */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Días activa</p>
                  <button onClick={() => setForm(f => ({ ...f, todosLosDias: !f.todosLosDias, dias_semana: !f.todosLosDias ? [0,1,2,3,4,5,6] : f.dias_semana }))}
                    className={cn('text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors',
                      form.todosLosDias ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500')}>
                    {form.todosLosDias ? 'Todos los días' : 'Personalizar'}
                  </button>
                </div>
                {!form.todosLosDias && (
                  <div className="flex gap-1.5">
                    {DIAS.map(d => (
                      <button key={d.valor} onClick={() => toggleDia(d.valor)}
                        className={cn('flex-1 py-2 rounded-xl text-xs font-bold transition-all border',
                          form.dias_semana.includes(d.valor) ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-500 border-slate-200')}>
                        {d.etiqueta}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Horario */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Horario</p>
                  <button onClick={() => setForm(f => ({ ...f, todoElDia: !f.todoElDia, hora_inicio: '', hora_fin: '' }))}
                    className={cn('text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors',
                      form.todoElDia ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500')}>
                    {form.todoElDia ? 'Todo el día' : 'Personalizar'}
                  </button>
                </div>
                {!form.todoElDia && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Desde" type="time" iconoIzq={<Clock className="w-5 h-5" />}
                      value={form.hora_inicio} onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
                    <Input label="Hasta" type="time" iconoIzq={<Clock className="w-5 h-5" />}
                      value={form.hora_fin} onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer de navegación */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-2 flex-shrink-0">
          {paso > 1 && !esEdicion ? (
            <Button variante="secundario" onClick={() => setPaso(p => p - 1)} disabled={cargando} className="flex-shrink-0">
              ← Atrás
            </Button>
          ) : (
            <Button variante="secundario" onClick={onCerrar} disabled={cargando} className="flex-shrink-0">Cancelar</Button>
          )}
          {paso < 3 ? (
            <Button onClick={avanzar} className="flex-1">
              Siguiente →
            </Button>
          ) : (
            <Button onClick={guardar} cargando={cargando} className="flex-1">
              {esEdicion ? 'Guardar cambios' : 'Crear oferta'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function bordeOferta(o) {
  const est = estadoOferta(o)
  if (est.label === 'Activa')      return 'border-l-4 border-l-emerald-400'
  if (est.label === 'Programada')  return 'border-l-4 border-l-blue-400'
  if (est.label === 'Expirada')    return 'border-l-4 border-l-red-400'
  return 'border-l-4 border-l-slate-200'
}

export default function OfertasPage() {
  const { empresa, perfil } = useApp()
  const [ofertas, setOfertas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [ofertaEditar, setOfertaEditar] = useState(null)
  const [confirmarEliminar, setConfirmarEliminar] = useState(null)

  const cargar = async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase.from('ofertas')
        .select('*, productos!producto_id(nombre, precio_venta), trigger:productos!producto_trigger_id(nombre)')
        .order('creado_en', { ascending: false })
      if (error) throw error
      setOfertas(data || [])
    } catch (err) { console.error(err) }
    finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [])

  const conteos = useMemo(() => ({
    activas:    ofertas.filter(o => estadoOferta(o).label === 'Activa').length,
    programadas:ofertas.filter(o => estadoOferta(o).label === 'Programada').length,
    expiradas:  ofertas.filter(o => estadoOferta(o).label === 'Expirada').length,
    total:      ofertas.length,
  }), [ofertas])

  const filtradas = useMemo(() => {
    let r = ofertas
    if (filtro === 'activas')      r = r.filter(o => estadoOferta(o).label === 'Activa')
    else if (filtro === 'programadas') r = r.filter(o => estadoOferta(o).label === 'Programada')
    else if (filtro === 'inactivas')   r = r.filter(o => estadoOferta(o).label === 'Inactiva')
    else if (filtro === 'expiradas')   r = r.filter(o => estadoOferta(o).label === 'Expirada')
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(o => o.nombre.toLowerCase().includes(q) || o.productos?.nombre?.toLowerCase().includes(q) || o.categoria?.toLowerCase().includes(q))
    }
    return r
  }, [ofertas, filtro, busqueda])

  async function toggleActiva(oferta) {
    const { error } = await supabase.from('ofertas').update({ activa: !oferta.activa }).eq('id', oferta.id)
    if (error) { toast.error(error.message); return }
    await logBitacora({
      empresa_id:    empresa?.id,
      tipo:          oferta.activa ? 'oferta_desactivada' : 'oferta_activada',
      descripcion:   `Oferta "${oferta.nombre}" ${oferta.activa ? 'desactivada' : 'activada'}`,
      usuario_id:    perfil?.id ?? null,
      referencia_id: oferta.id,
    })
    toast.success(oferta.activa ? 'Oferta desactivada' : 'Oferta activada')
    cargar()
  }

  function solicitarEliminar(oferta) {
    setConfirmarEliminar(oferta)
  }

  async function eliminar(oferta) {
    setConfirmarEliminar(null)
    const { error } = await supabase.from('ofertas').delete().eq('id', oferta.id)
    if (error) { toast.error(error.message); return }
    await logBitacora({
      empresa_id:    empresa?.id,
      tipo:          'oferta_eliminada',
      descripcion:   `Oferta eliminada: "${oferta.nombre}"`,
      usuario_id:    perfil?.id ?? null,
      referencia_id: oferta.id,
    })
    toast.success('Oferta eliminada')
    cargar()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Ofertas</h1>
          <p className="text-sm text-slate-500 mt-1">Descuentos y promociones vigentes</p>
        </div>
        <Button onClick={() => { setOfertaEditar(null); setModalAbierto(true) }} iconoIzq={<Plus className="w-4 h-4" />}>
          <span className="hidden sm:inline">Nueva oferta</span><span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {/* Tarjetas de resumen */}
      {!cargando && ofertas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => setFiltro('activas')} className={cn(
            'p-4 rounded-2xl border text-left transition-all hover:shadow-md shadow-sm',
            filtro === 'activas' ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-100' : 'bg-white border-slate-200 hover:border-emerald-200'
          )}>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center mb-2">
              <ToggleRight className="w-4 h-4 text-emerald-600" />
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', conteos.activas > 0 ? 'text-emerald-600' : 'text-slate-900')}>{conteos.activas}</p>
            <p className="text-xs text-slate-400 mt-0.5">activas ahora</p>
          </button>

          <button onClick={() => setFiltro('programadas')} className={cn(
            'p-4 rounded-2xl border text-left transition-all hover:shadow-md shadow-sm',
            filtro === 'programadas' ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-slate-200 hover:border-blue-200'
          )}>
            <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center mb-2">
              <Calendar className="w-4 h-4 text-blue-600" />
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', conteos.programadas > 0 ? 'text-blue-600' : 'text-slate-900')}>{conteos.programadas}</p>
            <p className="text-xs text-slate-400 mt-0.5">programadas</p>
          </button>

          <button onClick={() => setFiltro('expiradas')} className={cn(
            'p-4 rounded-2xl border text-left transition-all hover:shadow-md shadow-sm',
            filtro === 'expiradas'
              ? 'bg-red-50 border-red-400 ring-2 ring-red-100'
              : conteos.expiradas > 0 ? 'bg-red-50/40 border-red-200 hover:border-red-300' : 'bg-white border-slate-200 hover:border-slate-300'
          )}>
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-2', conteos.expiradas > 0 ? 'bg-red-100' : 'bg-slate-100')}>
              <Clock className={cn('w-4 h-4', conteos.expiradas > 0 ? 'text-red-500' : 'text-slate-400')} />
            </div>
            <p className={cn('text-2xl font-bold tabular-nums', conteos.expiradas > 0 ? 'text-red-600' : 'text-slate-900')}>{conteos.expiradas}</p>
            <p className="text-xs text-slate-400 mt-0.5">expiradas</p>
          </button>

          <button onClick={() => setFiltro('todas')} className={cn(
            'p-4 rounded-2xl border text-left transition-all hover:shadow-md shadow-sm',
            filtro === 'todas' ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-100' : 'bg-white border-slate-200 hover:border-slate-300'
          )}>
            <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center mb-2">
              <Tag className="w-4 h-4 text-primary-600" />
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{conteos.total}</p>
            <p className="text-xs text-slate-400 mt-0.5">en total</p>
          </button>
        </div>
      )}

      {/* Búsqueda */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input placeholder="Buscar por nombre, producto o categoría..." iconoIzq={<Search className="w-5 h-5" />}
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
            iconoDer={busqueda && <button onClick={() => setBusqueda('')} className="hover:text-slate-600"><X className="w-4 h-4" /></button>}
          />
        </div>
        <button onClick={cargar} disabled={cargando} className="w-11 h-11 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:border-slate-300 transition-colors">
          <RefreshCw className={cn('w-4 h-4', cargando && 'animate-spin')} />
        </button>
      </div>

      {cargando && ofertas.length === 0 ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" /></div>
      ) : filtradas.length === 0 ? (
        <EmptyState icono={Tag} titulo={ofertas.length === 0 ? 'Sin ofertas' : 'Sin resultados'}
          descripcion={ofertas.length === 0 ? 'Crea tu primera oferta.' : 'Ajusta los filtros.'}
          accion={ofertas.length === 0 ? <Button onClick={() => setModalAbierto(true)} iconoIzq={<Plus className="w-4 h-4" />}>Crear oferta</Button> : null} />
      ) : (
        <div className="space-y-3">
          {filtradas.map(o => {
            const est = estadoOferta(o)
            const diasActivos = o.dias_semana?.length === 7 ? 'Todos los días' : (o.dias_semana || []).map(d => DIAS.find(dd => dd.valor === d)?.etiqueta).join(', ')
            return (
              <div key={o.id} className={cn('bg-white border rounded-2xl overflow-hidden transition-all hover:shadow-md shadow-sm', bordeOferta(o), !o.activa && 'opacity-60')}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                        {o.tipo === 'nxm' ? <Gift className="w-5 h-5 text-purple-600" /> :
                         o.tipo === 'descuento_porcentaje' ? <Percent className="w-5 h-5 text-purple-600" /> :
                         <Tag className="w-5 h-5 text-purple-600" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{o.nombre}</p>
                        <p className="text-xs text-purple-700 font-semibold">{descOferta(o)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {o.producto_trigger_id && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Cruzada</span>
                      )}
                      <span className={cn('text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border', est.cls)}>{est.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {o.producto_id ? <><Package className="w-3 h-3" /> {o.productos?.nombre || 'Producto'}</> : <><Tag className="w-3 h-3" /> {o.categoria}</>}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      <Calendar className="w-3 h-3" /> {formatoFecha(o.fecha_inicio)}{o.fecha_fin ? ` — ${formatoFecha(o.fecha_fin)}` : ' — Indefinida'}
                    </span>
                    {diasActivos !== 'Todos los días' && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{diasActivos}</span>}
                    {o.hora_inicio && <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> {o.hora_inicio} — {o.hora_fin}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setOfertaEditar(o); setModalAbierto(true) }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button onClick={() => solicitarEliminar(o)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors ml-auto">
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ModalOferta abierto={modalAbierto} onCerrar={() => { setModalAbierto(false); setOfertaEditar(null) }} onExito={cargar} ofertaEditar={ofertaEditar} />

      {/* Modal confirmación eliminar oferta */}
      {confirmarEliminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setConfirmarEliminar(null)} />
          <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-center font-semibold text-slate-900 mb-1">Eliminar oferta</h3>
            <p className="text-center text-sm text-slate-500 mb-5">
              ¿Eliminar <strong>"{confirmarEliminar.nombre}"</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmarEliminar(null)} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                Cancelar
              </button>
              <button onClick={() => eliminar(confirmarEliminar)} className="flex-1 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 text-sm font-medium text-white transition-colors">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}