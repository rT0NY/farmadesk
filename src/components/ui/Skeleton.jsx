import { cn } from '@/lib/clases'

/** Bloque de carga con pulso, para usar en lugar de spinners. */
export function Skeleton({ className }) {
  return (
    <div className={cn('animate-pulse rounded-3xl bg-slate-200/60', className)} />
  )
}
