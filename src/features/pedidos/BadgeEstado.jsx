import { cn } from '@/lib/clases'

const ESTADO_BADGE = {
  pendiente: 'bg-amber-100 text-amber-700 border-amber-200',
  recibido:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  parcial:   'bg-sky-100 text-sky-700 border-sky-200',
  cancelado: 'bg-slate-100 text-slate-500 border-slate-200',
}
const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  recibido:  'Recibido',
  parcial:   'Parcial',
  cancelado: 'Cancelado',
}
function BadgeEstado({ estado }) {
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide',
      ESTADO_BADGE[estado] ?? ESTADO_BADGE.pendiente
    )}>
      {ESTADO_LABEL[estado] ?? estado}
    </span>
  )
}

export { BadgeEstado }
