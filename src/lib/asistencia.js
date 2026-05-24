import { supabase } from '@/lib/supabase'
import { fechaEnZona } from '@/lib/formatos'

/**
 * Registra automáticamente la asistencia en `programacion` cuando un empleado
 * abre su turno de caja. Se llama tanto desde VentasPage como desde CajaPage.
 *
 * Casos:
 * A) Sin registro hoy → insertar con el turno de empresa vigente
 * B) Registro en otra sucursal → actualizar sucursal (emergencia)
 * C) Registro con llegada >90 min tarde → borrar el anterior e insertar nuevo
 * D) Registro a tiempo, misma sucursal → no hacer nada
 */
export async function registrarAsistencia({ perfilId, empresaId, sucursalId, tz }) {
  if (!perfilId || !empresaId || !sucursalId) return

  const hoyAuto = fechaEnZona(tz)
  const horaActual = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())

  const { data: progsHoy } = await supabase
    .from('programacion')
    .select('id, sucursal_id, turno_id, turnos_empresa(hora_inicio, hora_fin)')
    .eq('empresa_id', empresaId)
    .eq('usuario_id', perfilId)
    .eq('fecha', hoyAuto)
    .limit(1)
  const progHoy = progsHoy?.[0] ?? null

  const registrarConTurnoActual = async () => {
    const { data: turnosEmp } = await supabase
      .from('turnos_empresa').select('id, hora_inicio, hora_fin')
      .eq('empresa_id', empresaId).order('hora_inicio')
    if (!turnosEmp?.length) return
    const turnoEmpresa = turnosEmp.find(
      t => t.hora_inicio.slice(0, 5) <= horaActual && horaActual < t.hora_fin.slice(0, 5)
    ) ?? turnosEmp[0]
    await supabase.from('programacion').insert({
      empresa_id:  empresaId,
      usuario_id:  perfilId,
      sucursal_id: sucursalId,
      turno_id:    turnoEmpresa.id,
      fecha:       hoyAuto,
    })
  }

  if (!progHoy) {
    await registrarConTurnoActual()
  } else {
    const horaInicio = (progHoy.turnos_empresa?.hora_inicio || '').slice(0, 5)
    const [hI, mI] = horaInicio ? horaInicio.split(':').map(Number) : [0, 0]
    const [hA, mA] = horaActual.split(':').map(Number)
    const minutosLlegada = horaInicio ? (hA * 60 + mA) - (hI * 60 + mI) : 0

    const otraSucursal  = progHoy.sucursal_id !== sucursalId
    const llegoMuyTarde = horaInicio && minutosLlegada > 90

    if (llegoMuyTarde) {
      await supabase.from('programacion').delete().eq('id', progHoy.id)
      await registrarConTurnoActual()
    } else if (otraSucursal) {
      await supabase.from('programacion').update({ sucursal_id: sucursalId }).eq('id', progHoy.id)
    }
  }
}
