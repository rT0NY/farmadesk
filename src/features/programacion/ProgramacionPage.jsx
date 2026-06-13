import { useState, useEffect, useCallback, useRef} from 'react'
import { ChevronLeft, ChevronRight, X, Settings2, Clock, Check, Send, Phone, Zap, Users } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { fechaEnZona, addDias, dowEnZona } from '@/lib/formatos'

const DIA_LABEL  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DIA_LETRA  = ['D',   'L',   'M',   'X',   'J',   'V',   'S']
const TURNO_DOT  = ['bg-primary-500', 'bg-violet-500']
const TURNO_BG   = ['bg-primary-50',  'bg-violet-50']
const TURNO_BORDER = ['border-primary-200', 'border-violet-200']
const TURNO_AVT  = ['bg-primary-200 text-primary-800', 'bg-violet-200 text-violet-800']
const TURNO_TEXT = ['text-primary-700', 'text-violet-700']
const TURNO_PILL = ['bg-primary-600', 'bg-violet-600']

function lunesActual(tz = 'America/Mexico_City') {
  const hoy  = fechaEnZona(tz)
  const dow  = dowEnZona(hoy)
  const diff = dow === 0 ? -6 : 1 - dow
  return addDias(hoy, diff)
}

function semanaFechas(isoLunes) {
  return Array.from({ length: 7 }, (_, i) => addDias(isoLunes, i))
}

function navegarSemana(isoLunes, delta) {
  return addDias(isoLunes, delta * 7)
}

function formatHora(t)  { return t?.slice(0, 5) ?? '' }

