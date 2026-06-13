import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Building2, Store, Plus, Users,
  MapPin, Trash2, Edit2, Pause, Play, AlertTriangle,
  TrendingUp, DollarSign, Save, X, Check, RefreshCw,
  CreditCard, Phone, CalendarClock, CheckCircle2, ChevronDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizar } from '@/lib/sanitizar'
import { formatoFecha, formatoMoneda } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/clases'
import { Skeleton } from '@/components/ui/Skeleton'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

function CampoTexto({ label, value, onChange, placeholder, opts = {} }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={opts.max}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
      />
    </div>
  )
}

function formatDireccion(s) {
  const partes = [s.calle, s.colonia, s.ciudad, s.estado].filter(Boolean)
  if (!partes.length) return null
  let dir = partes.join(', ')
  if (s.codigo_postal) dir += ` C.P. ${s.codigo_postal}`
  return dir
}

// ─── Modal confirmación ──────────────────────────────────────────────────────
function ModalConfirmar({ mensaje, onConfirmar, onCancelar, variante = 'danger' }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onCancelar} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 w-full sm:max-w-sm animate-modal-in">
        <div className={cn(
          'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4',
          variante === 'danger' ? 'bg-red-100' : 'bg-amber-100'
        )}>
          <AlertTriangle className={cn('w-6 h-6', variante === 'danger' ? 'text-red-600' : 'text-amber-600')} />
        </div>
        <p className="text-center text-sm text-slate-700 mb-5">{mensaje}</p>
        <div className="flex gap-2">
          <Button variante="secundario" onClick={onCancelar} className="flex-1">Cancelar</Button>
          <Button
            onClick={onConfirmar}
            className={cn('flex-1', variante === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : '')}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal editar sucursal ────────────────────────────────────────────────────
