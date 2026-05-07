import { NavLink, useNavigate } from 'react-router-dom'
import { Building2, LogOut, Shield, CreditCard } from 'lucide-react'
import { useAuth } from '@/context/AuthProvider'
import { useApp } from '@/context/AppCtx'
import { cn } from '@/lib/clases'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

function useUrgentes() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    supabase.from('empresas')
      .select('dia_pago, ultimo_pago')
      .neq('estado', 'eliminada')
      .not('dia_pago', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const hoy = new Date(); const d = hoy.getDate()
        const n = data.filter(e => {
          if (e.ultimo_pago) {
            const up = new Date(e.ultimo_pago + 'T12:00:00')
            if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth()) return false
          }
          return d >= e.dia_pago
        }).length
        setCount(n)
      })
  }, [])
  return count
}

const MENU = [
  { ruta: '/super/empresas', nombre: 'Empresas', icono: Building2 },
  { ruta: '/super/cobranza', nombre: 'Cobranza',  icono: CreditCard },
]

export default function SuperLayout({ children }) {
  const { cerrarSesion } = useAuth()
  const { perfil } = useApp()
  const navigate = useNavigate()
  const urgentes = useUrgentes()

  const salir = async () => {
    await cerrarSesion()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      {/* Topbar super admin */}
      <header className="sticky top-0 z-30 px-3 pt-3 lg:px-6 lg:pt-6">
        <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm px-4 lg:px-6 h-14 lg:h-16 flex items-center gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-slate-900 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 text-sm lg:text-base leading-tight">
                Panel Super Admin
              </p>
              <p className="text-xs text-slate-500 leading-tight truncate">
                {perfil?.nombre} · Farmadesk
              </p>
            </div>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            {MENU.map(item => {
              const Icono = item.icono
              const badge = item.ruta === '/super/cobranza' && urgentes > 0 ? urgentes : 0
              return (
                <NavLink
                  key={item.ruta}
                  to={item.ruta}
                  className={({ isActive }) =>
                    cn(
                      'relative flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-medium transition-all',
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    )
                  }
                >
                  <Icono className="w-4 h-4" />
                  {item.nombre}
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>

          <button
            onClick={salir}
            className="flex items-center gap-2 px-3 py-2 rounded-2xl text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main className="px-3 pb-8 pt-4 lg:px-6 lg:pt-6">
        {children}
      </main>
    </div>
  )
}