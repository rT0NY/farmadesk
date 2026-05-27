import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, Archive, Wallet, Tag,
  Receipt, ArrowLeftRight, Users, Store, Building2,
  BarChart3, Settings, LogOut, CreditCard, ClipboardList,
  History, Clock, Ban, ChevronLeft, ChevronRight, Bell, ListOrdered, CalendarX,
} from 'lucide-react'
import { cn } from '@/lib/clases'
import { useApp } from '@/context/AppCtx'
import { useAuth } from '@/context/AuthProvider'
import Logo from '@/components/ui/Logo'
import IndicadorConexion, { PuntoConexion } from '@/components/ui/IndicadorConexion'
import { ETIQUETAS_ROL } from '@/lib/constantes'
import { useAlertaConteo, NotificacionesDrawer } from '@/components/ui/NotificacionesPanel'

const SECCIONES = [
  {
    titulo: 'Principal',
    items: [
      { ruta: '/', nombre: 'Dashboard', icono: LayoutDashboard, roles: ['admin', 'encargado', 'cajero'] },
      { ruta: '/ventas', nombre: 'Ventas', icono: ShoppingCart, roles: ['admin', 'encargado', 'cajero'] },
      { ruta: '/caja', nombre: 'Caja', icono: Wallet, roles: ['admin', 'encargado', 'cajero'] },
    ],
  },
  {
    titulo: 'Catálogo',
    items: [
      { ruta: '/productos', nombre: 'Productos', icono: Package, roles: ['admin', 'encargado'] },
      { ruta: '/inventario', nombre: 'Inventario', icono: Archive, roles: ['admin', 'encargado', 'cajero'] },
      { ruta: '/ofertas', nombre: 'Ofertas', icono: Tag, roles: ['admin', 'encargado'] },
      { ruta: '/transferencias',       nombre: 'Transferencias',        icono: ArrowLeftRight, roles: ['admin', 'encargado'] },
      { ruta: '/historial-inventario', nombre: 'Historial inventario',  icono: ListOrdered,    roles: ['admin', 'encargado'] },
      { ruta: '/caducidades',          nombre: 'Caducidades',           icono: CalendarX,      roles: ['admin', 'encargado', 'cajero'] },
    ],
  },
  {
    titulo: 'Finanzas',
    items: [
      { ruta: '/gastos', nombre: 'Gastos', icono: Receipt, roles: ['admin', 'encargado'] },
      { ruta: '/cuentas', nombre: 'Cuentas pendientes', icono: CreditCard, roles: ['admin', 'encargado'] },
      { ruta: '/cancelaciones', nombre: 'Cancelaciones', icono: Ban, roles: ['admin', 'encargado'] },
    ],
  },
  {
    titulo: 'Equipo',
    items: [
      { ruta: '/empleados', nombre: 'Empleados', icono: Users, roles: ['admin'] },
      { ruta: '/horarios', nombre: 'Horarios', icono: Clock, roles: ['admin', 'encargado'] },
      { ruta: '/salarios', nombre: 'Salarios', icono: ClipboardList, roles: ['admin'] },
      { ruta: '/proveedores', nombre: 'Proveedores', icono: Store, roles: ['admin', 'encargado'] },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      { ruta: '/sucursales', nombre: 'Sucursales', icono: Building2, roles: ['admin'] },
      { ruta: '/reportes', nombre: 'Reportes', icono: BarChart3, roles: ['admin', 'encargado'] },
      { ruta: '/bitacora', nombre: 'Bitácora', icono: History, roles: ['admin'] },
      { ruta: '/ajustes', nombre: 'Ajustes', icono: Settings, roles: ['admin'] },
    ],
  },
]

function ItemMenu({ item }) {
  const Icono = item.icono
  return (
    <NavLink
      to={item.ruta}
      end={item.ruta === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )
      }
    >
      <Icono className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
      <span className="truncate">{item.nombre}</span>
    </NavLink>
  )
}

function ItemIcono({ item }) {
  const Icono = item.icono
  return (
    <NavLink
      to={item.ruta}
      end={item.ruta === '/'}
      title={item.nombre}
      className={({ isActive }) =>
        cn(
          'flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-200',
          isActive
            ? 'bg-primary-600 text-white shadow-md shadow-primary-500/25'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        )
      }
    >
      <Icono className="w-4 h-4" strokeWidth={2} />
    </NavLink>
  )
}

