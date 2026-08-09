import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/clases'

/**
 * Bloqueo del fondo mientras hay una ventana abierta.
 *
 * En iOS no basta `overflow: hidden` en el body — el navegador lo ignora para
 * el gesto táctil, y por eso al deslizar dentro de un modal se movía la página
 * de atrás. La técnica que sí funciona es fijar el body y compensar el scroll
 * con `top`, restaurándolo al cerrar.
 *
 * El contador es para las ventanas encadenadas: la edición masiva pasa del
 * paso 1 al 2 desmontando una y montando otra, y sin contador el fondo se
 * soltaría a medio camino perdiendo la posición de la página.
 */
let bloqueos = 0
let scrollGuardado = 0

function useFondoBloqueado() {
  useEffect(() => {
    const body = document.body
    if (bloqueos === 0) {
      scrollGuardado = window.scrollY
      body.style.position = 'fixed'
      body.style.top      = `-${scrollGuardado}px`
      body.style.left     = '0'
      body.style.right    = '0'
      body.style.overflow = 'hidden'
    }
    bloqueos += 1

    return () => {
      bloqueos -= 1
      if (bloqueos === 0) {
        body.style.position = ''
        body.style.top      = ''
        body.style.left     = ''
        body.style.right    = ''
        body.style.overflow = ''
        window.scrollTo(0, scrollGuardado)
      }
    }
  }, [])
}

// `cerrarAlTocarFuera` viene en true para no cambiar el comportamiento de las
// ventanas que ya existen. Se pone en false donde un clic afuera por descuido
// costaria una captura larga.
function Modal({ children, onClose, maxWidth = 'sm:max-w-md', cerrarAlTocarFuera = true }) {
  useFondoBloqueado()
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={cerrarAlTocarFuera ? onClose : undefined}
      />
      {/* `overscroll-contain` corta el encadenado: al llegar al final de una
          lista dentro del modal, el gesto ya no se pasa a la página de atrás. */}
      <div className={cn(
        'relative w-full bg-white rounded-none sm:rounded-3xl shadow-2xl flex flex-col overscroll-contain',
        'h-[100dvh] sm:h-auto sm:max-h-[92dvh]',
        maxWidth
      )}>
        {children}
      </div>
    </div>
  )
}

function ModalHeader({ titulo, subtitulo, onClose }) {
  return (
    // A pantalla completa el encabezado arranca en el borde de arriba, o sea
    // debajo del notch. El relleno le suma esa franja; en computadora vale cero
    // y no cambia nada.
    <div
      className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0"
      style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}
    >
      {/* min-w-0 para que un subtítulo largo se recorte en vez de empujar la
          X fuera de la pantalla en un teléfono angosto. */}
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-slate-900 truncate">{titulo}</h2>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitulo}</p>}
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors -mt-1 -mr-1 flex-shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

function ModalFooter({ children }) {
  return (
    // El relleno de abajo suma la franja del gesto de inicio del teléfono. Sin
    // eso, en pantalla completa los botones quedan justo debajo de la barra y
    // se tocan por accidente al intentar salir.
    <div
      className="px-6 py-4 border-t border-slate-100 flex-shrink-0"
      style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      {children}
    </div>
  )
}

export { Modal, ModalHeader, ModalFooter }