function formatFechaCorta(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

// ─── Modal base (bottom sheet en móvil, centrado en desktop) ─────────────────

function Modal({ children, onClose, maxWidth = 'sm:max-w-md' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={cn(
        'relative w-full bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] animate-modal-in',
        maxWidth
      )}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ titulo, subtitulo, onClose }) {
  return (
    <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors -mt-1 -mr-1">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ModalFooter({ children }) {
  return (
    <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
      {children}
    </div>
  )
}

// ─── Modal: configurar turnos ─────────────────────────────────────────────────

function ModalTurnos({ empresa, turnos, onClose, onGuardado }) {
  const [config, setConfig] = useState(() =>
    turnos.length === 0
      ? [{ id: null, nombre: 'Turno', hora_inicio: '08:00', hora_fin: '20:00', orden: 1 }]
      : turnos.map((t) => ({ ...t, hora_inicio: formatHora(t.hora_inicio), hora_fin: formatHora(t.hora_fin) }))
  )
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)
  const cantTurnos = config.length

  const set = (idx, campo, val) =>
    setConfig((prev) => prev.map((t, i) => (i === idx ? { ...t, [campo]: val } : t)))

  const toggleDos = () => {
    if (cantTurnos === 1) {
      setConfig((prev) => [
        { ...prev[0], nombre: 'Turno matutino', hora_fin: '14:00' },
        { id: null, nombre: 'Turno vespertino', hora_inicio: '14:00', hora_fin: '20:00', orden: 2 },
      ])
    } else {
      setConfig((prev) => [{ ...prev[0], hora_fin: '20:00' }])
    }
  }

  const guardar = async () => {
    for (const t of config) {
      if (!t.nombre.trim()) return toast.error('Escribe un nombre para cada turno')
      if (t.hora_fin <= t.hora_inicio) return toast.error(`${t.nombre}: la salida debe ser después de la entrada`)
    }
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      for (const t of config) {
        if (t.id) {
          const { error } = await supabase.from('turnos_empresa')
            .update({ nombre: t.nombre, hora_inicio: t.hora_inicio, hora_fin: t.hora_fin })
            .eq('id', t.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('turnos_empresa').insert({
            empresa_id: empresa.id, nombre: t.nombre,
            hora_inicio: t.hora_inicio, hora_fin: t.hora_fin, orden: t.orden,
          })
          if (error) throw error
        }
      }
      if (cantTurnos === 1 && turnos.length === 2) {
        const segundo = turnos.find((t) => t.orden === 2)
        if (segundo) {
          const { data: asigs } = await supabase.from('programacion').select('id').eq('turno_id', segundo.id)
          if (asigs?.length > 0) {
            const { error } = await supabase.from('programacion').delete().eq('turno_id', segundo.id)
            if (error) throw error
            toast(`Se eliminaron ${asigs.length} asignación(es) del turno 2`)
          }
          const { error } = await supabase.from('turnos_empresa').delete().eq('id', segundo.id)
          if (error) throw error
        }
      }
      toast.success('Turnos guardados')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader titulo="Configurar turnos" subtitulo="Define los horarios de tu empresa" onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
        <div className="flex gap-2">
          {[1, 2].map((n) => (
            <button key={n} onClick={() => n !== cantTurnos && toggleDos()}
              className={cn(
                'flex-1 py-3 rounded-2xl text-sm font-semibold border transition-all',
                cantTurnos === n
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-500 border-slate-200'
              )}>
              {n} turno{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>

        {cantTurnos === 1 && turnos.length === 2 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
            Al guardar se eliminarán todas las asignaciones del turno 2.
          </div>
        )}

        {config.map((t, idx) => (
          <div key={idx} className={cn(
            'border rounded-2xl p-4 flex flex-col gap-4',
            idx === 0 ? 'bg-primary-50/50 border-primary-200' : 'bg-violet-50/50 border-violet-200'
          )}>
            <input value={t.nombre} onChange={(e) => set(idx, 'nombre', e.target.value)}
              placeholder={`Nombre del turno ${idx + 1}`}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
            <div className="grid grid-cols-2 gap-3">
              {[['hora_inicio', 'Entrada'], ['hora_fin', 'Salida']].map(([campo, label]) => (
                <div key={campo} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-500">{label}</label>
                  <input type="time" value={t[campo]} onChange={(e) => set(idx, campo, e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>Guardar</Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: asignar empleados a un slot ───────────────────────────────────────

function ModalSlot({ sucursal, turno, fecha, empleados, programacion, empresa, onClose, onGuardado }) {
  const asigSlot = programacion.filter(
    (p) => p.sucursal_id === sucursal.id && p.turno_id === turno.id && p.fecha === fecha
  )
  const [seleccion, setSeleccion] = useState(() => new Set(asigSlot.map((a) => a.usuario_id)))
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const toggle = (empId) =>
    setSeleccion((prev) => {
      const next = new Set(prev)
      next.has(empId) ? next.delete(empId) : next.add(empId)
      return next
    })

  const guardar = async () => {
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const prevIds  = new Set(asigSlot.map((a) => a.usuario_id))
      const toAdd    = [...seleccion].filter((id) => !prevIds.has(id))
      const toRemove = [...prevIds].filter((id) => !seleccion.has(id))
      for (const uid of toAdd) {
        const { error } = await supabase.from('programacion').insert({
          empresa_id: empresa.id, usuario_id: uid,
          sucursal_id: sucursal.id, turno_id: turno.id, fecha,
        })
        if (error) throw error
      }
      for (const uid of toRemove) {
        const asig = asigSlot.find((a) => a.usuario_id === uid)
        if (asig) {
          const { error } = await supabase.from('programacion').delete().eq('id', asig.id)
          if (error) throw error
        }
      }
      toast.success('Guardado')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const diaLabel = DIA_LABEL[new Date(fecha + 'T12:00:00').getDay()]

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-sm">
      <ModalHeader
        titulo={sucursal.nombre}
        subtitulo={`${turno.nombre} · ${formatHora(turno.hora_inicio)}–${formatHora(turno.hora_fin)} · ${diaLabel} ${formatFechaCorta(fecha)}`}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
          Toca para seleccionar / deseleccionar
        </p>
        {empleados.map((emp) => {
          const asignado  = seleccion.has(emp.id)
          const conflicto = !asignado && programacion.find(
            (p) => p.usuario_id === emp.id && p.turno_id === turno.id &&
                   p.fecha === fecha && p.sucursal_id !== sucursal.id
          )
          return (
            <button key={emp.id} onClick={() => !conflicto && toggle(emp.id)}
              disabled={!!conflicto}
              className={cn(
                'flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-left w-full',
                asignado
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : conflicto
                  ? 'bg-slate-50 border-slate-100 opacity-40 cursor-default'
                  : 'bg-white border-slate-200 active:bg-primary-50 text-slate-700'
              )}>
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold',
                asignado ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-700'
              )}>
                {emp.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{emp.nombre}</p>
                {conflicto && (
                  <p className="text-[11px] opacity-60 truncate mt-0.5">
                    Ya en {conflicto.sucursales?.nombre} · {conflicto.turnos_empresa?.nombre}
                  </p>
                )}
              </div>
              {asignado && <Check className="w-5 h-5 flex-shrink-0" />}
            </button>
          )
        })}
        {empleados.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Users className="w-8 h-8 text-slate-300" />
            <p className="text-sm text-slate-400">Sin empleados disponibles</p>
          </div>
        )}
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>Guardar</Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: asignación rápida ─────────────────────────────────────────────────

const PRESET_DIAS = [
  { label: 'Lun–Vie', indices: [0, 1, 2, 3, 4] },
  { label: 'Lun–Sáb', indices: [0, 1, 2, 3, 4, 5] },
  { label: 'Todos',   indices: [0, 1, 2, 3, 4, 5, 6] },
]

function ModalAsignacionRapida({ empresa, empleados, turnos, sucursales, semanaInicio, onClose, onGuardado }) {
  const fechas = semanaFechas(semanaInicio)

  const [empId,      setEmpId]      = useState('')
  const [diasSel,    setDiasSel]    = useState(new Set([0, 1, 2, 3, 4]))
  const [sucursalId, setSucursalId] = useState(sucursales[0]?.id ?? '')
  const [turnoId,    setTurnoId]    = useState(turnos[0]?.id ?? '')
  const [guardando,  setGuardando]  = useState(false)
  const guardandoRef = useRef(false)

  const toggleDia = (i) =>
    setDiasSel((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  const aplicar = async () => {
    if (!empId)        return toast.error('Selecciona un empleado')
    if (!diasSel.size) return toast.error('Selecciona al menos un día')
    if (!sucursalId)   return toast.error('Selecciona una sucursal')
    if (!turnoId)      return toast.error('Selecciona un turno')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const fechasSel = fechas.filter((_, i) => diasSel.has(i))
      for (const fecha of fechasSel) {
        const { error } = await supabase.from('programacion')
          .upsert({
            empresa_id: empresa.id, usuario_id: empId,
            sucursal_id: sucursalId, turno_id: Number(turnoId), fecha,
          }, { onConflict: 'usuario_id,turno_id,fecha' })
        if (error) throw error
      }
      const emp = empleados.find((e) => e.id === empId)
      toast.success(`${emp?.nombre?.split(' ')[0] ?? 'Empleado'} asignado ${diasSel.size} día${diasSel.size !== 1 ? 's' : ''}`)
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al asignar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader titulo="Asignación rápida" subtitulo="Asigna varios días de una vez" onClose={onClose} />

      <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
        {/* Empleado */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Empleado</p>
          <div className="flex flex-col gap-2">
            {empleados.map((emp) => (
              <button key={emp.id} onClick={() => setEmpId(emp.id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left',
                  emp.id === empId
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white border-slate-200 text-slate-700 active:bg-slate-50'
                )}>
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0',
                  emp.id === empId ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-700'
                )}>
                  {emp.nombre.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-semibold">{emp.nombre}</span>
                {emp.id === empId && <Check className="w-4 h-4 ml-auto flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Días */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Días</p>
            <div className="flex gap-1">
              {PRESET_DIAS.map((p) => (
                <button key={p.label} onClick={() => setDiasSel(new Set(p.indices))}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-primary-600 hover:bg-primary-50 active:bg-primary-100 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {fechas.map((f, i) => {
              const d     = new Date(f + 'T12:00:00')
              const sel   = diasSel.has(i)
              return (
                <button key={f} onClick={() => toggleDia(i)}
                  className={cn(
                    'flex flex-col items-center py-3 rounded-xl border text-xs font-bold transition-all',
                    sel
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-slate-400 border-slate-200 active:bg-slate-50'
                  )}>
                  {DIA_LETRA[d.getDay()]}
                  <span className={cn('text-[10px] font-normal mt-0.5', sel ? 'text-white/70' : 'text-slate-300')}>
                    {d.getDate()}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-400 text-center">
            {diasSel.size > 0
              ? `${diasSel.size} día${diasSel.size !== 1 ? 's' : ''} seleccionado${diasSel.size !== 1 ? 's' : ''}`
              : 'Sin días seleccionados'}
          </p>
        </div>

        {/* Sucursal */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sucursal</p>
          <div className="flex flex-col gap-2">
            {sucursales.map((s) => (
              <button key={s.id} onClick={() => setSucursalId(s.id)}
                className={cn(
                  'flex items-center justify-between px-4 py-3 rounded-2xl border text-sm font-semibold transition-all',
                  s.id === sucursalId
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-slate-700 border-slate-200 active:bg-slate-50'
                )}>
                {s.nombre}
                {s.id === sucursalId && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        {/* Turno */}
        {turnos.length > 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Turno</p>
            <div className="flex flex-col gap-2">
              {turnos.map((t, i) => (
                <button key={t.id} onClick={() => setTurnoId(t.id)}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-2xl border text-sm transition-all',
                    t.id === turnoId
                      ? cn(TURNO_PILL[i], 'text-white border-transparent')
                      : 'bg-white text-slate-700 border-slate-200 active:bg-slate-50'
                  )}>
                  <span className="font-semibold">{t.nombre}</span>
                  <span className={cn('text-xs', t.id === turnoId ? 'opacity-70' : 'text-slate-400')}>
                    {formatHora(t.hora_inicio)}–{formatHora(t.hora_fin)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {turnos.length === 1 && (
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
            <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">{turnos[0].nombre}</p>
              <p className="text-xs text-slate-400">{formatHora(turnos[0].hora_inicio)}–{formatHora(turnos[0].hora_fin)}</p>
            </div>
          </div>
        )}
      </div>

      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={aplicar}>
            <Zap className="w-4 h-4 mr-1.5" />
            Asignar {diasSel.size > 0 ? `${diasSel.size} día${diasSel.size !== 1 ? 's' : ''}` : ''}
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: enviar horarios por WhatsApp ──────────────────────────────────────

function ModalEnviar({ empresa, empleados, programacion, turnos, semanaInicio, onClose }) {
  const fechas = semanaFechas(semanaInicio)

  const formatRango = () => {
    const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return `${fmt(fechas[0])} – ${fmt(fechas[6])}`
  }

  const generarMensaje = (emp) => {
    const asigs  = programacion.filter((p) => p.usuario_id === emp.id)
    const lineas = fechas.map((f) => {
      const d       = new Date(f + 'T12:00:00')
      const diaStr  = `${DIA_LABEL[d.getDay()]} ${formatFechaCorta(f)}`
      const diasigs = asigs.filter((a) => a.fecha === f)
      if (diasigs.length === 0) return `• ${diaStr}: Libre`
      return diasigs.map((a) => {
        const horaStr = `${formatHora(a.turnos_empresa?.hora_inicio)}-${formatHora(a.turnos_empresa?.hora_fin)}`
        const turnoStr = turnos.length > 1 ? ` – ${a.turnos_empresa?.nombre}` : ''
        return `• ${diaStr}: ${a.sucursales?.nombre}${turnoStr} (${horaStr})`
      }).join('\n')
    })
    let msg = `*Horario ${formatRango()}*\n${empresa?.nombre ?? ''}\n\n${emp.nombre}:\n${lineas.join('\n')}`
    if (empresa?.telefono_whatsapp) {
      const tel = empresa.telefono_whatsapp.replace(/\D/g, '')
      msg += `\n\nConsultas: wa.me/${tel}`
    }
    return msg
  }

  const enviar = (emp) => {
    const tel = emp.telefono?.replace(/\D/g, '')
    if (!tel) return toast.error(`${emp.nombre} no tiene número registrado`)
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(generarMensaje(emp))}`, '_blank')
  }

  const enviarTodos = () => {
    const conTel = empleados.filter((e) => e.telefono)
    if (conTel.length === 0) return toast.error('Ningún empleado tiene número registrado')
    conTel.forEach((emp) => enviar(emp))
    toast.success(`${conTel.length} conversaciones abiertas`)
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-md">
      <ModalHeader titulo="Enviar horarios" subtitulo={`${formatRango()} · por WhatsApp`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {!empresa?.telefono_whatsapp && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
            Agrega tu teléfono de dueño para que aparezca en cada mensaje.
          </div>
        )}
        {empleados.map((emp) => {
          const asigs    = programacion.filter((p) => p.usuario_id === emp.id)
          const tieneTel = !!emp.telefono
          return (
            <div key={emp.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-primary-700">
                {emp.nombre.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{emp.nombre}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {asigs.length > 0 ? `${asigs.length} días` : 'Sin asignaciones'}
                  {' · '}{tieneTel ? emp.telefono : 'Sin número'}
                </p>
              </div>
              <button onClick={() => enviar(emp)} disabled={!tieneTel}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex-shrink-0',
                  tieneTel
                    ? 'bg-emerald-500 text-white active:bg-emerald-600'
                    : 'bg-slate-200 text-slate-400 cursor-default'
                )}>
                <Send className="w-3.5 h-3.5" />
                Enviar
              </button>
            </div>
          )
        })}
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cerrar</Button>
          <Button variante="exito" tamano="md" className="flex-1" onClick={enviarTodos}>
            <Send className="w-4 h-4 mr-1.5" />
            Enviar a todos
          </Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Modal: teléfono del dueño ────────────────────────────────────────────────

function ModalTelefono({ empresa, onClose, onGuardado }) {
  const [tel, setTel]           = useState(empresa?.telefono_whatsapp ?? '')
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const guardar = async () => {
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { error } = await supabase.from('empresas')
        .update({ telefono_whatsapp: tel.trim() || null }).eq('id', empresa.id)
      if (error) throw error
      toast.success('Número guardado')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Modal onClose={onClose} maxWidth="sm:max-w-sm">
      <ModalHeader
        titulo="Teléfono del dueño"
        subtitulo="Se incluye en el mensaje de horario de cada empleado"
        onClose={onClose}
      />
      <div className="px-6 py-5 flex flex-col gap-3">
        <label className="text-sm font-medium text-slate-700">Número WhatsApp</label>
        <div className="relative">
          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)}
            placeholder="Ej: 525512345678"
            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
        </div>
        <p className="text-xs text-slate-400">Incluye el código de país — México: 52 + 10 dígitos</p>
      </div>
      <ModalFooter>
        <div className="flex gap-3">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>Guardar</Button>
        </div>
      </ModalFooter>
    </Modal>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProgramacionPage() {
  const { empresa, recargarDatos, tz } = useApp()

  const [semanaInicio, setSemanaInicio] = useState(() => lunesActual(tz))
  const [empleados,    setEmpleados]    = useState([])
  const [programacion, setProgramacion] = useState([])
  const [turnos,       setTurnos]       = useState([])
  const [sucursales,   setSucursales]   = useState([])
  const [cargando,     setCargando]     = useState(true)
  const [modalTurnos,  setModalTurnos]  = useState(false)
  const [modalSlot,    setModalSlot]    = useState(null)
  const [modalEnviar,  setModalEnviar]  = useState(false)
  const [modalTel,     setModalTel]     = useState(false)
  const [modalRapido,  setModalRapido]  = useState(false)
  const [diaIdx,       setDiaIdx]       = useState(() => {
    const dow = new Date().getDay()
    // Convertir: getDay() 0=Dom→6, 1=Lun→0 ... 6=Sáb→5
    const idx = dow === 0 ? 6 : dow - 1
    return idx
  })

  const hoy = fechaEnZona(tz)

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    const fechas = semanaFechas(semanaInicio)
    try {
      const [
        { data: emps,  error: e1 },
        { data: prog,  error: e2 },
        { data: turns, error: e3 },
        { data: sucs,  error: e4 },
      ] = await Promise.all([
        supabase.from('perfiles').select('id, nombre, rol, telefono')
          .eq('empresa_id', empresa.id).eq('activo', true)
          .neq('rol', 'super_admin').neq('id', empresa.propietario).order('nombre'),
        supabase.from('programacion')
          .select('*, turnos_empresa(nombre, hora_inicio, hora_fin, orden), sucursales(nombre)')
          .eq('empresa_id', empresa.id).gte('fecha', fechas[0]).lte('fecha', fechas[6]),
        supabase.from('turnos_empresa').select('*').eq('empresa_id', empresa.id).order('orden'),
        supabase.from('sucursales').select('id, nombre')
          .eq('empresa_id', empresa.id).eq('activa', true).order('nombre'),
      ])
      if (e1) throw e1; if (e2) throw e2; if (e3) throw e3; if (e4) throw e4
      setEmpleados(emps    ?? [])
      setProgramacion(prog ?? [])
      setTurnos(turns      ?? [])
      setSucursales(sucs   ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar')
    } finally {
      setCargando(false)
    }
  }, [empresa, semanaInicio])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  const fechas   = semanaFechas(semanaInicio)
  const esActual = semanaInicio === lunesActual()

  const formatRango = () => {
    const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    return `${fmt(fechas[0])} – ${fmt(fechas[6])}`
  }

  const empsEnSlot = (sucId, turnoId, fecha) =>
    programacion.filter((p) => p.sucursal_id === sucId && p.turno_id === turnoId && p.fecha === fecha)

  // ── Vista móvil: cards por día seleccionado ─────────────────────────────────
  const vistaMovil = (
    <div className="sm:hidden flex flex-col gap-4">
      {/* Selector de días */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {fechas.map((f, i) => {
          const d     = new Date(f + 'T12:00:00')
          const esHoy = f === hoy
          const sel   = i === diaIdx
          const tieneAlgo = sucursales.some((suc) =>
            turnos.some((t) => empsEnSlot(suc.id, t.id, f).length > 0)
          )
          return (
            <button key={f} onClick={() => setDiaIdx(i)}
              className={cn(
                'flex-shrink-0 flex flex-col items-center px-3.5 py-2.5 rounded-2xl border transition-all min-w-[52px]',
                sel
                  ? 'bg-primary-600 text-white border-primary-600'
                  : esHoy
                  ? 'bg-primary-50 text-primary-600 border-primary-200'
                  : 'bg-white text-slate-600 border-slate-200'
              )}>
              <span className="text-[10px] font-semibold">{DIA_LETRA[d.getDay()]}</span>
              <span className="text-base font-bold leading-tight">{d.getDate()}</span>
              <span className={cn(
                'w-1.5 h-1.5 rounded-full mt-1',
                sel ? 'bg-white/60' : tieneAlgo ? 'bg-primary-400' : 'bg-transparent'
              )} />
            </button>
          )
        })}
      </div>

      {/* Fecha seleccionada */}
      <p className="text-sm font-semibold text-slate-700 capitalize">
        {new Date(fechas[diaIdx] + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* Slots del día */}
      {sucursales.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Clock className="w-8 h-8 text-slate-300" />
          <p className="text-sm text-slate-400">Sin sucursales configuradas</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sucursales.map((suc) => (
            <div key={suc.id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-card">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800">{suc.nombre}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {turnos.map((turno, ti) => {
                  const asigs = empsEnSlot(suc.id, turno.id, fechas[diaIdx])
                  return (
                    <button key={turno.id}
                      onClick={() => setModalSlot({ sucursal: suc, turno, turnoIdx: ti, fecha: fechas[diaIdx] })}
                      className="w-full flex items-center gap-4 px-4 py-4 text-left active:bg-slate-50 transition-colors">
                      <div className={cn('w-1 self-stretch rounded-full flex-shrink-0', TURNO_DOT[ti])} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{turno.nombre}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {formatHora(turno.hora_inicio)} – {formatHora(turno.hora_fin)}
                        </p>
                        {asigs.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {asigs.map((a) => {
                              const emp = empleados.find((e) => e.id === a.usuario_id)
                              return (
                                <span key={a.id} className={cn(
                                  'text-[11px] font-semibold px-2.5 py-1 rounded-full',
                                  TURNO_BG[ti], TURNO_TEXT[ti]
                                )}>
                                  {emp?.nombre?.split(' ')[0] ?? '?'}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      {asigs.length === 0 ? (
                        <div className="w-9 h-9 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-slate-300 text-lg">+</span>
                        </div>
                      ) : (
                        <div className="flex -space-x-2 flex-shrink-0">
                          {asigs.slice(0, 3).map((a) => {
                            const emp = empleados.find((e) => e.id === a.usuario_id)
                            return (
                              <div key={a.id} className={cn(
                                'w-9 h-9 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-bold',
                                TURNO_AVT[ti]
                              )}>
                                {emp?.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ── Vista desktop: tabla ────────────────────────────────────────────────────
  const vistaDesktop = (
    <div className="hidden sm:block bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider min-w-[160px] sticky left-0 bg-white/95 z-10">
                Sucursal · Turno
              </th>
              {fechas.map((f) => {
                const d     = new Date(f + 'T12:00:00')
                const esHoy = f === hoy
                return (
                  <th key={f} className={cn(
                    'px-2 py-3 text-center text-[10px] font-semibold uppercase tracking-wider min-w-[80px]',
                    esHoy ? 'text-primary-600' : 'text-slate-400'
                  )}>
                    {DIA_LETRA[d.getDay()]}
                    <span className="block text-[10px] font-normal normal-case mt-0.5">{formatFechaCorta(f)}</span>
                    {esHoy && <span className="block w-1 h-1 rounded-full bg-primary-500 mx-auto mt-1" />}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sucursales.map((suc, sucIdx) =>
              turnos.map((turno, ti) => (
                <tr key={`${suc.id}-${turno.id}`} className={cn(
                  ti === turnos.length - 1 && sucIdx !== sucursales.length - 1
                    ? 'border-b-2 border-slate-100' : 'border-b border-slate-50'
                )}>
                  <td className="px-5 py-2 sticky left-0 bg-white/95 z-10">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', TURNO_DOT[ti])} />
                      <div className="min-w-0">
                        {ti === 0 && <p className="text-xs font-bold text-slate-700 truncate">{suc.nombre}</p>}
                        <p className={cn('text-[11px] truncate', ti === 0 ? 'text-slate-400' : 'text-slate-500 font-medium')}>
                          {turno.nombre} · {formatHora(turno.hora_inicio)}–{formatHora(turno.hora_fin)}
                        </p>
                      </div>
                    </div>
                  </td>
                  {fechas.map((f) => {
                    const asigs = empsEnSlot(suc.id, turno.id, f)
                    const esHoy = f === hoy
                    return (
                      <td key={f} className="px-1.5 py-1.5">
                        <button
                          onClick={() => setModalSlot({ sucursal: suc, turno, turnoIdx: ti, fecha: f })}
                          className={cn(
                            'w-full min-h-[52px] rounded-xl border transition-all flex flex-col items-center justify-center gap-1 p-1.5',
                            asigs.length > 0
                              ? cn('border-transparent', TURNO_BG[ti])
                              : cn('border-dashed hover:border-slate-300 hover:bg-slate-50',
                                  esHoy ? 'border-primary-200 bg-primary-50/20' : 'border-slate-200')
                          )}>
                          {asigs.length > 0 ? (
                            <>
                              <div className="flex -space-x-1.5 justify-center">
                                {asigs.slice(0, 3).map((a) => {
                                  const emp = empleados.find((e) => e.id === a.usuario_id)
                                  return (
                                    <div key={a.id} className={cn('w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-bold', TURNO_AVT[ti])}>
                                      {emp?.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                                    </div>
                                  )
                                })}
                                {asigs.length > 3 && (
                                  <div className="w-6 h-6 rounded-full ring-2 ring-white bg-slate-200 text-slate-600 flex items-center justify-center text-[9px] font-bold">
                                    +{asigs.length - 3}
                                  </div>
                                )}
                              </div>
                              {asigs.length === 1 && (
                                <p className={cn('text-[10px] font-medium truncate w-full text-center px-1', TURNO_TEXT[ti])}>
                                  {empleados.find((e) => e.id === asigs[0].usuario_id)?.nombre?.split(' ')[0] ?? '–'}
                                </p>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300 text-lg font-light">+</span>
                          )}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Programación</h1>
          <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">Asigna empleados por sucursal y turno</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModalTel(true)} title="Teléfono del dueño"
            className={cn(
              'p-2.5 rounded-xl border transition-colors',
              empresa?.telefono_whatsapp
                ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                : 'bg-white border-slate-200 text-slate-400'
            )}>
            <Phone className="w-4 h-4" />
          </button>
          <button onClick={() => setModalEnviar(true)}
            className="p-2.5 rounded-xl border bg-white border-slate-200 text-slate-600 active:bg-slate-50 transition-colors sm:hidden">
            <Send className="w-4 h-4" />
          </button>
          <Button variante="tinted" tamano="sm" onClick={() => setModalEnviar(true)} className="hidden sm:flex">
            <Send className="w-4 h-4 mr-1.5" />
            Enviar
          </Button>
          <Button variante="primario" tamano="sm" onClick={() => setModalRapido(true)} disabled={turnos.length === 0}>
            <Zap className="w-4 h-4 mr-1.5" />
            Asignar
          </Button>
          <button onClick={() => setModalTurnos(true)}
            className="p-2.5 rounded-xl border bg-white border-slate-200 text-slate-600 active:bg-slate-50 transition-colors">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navegador de semana */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
        <button onClick={() => setSemanaInicio((s) => navegarSemana(s, -1))}
          className="p-1.5 rounded-xl text-slate-400 active:bg-slate-100 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-900">{formatRango()}</p>
          {esActual && <p className="text-[10px] text-primary-500 font-medium mt-0.5">Semana actual</p>}
        </div>
        <button onClick={() => setSemanaInicio((s) => navegarSemana(s, 1))}
          className="p-1.5 rounded-xl text-slate-400 active:bg-slate-100 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Sin turnos */}
      {!cargando && turnos.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Configura tus turnos primero</p>
            <p className="text-xs text-amber-600 mt-0.5 hidden sm:block">Define los horarios antes de asignar empleados</p>
          </div>
          <button onClick={() => setModalTurnos(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-amber-200 text-amber-700 text-xs font-semibold flex-shrink-0">
            <Settings2 className="w-3.5 h-3.5" />
            Configurar
          </button>
        </div>
      )}

      {/* Loader */}
      {cargando && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      )}

      {/* Vistas */}
      {!cargando && turnos.length > 0 && (
        <>
          {vistaMovil}
          {vistaDesktop}
        </>
      )}

      {/* Modales */}
      {modalTurnos && (
        <ModalTurnos empresa={empresa} turnos={turnos}
          onClose={() => setModalTurnos(false)}
          onGuardado={() => { setModalTurnos(false); cargar() }} />
      )}
      {modalSlot && (
        <ModalSlot sucursal={modalSlot.sucursal} turno={modalSlot.turno}
          turnoIdx={modalSlot.turnoIdx} fecha={modalSlot.fecha}
          empleados={empleados} programacion={programacion} empresa={empresa}
          onClose={() => setModalSlot(null)}
          onGuardado={() => { setModalSlot(null); cargar() }} />
      )}
      {modalEnviar && (
        <ModalEnviar empresa={empresa} empleados={empleados}
          programacion={programacion} turnos={turnos} semanaInicio={semanaInicio}
          onClose={() => setModalEnviar(false)} />
      )}
      {modalTel && (
        <ModalTelefono empresa={empresa}
          onClose={() => setModalTel(false)}
          onGuardado={() => { setModalTel(false); recargarDatos() }} />
      )}
      {modalRapido && (
        <ModalAsignacionRapida empresa={empresa} empleados={empleados}
          turnos={turnos} sucursales={sucursales} semanaInicio={semanaInicio}
          onClose={() => setModalRapido(false)}
          onGuardado={() => { setModalRapido(false); cargar() }} />
      )}
    </div>
  )
}