function ModalEditarSucursal({ sucursal, onCerrar, onExito }) {
  const [form, setForm] = useState({
    nombre:        sucursal.nombre || '',
    calle:         sucursal.calle || '',
    colonia:       sucursal.colonia || '',
    ciudad:        sucursal.ciudad || '',
    estado:        sucursal.estado || '',
    codigo_postal: sucursal.codigo_postal || '',
  })
  const [cargando, setCargando] = useState(false)
  const cargandoRef = useRef(false)
  const set = k => v => setForm(f => ({ ...f, [k]: v }))

  const guardar = async (e) => {
    e.preventDefault()
    const n = sanitizar(form.nombre)
    if (!n) return toast.error('Nombre requerido')
    if (cargandoRef.current) return
    cargandoRef.current = true
    setCargando(true)
    try {
      const { error } = await supabase.from('sucursales').update({
        nombre:        n,
        calle:         form.calle.trim() || null,
        colonia:       form.colonia.trim() || null,
        ciudad:        form.ciudad.trim() || null,
        estado:        form.estado.trim() || null,
        codigo_postal: form.codigo_postal.trim() || null,
      }).eq('id', sucursal.id)
      if (error) throw error
      toast.success('Sucursal actualizada')
      onExito?.()
    } catch (err) {
      toast.error(err.message || 'Error al actualizar')
    } finally {
      cargandoRef.current = false
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => !cargando && onCerrar()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] animate-modal-in">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center">
              <Store className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Editar sucursal</h3>
              <p className="text-xs text-slate-500">{sucursal.nombre}</p>
            </div>
          </div>
          <button onClick={onCerrar} disabled={cargando} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <CampoTexto label="Nombre de la sucursal *" value={form.nombre} onChange={set('nombre')} placeholder="Ej. Sucursal Norte" />
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Dirección</p>
            <div className="flex flex-col gap-3">
              <CampoTexto label="Calle y número" value={form.calle} onChange={set('calle')} placeholder="Ej. Av. Reforma 456" />
              <CampoTexto label="Colonia" value={form.colonia} onChange={set('colonia')} placeholder="Ej. Col. Centro" />
              <div className="grid grid-cols-2 gap-3">
                <CampoTexto label="Ciudad" value={form.ciudad} onChange={set('ciudad')} placeholder="Ej. Guadalajara" />
                <CampoTexto label="Estado" value={form.estado} onChange={set('estado')} placeholder="Ej. Jalisco" />
              </div>
              <CampoTexto label="Código postal" value={form.codigo_postal} onChange={set('codigo_postal')} placeholder="Ej. 44100" opts={{ max: 10 }} />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <Button variante="secundario" onClick={onCerrar} disabled={cargando} className="flex-1">Cancelar</Button>
          <Button onClick={guardar} cargando={cargando} className="flex-1" iconoIzq={<Save className="w-4 h-4" />}>Guardar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal nueva sucursal ────────────────────────────────────────────────────
function ModalNuevaSucursal({ empresaId, onCerrar, onExito }) {
  const [form, setForm] = useState({
    nombre: '', calle: '', colonia: '', ciudad: '', estado: '', codigo_postal: '',
  })
  const [cargando, setCargando] = useState(false)
  const cargandoRef = useRef(false)
  const set = k => v => setForm(f => ({ ...f, [k]: v }))

  const guardar = async (e) => {
    e.preventDefault()
    const n = sanitizar(form.nombre)
    if (!n) return toast.error('Nombre requerido')
    if (cargandoRef.current) return
    cargandoRef.current = true
    setCargando(true)
    try {
      const { error } = await supabase.from('sucursales').insert([{
        empresa_id:    empresaId,
        nombre:        n,
        calle:         form.calle.trim()         || null,
        colonia:       form.colonia.trim()       || null,
        ciudad:        form.ciudad.trim()        || null,
        estado:        form.estado.trim()        || null,
        codigo_postal: form.codigo_postal.trim() || null,
      }])
      if (error) throw error
      toast.success('Sucursal creada')
      onExito?.()
    } catch (err) {
      toast.error(err.message || 'Error al crear sucursal')
    } finally {
      cargandoRef.current = false
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={() => !cargando && onCerrar()} />
      <div className="relative w-full sm:max-w-md bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] animate-modal-in">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center">
            <Store className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Nueva sucursal</h3>
            <p className="text-xs text-slate-500">Se agregará a la empresa</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          <CampoTexto label="Nombre de la sucursal *" value={form.nombre} onChange={set('nombre')} placeholder="Ej. Sucursal Norte" />
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Dirección (opcional)</p>
            <div className="flex flex-col gap-3">
              <CampoTexto label="Calle y número" value={form.calle} onChange={set('calle')} placeholder="Ej. Av. Reforma 456" />
              <CampoTexto label="Colonia" value={form.colonia} onChange={set('colonia')} placeholder="Ej. Col. Centro" />
              <div className="grid grid-cols-2 gap-3">
                <CampoTexto label="Ciudad" value={form.ciudad} onChange={set('ciudad')} placeholder="Ej. Guadalajara" />
                <CampoTexto label="Estado" value={form.estado} onChange={set('estado')} placeholder="Ej. Jalisco" />
              </div>
              <CampoTexto label="Código postal" value={form.codigo_postal} onChange={set('codigo_postal')} placeholder="Ej. 44100" opts={{ max: 10 }} />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
          <Button variante="secundario" onClick={onCerrar} disabled={cargando} className="flex-1">Cancelar</Button>
          <Button onClick={guardar} cargando={cargando} className="flex-1">Crear</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Calendario de historial de pagos ────────────────────────────────────────
function CalendarioHistorial({ pagos, diaPago, creadoEn }) {
  const hoy = new Date()
  const anoActual = hoy.getFullYear()
  const [anosAbiertos, setAnosAbiertos] = useState({ [anoActual]: true })

  if (!diaPago && pagos.length === 0) return null

  const dp = parseInt(diaPago || 0)
  const DIAS = ['D','L','M','X','J','V','S']

  // Primer mes a mostrar: desde cuando fue creada la empresa (o hace 12 meses como fallback)
  const fechaInicio = creadoEn
    ? new Date(new Date(creadoEn).getFullYear(), new Date(creadoEn).getMonth(), 1)
    : new Date(hoy.getFullYear() - 1, hoy.getMonth(), 1)
  const mesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  // Generar todos los meses desde el inicio hasta hoy
  const todosMeses = []
  let cursor = new Date(fechaInicio)
  while (cursor <= mesActual) {
    todosMeses.push({ y: cursor.getFullYear(), m: cursor.getMonth() })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  // Agrupar por año
  const porAno = {}
  todosMeses.forEach(({ y, m }) => {
    if (!porAno[y]) porAno[y] = []
    porAno[y].push(m)
  })
  const anos = Object.keys(porAno).map(Number).sort((a, b) => b - a)

  const pagoMap = {}
  pagos.forEach(p => { pagoMap[p.fecha_pago.slice(0, 7)] = p })

  const toggleAno = (ano) => setAnosAbiertos(v => ({ ...v, [ano]: !v[ano] }))

  const renderMes = (y, m) => {
    const key = `${y}-${String(m + 1).padStart(2, '0')}`
    const pago = pagoMap[key]
    const diasEnMes = new Date(y, m + 1, 0).getDate()
    const primerDia = new Date(y, m, 1).getDay()
    const esPasado = y < hoy.getFullYear() || (y === hoy.getFullYear() && m < hoy.getMonth())
    const esActual = y === hoy.getFullYear() && m === hoy.getMonth()
    const dpMes = parseInt(pago?.dia_pago_programado ?? dp)
    const pagadoEl = pago ? parseInt(pago.fecha_pago.slice(8, 10)) : null
    const tardio = pagadoEl && dpMes && pagadoEl > dpMes
    const sinPago = !pago && dpMes && esPasado
    const nombre = new Date(y, m, 1).toLocaleDateString('es-MX', { month: 'short' })
    const cells = []
    for (let i = 0; i < primerDia; i++) cells.push(null)
    for (let d = 1; d <= diasEnMes; d++) cells.push(d)

    return (
      <div key={key} className={cn(
        'rounded-xl border p-2',
        pago && !tardio ? 'bg-emerald-50/50 border-emerald-200' :
        pago && tardio  ? 'bg-amber-50/50 border-amber-200' :
        sinPago         ? 'bg-red-50/30 border-red-100' :
                          'bg-white border-slate-100'
      )}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-bold text-slate-600 capitalize">{nombre}</p>
          {pago && !tardio && <span className="text-[9px] font-bold text-emerald-600">✓</span>}
          {pago && tardio  && <span className="text-[9px] font-bold text-amber-600">+{pagadoEl - dpMes}d</span>}
          {sinPago         && <span className="text-[9px] text-red-400">—</span>}
        </div>
        <div className="grid grid-cols-7 gap-0">
          {DIAS.map(d => (
            <div key={d} className="text-center text-[7px] text-slate-300 font-semibold leading-none mb-0.5">{d}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="h-[16px]" />
            const esDp     = d === dpMes
            const esPagado = d === pagadoEl
            const esHoyD   = esActual && d === hoy.getDate()
            let cls = 'h-[16px] w-[16px] mx-auto rounded-full flex items-center justify-center text-[7px] leading-none '
            if (esPagado && !tardio)     cls += 'bg-emerald-500 text-white font-bold'
            else if (esPagado && tardio) cls += 'bg-amber-400 text-white font-bold'
            else if (esDp && sinPago)    cls += 'ring-1 ring-red-400 text-red-500'
            else if (esDp && esActual)   cls += 'ring-1 ring-violet-400 text-violet-700 font-semibold'
            else if (esDp)               cls += 'text-slate-500 font-semibold'
            else if (esHoyD)             cls += 'bg-slate-200 text-slate-600'
            else                         cls += 'text-slate-200'
            return (
              <div key={`${d}_${i}`} className="flex justify-center">
                <div className={cls}>{d}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {anos.map(ano => {
        const mesesDelAno = porAno[ano]
        const pagosEnAno  = mesesDelAno.filter(m => pagoMap[`${ano}-${String(m + 1).padStart(2, '0')}`]).length
        const abierto     = !!anosAbiertos[ano]
        const alCorriente = pagosEnAno === mesesDelAno.length && mesesDelAno.length > 0

        return (
          <div key={ano} className="border border-slate-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggleAno(ano)}
              className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/60 hover:bg-slate-100/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <p className="text-sm font-bold text-slate-700">{ano}</p>
                <span className="text-xs text-slate-400">
                  {pagosEnAno}/{mesesDelAno.length} mes{mesesDelAno.length !== 1 ? 'es' : ''}
                </span>
                {alCorriente && (
                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                    Al corriente
                  </span>
                )}
              </div>
              <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform flex-shrink-0', abierto && 'rotate-180')} />
            </button>
            {abierto && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3 border-t border-slate-100">
                {[...mesesDelAno].reverse().map(m => renderMes(ano, m))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function DetalleEmpresaPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [empresa, setEmpresa] = useState(null)
  const [sucursales, setSucursales] = useState([])
  const [propietario, setPropietario] = useState(null)
  const [totalUsuarios, setTotalUsuarios] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [modalNueva, setModalNueva] = useState(false)
  const [editarSucursal, setEditarSucursal] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [billing, setBilling] = useState({ cliente_nombre: '', cliente_telefono: '', dia_pago: '', ultimo_pago: null, precio_mensual: '', creado_en: null })
  const [billingEdit, setBillingEdit] = useState(false)
  const [billingGuardando, setBillingGuardando] = useState(false)
  const billingGuardandoRef = useRef(false)
  const [pagosHistorial, setPagosHistorial] = useState([])
  const [historialAbierto, setHistorialAbierto] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      // Empresa via RPC (SECURITY DEFINER — bypasses RLS para super_admin)
      const { data: lista, error: errLista } = await supabase.rpc('resumen_empresas_super')
      if (errLista) throw errLista
      const emp = (lista || []).find(e => String(e.id) === String(id))
      if (!emp) {
        toast.error('Empresa no encontrada')
        navigate('/super')
        return
      }
      setEmpresa(emp)

      // Datos de cobranza privados
      const { data: bil } = await supabase.from('empresas')
        .select('cliente_nombre, cliente_telefono, dia_pago, ultimo_pago, precio_mensual, creado_en')
        .eq('id', id).single()
      if (bil) {
        setBilling({
          cliente_nombre:   bil.cliente_nombre   ?? '',
          cliente_telefono: bil.cliente_telefono ?? '',
          dia_pago:         bil.dia_pago != null ? String(bil.dia_pago) : '',
          ultimo_pago:      bil.ultimo_pago ?? null,
          precio_mensual:   bil.precio_mensual != null ? String(bil.precio_mensual) : '',
          creado_en:        bil.creado_en ?? null,
        })
      }

      // Historial de pagos (RPC con SECURITY DEFINER para bypasear RLS de perfiles)
      const { data: historial } = await supabase
        .rpc('obtener_historial_pagos', { p_empresa_id: id })
      setPagosHistorial(historial || [])

      // Sucursales: intentar RPC primero, luego calcular client-side
      const { data: sucsResumen, error: errResumen } = await supabase
        .rpc('super_resumen_sucursales', { p_empresa_id: id })

      if (errResumen) console.warn('super_resumen_sucursales falló, calculando client-side:', errResumen.message)

      if (!errResumen && sucsResumen) {
        setSucursales(sucsResumen)
      } else {
        // Calcular métricas del mes client-side
        const { data: sucsList } = await supabase
          .from('sucursales')
          .select('*')
          .eq('empresa_id', id)
          .order('nombre')
        const sucsBase = sucsList || []
        const sucursalIds = sucsBase.map(s => s.id)

        let sucsConMetricas = sucsBase.map(s => ({
          ...s, total_ventas_mes: 0, ingresos_mes: 0, costo_mes: 0, ganancia_mes: 0,
        }))

        if (sucursalIds.length > 0) {
          const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

          const { data: ventas } = await supabase
            .from('ventas')
            .select('id, sucursal_id, total')
            .in('sucursal_id', sucursalIds)
            .eq('estado', 'completada')
            .gte('creado_en', primerDiaMes)

          const ventasIds = (ventas || []).map(v => v.id)
          const costosMap = {}

          if (ventasIds.length > 0) {
            const { data: detalles } = await supabase
              .from('detalle_ventas')
              .select('venta_id, cantidad, costo_unitario, productos(precio_compra)')
              .in('venta_id', ventasIds)
            ;(detalles || []).forEach(d => {
              const c = d.cantidad * Number(d.costo_unitario ?? d.productos?.precio_compra ?? 0)
              costosMap[d.venta_id] = (costosMap[d.venta_id] || 0) + c
            })
          }

          const metricasMap = {}
          ;(ventas || []).forEach(v => {
            if (!metricasMap[v.sucursal_id]) {
              metricasMap[v.sucursal_id] = { total_ventas_mes: 0, ingresos_mes: 0, costo_mes: 0 }
            }
            metricasMap[v.sucursal_id].total_ventas_mes++
            metricasMap[v.sucursal_id].ingresos_mes += Number(v.total) || 0
            metricasMap[v.sucursal_id].costo_mes += costosMap[v.id] || 0
          })

          sucsConMetricas = sucsBase.map(s => {
            const m = metricasMap[s.id] || { total_ventas_mes: 0, ingresos_mes: 0, costo_mes: 0 }
            return { ...s, ...m, ganancia_mes: m.ingresos_mes - m.costo_mes }
          })
        }

        setSucursales(sucsConMetricas)
      }

      // Propietario
      const propId = emp.propietario_id || emp.propietario
      if (propId) {
        const { data: prop } = await supabase
          .from('perfiles')
          .select('id, nombre, correo')
          .eq('id', propId)
          .maybeSingle()
        setPropietario(prop)
      }

      // Total usuarios activos
      const { count } = await supabase
        .from('perfiles')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', id)
        .eq('activo', true)
      setTotalUsuarios(count || 0)
    } catch (err) {
      toast.error(err.message || 'Error al cargar empresa')
    } finally {
      setCargando(false)
    }
  }, [id])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  // Refresco automático cada 60 segundos para mantener ventas actualizadas
  useEffect(() => {
    const interval = setInterval(() => { cargar() }, 60000)
    return () => clearInterval(interval)
  }, [cargar])

  const toggleSucursal = async (sucursal) => {
    const nuevaActiva = !sucursal.activa
    const { error } = await supabase
      .from('sucursales')
      .update({ activa: nuevaActiva })
      .eq('id', sucursal.id)
    if (error) return toast.error(error.message)
    toast.success(nuevaActiva ? 'Sucursal activada' : 'Sucursal suspendida')
    cargar()
  }

  const eliminarSucursal = async (sucursal) => {
    setConfirmar({
      mensaje: `¿Eliminar la sucursal "${sucursal.nombre}"? Se eliminarán todos sus datos. Esta acción no se puede deshacer.`,
      variante: 'danger',
      onConfirmar: async () => {
        setConfirmar(null)
        const { error } = await supabase.from('sucursales').delete().eq('id', sucursal.id)
        if (error) return toast.error(error.message)
        toast.success('Sucursal eliminada')
        cargar()
      },
    })
  }

  const accionEmpresa = async (tipo) => {
    if (tipo === 'suspender') {
      setConfirmar({
        mensaje: `¿Suspender la empresa "${empresa.nombre}"? Todos sus usuarios perderán acceso.`,
        variante: 'danger',
        onConfirmar: async () => {
          setConfirmar(null)
          const { error } = await supabase.rpc('suspender_empresa', { p_empresa_id: id, p_motivo: null })
          if (error) return toast.error(error.message)
          toast.success('Empresa suspendida')
          cargar()
        },
      })
    } else if (tipo === 'reactivar') {
      const { error } = await supabase.rpc('reactivar_empresa', { p_empresa_id: id })
      if (error) return toast.error(error.message)
      toast.success('Empresa reactivada')
      cargar()
    } else if (tipo === 'eliminar') {
      setConfirmar({
        mensaje: `¿Eliminar TODOS los datos de "${empresa.nombre}"? Esto borrará usuarios, ventas, inventario y todo el historial. Acción irreversible.`,
        variante: 'danger',
        onConfirmar: async () => {
          setConfirmar(null)
          const { error } = await supabase.rpc('eliminar_empresa_completo', { p_empresa_id: id })
          if (error) return toast.error(error.message)
          toast.success('Empresa eliminada')
          navigate('/super')
        },
      })
    }
  }

  const guardarBilling = async () => {
    if (billingGuardandoRef.current) return
    billingGuardandoRef.current = true
    setBillingGuardando(true)
    const { error } = await supabase.rpc('actualizar_billing_empresa', {
      p_empresa_id:       id,
      p_cliente_nombre:   billing.cliente_nombre.trim() || null,
      p_cliente_telefono: billing.cliente_telefono.trim() || null,
      p_dia_pago:         billing.dia_pago ? parseInt(billing.dia_pago) : null,
      p_ultimo_pago:      billing.ultimo_pago || null,
      p_precio_mensual:   billing.precio_mensual ? parseFloat(billing.precio_mensual) : null,
    })
    billingGuardandoRef.current = false
    setBillingGuardando(false)
    if (error) { toast.error(error.message); return }
    toast.success('Datos de cobranza guardados')
    setBillingEdit(false)
  }

  const marcarPagadoDetalle = async () => {
    const hoy = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.rpc('marcar_empresa_pagada', { p_empresa_id: id })
    if (error) { toast.error(error.message); return }
    setBilling(prev => ({ ...prev, ultimo_pago: hoy }))
    const dpNum = billing.dia_pago ? parseInt(billing.dia_pago) : null
    setPagosHistorial(prev => [
      { fecha_pago: hoy, dia_pago_programado: dpNum },
      ...prev.filter(p => p.fecha_pago.slice(0, 7) !== hoy.slice(0, 7)),
    ])
    toast.success('Pago registrado')
  }

  // Estado de pago para esta empresa
  const estadoPagoDetalle = (() => {
    if (!billing.dia_pago) return null
    const hoy = new Date(); const diaHoy = hoy.getDate()
    if (billing.ultimo_pago) {
      const up = new Date(billing.ultimo_pago + 'T12:00:00')
      if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth()) return 'pagado'
    }
    if (diaHoy === parseInt(billing.dia_pago)) return 'hoy'
    if (diaHoy > parseInt(billing.dia_pago))   return 'vencido'
    return 'proximo'
  })()

  if (cargando) {
    return (
      <div className="flex flex-col gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
    )
  }

  if (!empresa) return null

  const sucursalesActivas = sucursales.filter(s => s.activa).length
  const _esSuspendida = empresa.estado === 'suspendida'

  return (
    <div className="space-y-5">
      {/* Volver */}
      <button
        onClick={() => navigate('/super')}
        className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a empresas
      </button>

      {/* Header */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl p-5 shadow-card">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-7 h-7 text-primary-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">
                  {empresa.nombre}
                </h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Creada el {formatoFecha(empresa.creado_en)}
                </p>
              </div>
              <div className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border',
                empresa.estado === 'activa'    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                empresa.estado === 'suspendida' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                  'bg-red-50 text-red-700 border-red-200'
              )}>
                <span className={cn('w-1.5 h-1.5 rounded-full',
                  empresa.estado === 'activa' ? 'bg-emerald-500' :
                  empresa.estado === 'suspendida' ? 'bg-amber-500' : 'bg-red-500'
                )} />
                {empresa.estado === 'activa' ? 'Activa' : empresa.estado === 'suspendida' ? 'Suspendida' : 'Eliminada'}
              </div>
            </div>
            {propietario && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 text-sm">
                <Users className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-700">{propietario.nombre}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500">{propietario.correo}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-slate-50 rounded-2xl py-3 text-center">
            <Store className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{sucursalesActivas}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Activas</p>
          </div>
          <div className="bg-slate-50 rounded-2xl py-3 text-center">
            <Store className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{sucursales.length}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
          </div>
          <div className="bg-slate-50 rounded-2xl py-3 text-center">
            <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{totalUsuarios || empresa.total_usuarios || 0}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Usuarios</p>
          </div>
          <div className="bg-slate-50 rounded-2xl py-3 text-center">
            <TrendingUp className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-900">{empresa.total_ventas_mes || 0}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Ventas/mes</p>
          </div>
        </div>

        {Number(empresa.monto_ventas_mes) > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Ingresos del mes</span>
              <span className="font-bold text-slate-900">{formatoMoneda(empresa.monto_ventas_mes)}</span>
            </div>
            {/* Ganancia consolidada de todas las sucursales */}
            {sucursales.length > 0 && sucursales[0]?.ganancia_mes !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Ganancia total</span>
                <span className="font-bold text-emerald-700">
                  {formatoMoneda(sucursales.reduce((s, suc) => s + (Number(suc.ganancia_mes) || 0), 0))}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Acciones empresa */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100 flex-wrap">
          {empresa.estado === 'activa' ? (
            <button
              onClick={() => accionEmpresa('suspender')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors border border-amber-200"
            >
              <Pause className="w-3.5 h-3.5" /> Suspender empresa
            </button>
          ) : empresa.estado === 'suspendida' ? (
            <button
              onClick={() => accionEmpresa('reactivar')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors border border-emerald-200"
            >
              <Play className="w-3.5 h-3.5" /> Reactivar empresa
            </button>
          ) : null}
          <button
            onClick={() => accionEmpresa('eliminar')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-red-700 hover:bg-red-50 transition-colors border border-red-200 ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar empresa y todos sus datos
          </button>
        </div>
      </div>

      {/* Cobranza privada — solo super admin */}
      <div className="bg-white/80 backdrop-blur-xl border border-violet-200/70 rounded-3xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-violet-900">Datos del dueño</p>
              <p className="text-xs text-violet-500">Solo visible para ti</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {estadoPagoDetalle === 'pagado' && (
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3" />Pagado este mes
              </span>
            )}
            {(estadoPagoDetalle === 'hoy' || estadoPagoDetalle === 'vencido') && (
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
                estadoPagoDetalle === 'hoy' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {estadoPagoDetalle === 'hoy' ? 'Pago hoy' : 'Pago vencido'}
              </span>
            )}
            <button
              onClick={() => setBillingEdit(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
            >
              <Edit2 className="w-3 h-3" />{billingEdit ? 'Cancelar' : 'Editar'}
            </button>
          </div>
        </div>

        {billingEdit ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">Nombre del contacto</label>
              <input value={billing.cliente_nombre} onChange={e => setBilling(p => ({ ...p, cliente_nombre: e.target.value }))}
                placeholder="Ej. Rodrigo García"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">Teléfono</label>
              <input type="tel" value={billing.cliente_telefono} onChange={e => setBilling(p => ({ ...p, cliente_telefono: e.target.value }))}
                placeholder="55 1234 5678"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-500">Día de pago mensual</label>
                {billing.dia_pago && (
                  <button
                    type="button"
                    onClick={() => setBilling(p => ({ ...p, dia_pago: '' }))}
                    className="text-[10px] font-semibold text-slate-400 hover:text-red-500 transition-colors"
                  >
                    Quitar
                  </button>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setBilling(p => ({ ...p, dia_pago: String(d) }))}
                    className={cn(
                      'h-9 rounded-xl text-sm font-semibold transition-all',
                      billing.dia_pago === String(d)
                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                        : 'bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700 border border-slate-200'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              {billing.dia_pago ? (
                <p className="text-xs text-violet-700 font-medium">
                  Se cobra el día <strong>{billing.dia_pago}</strong> de cada mes
                </p>
              ) : (
                <p className="text-xs text-slate-400">Selecciona el día del mes en que se cobra</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Precio mensual (MXN)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">$</span>
                <input type="number" min="0" step="0.01"
                  value={billing.precio_mensual}
                  onChange={e => setBilling(p => ({ ...p, precio_mensual: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500">Último pago recibido (opcional)</label>
              <input
                type="date"
                value={billing.ultimo_pago || ''}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => {
                  const val = e.target.value
                  const dia = val ? new Date(val + 'T12:00:00').getDate() : null
                  setBilling(p => ({
                    ...p,
                    ultimo_pago: val || null,
                    dia_pago: dia ? String(dia) : p.dia_pago,
                  }))
                }}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 bg-white"
              />
              {billing.ultimo_pago && (
                <p className="text-[10px] text-slate-400">
                  Pago registrado el {new Date(billing.ultimo_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            <button
              onClick={guardarBilling} disabled={billingGuardando}
              className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60"
            >
              <Save className="w-4 h-4" />{billingGuardando ? 'Guardando…' : 'Guardar datos'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(billing.cliente_nombre || billing.cliente_telefono || billing.dia_pago || billing.precio_mensual) ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {billing.cliente_nombre && (
                  <div className="bg-slate-50 rounded-2xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Contacto</p>
                    <p className="text-sm font-semibold text-slate-900">{billing.cliente_nombre}</p>
                  </div>
                )}
                {billing.cliente_telefono && (
                  <div className="bg-slate-50 rounded-2xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Teléfono</p>
                    <a href={`tel:${billing.cliente_telefono}`}
                      className="flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:underline">
                      <Phone className="w-3.5 h-3.5" />{billing.cliente_telefono}
                    </a>
                  </div>
                )}
                {billing.precio_mensual && Number(billing.precio_mensual) > 0 && (
                  <div className="bg-slate-50 rounded-2xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Precio mensual</p>
                    <p className="text-sm font-bold text-emerald-700 tabular-nums">{formatoMoneda(billing.precio_mensual)}</p>
                  </div>
                )}
                {billing.dia_pago && (
                  <div className="bg-slate-50 rounded-2xl px-4 py-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Día de pago</p>
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-900">Día {billing.dia_pago}</p>
                    </div>
                    {billing.ultimo_pago && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Último: {new Date(billing.ultimo_pago + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-2">Sin datos de cobranza. Presiona Editar para agregar.</p>
            )}
            {estadoPagoDetalle && estadoPagoDetalle !== 'pagado' && estadoPagoDetalle !== 'proximo' && (
              <button
                onClick={marcarPagadoDetalle}
                className="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />Marcar como pagado
              </button>
            )}
          </div>
        )}
      </div>

      {/* Historial de pagos */}
      {(pagosHistorial.length > 0 || billing.dia_pago) && (
        <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
          <button
            onClick={() => setHistorialAbierto(v => !v)}
            className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors"
          >
            <div className="w-8 h-8 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <CalendarClock className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-slate-900">Historial de pagos</p>
              <p className="text-xs text-slate-400">
                {pagosHistorial.length > 0
                  ? `${pagosHistorial.length} pago${pagosHistorial.length !== 1 ? 's' : ''} registrado${pagosHistorial.length !== 1 ? 's' : ''}`
                  : 'Sin pagos registrados aún'}
              </p>
            </div>
            <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', historialAbierto && 'rotate-180')} />
          </button>
          {historialAbierto && (
            <div className="px-5 pb-5 border-t border-slate-100">
              <p className="text-[10px] text-slate-400 pt-3 pb-3">
                Verde = a tiempo · Amarillo = tarde · Sin pago = mes no registrado
              </p>
              <CalendarioHistorial pagos={pagosHistorial} diaPago={billing.dia_pago} creadoEn={billing.creado_en} />
            </div>
          )}
        </div>
      )}

      {/* Notas internas */}
      {empresa.notas_internas && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-4">
          <div className="flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">Notas internas</p>
              <p className="text-sm text-amber-900">{empresa.notas_internas}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sucursales */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Sucursales</h2>
            <button
              onClick={cargar}
              disabled={cargando}
              title="Refrescar datos"
              className="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', cargando && 'animate-spin')} />
            </button>
          </div>
          <Button
            tamano="sm"
            onClick={() => setModalNueva(true)}
            iconoIzq={<Plus className="w-4 h-4" />}
          >
            Nueva sucursal
          </Button>
        </div>

        {sucursales.length === 0 ? (
          <div className="bg-white/80 border border-slate-100 rounded-3xl p-8 text-center">
            <p className="text-sm text-slate-500">Sin sucursales</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sucursales.map(s => {
              const direccionObj = s
              const hayVentas = Number(s.total_ventas_mes) > 0
              const ganancia = Number(s.ganancia_mes) || 0
              const ingresos = Number(s.ingresos_mes) || 0
              const margenPct = ingresos > 0 ? (ganancia / ingresos * 100) : 0
              return (
                <div
                  key={s.id}
                  className={cn(
                    'bg-white/80 backdrop-blur-xl border rounded-2xl p-4 shadow-sm flex flex-col gap-3',
                    s.activa ? 'border-slate-200/60' : 'border-amber-200 opacity-70'
                  )}
                >
                  {/* Header sucursal */}
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0',
                      s.activa ? 'bg-emerald-50' : 'bg-amber-50'
                    )}>
                      <Store className={cn('w-5 h-5', s.activa ? 'text-emerald-600' : 'text-amber-500')} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 truncate">{s.nombre}</p>
                        {!s.activa && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                            Suspendida
                          </span>
                        )}
                      </div>
                      {formatDireccion(direccionObj) ? (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          {formatDireccion(direccionObj)}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">Sin dirección</p>
                      )}
                    </div>
                  </div>

                  {/* Métricas del mes */}
                  <div className="bg-slate-50 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Este mes {!hayVentas && <span className="font-normal normal-case">(sin ventas)</span>}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-slate-500">Ventas</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums">{Number(s.total_ventas_mes) || 0}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Ingresos</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums">{formatoMoneda(ingresos)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Costo</p>
                        <p className="text-sm font-semibold text-slate-600 tabular-nums">{formatoMoneda(Number(s.costo_mes) || 0)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-500">Ganancia neta</p>
                        <p className={cn(
                          'text-sm font-bold tabular-nums',
                          ganancia > 0 ? 'text-emerald-600' : ganancia < 0 ? 'text-red-600' : 'text-slate-400'
                        )}>
                          {formatoMoneda(ganancia)}
                          {hayVentas && (
                            <span className="text-[10px] font-normal ml-1 opacity-70">
                              ({margenPct.toFixed(1)}%)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Acciones — todos flex-1 para igual ancho */}
                  <div className="flex gap-1.5 pt-1 border-t border-slate-100">
                    <button
                      onClick={() => setEditarSucursal(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-primary-50 hover:text-primary-700 transition-colors border border-slate-200"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      onClick={() => toggleSucursal(s)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-colors border',
                        s.activa
                          ? 'text-amber-700 hover:bg-amber-50 border-amber-200'
                          : 'text-emerald-700 hover:bg-emerald-50 border-emerald-200'
                      )}
                    >
                      {s.activa
                        ? <><Pause className="w-3.5 h-3.5" /> Suspender</>
                        : <><Play className="w-3.5 h-3.5" /> Activar</>
                      }
                    </button>
                    <button
                      onClick={() => eliminarSucursal(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 transition-colors border border-red-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {modalNueva && (
        <ModalNuevaSucursal
          empresaId={id}
          onCerrar={() => setModalNueva(false)}
          onExito={() => { setModalNueva(false); cargar() }}
        />
      )}
      {editarSucursal && (
        <ModalEditarSucursal
          sucursal={editarSucursal}
          onCerrar={() => setEditarSucursal(null)}
          onExito={() => { setEditarSucursal(null); cargar() }}
        />
      )}
      {confirmar && (
        <ModalConfirmar
          mensaje={confirmar.mensaje}
          variante={confirmar.variante}
          onConfirmar={confirmar.onConfirmar}
          onCancelar={() => setConfirmar(null)}
        />
      )}
    </div>
  )
}
