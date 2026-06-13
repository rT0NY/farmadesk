import { forwardRef } from 'react'
import { cn } from '@/lib/clases'

const VARIANTES = {
  primario:
    'bg-gradient-to-b from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 active:from-primary-800 active:to-primary-900 text-white shadow-primario hover:shadow-lg hover:shadow-primary-500/40',
  secundario:
    'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700',
  tinted:
    'bg-primary-50 hover:bg-primary-100 active:bg-primary-200 text-primary-700',
  fantasma:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700',
  peligro:
    'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 text-white shadow-peligro hover:shadow-lg hover:shadow-red-500/40',
  'peligro-suave':
    'bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600',
  exito:
    'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 active:from-emerald-700 active:to-emerald-800 text-white shadow-exito hover:shadow-lg hover:shadow-emerald-500/40',
  advertencia:
    'bg-gradient-to-b from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 active:from-amber-600 active:to-amber-700 text-white shadow-advertencia hover:shadow-lg hover:shadow-amber-500/40',
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