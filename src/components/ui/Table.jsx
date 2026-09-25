import { cn } from '@/lib/clases'
import { createContext, useContext } from 'react'
import { useMediaQuery, DESDE_MD } from '@/hooks/useMediaQuery'

// Contexto para saber si estamos en "modo tabla" o "modo tarjeta" (móvil)
const TableContext = createContext({ modo: 'tabla' })
const MODO_TABLA   = { modo: 'tabla' }
const MODO_TARJETA = { modo: 'tarjeta' }

/**
 * Tabla responsive: desktop muestra tabla, móvil convierte en tarjetas apiladas.
 */
// `anchoFijo` hace que manden los anchos declarados en las HeadCell. Sin él, el
// navegador dimensiona las columnas segun su contenido y `truncate` no puede
// actuar: un solo nombre largo ensancha su columna y empuja al resto fuera de la
// vista. Va apagado por defecto para no alterar las tablas que no declaran
// anchos — ahi todas las columnas quedarian iguales.
//
// Solo se construye la versión que se ve. Antes se armaban las dos y una se
// escondía con CSS (`hidden md:block` / `md:hidden`): cada fila existía dos
// veces, y en Productos eso duplicaba 2,900 renglones.
export function Table({ children, className, anchoFijo = false }) {
  const escritorio = useMediaQuery(DESDE_MD)
  return (
    <div className={cn(
      'bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-card',
      className
    )}>
      {escritorio ? (
        // Desktop: tabla real
        <div className="overflow-x-auto">
          <TableContext.Provider value={MODO_TABLA}>
            <table className={cn('w-full', anchoFijo && 'table-fixed min-w-[620px]')}>
              {children}
            </table>
          </TableContext.Provider>
        </div>
      ) : (
        // Móvil: tarjetas apiladas
        <div className="divide-y divide-slate-100">
          <TableContext.Provider value={MODO_TARJETA}>
            {children}
          </TableContext.Provider>
        </div>
      )}
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