// Cuando una petición no llega al servidor (o su respuesta no regresa), Supabase
// no devuelve un error de la base sino el del navegador, tal cual:
// "TypeError: Failed to fetch" en Chrome y Edge, "Load failed" en Safari,
// "NetworkError when attempting to fetch resource" en Firefox. A quien está en
// el mostrador eso no le dice nada; aquí se traduce a lo que de verdad pasó.

const DE_RED = /failed to fetch|load failed|networkerror|network request failed/i

export const esErrorDeRed = (err) => DE_RED.test(String(err?.message ?? err ?? ''))

/** Mensaje para mostrar: el de la base si lo hay; si fue la red, uno claro. */
export function mensajeError(err, porDefecto = 'Ocurrió un error') {
  if (esErrorDeRed(err)) return 'No hubo conexión con el servidor. Revisa tu internet e inténtalo de nuevo.'
  return err?.message || porDefecto
}
