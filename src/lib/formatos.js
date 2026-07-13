const TZ_DEFAULT = 'America/Mexico_City'

// Fecha de un Date como YYYY-MM-DD en la zona horaria dada (cualquier dispositivo → mismo resultado)
export function isoEnZona(d, tz = TZ_DEFAULT) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(d)
}

// Fecha de HOY como YYYY-MM-DD en la zona horaria de la empresa
export const fechaEnZona = (tz = TZ_DEFAULT) => isoEnZona(new Date(), tz)

// Suma N días a una fecha ISO (YYYY-MM-DD) trabajando en UTC puro — sin depender de ningún timezone
export function addDias(isoDate, dias) {
  const d = new Date(isoDate + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Día de semana (0=Dom…6=Sáb) de una fecha ISO en la zona horaria dada
export function dowEnZona(isoDate) {
  return new Date(isoDate + 'T12:00:00Z').getUTCDay()
}

// ─── Alias legacy — usar fechaEnZona(tz) en su lugar ─────────────────────────
// Convierte un Date a YYYY-MM-DD usando la zona horaria LOCAL del dispositivo
export function toLocalIso(d) {
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
// Solo para compatibilidad con código viejo; migrar a fechaEnZona(tz)
export const fechaLocalHoy = () => fechaEnZona()

/**
 * Genera un folio de ticket único y jerárquico.
 * Formato: {SUC3}-{ID_6} — ej. "CEN-000042", "MAT-000043"
 *
 * Jerarquía: sucursal → ticket global.
 * Unicidad garantizada por el ID (PK bigint de la tabla ventas).
 * El prefijo de sucursal normaliza acentos, espacios y caracteres especiales.
 */
export function generarFolio(ventaId, sucursalNombre) {
  const suc = String(sucursalNombre || 'GEN')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // quitar acentos
    .replace(/[^A-Za-z0-9]/g, '')                       // quitar espacios y símbolos
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X')                                     // siempre 3 chars
  const id = String(ventaId || 0).padStart(6, '0')
  return `${suc}-${id}`
}

export const formatoMoneda = (n) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0)

export const formatoFecha = (fecha) => {
  if (!fecha) return ''
  const d = new Date(fecha)
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export const formatoFechaHora = (fecha) => {
  if (!fecha) return ''
  const d = new Date(fecha)
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatoHora = (fecha) => {
  if (!fecha) return ''
  const d = new Date(fecha)
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Escapa texto controlado por el usuario antes de interpolarlo en HTML de tickets/etiquetas.
// Evita XSS almacenado: p. ej. un producto llamado <img onerror=...> ejecutándose en la
// ventana de impresión (mismo origen que la app → acceso a la sesión de Supabase).
export const escapeHtml = (valor) => {
  if (valor === null || valor === undefined) return ''
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
