// Evento global que obliga a recalcular los badges del menú y el panel de alertas.
export const EVENTO_ALERTA = 'farmadesk:alerta'

/**
 * Dispara el recálculo inmediato de los contadores (cancelaciones pendientes,
 * cuentas por cobrar...). Llamar en cuanto una acción cambie algo que se cuente:
 * aprobar/rechazar una cancelación, solicitarla, cobrar una cuenta.
 *
 * Realtime cubre los demás dispositivos; esto cubre el propio, que si no se
 * queda mostrando el número viejo hasta el siguiente sondeo.
 */
export function emitirAlerta() {
  window.dispatchEvent(new CustomEvent(EVENTO_ALERTA))
}
