import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, Wallet, Menu, X, LogOut,
  Archive, Tag, ArrowLeftRight, Receipt, CreditCard, Ban,
  Users, Clock, ClipboardList, Store, Building2, BarChart3, History, Settings, Bell, ListOrdered, CalendarX,
} from 'lucide-react'
import { cn } from '@/lib/clases'
import { useApp } from '@/context/AppCtx'
import { useAuth } from '@/context/AuthProvider'
import { ETIQUETAS_ROL } from '@/lib/constantes'
import { useAlertaConteo, NotificacionesDrawer, useBadgesMenu } from '@/components/ui/NotificacionesPanel'

// Ítems fijos del bottom nav según rol
const BOTTOM_ADMIN = [
  { ruta: '/',       nombre: 'Dashboard', icono: LayoutDashboard },
  { ruta: '/ventas', nombre: 'Ventas',    icono: ShoppingCart    },
  { ruta: '/caja',   nombre: 'Caja',      icono: Wallet          },
]
const BOTTOM_CAJERO = [
  { ruta: '/',       nombre: 'Dashboard', icono: LayoutDashboard },
  { ruta: '/ventas', nombre: 'Ventas',    icono: ShoppingCart    },
  { ruta: '/caja',   nombre: 'Caja',      icono: Wallet          },
]

const MAS_SECCIONES = [
  {
    titulo: 'Catálogo',
    items: [
      { ruta: '/productos',      nombre: 'Productos',      icono: Package,       roles: ['admin', 'encargado'] },
      { ruta: '/inventario',     nombre: 'Inventario',     icono: Archive,       roles: ['admin', 'encargado'] },
      { ruta: '/pedidos',        nombre: 'Pedidos',        icono: ClipboardList, roles: ['admin', 'encargado', 'cajero'] },
      { ruta: '/ofertas',        nombre: 'Ofertas',        icono: Tag,           roles: ['admin', 'encargado'] },
      { ruta: '/transferencias',       nombre: 'Transferencias',       icono: ArrowLeftRight, roles: ['admin', 'encargado'] },
      { ruta: '/historial-inventario', nombre: 'Historial inventario', icono: ListOrdered,    roles: ['admin', 'encargado'] },
      { ruta: '/caducidades',          nombre: 'Caducidades',          icono: CalendarX,      roles: ['admin', 'encargado'] },
    ],
  },
  {
    titulo: 'Finanzas',
    items: [
      { ruta: '/gastos',        nombre: 'Gastos',             icono: Receipt,    roles: ['admin', 'encargado'] },
      { ruta: '/cuentas',       nombre: 'Cuentas pendientes', icono: CreditCard, roles: ['admin', 'encargado'], badge: 'cuentas' },
      { ruta: '/cancelaciones', nombre: 'Cancelaciones',      icono: Ban,        roles: ['admin', 'encargado'], badge: 'cancelaciones' },
    ],
  },
  {
    titulo: 'Equipo',
    items: [
      { ruta: '/empleados', nombre: 'Empleados',  icono: Users,        roles: ['admin'] },
      { ruta: '/horarios',  nombre: 'Horarios',   icono: Clock,        roles: ['admin', 'encargado'] },
      { ruta: '/salarios',  nombre: 'Salarios',   icono: ClipboardList, roles: ['admin'] },
      { ruta: '/proveedores', nombre: 'Proveedores', icono: Store,     roles: ['admin', 'encargado'] },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: '/reportes',   nombre: 'Reportes',   icono: BarChart3,  roles: ['admin', 'encargado'] },
      { ruta: '/sucursales', nombre: 'Sucursales', icono: Building2,  roles: ['admin'] },
      { ruta: '/bitacora',   nombre: 'Bitácora',   icono: History,    roles: ['admin'] },
      { ruta: '/ajustes',    nombre: 'Ajustes',    icono: Settings,   roles: ['admin'] },
    ],
  },
]

