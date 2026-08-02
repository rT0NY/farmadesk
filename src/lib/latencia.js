// Medición pasiva de latencia.
//
// Antes se lanzaba una consulta a Supabase solo para cronometrarla. Esa consulta
// competía con las demás: si coincidía con una ráfaga, medía la cola de la propia
// app y el indicador marcaba "lenta" con la red perfecta.
//
// Ahora se cronometran las peticiones que ya se hacen, y se reporta el MÍNIMO de
// las últimas: la petición más rápida es la que menos trabajo de servidor lleva
// encima, así que se aproxima al viaje redondo real de la red.

const MAX_MUESTRAS = 10
const VIGENCIA_MS  = 2 * 60_000   // sin tráfico reciente, el dato ya no dice nada

const muestras = []          // { ms, en }
let fallosSeguidos = 0
const oyentes = new Set()

function avisar() {
  const estado = estadoRed()
  oyentes.forEach(fn => fn(estado))
}

export function registrarExito(ms) {
  fallosSeguidos = 0
  muestras.push({ ms, en: Date.now() })
  if (muestras.length > MAX_MUESTRAS) muestras.shift()
  avisar()
}

export function registrarFallo() {
  // Tres seguidos para no marcar caída por un error puntual
  fallosSeguidos += 1
  avisar()
}

export function estadoRed() {
  const vigentes = muestras.filter(m => Date.now() - m.en < VIGENCIA_MS)
  return {
    latencia: vigentes.length ? Math.min(...vigentes.map(m => m.ms)) : null,
    caida:    fallosSeguidos >= 3,
  }
}

export function suscribirRed(fn) {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}
