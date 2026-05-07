import { forwardRef } from 'react'
import { cn } from '@/lib/clases'

const VARIANTES = {
  primario:
    'bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white shadow-sm hover:shadow-md',
  secundario:
    'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm',
  fantasma:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700',
  peligro:
    'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm hover:shadow-md',
  exito:
    'bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-sm hover:shadow-md',
}

const TAMANOS = {
  sm: 'h-9 px-3 text-sm rounded-xl',
  md: 'h-11 px-4 text-sm rounded-2xl',
  lg: 'h-12 px-5 text-base rounded-2xl',
  xl: 'h-14 px-6 text-lg rounded-2xl font-semibold',
}

export const Button = forwardRef(function Button(
  {
    children,
    variante = 'primario',
    tamano = 'md',
    cargando = false,
    iconoIzq,
    iconoDer,
    className,
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || cargando}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium',
        'transition-all duration-200 ease-out',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:ring-offset-1',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none',
        'active:scale-[0.98]',
        VARIANTES[variante],
        TAMANOS[tamano],
        className
      )}
      {...props}
    >
      {cargando ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        iconoIzq
      )}
      {children}
      {!cargando && iconoDer}
    </button>
  )
})