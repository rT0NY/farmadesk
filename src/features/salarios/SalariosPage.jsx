import { useState, useEffect, useCallback } from 'react'
import { X, BadgeCheck, RefreshCw, Users, Bell, Settings, Check, ChevronRight, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/clases'
import { formatoMoneda, fechaEnZona, addDias, dowEnZona } from '@/lib/formatos'

const DIAS_ORD   = [1, 2, 3, 4, 5, 6, 0]
const DIA_LETRA  = { 0: 'D', 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S' }
const DIA_NOMBRE = { 0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' }

function lunesActual(tz = 'America/Mexico_City') {
  const hoy  = fechaEnZona(tz)
  const dow  = dowEnZona(hoy)           // 0=Dom…6=Sáb, calculado en tz de la empresa
  const diff = dow === 0 ? -6 : 1 - dow
  return addDias(hoy, diff)
}

function semanaFechas(isoLunes) {
  return Array.from({ length: 7 }, (_, i) => addDias(isoLunes, i))
}

function formatRango(isoDate) {
  const d   = new Date(isoDate + 'T12:00:00')
  const fin = new Date(d)
  fin.setDate(d.getDate() + 6)
  const fmt = (x) => x.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
  return `${fmt(d)} – ${fmt(fin)}`
}

// Días trabajados según programacion (horario asignado — puede incluir ausencias)
async function diasDesdeProgramacion(usuarioId, semanaInicio) {
  const fechas = semanaFechas(semanaInicio)
  const { data } = await supabase
    .from('programacion').select('fecha')
    .eq('usuario_id', usuarioId).in('fecha', fechas)
  return [...new Set((data ?? []).map(p => new Date(p.fecha + 'T12:00:00').getDay()))]
}

// Días realmente trabajados según turnos_caja (solo días donde el empleado abrió turno)
async function diasDesdeTurnos(usuarioId, semanaInicio, empresaId, tz = 'America/Mexico_City') {
  const inicio = semanaInicio + 'T00:00:00'
  const fin    = addDias(semanaInicio, 6) + 'T23:59:59'
  const { data } = await supabase
    .from('turnos_caja')
    .select('fecha_apertura')
    .eq('usuario_id', usuarioId)
    .eq('empresa_id', empresaId)
    .gte('fecha_apertura', inicio)
    .lte('fecha_apertura', fin)
  const semanaSet = new Set(semanaFechas(semanaInicio))
  const dias = new Set()
  ;(data ?? []).forEach(t => {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(t.fecha_apertura))
    if (semanaSet.has(fecha)) dias.add(new Date(fecha + 'T12:00:00').getDay())
  })
  return [...dias]
}

// ─── Modal: configurar día de pago ───────────────────────────────────────────

function ModalDiaPago({ empresa, onClose, onGuardado }) {
  const [dia, setDia]             = useState(empresa?.dia_pago ?? 5)
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      const { error } = await supabase.from('empresas')
        .update({ dia_pago: dia }).eq('id', empresa.id)
      if (error) throw error
      toast.success(`Día de pago: ${DIA_NOMBRE[dia]}`)
      onGuardado(dia)
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Día de pago</h2>
            <p className="text-xs text-slate-400 mt-0.5">¿Qué día paga tu empresa?</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 -mt-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 flex flex-col gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} onClick={() => setDia(d)}
              className={cn(
                'flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-semibold transition-all',
                dia === d ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              )}>
              {DIA_NOMBRE[d]}
              {dia === d && <Check className="w-4 h-4" />}
            </button>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-slate-100">
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>Guardar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: detalle semanal del empleado ──────────────────────────────────────

function ModalSalario({ empleado, onClose }) {
  const { empresa, tz } = useApp()
  const [salarioDia,    setSalarioDia]    = useState('')
  const [salarioId,     setSalarioId]     = useState(null)
  const [semanas,       setSemanas]       = useState([])
  const [cargando,      setCargando]      = useState(true)
  const [guardandoSal,  setGuardandoSal]  = useState(false)
  const [sincronizando, setSincronizando] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    const [{ data: sal }, { data: sem }] = await Promise.all([
      supabase.from('salarios').select('id, salario_diario').eq('usuario_id', empleado.id).maybeSingle(),
      supabase.from('semanas_salario').select('*').eq('usuario_id', empleado.id)
        .order('semana_inicio', { ascending: false }),
    ])
    if (sal) { setSalarioDia(String(sal.salario_diario)); setSalarioId(sal.id) }
    setSemanas(sem ?? [])
    setCargando(false)
  }, [empleado.id])

  useEffect(() => { cargar() }, [cargar])

  const guardarSalario = async () => {
    const valor = parseFloat(salarioDia)
    if (isNaN(valor) || valor < 0) return toast.error('Ingresa un salario válido')
    setGuardandoSal(true)
    try {
      if (salarioId) {
        const { error } = await supabase.from('salarios')
          .update({ salario_diario: valor }).eq('id', salarioId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('salarios')
          .insert({ usuario_id: empleado.id, empresa_id: empresa.id, salario_diario: valor })
          .select('id').single()
        if (error) throw error
        setSalarioId(data.id)
      }
      toast.success('Salario guardado')
      onClose()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      setGuardandoSal(false)
    }
  }

  const agregarSemana = async () => {
    const semana_inicio = lunesActual(tz)
    if (semanas.some((s) => s.semana_inicio === semana_inicio))
      return toast.error('Ya existe un registro para esta semana')
    try {
      // Usar turnos reales abiertos como fuente de verdad para asistencia
      const dias    = await diasDesdeTurnos(empleado.id, semana_inicio, empresa.id, tz)
      const salario = parseFloat(salarioDia) || 0
      const total   = dias.length * salario
      const { data, error } = await supabase.from('semanas_salario')
        .insert({ usuario_id: empleado.id, empresa_id: empresa.id, semana_inicio,
                  dias_trabajados: dias.length, dias_marcados: dias, total_calculado: total, pagado: false })
        .select().single()
      if (error) throw error
      setSemanas((prev) => [data, ...prev])
      toast.success(dias.length > 0
        ? `${dias.length} días trabajados (verificado con turnos)`
        : 'Sin turnos registrados esta semana · puedes marcarlos manualmente')
    } catch (e) {
      toast.error(e.message ?? 'Error al agregar semana')
    }
  }

  const sincronizar = async (semana) => {
    setSincronizando(semana.id)
    try {
      // Sincroniza con los turnos realmente abiertos (no con lo programado)
      const dias    = await diasDesdeTurnos(empleado.id, semana.semana_inicio, empresa.id, tz)
      const salario = parseFloat(salarioDia) || 0
      const total   = dias.length * salario
      const { error } = await supabase.from('semanas_salario')
        .update({ dias_marcados: dias, dias_trabajados: dias.length, total_calculado: total }).eq('id', semana.id)
      if (error) throw error
      setSemanas((prev) => prev.map((s) =>
        s.id === semana.id ? { ...s, dias_marcados: dias, dias_trabajados: dias.length, total_calculado: total } : s
      ))
      toast.success(
        dias.length > 0
          ? `${dias.length} día${dias.length !== 1 ? 's' : ''} verificados con turnos reales`
          : 'Sin turnos abiertos esta semana — los días marcados se limpiaron'
      )
    } catch (e) {
      toast.error(e.message ?? 'Error al sincronizar')
    } finally {
      setSincronizando(null)
    }
  }

  const toggleDia = async (semana, dia) => {
    const marcados = semana.dias_marcados ?? []
    const nuevos   = marcados.includes(dia) ? marcados.filter((d) => d !== dia) : [...marcados, dia]
    const salario  = parseFloat(salarioDia) || 0
    const total    = nuevos.length * salario
    setSemanas((prev) => prev.map((s) =>
      s.id === semana.id ? { ...s, dias_marcados: nuevos, dias_trabajados: nuevos.length, total_calculado: total } : s
    ))
    await supabase.from('semanas_salario')
      .update({ dias_marcados: nuevos, dias_trabajados: nuevos.length, total_calculado: total }).eq('id', semana.id)
  }

  const togglePagado = async (semana) => {
    const pagado = !semana.pagado
    setSemanas((prev) => prev.map((s) => s.id === semana.id ? { ...s, pagado } : s))
    await supabase.from('semanas_salario').update({ pagado }).eq('id', semana.id)
  }

  const lunes             = lunesActual(tz)
  const tieneSemanaActual = semanas.some((s) => s.semana_inicio === lunes)
  const totalPendiente    = semanas.filter((s) => !s.pagado)
    .reduce((acc, s) => acc + (s.total_calculado ?? 0), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-primary-700">{empleado.nombre.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">{empleado.nombre}</h2>
              {totalPendiente > 0
                ? <p className="text-xs text-amber-500 font-medium mt-0.5">{formatoMoneda(totalPendiente)} pendiente</p>
                : <p className="text-xs text-emerald-500 font-medium mt-0.5">Al día</p>
              }
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">

          {/* Salario diario */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Salario por día</p>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="0.01" value={salarioDia}
                  onChange={(e) => setSalarioDia(e.target.value)} placeholder="0.00"
                  className="w-full pl-8 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
              </div>
              <Button variante="primario" tamano="sm" cargando={guardandoSal} onClick={guardarSalario}>
                Guardar
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">Al guardar se cierra el modal y se actualiza la tabla.</p>
          </div>

          {/* Semanas */}
          {cargando ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {!tieneSemanaActual && (
                <button onClick={agregarSemana}
                  className="flex items-center justify-center gap-2 py-3.5 border-2 border-dashed border-primary-200 rounded-2xl text-sm font-medium text-primary-600 hover:bg-primary-50 active:bg-primary-100 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                  Cargar semana actual desde horario
                </button>
              )}

              {semanas.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Sin registros de semanas aún</p>
              )}

              {semanas.map((sem) => (
                <div key={sem.id} className={cn(
                  'border rounded-2xl p-4 flex flex-col gap-3 transition-colors',
                  sem.pagado ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{formatRango(sem.semana_inicio)}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          'text-xs font-semibold px-2 py-0.5 rounded-lg',
                          sem.dias_trabajados > 0 ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400'
                        )}>
                          {sem.dias_trabajados} día{sem.dias_trabajados !== 1 ? 's' : ''}
                        </span>
                        <span className={cn(
                          'text-xs font-bold',
                          sem.total_calculado > 0 ? 'text-slate-700' : 'text-slate-300'
                        )}>
                          {formatoMoneda(sem.total_calculado)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {!sem.pagado && (
                        <button onClick={() => sincronizar(sem)} disabled={sincronizando === sem.id}
                          title="Sincronizar desde horario"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                          <RefreshCw className={cn('w-3.5 h-3.5', sincronizando === sem.id && 'animate-spin')} />
                        </button>
                      )}
                      <button onClick={() => togglePagado(sem)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap',
                          sem.pagado
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-emerald-300 hover:text-emerald-600'
                        )}>
                        <BadgeCheck className="w-3.5 h-3.5" />
                        {sem.pagado ? 'Pagado' : 'Marcar pagado'}
                      </button>
                    </div>
                  </div>

                  {/* Días */}
                  <div className="grid grid-cols-7 gap-1">
                    {DIAS_ORD.map((d) => {
                      const marcado = (sem.dias_marcados ?? []).includes(d)
                      return (
                        <button key={d} onClick={() => !sem.pagado && toggleDia(sem, d)}
                          disabled={sem.pagado} title={DIA_NOMBRE[d]}
                          className={cn(
                            'py-2.5 rounded-xl border text-[11px] font-bold transition-all',
                            marcado ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-slate-300 border-slate-200 hover:border-slate-300',
                            sem.pagado && 'cursor-default opacity-60'
                          )}>
                          {DIA_LETRA[d]}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <Button variante="secundario" tamano="md" className="w-full" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalariosPage() {
  const { empresa, recargarDatos, tz } = useApp()

  const [empleados,    setEmpleados]    = useState([])
  const [salarios,     setSalarios]     = useState([])
  const [semanas,      setSemanas]      = useState([])
  const [diasSemana,   setDiasSemana]   = useState({}) // usuario_id → días programados esta semana
  const [cargando,     setCargando]     = useState(true)
  const [modal,        setModal]        = useState(null)
  const [modalDiaPago, setModalDiaPago] = useState(false)
  const [diaPago,      setDiaPago]      = useState(empresa?.dia_pago ?? 5)
  const [busqueda,     setBusqueda]     = useState('')

  const hoy       = new Date().getDay()
  const esDiaPago = hoy === diaPago

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      const lunes  = lunesActual(tz)
      const fechas = semanaFechas(lunes)

      const [{ data: emps, error: e1 }, { data: sals, error: e2 },
             { data: sems, error: e3 }, { data: prog, error: e4 }] = await Promise.all([
        supabase.from('perfiles').select('id, nombre, rol')
          .eq('empresa_id', empresa.id).eq('activo', true)
          .neq('rol', 'super_admin').neq('id', empresa.propietario).order('nombre'),
        supabase.from('salarios').select('usuario_id, salario_diario').eq('empresa_id', empresa.id),
        supabase.from('semanas_salario')
          .select('usuario_id, pagado, total_calculado, dias_trabajados, semana_inicio')
          .eq('empresa_id', empresa.id),
        supabase.from('programacion').select('usuario_id, fecha')
          .eq('empresa_id', empresa.id).in('fecha', fechas),
      ])
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3

      // Días únicos programados esta semana por empleado
      const diasMap = {}
      ;(prog ?? []).forEach(p => {
        if (!diasMap[p.usuario_id]) diasMap[p.usuario_id] = new Set()
        diasMap[p.usuario_id].add(p.fecha)
      })
      const diasObj = {}
      Object.entries(diasMap).forEach(([uid, set]) => { diasObj[uid] = set.size })

      setEmpleados(emps    ?? [])
      setSalarios(sals     ?? [])
      setSemanas(sems      ?? [])
      setDiasSemana(diasObj)
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar')
    } finally {
      setCargando(false)
    }
  }, [empresa])

  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { setDiaPago(empresa?.dia_pago ?? 5) }, [empresa])

  const marcarPagadoRapido = async (emp) => {
    try {
      const { error } = await supabase.from('semanas_salario')
        .update({ pagado: true }).eq('usuario_id', emp.id).eq('pagado', false)
      if (error) throw error
      setSemanas(prev => prev.map(s =>
        s.usuario_id === emp.id && !s.pagado ? { ...s, pagado: true } : s
      ))
      toast.success(`${emp.nombre.split(' ')[0]} marcado como pagado`)
    } catch (e) {
      toast.error(e.message ?? 'Error')
    }
  }

  const salarioDeEmp   = (uid) => salarios.find(s => s.usuario_id === uid)
  const pendienteDeEmp = (uid) => semanas
    .filter(s => s.usuario_id === uid && !s.pagado)
    .reduce((acc, s) => acc + (s.total_calculado ?? 0), 0)
  const semanaActual   = (uid) => semanas.find(s => s.usuario_id === uid && s.semana_inicio === lunesActual(tz))

  const totalPendienteGlobal = semanas
    .filter(s => !s.pagado).reduce((acc, s) => acc + (s.total_calculado ?? 0), 0)
  const pendientesPago = empleados.filter(emp => pendienteDeEmp(emp.id) > 0)
  const empleadosFiltrados = busqueda.trim()
    ? empleados.filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : empleados

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Salarios</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Día de pago: <span className="font-semibold text-slate-700">{DIA_NOMBRE[diaPago]}</span>
          </p>
        </div>
        <button onClick={() => setModalDiaPago(true)}
          className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-slate-300 transition-colors"
          title="Configurar día de pago">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Banner día de pago */}
      {esDiaPago && pendientesPago.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">¡Hoy es día de pago!</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {pendientesPago.length} empleado{pendientesPago.length !== 1 ? 's' : ''} pendiente{pendientesPago.length !== 1 ? 's' : ''}
              {totalPendienteGlobal > 0 && ` · ${formatoMoneda(totalPendienteGlobal)} en total`}
            </p>
          </div>
        </div>
      )}

      {/* Resumen sin ser día de pago */}
      {!esDiaPago && totalPendienteGlobal > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-slate-500">Total pendiente de pago</p>
            <p className="text-sm font-bold text-slate-800">{formatoMoneda(totalPendienteGlobal)}</p>
          </div>
          <p className="text-xs text-slate-400">
            Próximo pago: <span className="font-semibold text-slate-600">{DIA_NOMBRE[diaPago]}</span>
          </p>
        </div>
      )}

      {/* Buscador */}
      {!cargando && empleados.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar empleado..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
      )}

      {/* Cards de empleados */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : empleados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Users className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Sin empleados registrados</p>
        </div>
      ) : empleadosFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Users className="w-7 h-7 text-slate-300" />
          <p className="text-sm text-slate-400">Sin resultados para "{busqueda}"</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {empleadosFiltrados.map((emp) => {
            const sal        = salarioDeEmp(emp.id)
            const pendiente  = pendienteDeEmp(emp.id)
            const diasHoy    = diasSemana[emp.id] ?? 0
            const semAct     = semanaActual(emp.id)
            const diasSemAct = semAct?.dias_trabajados ?? 0
            const totalSemAct = semAct?.total_calculado ?? 0
            return (
              <div key={emp.id}
                className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="w-11 h-11 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-base font-bold text-primary-700">
                      {emp.nombre.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-slate-900">{emp.nombre}</p>
                        <p className="text-xs text-slate-400 capitalize mt-0.5">{emp.rol}</p>
                      </div>
                      {/* Estado de pago */}
                      {pendiente > 0 ? (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl flex-shrink-0">
                          {formatoMoneda(pendiente)}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl flex-shrink-0 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Al día
                        </span>
                      )}
                    </div>

                    {/* Stats fila */}
                    <div className="flex flex-wrap gap-x-3 gap-y-2 mt-3">
                      {/* Salario/día */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Salario/día</span>
                        <span className="text-sm font-bold text-slate-700 mt-0.5">
                          {sal ? formatoMoneda(sal.salario_diario) : <span className="text-slate-300 text-xs">Sin configurar</span>}
                        </span>
                      </div>

                      <div className="hidden sm:block w-px bg-slate-100 self-stretch" />

                      {/* Esta semana (programado) */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">En horario</span>
                        <span className={cn('text-sm font-bold mt-0.5', diasHoy > 0 ? 'text-primary-600' : 'text-slate-300')}>
                          {diasHoy} día{diasHoy !== 1 ? 's' : ''} programados
                        </span>
                      </div>

                      {semAct && (
                        <>
                          <div className="hidden sm:block w-px bg-slate-100 self-stretch" />
                          {/* Días marcados semana actual */}
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Días marcados</span>
                            <span className={cn('text-sm font-bold mt-0.5', diasSemAct > 0 ? 'text-slate-700' : 'text-slate-300')}>
                              {diasSemAct} día{diasSemAct !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </>
                      )}

                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                      <button onClick={() => setModal(emp)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all">
                        <ChevronRight className="w-3.5 h-3.5" />
                        Ver detalles
                      </button>
                      {pendiente > 0 && (
                        <button onClick={() => marcarPagadoRapido(emp)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-all">
                          <BadgeCheck className="w-3.5 h-3.5" />
                          Marcar pagado
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ModalSalario empleado={modal} onClose={() => { setModal(null); cargar() }} />
      )}
      {modalDiaPago && (
        <ModalDiaPago
          empresa={empresa}
          onClose={() => setModalDiaPago(false)}
          onGuardado={(dia) => { setDiaPago(dia); setModalDiaPago(false); recargarDatos() }}
        />
      )}
    </div>
  )
}
