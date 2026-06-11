import { cn } from '@/lib/clases'

export function EmptyState({ 
  icono: Icono, 
  titulo, 
  descripcion, 
  accion,
  className,
}) {
  return (
    <div className={cn(
      'bg-white border border-slate-100 rounded-3xl p-8 lg:p-12 text-center shadow-card',
      className
    )}>
      {Icono && (
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mx-auto mb-4">
          <Icono className="w-7 h-7 text-primary-400" strokeWidth={1.5} />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900 mb-1">{titulo}</h3>
      {descripcion && (
        <p className="text-sm text-slate-500 max-w-sm mx-auto mb-5">
          {descripcion}
        </p>
      )}
      {accion}
    </div>
  )
}