import { toast } from 'sonner'

// Ancho del rollo de las impresoras de tickets
const ANCHO_MM = 80

/**
 * Le da al ticket una página del tamaño exacto: 80 mm de ancho por el alto real
 * del contenido.
 *
 * Antes cada plantilla decía `@page{size:80mm auto}`, que no es CSS válido:
 * Chrome descartaba la regla entera y armaba el ticket en una hoja carta
 * (215.9 × 279.4 mm), y quedaba en manos del driver cómo acomodar esa hoja en
 * el rollo, con el blanco que eso dejara. La app de escritorio ya medía el alto
 * (electron/main.cjs); esto hace lo mismo en la web.
 */
function ajustarPagina(doc) {
  const px = Math.ceil(doc.documentElement.scrollHeight)
  const mm = Math.ceil((px * 25.4) / 96) + 2   // 96 px = 25.4 mm en CSS, + 2 mm de respiro
  const estilo = doc.createElement('style')
  estilo.textContent = `@page{size:${ANCHO_MM}mm ${mm}mm;margin:0}`
  doc.head.appendChild(estilo)
}

/**
 * Imprime un ticket de 80 mm. Es la ÚNICA puerta para imprimir tickets
 * (venta, reimpresión y cortes de caja): había dos copias de esta función, una
 * en Ventas y otra en Caja, y un arreglo en una no llegaba a la otra.
 *
 * La plantilla debe traer `@page{margin:0}` y nada de `size`: el tamaño lo pone
 * esta función con el alto medido.
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
    setTimeout(() => {
      // Si medir fallara, se imprime igual: mejor un ticket con blanco de más
      // que ningún ticket.
      try { ajustarPagina(win.document) } catch { /* sin ajuste */ }
      win.print()
      win.close()
    }, 500)
    return true
  } catch {
    toast.error('Error al imprimir', {
      description: 'No se pudo conectar con la impresora. Verifica que esté encendida y con papel; los tickets de venta se pueden reimprimir desde Historial.',
      duration: 8000,
    })
    return false
  }
}
