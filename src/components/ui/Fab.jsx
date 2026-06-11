import { Plus } from 'lucide-react'
import { cn } from '@/lib/clases'

/**
 * Botón de acción flotante (solo móvil). Aparece arriba del bottom nav,
 * con gradiente azul y sombra de color, estilo iOS.
 */
export function Fab({ onClick, icono, label = 'Crear', className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'lg:hidden fixed right-4 z-30',
        'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]',
        'w-14 h-14 rounded-full',
        'bg-gradient-to-b from-primary-600 to-primary-700 text-white',
        'shadow-lg shadow-primary-500/40',
        'flex items-center justify-center',
        'active:scale-95 transition-all duration-200',
        className
      )}
    >
      {icono ?? <Plus className="w-6 h-6" strokeWidth={2.5} />}
    </button>
  )
}