export default function MobileNav() {
  const [abierto,      setAbierto]      = useState(false)
  const [notifAbierto, setNotifAbierto] = useState(false)
  const { perfil } = useApp()
  const { cerrarSesion } = useAuth()
  const rol         = perfil?.rol
  const alertaTotal = useAlertaConteo()
  const badges      = useBadgesMenu()

  const esCajero    = rol === 'cajero'
  const bottomItems = esCajero ? BOTTOM_CAJERO : BOTTOM_ADMIN

  const seccionesMas = MAS_SECCIONES
    .map(s => ({ ...s, items: s.items.filter(i => i.roles.includes(rol)) }))
    .filter(s => s.items.length > 0)

  return (
    <>
      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none">
        <div className="bg-white/90 backdrop-blur-2xl border border-slate-200/70 rounded-3xl shadow-xl shadow-slate-900/5 pointer-events-auto">
          <div className={cn('grid h-16', esCajero ? 'grid-cols-4' : 'grid-cols-5')}>

            {bottomItems.map(item => {
              const Icono = item.icono
              return (
                <NavLink
                  key={item.ruta}
                  to={item.ruta}
                  end={item.ruta === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center justify-center gap-0.5 transition-colors',
                      isActive ? 'text-primary-600' : 'text-slate-500'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className={cn(
                        'flex items-center justify-center w-9 h-8 rounded-full transition-all duration-200',
                        isActive && 'bg-gradient-to-b from-primary-600 to-primary-700 text-white shadow-md shadow-primary-500/30'
                      )}>
                        <Icono className="w-5 h-5" strokeWidth={2.2} />
                      </div>
                      <span className={cn('text-[10px] leading-none', isActive ? 'font-semibold' : 'font-medium')}>{item.nombre}</span>
                    </>
                  )}
                </NavLink>
              )
            })}

            {/* Campana */}
            <button
              onClick={() => setNotifAbierto(true)}
              className="relative flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <div className="relative flex items-center justify-center w-8 h-8 rounded-2xl">
                <Bell className="w-5 h-5" strokeWidth={2.2} />
                {alertaTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {alertaTotal > 99 ? '99+' : alertaTotal}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-none">Alertas</span>
            </button>

            {/* Botón "Más" — solo para admin/encargado */}
            {!esCajero && (
              <button
                onClick={() => setAbierto(true)}
                className="flex flex-col items-center justify-center gap-0.5 text-slate-500 hover:text-slate-700 transition-colors"
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-2xl">
                  <Menu className="w-5 h-5" strokeWidth={2.2} />
                </div>
                <span className="text-[10px] font-medium leading-none">Más</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Drawer "Más" */}
      {abierto && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
            onClick={() => setAbierto(false)}
          />
          <div className="relative w-full bg-white rounded-t-3xl pb-[max(2rem,env(safe-area-inset-bottom))] max-h-[88dvh] overflow-hidden flex flex-col animate-sheet-up">

            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-slate-200" />
            </div>

            {/* Header + perfil */}
            <div className="px-5 pt-2 pb-4">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-primary-700">
                    {perfil?.nombre?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{perfil?.nombre || 'Usuario'}</p>
                  <p className="text-xs text-slate-500">{ETIQUETAS_ROL[rol] || '—'}</p>
                </div>
                <button
                  onClick={() => setAbierto(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Secciones con scroll */}
            <div className="flex-1 overflow-y-auto px-5 space-y-4">
              {seccionesMas.map(sec => (
                <div key={sec.titulo}>
                  <p className="px-1 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    {sec.titulo}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {sec.items.map(item => {
                      const Icono = item.icono
                      const badgeCount = item.badge ? (badges[item.badge] ?? 0) : 0
                      return (
                        <NavLink
                          key={item.ruta}
                          to={item.ruta}
                          onClick={() => setAbierto(false)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-colors border',
                              isActive
                                ? 'bg-primary-50 text-primary-700 border-primary-200'
                                : 'text-slate-700 bg-slate-50 border-slate-100 hover:bg-slate-100'
                            )
                          }
                        >
                          <div className="relative flex-shrink-0">
                            <Icono className="w-4 h-4" />
                            {badgeCount > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 min-w-[13px] h-[13px] bg-red-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                                {badgeCount > 9 ? '9+' : badgeCount}
                              </span>
                            )}
                          </div>
                          <span className="truncate flex-1">{item.nombre}</span>
                          {badgeCount > 0 && (
                            <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </NavLink>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Cerrar sesión */}
            <div className="px-5 mt-4">
              <button
                onClick={() => { setAbierto(false); cerrarSesion() }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border border-red-100"
              >
                <LogOut className="w-4 h-4" />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      <NotificacionesDrawer abierto={notifAbierto} onClose={() => setNotifAbierto(false)} />
    </>
  )
}
