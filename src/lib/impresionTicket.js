import { toast } from 'sonner'

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
  try {
    const win = window.open('', '_blank', 'width=320,height=600')
    if (!win || win.closed) {
      toast.error('Impresión bloqueada', {
        description: 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.',
        duration: 8000,
      })
      return false
    }
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
