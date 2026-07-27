import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Building2, LogOut, Shield, CreditCard,
  LayoutDashboard, Receipt, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/context/AuthProvider'
import { useApp } from '@/context/AppCtx'
import { useDevice } from '@/hooks/useDevice'
import { cn } from '@/lib/clases'
import { supabase } from '@/lib/supabase'

function useUrgentes() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    supabase.rpc('datos_cobranza_super')
      .then(({ data }) => {
        if (!data) return
        const hoy = new Date(); const d = hoy.getDate()
        setCount(data.filter(e => {
          if (e.dia_pago == null) return false
          if (e.ultimo_pago) {
            const up = new Date(e.ultimo_pago + 'T12:00:00')
            if (up.getFullYear() === hoy.getFullYear() && up.getMonth() === hoy.getMonth()) return false
          }
          return d >= e.dia_pago
        }).length)
      })
  }, [])
  return count
}

const MENU = [
  { ruta: '/super/dashboard', nombre: 'Dashboard', icono: LayoutDashboard },
  { ruta: '/super/empresas',  nombre: 'Empresas',  icono: Building2       },
  { ruta: '/super/cobranza',  nombre: 'Cobranza',  icono: CreditCard      },
  { ruta: '/super/gastos',    nombre: 'Gastos',    icono: Receipt         },
]

function SuperSidebar({ abierto, onToggle }) {
  const { cerrarSesion } = useAuth()
  const { perfil } = useApp()
  const navigate = useNavigate()
  const urgentes = useUrgentes()

  const salir = async () => {
    await cerrarSesion()
    navigate('/login', { replace: true })
  }

  return (
    <aside className={cn(
      'flex flex-col fixed inset-y-0 left-0 z-40 transition-[width] duration-300 ease-in-out',
      abierto ? 'w-64' : 'w-[60px]'
    )}>
      <div className="flex flex-col flex-1 bg-white/80 backdrop-blur-xl border border-slate-100 m-3 rounded-3xl shadow-lg shadow-slate-200/40 overflow-hidden">

        {/* Header */}
        {abierto ? (
          <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0">
            <div className="w-9 h-9 rounded-2xl bg-slate-900 flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate leading-tight">Panel Super Admin</p>
              <p className="text-xs text-slate-500 truncate">Farmadesk</p>
            </div>
            <button onClick={onToggle} title="Colapsar"
              className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-3 pb-1 gap-1 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-slate-900 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" strokeWidth={2.2} />
            </div>
            <button onClick={onToggle} title="Expandir"
              className="p-1 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Nav */}
        {abierto ? (
          <nav className="flex-1 min-h-0 px-3 pb-3 overflow-y-auto space-y-0.5">
            {MENU.map(item => {
              const Icono = item.icono
              const badge = item.ruta === '/super/cobranza' && urgentes > 0 ? urgentes : 0
              return (
                <NavLink key={item.ruta} to={item.ruta}
                  className={({ isActive }) => cn(
                    'relative flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}>
                  <Icono className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
                  <span className="truncate">{item.nombre}</span>
                  {badge > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                      {badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>
        ) : (
          <nav className="flex-1 min-h-0 overflow-y-auto py-2 flex flex-col items-center gap-1 px-1">
            {MENU.map(item => {
              const Icono = item.icono
              const badge = item.ruta === '/super/cobranza' && urgentes > 0 ? urgentes : 0
              return (
                <NavLink key={item.ruta} to={item.ruta}
                  title={item.nombre}
                  className={({ isActive }) => cn(
                    'relative flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-200',
                    isActive
                      ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  )}>
                  <Icono className="w-4 h-4" strokeWidth={2} />
                  {badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {badge}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>
        )}

        {/* Perfil */}
        <div className="p-3 border-t border-slate-200/60 flex-shrink-0">
          {abierto ? (
            <div className="flex items-center gap-3 px-2 py-2 rounded-2xl">
              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-white">
                  {perfil?.nombre?.charAt(0)?.toUpperCase() || 'S'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{perfil?.nombre || 'Super Admin'}</p>
                <p className="text-xs text-slate-500 truncate">Super Admin</p>
              </div>
              <button onClick={salir} title="Cerrar sesión"
                className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center" title={perfil?.nombre}>
                <span className="text-sm font-semibold text-white">
                  {perfil?.nombre?.charAt(0)?.toUpperCase() || 'S'}
                </span>
              </div>
              <button onClick={salir} title="Cerrar sesión"
                className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

      </div>
    </aside>
  )
}

// Mobile: bottom nav bar
function MobileNav() {
  const { cerrarSesion } = useAuth()
  const navigate = useNavigate()
  const urgentes = useUrgentes()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
      <div className="bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-lg px-2 py-2 flex items-center justify-around">
        {MENU.map(item => {
          const Icono = item.icono
          const badge = item.ruta === '/super/cobranza' && urgentes > 0 ? urgentes : 0
          return (
            <NavLink key={item.ruta} to={item.ruta}
              className={({ isActive }) => cn(
                'relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all',
                isActive ? 'text-primary-600' : 'text-slate-500'
              )}>
              <Icono className="w-5 h-5" strokeWidth={2} />
              <span className="text-[9px] font-semibold">{item.nombre}</span>
              {badge > 0 && (
                <span className="absolute top-0 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {badge}
                </span>
              )}
            </NavLink>
          )
        })}
        <button
          onClick={async () => { await cerrarSesion(); navigate('/login', { replace: true }) }}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-2xl text-slate-500 transition-all">
          <LogOut className="w-5 h-5" strokeWidth={2} />
          <span className="text-[9px] font-semibold">Salir</span>
        </button>
      </div>
    </nav>
  )
}

export default function SuperLayout({ children }) {
  const { isMobile } = useDevice()
  const [abierto, setAbierto] = useState(() => {
    const saved = localStorage.getItem('super_sidebar')
    return saved === null ? true : saved === 'true'
  })

  const toggle = () => {
    setAbierto(v => {
      localStorage.setItem('super_sidebar', String(!v))
      return !v
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {!isMobile && <SuperSidebar abierto={abierto} onToggle={toggle} />}
      {isMobile  && <MobileNav />}

      <div
        className="transition-[padding] duration-300 ease-in-out"
        style={{
          paddingLeft:   isMobile ? 0 : (abierto ? '272px' : '76px'),
          paddingBottom: isMobile ? '72px' : 0,
        }}
      >
        <main className={isMobile ? 'px-3 pt-4 pb-4' : 'px-6 pt-6 pb-8'}>
          {children}
        </main>
      </div>
    </div>
  )
}
