import { forwardRef } from 'react'
import { cn } from '@/lib/clases'

export const Input = forwardRef(function Input(
  { label, error, iconoIzq, iconoDer, className, id, ...props },
  ref
) {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {iconoIzq && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {iconoIzq}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full h-11 rounded-2xl border bg-white text-slate-900 placeholder:text-slate-400',
            'transition-all duration-200 ease-out',
            'focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500',
            'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
            iconoIzq ? 'pl-11' : 'pl-4',
            iconoDer ? 'pr-11' : 'pr-4',
            error
              ? 'border-red-300 focus:ring-red-500/30 focus:border-red-500'
              : 'border-slate-200',
            className
          )}
          {...props}
        />
        {iconoDer && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            {iconoDer}
          </span>
        )}
      </div>
      {error && (
        <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
          {error}
        </p>
      )}
    </div>
  )
})