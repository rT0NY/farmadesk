import { cn } from '@/lib/clases'

export function Card({ children, className, padding = 'md', ...props }) {
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  return (
    <div
      className={cn(
        'bg-white rounded-3xl border border-slate-100',
        'shadow-card',
        paddings[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardTitulo({ children, className }) {
  return (
    <h2
      className={cn('text-lg font-semibold text-slate-900', className)}
    >
      {children}
    </h2>
  )
}

export function CardSubtitulo({ children, className }) {
  return (
    <p className={cn('text-sm text-slate-500 mt-0.5', className)}>
      {children}
    </p>
  )
}