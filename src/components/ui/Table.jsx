import { cn } from '@/lib/clases'
import { createContext, useContext } from 'react'

// Contexto para saber si estamos en "modo tabla" o "modo tarjeta" (móvil)
const TableContext = createContext({ modo: 'tabla' })

/**
 * Tabla responsive: desktop muestra tabla, móvil convierte en tarjetas apiladas.
 */
export function Table({ children, className }) {
  return (
    <div className={cn(
      'bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-card',
      className
    )}>
      {/* Desktop: tabla real */}
      <div className="hidden md:block overflow-x-auto">
        <TableContext.Provider value={{ modo: 'tabla' }}>
          <table className="w-full">
            {children}
          </table>
        </TableContext.Provider>
      </div>
      {/* Móvil: tarjetas apiladas */}
      <div className="md:hidden divide-y divide-slate-100">
        <TableContext.Provider value={{ modo: 'tarjeta' }}>
          {children}
        </TableContext.Provider>
      </div>
    </div>
  )
}

function TableHead({ children }) {
  const { modo } = useContext(TableContext)
  if (modo === 'tarjeta') return null // en móvil no mostramos header
  return (
    <thead className="bg-slate-50/70 border-b border-slate-200">
      <tr>{children}</tr>
    </thead>
  )
}

function TableHeadCell({ children, align = 'left', className }) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        align === 'left' && 'text-left',
        className
      )}
    >
      {children}
    </th>
  )
}

function TableBody({ children }) {
  const { modo } = useContext(TableContext)
  if (modo === 'tarjeta') {
    // En móvil, Body es un fragment simple
    return <>{children}</>
  }
  return <tbody className="divide-y divide-slate-100">{children}</tbody>
}

function TableRow({ children, onClick, className }) {
  const { modo } = useContext(TableContext)
  if (modo === 'tarjeta') {
    return (
      <div
        onClick={onClick}
        className={cn(
          'p-4 space-y-1.5',
          onClick && 'cursor-pointer hover:bg-slate-50 transition-colors',
          className
        )}
      >
        {children}
      </div>
    )
  }
  return (
    <tr
      onClick={onClick}
      className={cn(
        'hover:bg-slate-50/70 transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </tr>
  )
}

function TableCell({ children, label, align = 'left', className, mono = false }) {
  const { modo } = useContext(TableContext)
  if (modo === 'tarjeta') {
    return (
      <div className={cn('flex items-center justify-between gap-3', className)}>
        {label && (
          <span className="text-xs font-medium text-slate-500 flex-shrink-0">
            {label}
          </span>
        )}
        <span className={cn(
          'text-sm text-slate-900 min-w-0',
          mono && 'tabular-nums',
          label ? 'text-right' : 'w-full'
        )}>
          {children}
        </span>
      </div>
    )
  }
  return (
    <td
      className={cn(
        'px-3 py-2.5 text-sm text-slate-900',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        mono && 'tabular-nums',
        className
      )}
    >
      {children}
    </td>
  )
}

Table.Head = TableHead
Table.HeadCell = TableHeadCell
Table.Body = TableBody
Table.Row = TableRow
Table.Cell = TableCell