function Reloj(tz = 'America/Mexico_City') {
  const [hora, setHora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(hora)
  const get = (tipo) => partes.find(p => p.type === tipo)?.value ?? '00'
  return { hh: get('hour'), mm: get('minute'), ss: get('second') }
}

export default function Sidebar({ abierto, onToggle }) {
  const { perfil, empresa } = useApp()
  const { cerrarSesion } = useAuth()
  const rol = perfil?.rol
  const { hh, mm, ss } = Reloj(empresa?.zona_horaria || 'America/Mexico_City')
  const alertaTotal = useAlertaConteo()
  const [notifAbierto, setNotifAbierto] = useState(false)

  const seccionesFiltradas = SECCIONES
    .map(sec => ({ ...sec, items: sec.items.filter(i => i.roles.includes(rol)) }))
    .filter(sec => sec.items.length > 0)

  return (
    <>
    <aside className={cn(
      'flex flex-col fixed inset-y-0 left-0 z-40 transition-[width] duration-300 ease-in-out',
      abierto ? 'w-64' : 'w-[60px]'
    )}>
      <div className="flex flex-col flex-1 bg-white/80 backdrop-blur-xl border border-slate-200/60 m-3 rounded-3xl shadow-lg shadow-slate-200/40 overflow-hidden">

        {/* Header expandido */}
        {abierto ? (
          <div className="flex items-center gap-3 px-4 py-4 flex-shrink-0">
            <Logo className="w-10 h-10 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900 truncate leading-tight">Farmadesk</p>
              <p className="text-xs text-slate-500 truncate">{empresa?.nombre || '—'}</p>
            </div>
            <button onClick={onToggle} title="Colapsar"
              className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors flex-shrink-0">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-3 pb-1 gap-1 flex-shrink-0">
            <Logo className="w-8 h-8" />
            <button onClick={onToggle} title="Expandir"
              className="p-1 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Nav */}
        {abierto ? (
          <nav className="flex-1 min-h-0 px-3 pb-3 overflow-y-auto space-y-5">
            {seccionesFiltradas.map(sec => (
              <div key={sec.titulo}>
                <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {sec.titulo}
                </p>
                <div className="space-y-0.5">
                  {sec.items.map(item => <ItemMenu key={item.ruta} item={item} />)}
                </div>
              </div>
            ))}
          </nav>
        ) : (
          <nav className="flex-1 min-h-0 overflow-y-auto py-2 flex flex-col items-center gap-1 px-1">
            {seccionesFiltradas.map(sec => (
              <div key={sec.titulo} className="flex flex-col items-center gap-0.5 w-full">
                <div className="h-px bg-slate-100 w-full my-1" />
                {sec.items.map(item => <ItemIcono key={item.ruta} item={item} />)}
              </div>
            ))}
          </nav>
        )}

        {/* Reloj + Perfil */}
        <div className="p-3 border-t border-slate-200/60 flex-shrink-0 flex flex-col gap-2">

          {/* Reloj + Campana */}
          {abierto ? (
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold text-slate-800 tabular-nums tracking-tight">{hh}</span>
                <span className="text-lg font-bold text-slate-400 leading-none mb-0.5">:</span>
                <span className="text-xl font-bold text-slate-800 tabular-nums tracking-tight">{mm}</span>
                <span className="text-lg font-bold text-slate-400 leading-none mb-0.5">:</span>
                <span className="text-xl font-bold text-primary-500 tabular-nums tracking-tight">{ss}</span>
              </div>
              <button onClick={() => setNotifAbierto(true)} title="Notificaciones"
                className="relative p-2 rounded-2xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0">
                <Bell className="w-4 h-4" strokeWidth={2.5} />
                {alertaTotal > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {alertaTotal > 99 ? '99+' : alertaTotal}
                  </span>
                )}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-bold text-slate-800 tabular-nums tracking-tight leading-none">{hh}:{mm}</span>
                <span className="text-[10px] font-bold text-primary-500 tabular-nums leading-none">{ss}</span>
              </div>
              <button onClick={() => setNotifAbierto(true)} title="Notificaciones"
                className="relative p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                <Bell className="w-4 h-4" strokeWidth={2.5} />
                {alertaTotal > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {alertaTotal > 99 ? '99+' : alertaTotal}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Indicador conexión */}
          {abierto
            ? <IndicadorConexion />
            : <div className="flex justify-center"><PuntoConexion /></div>
          }

          {/* Perfil */}
          {abierto ? (
            <div className="flex items-center gap-3 px-3 py-2 rounded-2xl">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary-700">
                  {perfil?.nombre?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{perfil?.nombre || 'Usuario'}</p>
                <p className="text-xs text-slate-500 truncate">{ETIQUETAS_ROL[rol] || '—'}</p>
              </div>
              <button onClick={cerrarSesion} title="Cerrar sesión"
                className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center" title={perfil?.nombre}>
                <span className="text-sm font-semibold text-primary-700">
                  {perfil?.nombre?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>
              <button onClick={cerrarSesion} title="Cerrar sesión"
                className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
    <NotificacionesDrawer abierto={notifAbierto} onClose={() => setNotifAbierto(false)} />
    </>
  )
}
