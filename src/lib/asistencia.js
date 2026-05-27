import { supabase } from '@/lib/supabase'
import { fechaEnZona } from '@/lib/formatos'

/**
 * Registra automáticamente la asistencia en `programacion` cuando un empleado
 * abre su turno de caja. Cada turno_empresa del día tiene su propio registro.
 *
 * Casos:
 * A) Sin registro para este turno hoy → insertar
 * B) Registro para este turno en otra sucursal → actualizar (emergencia)
 * C) Registro para este turno en la misma sucursal → no hacer nada
 */
export async function registrarAsistencia({ perfilId, empresaId, sucursalId, tz }) {
  if (!perfilId || !empresaId || !sucursalId) return

  const hoyAuto = fechaEnZona(tz)
  const horaActual = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date())

  // Determinar cuál turno_empresa corresponde a la hora actual
  const { data: turnosEmp } = await supabase
    .from('turnos_empresa').select('id, hora_inicio, hora_fin')
    .eq('empresa_id', empresaId).order('hora_inicio')
  if (!turnosEmp?.length) return

  const turnoEmpresa = turnosEmp.find(
    t => t.hora_inicio.slice(0, 5) <= horaActual && horaActual < t.hora_fin.slice(0, 5)
  ) ?? turnosEmp[0]

  // Buscar registro existente para HOY + este TURNO específico
  const { data: progsHoy } = await supabase
    .from('programacion')
    .select('id, sucursal_id')
    .eq('empresa_id', empresaId)
    .eq('usuario_id', perfilId)
    .eq('fecha', hoyAuto)
    .eq('turno_id', turnoEmpresa.id)
    .limit(1)
  const progHoy = progsHoy?.[0] ?? null

  if (!progHoy) {
    await supabase.from('programacion').insert({
      empresa_id:  empresaId,
      usuario_id:  perfilId,
      sucursal_id: sucursalId,
      turno_id:    turnoEmpresa.id,
      fecha:       hoyAuto,
    })
  } else if (progHoy.sucursal_id !== sucursalId) {
    // Mismo turno pero sucursal diferente (emergencia) → actualizar
    await supabase.from('programacion').update({ sucursal_id: sucursalId }).eq('id', progHoy.id)
  }
}
