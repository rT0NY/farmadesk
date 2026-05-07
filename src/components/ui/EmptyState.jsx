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
      'bg-white border border-slate-200/70 rounded-3xl p-8 lg:p-12 text-center shadow-sm',
      className
    )}>
      {Icono && (
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <Icono className="w-7 h-7 text-slate-400" strokeWidth={1.5} />
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