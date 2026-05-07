import { useState, useRef, useEffect, forwardRef } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/clases'

/**
 * Select con estilo iOS. Opciones: [{ valor: 'x', etiqueta: 'X' }]
 */
export const Select = forwardRef(function Select({
  label,
  valor,
  onChange,
  opciones = [],
  placeholder = 'Seleccionar...',
  iconoIzq,
  disabled = false,
  permitirVacio = false,
  error,
  className,
}, ref) {
  const [abierto, setAbierto] = useState(false)
  const refContenedor = useRef(null)

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e) => {
      if (refContenedor.current && !refContenedor.current.contains(e.target)) {
        setAbierto(false)
      }
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  const opcionSeleccionada = opciones.find(o => o.valor === valor)

  return (
    <div className="w-full" ref={refContenedor}>
      {label && (
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {label}
        </label>
      )}
      
      <button
        ref={ref}
        type="button"
        onClick={() => !disabled && setAbierto(v => !v)}
        disabled={disabled}
        className={cn(
          'w-full h-11 rounded-2xl border bg-white text-left',
          'flex items-center gap-2 px-4 pr-10 relative',
          'transition-all',
          abierto && 'ring-2 ring-primary-500/30 border-primary-500',
          !abierto && error && 'border-red-300',
          !abierto && !error && 'border-slate-200 hover:border-slate-300',
          disabled && 'bg-slate-50 cursor-not-allowed opacity-60',
          className
        )}
      >
        {iconoIzq && (
          <span className="text-slate-400 flex-shrink-0">{iconoIzq}</span>
        )}
        <span className={cn(
          'flex-1 truncate text-sm',
          opcionSeleccionada ? 'text-slate-900' : 'text-slate-400'
        )}>
          {opcionSeleccionada?.etiqueta || placeholder}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 transition-transform',
          abierto && 'rotate-180'
        )} />
      </button>

      {error && (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      )}

      {abierto && !disabled && (
        <div className="relative">
          <div className="absolute top-1 left-0 right-0 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
            {permitirVacio && (
              <button
                type="button"
                onClick={() => { onChange?.(null); setAbierto(false) }}
                className={cn(
                  'w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2',
                  !valor ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-500 hover:bg-slate-50'
                )}
              >
                <span className="flex-1">— Ninguno —</span>
                {!valor && <Check className="w-4 h-4" />}
              </button>
            )}
            {opciones.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400 text-center">
                Sin opciones
              </p>
            ) : (
              opciones.map(op => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => { onChange?.(op.valor); setAbierto(false) }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2',
                    op.valor === valor 
                      ? 'bg-primary-50 text-primary-700 font-medium' 
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span className="flex-1 truncate">{op.etiqueta}</span>
                  {op.valor === valor && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
})