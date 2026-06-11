import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, X, Package, CreditCard, Users, ShoppingCart,
  ArrowRight, Clock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'

// ─── Fila de resultado ────────────────────────────────────────────────────────
function FilaResultado({ Icono, color, titulo, sub, onClick }) {
  const cls = {
    primary: 'bg-primary-100 text-primary-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber:   'bg-amber-100   text-amber-600',
    violet:  'bg-violet-100  text-violet-600',
    slate:   'bg-slate-100   text-slate-500',
  }[color] ?? 'bg-slate-100 text-slate-500'

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left rounded-xl group">
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', cls)}>
        <Icono className="w-4 h-4" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{titulo}</p>
        {sub && <p className="text-xs text-slate-400 truncate">{sub}</p>}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
    </button>
  )
}

function Seccion({ label, children }) {
  return (
    <div>
      <p className="px-4 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      {children}
    </div>
  )
}

// ─── Hook de atajo Ctrl+K ─────────────────────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useBuscadorGlobal() {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setAbierto(v => !v)
      }
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return { abierto, setAbierto }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function BuscadorGlobal({ abierto, onClose }) {
  const { empresa, esAdmin } = useApp()
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const [query,     setQuery]     = useState('')
  const [resultados, setResultados] = useState(null)
  const [buscando,   setBuscando]   = useState(false)
  const debounceRef = useRef(null)

  // Focus al abrir
  useEffect(() => {
    if (abierto) {
      setQuery('')
      setResultados(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [abierto])

  const buscar = useCallback(async (q) => {
    if (!q.trim() || !empresa?.id) { setResultados(null); return }
    setBuscando(true)
    try {
      const [
        { data: productos },
        { data: cuentas },
        { data: empleados },
      ] = await Promise.all([
        supabase.from('productos')
          .select('id, nombre, categoria, precio_venta, precio_mayoreo, activo')
          .eq('empresa_id', empresa.id)
          .ilike('nombre', `%${q}%`)
          .limit(5),
        supabase.from('cuentas_pendientes')
          .select('id, nombre_cliente, total, abonado, pagada')
          .eq('empresa_id', empresa.id)
          .ilike('nombre_cliente', `%${q}%`)
          .limit(4),
        esAdmin
          ? supabase.from('perfiles')
              .select('id, nombre, rol, correo')
              .eq('empresa_id', empresa.id)
              .ilike('nombre', `%${q}%`)
              .limit(3)
          : { data: [] },
      ])
      setResultados({ productos: productos ?? [], cuentas: cuentas ?? [], empleados: empleados ?? [] })
    } catch { /* silencioso */ }
    finally { setBuscando(false) }
  }, [empresa?.id, esAdmin])

  const handleChange = (e) => {
    const v = e.target.value
    setQuery(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(v), 250)
  }

  const ir = (ruta) => { navigate(ruta); onClose() }

  const hayResultados = resultados && (
    resultados.productos.length > 0 ||
    resultados.cuentas.length   > 0 ||
    resultados.empleados.length > 0
  )

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16 px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-modal-in">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          {buscando
            ? <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin flex-shrink-0" />
            : <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            placeholder="Buscar productos, clientes, empleados..."
            className="flex-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none bg-transparent"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {query && (
              <button onClick={() => { setQuery(''); setResultados(null) }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 bg-slate-100 rounded-lg">
              ESC
            </kbd>
          </div>
        </div>

        {/* Resultados */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {!query && (
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
              <Search className="w-8 h-8 text-slate-200" />
              <p className="text-sm font-medium text-slate-400">Escribe para buscar</p>
              <p className="text-xs text-slate-300">Productos, clientes con cuentas, empleados</p>
            </div>
          )}

          {query && !buscando && !hayResultados && (
            <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
              <p className="text-sm font-medium text-slate-500">Sin resultados para "{query}"</p>
              <p className="text-xs text-slate-400">Intenta con otro término</p>
            </div>
          )}

          {hayResultados && (
            <div className="flex flex-col gap-1">
              {/* Productos */}
              {resultados.productos.length > 0 && (
                <Seccion label="Productos">
                  {resultados.productos.map(p => (
                    <FilaResultado key={p.id}
                      Icono={Package} color="primary"
                      titulo={p.nombre}
                      sub={[p.categoria, formatoMoneda(p.precio_venta), !p.activo && 'Archivado'].filter(Boolean).join(' · ')}
                      onClick={() => ir('/productos')}
                    />
                  ))}
                </Seccion>
              )}

              {/* Cuentas pendientes */}
              {resultados.cuentas.length > 0 && (
                <Seccion label="Cuentas pendientes">
                  {resultados.cuentas.map(c => {
                    const saldo = c.total - c.abonado
                    return (
                      <FilaResultado key={c.id}
                        Icono={CreditCard} color={c.pagada ? 'emerald' : 'amber'}
                        titulo={c.nombre_cliente}
                        sub={c.pagada ? 'Liquidada' : `Saldo: ${formatoMoneda(saldo)} de ${formatoMoneda(c.total)}`}
                        onClick={() => ir('/cuentas')}
                      />
                    )
                  })}
                </Seccion>
              )}

              {/* Empleados */}
              {resultados.empleados.length > 0 && (
                <Seccion label="Empleados">
                  {resultados.empleados.map(e => (
                    <FilaResultado key={e.id}
                      Icono={Users} color="violet"
                      titulo={e.nombre}
                      sub={[e.rol, e.correo].filter(Boolean).join(' · ')}
                      onClick={() => ir('/empleados')}
                    />
                  ))}
                </Seccion>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-4 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><kbd className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">↵</kbd> abrir</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">ESC</kbd> cerrar</span>
          <span className="flex items-center gap-1"><kbd className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">Ctrl</kbd>+<kbd className="bg-slate-100 px-1.5 py-0.5 rounded font-bold">K</kbd> abrir/cerrar</span>
        </div>
      </div>
    </div>
  )
}
