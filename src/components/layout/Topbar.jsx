import { Search, Store, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '@/context/AppCtx'
import { cn } from '@/lib/clases'

export default function Topbar() {
  const { sucursales, sucursalActiva, cambiarSucursal } = useApp()
  const [abierto, setAbierto] = useState(false)

  return (
    <header className="sticky top-0 z-30 px-3 pt-3 lg:px-6 lg:pt-6">
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm px-4 lg:px-5 h-14 lg:h-16 flex items-center gap-3 lg:gap-4">
        {/* Buscador */}
        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar..."
            className="w-full h-10 pl-10 pr-4 rounded-2xl bg-slate-100/70 border border-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-500/20 transition-all"
          />
        </div>

        {/* Selector de sucursal */}
        {sucursales.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setAbierto(v => !v)}
              className="flex items-center gap-2 h-10 px-3 lg:px-4 rounded-2xl bg-slate-100/70 hover:bg-slate-100 transition-colors text-sm"
            >
              <Store className="w-4 h-4 text-slate-500" />
              <span className="font-medium text-slate-700 hidden sm:block max-w-[140px] truncate">
                {sucursalActiva?.nombre || 'Sin sucursal'}
              </span>
              <ChevronDown className={cn(
                'w-4 h-4 text-slate-400 transition-transform',
                abierto && 'rotate-180'
              )} />
            </button>

            {abierto && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAbierto(false)}
                />
                <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5">
                  <p className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Cambiar sucursal
                  </p>
                  {sucursales.map(s => (
                    <button
                      key={s.id}
                      onClick={() => {
                        cambiarSucursal(s)
                        setAbierto(false)
                      }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                        s.id === sucursalActiva?.id
                          ? 'bg-primary-50 text-primary-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      {s.nombre}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}