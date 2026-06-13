import { useState, useEffect, useCallback, useRef} from 'react'
import { X, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { DIAS_SEMANA } from '@/lib/constantes'
import { cn } from '@/lib/clases'

// Lunes primero
const DIAS = [1, 2, 3, 4, 5, 6, 0]
const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatHora(time) {
  return time?.slice(0, 5) ?? ''
}

// ─── Modal horario semanal de un empleado ─────────────────────────────────────

function ModalHorarioEmpleado({ empleado, horariosEmpleado, empresa, onClose, onGuardado }) {
  // Estado por día: { activo, entrada, salida }
  const estadoInicial = () => {
    const m = {}
    DIAS.forEach((d) => {
      const h = horariosEmpleado.find((x) => x.dia_semana === d)
      m[d] = {
        activo:  !!h,
        entrada: h ? formatHora(h.hora_entrada) : '08:00',
        salida:  h ? formatHora(h.hora_salida)  : '17:00',
        id:      h?.id ?? null,
      }
    })
    return m
  }

  const [dias, setDias]               = useState(estadoInicial)
  const [horaDefault, setHoraDefault] = useState({ entrada: '08:00', salida: '17:00' })
  const [guardando, setGuardando]     = useState(false)
  const guardandoRef = useRef(false)

  const toggleDia = (d) =>
    setDias((prev) => ({
      ...prev,
      [d]: { ...prev[d], activo: !prev[d].activo },
    }))

  const cambiarHoraDia = (d, campo, val) =>
    setDias((prev) => ({
      ...prev,
      [d]: { ...prev[d], [campo]: val },
    }))

  const aplicarDefault = () =>
    setDias((prev) => {
      const next = { ...prev }
      DIAS.forEach((d) => {
        if (next[d].activo) {
          next[d] = { ...next[d], entrada: horaDefault.entrada, salida: horaDefault.salida }
        }
      })
      return next
    })

  const guardar = async () => {
    // Los turnos nocturnos (salida < entrada) son válidos — se guardan tal cual
    // Solo bloqueamos si entrada y salida son idénticas
    for (const d of DIAS) {
      const { activo, entrada, salida } = dias[d]
      if (activo && entrada === salida) {
        return toast.error(`${DIAS_SEMANA[d]}: la entrada y salida no pueden ser iguales`)
      }
    }

    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      for (const d of DIAS) {
        const { activo, entrada, salida, id } = dias[d]

        if (activo) {
          if (id) {
            await supabase.from('horarios')
              .update({ hora_entrada: entrada, hora_salida: salida })
              .eq('id', id)
          } else {
            await supabase.from('horarios').insert({
              empresa_id:   empresa.id,
              usuario_id:   empleado.id,
              sucursal_id:  empleado.sucursal_id ?? null,
              dia_semana:   d,
              hora_entrada: entrada,
              hora_salida:  salida,
            })
          }
        } else if (id) {
          // Tenía horario y ahora está desactivado → borrar
          await supabase.from('horarios').delete().eq('id', id)
        }
      }
      toast.success('Horario guardado')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const diasActivos = DIAS.filter((d) => dias[d].activo).length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{empleado.nombre}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {diasActivos} día{diasActivos !== 1 ? 's' : ''} activo{diasActivos !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
          {/* Horario rápido */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Horario predeterminado</p>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-slate-500 w-14">Entrada</label>
                <input
                  type="time" value={horaDefault.entrada}
                  onChange={(e) => setHoraDefault((h) => ({ ...h, entrada: e.target.value }))}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs text-slate-500 w-14">Salida</label>
                <input
                  type="time" value={horaDefault.salida}
                  onChange={(e) => setHoraDefault((h) => ({ ...h, salida: e.target.value }))}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
              </div>
              <Button variante="tinted" tamano="sm" onClick={aplicarDefault}>
                Aplicar
              </Button>
            </div>
          </div>

          {/* Toggle días */}
          <div className="grid grid-cols-7 gap-1.5">
            {DIAS.map((d) => (
              <button
                key={d}
                onClick={() => toggleDia(d)}
                className={cn(
                  'flex flex-col items-center py-2.5 rounded-2xl border text-xs font-semibold transition-all',
                  dias[d].activo
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                )}
              >
                {DIA_CORTO[d]}
              </button>
            ))}
          </div>

          {/* Horas por día */}
          <div className="flex flex-col gap-2">
            {DIAS.filter((d) => dias[d].activo).map((d) => {
              const esNocturno = dias[d].salida < dias[d].entrada
              return (
              <div key={d} className={cn(
                'flex items-center gap-3 rounded-2xl px-4 py-3 border',
                esNocturno ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-200'
              )}>
                <p className="text-sm font-semibold text-slate-700 w-10 flex-shrink-0">{DIA_CORTO[d]}</p>
                <input
                  type="time" value={dias[d].entrada}
                  onChange={(e) => cambiarHoraDia(d, 'entrada', e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                <span className="text-slate-300 text-xs">—</span>
                <input
                  type="time" value={dias[d].salida}
                  onChange={(e) => cambiarHoraDia(d, 'salida', e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                />
                {esNocturno && (
                  <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                    +1 día
                  </span>
                )}
              </div>
              )
            })}
            {diasActivos === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">
                Selecciona los días que trabaja este empleado
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
            Guardar horario
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HorariosPage() {
  const { empresa, sucursales, sucursalActiva, esAdmin } = useApp()

  const [sucursalId, setSucursalId] = useState(sucursalActiva?.id ?? sucursales[0]?.id ?? '')
  const [empleados,  setEmpleados]  = useState([])
  const [horarios,   setHorarios]   = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [modal,      setModal]      = useState(null)

  const hoy = new Date().getDay()

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      let q = supabase
        .from('perfiles')
        .select('id, nombre, rol, sucursal_id')
        .eq('empresa_id', empresa.id)
        .eq('activo', true)
        .neq('rol', 'super_admin')
        .neq('id', empresa.propietario)
        .order('nombre')

      if (sucursalId) q = q.eq('sucursal_id', sucursalId)

      const [{ data: emps }, { data: hors }] = await Promise.all([
        q,
        supabase.from('horarios').select('*').eq('empresa_id', empresa.id),
      ])

      setEmpleados(emps ?? [])
      setHorarios(hors ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar')
    } finally {
      setCargando(false)
    }
  }, [empresa, sucursalId])

  useEffect(() => { cargar() }, [cargar])

  const horariosDeEmpleado = (uid) => horarios.filter((h) => h.usuario_id === uid)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Horarios</h1>
          <p className="text-sm text-slate-500 mt-0.5">Turnos semanales del equipo</p>
        </div>
        {esAdmin && sucursales.length > 1 && (
          <div className="flex gap-2 flex-wrap justify-end">
            {sucursales.map((s) => (
              <button
                key={s.id}
                onClick={() => setSucursalId(s.id)}
                className={cn(
                  'px-3 py-2 rounded-2xl text-sm font-medium border transition-all',
                  s.id === sucursalId
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-slate-700 border-slate-200'
                )}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : empleados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Clock className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">Sin empleados en esta sucursal</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider min-w-[160px]">
                    Empleado
                  </th>
                  {DIAS.map((d) => (
                    <th key={d} className={cn(
                      'px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider min-w-[72px]',
                      d === hoy ? 'text-primary-600' : 'text-slate-400'
                    )}>
                      {DIA_CORTO[d]}
                      {d === hoy && <span className="block w-1 h-1 rounded-full bg-primary-500 mx-auto mt-1" />}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Días
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {empleados.map((emp) => {
                  const hEmp = horariosDeEmpleado(emp.id)
                  const diasActivos = hEmp.length
                  return (
                    <tr
                      key={emp.id}
                      onClick={() => setModal({ empleado: emp, horarios: hEmp })}
                      className="hover:bg-primary-50/40 cursor-pointer transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-700">
                              {emp.nombre.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900 truncate">{emp.nombre}</p>
                        </div>
                      </td>
                      {DIAS.map((d) => {
                        const h = hEmp.find((x) => x.dia_semana === d)
                        return (
                          <td key={d} className="px-2 py-3">
                            {h ? (
                              <div className={cn(
                                'flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl',
                                d === hoy ? 'bg-primary-100' : 'bg-primary-50'
                              )}>
                                <p className="text-[11px] font-bold text-primary-700">{formatHora(h.hora_entrada)}</p>
                                <p className="text-[9px] text-primary-400">—</p>
                                <p className="text-[11px] font-bold text-primary-700">{formatHora(h.hora_salida)}</p>
                              </div>
                            ) : (
                              <div className="h-12 rounded-xl border border-dashed border-slate-200 flex items-center justify-center">
                                <span className="text-slate-200 text-sm">·</span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-3 py-3 text-center">
                        <span className={cn(
                          'text-sm font-bold',
                          diasActivos === 0 ? 'text-slate-300' : 'text-slate-700'
                        )}>
                          {diasActivos}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ModalHorarioEmpleado
          empleado={modal.empleado}
          horariosEmpleado={modal.horarios}
          empresa={empresa}
          onClose={() => setModal(null)}
          onGuardado={() => { setModal(null); cargar() }}
        />
      )}
    </div>
  )
}
