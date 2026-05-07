export const sanitizar = (txt) => {
  if (typeof txt !== 'string') return ''
  return txt
    .trim()
    .replace(/[<>]/g, '')
    .slice(0, 500)
}

export const sanitizarNum = (valor, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(valor)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

export const sanitizarEntero = (valor, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = parseInt(valor, 10)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}