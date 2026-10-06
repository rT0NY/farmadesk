import { toast } from 'sonner'
import { porMarcoOculto } from '@/lib/documento'

/**
 * Ancho de TODOS los tickets (venta, reimpresión y cortes). Va al final del
 * <style> de cada plantilla, para que mande sobre lo demás.
 *
 * El ticket se diseña para el área que la impresora SÍ imprime, no para el
 * ancho del papel. En rollo de 80 mm casi todas las térmicas (Epson, Xprinter,
 * Star, Bixolon) imprimen 72 mm; en rollo de 58 mm, 48 mm. Antes el ticket
 * medía 80 mm: en la Epson de Dulce Nombre se perdían los ~6 mm de la derecha
 * —importes, total, "Efectivo"— y en la impresora de la otra sucursal no se
 * notaba porque esa imprime casi todo el ancho. A 72 mm sale completo en ambas.
 *
 * El navegador no sabe cuánto imprime cada impresora, pero sí qué papel tiene
 * seleccionado: al imprimir, (max-width) se evalúa contra el ancho del papel.
 * Medido en Edge/Chrome: rollo de 58 mm ≈ 219 px, de 80 mm ≈ 302 px. Con papel
 * de 58 mm el ticket se acomoda solo a 48 mm, sin configurar nada por sucursal
 * ni por equipo.
 */
export const CSS_ANCHO_TICKET =
  'body{width:72mm;padding:8px 2mm;overflow-wrap:break-word}' +
  // Un nombre largo sin espacios (AMOXICILINA/ACIDOCLAVULANICO…) estiraba la
  // tabla y empujaba los importes fuera del papel, en cualquier impresora. Solo
  // las columnas de texto se pueden partir; importes y horas, nunca.
  'tbody td:first-child,.prod td:nth-child(2){overflow-wrap:anywhere}' +
  '@media print and (max-width:260px){' +
    'body{width:48mm;padding:6px 1.5mm;font-size:11px}' +
    'h2{font-size:13px}' +
    '.folio{font-size:12px;letter-spacing:1px}' +
    'th{font-size:10px}td{font-size:11px}' +
    '.fila{font-size:11px}.total{font-size:13px}' +
    '.prod td{font-size:10px}' +
  '}'

/**
 * Imprime un ticket de 80 mm. Es la ÚNICA puerta para imprimir tickets
 * (venta, reimpresión y cortes de caja): había dos copias de esta función, una
 * en Ventas y otra en Caja, y un arreglo en una no llegaba a la otra.
 *
 * La plantilla lleva `@page{margin:0}` y NINGÚN `size`. Probado en la farmacia
 * (2026-09-28): cuando la página trae su propio tamaño, Chrome deja de respetar
 * los márgenes en 0 al mandarla a la térmica, la encoge para "ajustarla" al
 * papel del driver y le agrega su encabezado y pie (fecha, "about:blank",
 * "1/1"). En PDF se veía perfecto; en la impresora, no. Sin `size`, Chrome usa
 * el papel que tenga seleccionado la impresora y el contenido sale a tamaño
 * real. El largo del ticket depende entonces del papel configurado en el
 * driver: debe ser el de rollo, no carta ni 80×297.
 */
export async function abrirImpresion(html) {
  // ── Electron: IPC con diálogo nativo de Windows (mide el alto en main.cjs) ──
  if (window.electronAPI) {
    try {
      const impresoras = await window.electronAPI.obtenerImpresoras()
      if (!impresoras || impresoras.length === 0) {
        toast.error('Sin impresora', {
          description: 'No hay impresoras instaladas. Instala el driver de tu impresora de tickets e intenta de nuevo.',
          duration: 8000,
        })
        return false
      }
      const { success, errorType } = await window.electronAPI.imprimirTicket(html)
      if (!success && errorType !== 'cancelled') {
        toast.error('Error al imprimir', {
          description: `No se pudo enviar a la impresora (${errorType ?? 'desconocido'}).`,
          duration: 6000,
        })
      }
      return success
    } catch (e) {
      toast.error('Error al imprimir', { description: e?.message ?? 'Error inesperado', duration: 6000 })
      return false
    }
  }

  // ── Web: ventana aparte y diálogo de impresión del navegador ──
  // Si el navegador bloquea la ventana (emergentes desactivadas en ese equipo o
  // para este sitio), se imprime desde un marco oculto dentro de la misma
  // página: no es una ventana, así que no se puede bloquear. Es el mismo
  // recurso que ya usa documento.js. Se intenta primero la ventana porque es
  // el camino probado en iPhone, donde imprimir un marco no es confiable.
  const porMarco = () => {
    if (porMarcoOculto(html)) return true
    toast.error('Impresión bloqueada', {
      description: 'El navegador bloqueó la impresión. Permite ventanas emergentes para este sitio e intenta de nuevo.',
      duration: 8000,
    })
    return false
  }
  try {
    const win = window.open('', '_blank', 'width=320,height=600')
    if (!win || win.closed) return porMarco()
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
    return true
  } catch {
    toast.error('Error al imprimir', {
      description: 'No se pudo conectar con la impresora. Verifica que esté encendida y con papel; los tickets de venta se pueden reimprimir desde Historial.',
      duration: 8000,
    })
    return false
  }
}
