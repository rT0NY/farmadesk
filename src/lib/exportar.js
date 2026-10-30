// Descarga de listas como CSV que Excel abre bien a la primera:
//   - con BOM UTF-8, para que respete acentos y la ñ;
//   - cada campo entre comillas, así una coma dentro de un nombre no parte la columna;
//   - los números van sin "$" ni separador de miles, para poder sumarlos.

const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

/**
 * Fuerza a Excel a tratar el valor como texto. Sin esto un código de barras
 * de 13 dígitos se muestra como 7.50123E+12 y pierde los ceros a la izquierda.
 */
export const textoExcel = (v) => (v ? `="${String(v).replace(/"/g, '')}"` : '')

/** Número con dos decimales, sin formato de moneda */
export const numeroExcel = (v) => (Number(v) || 0).toFixed(2)

/** "Farmacias GI" → "farmacias-gi", para nombres de archivo */
export const paraArchivo = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'farmadesk'

export function descargarCSV(nombreArchivo, encabezados, filas) {
  const lineas = [encabezados, ...filas].map(f => f.map(campo).join(','))
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
