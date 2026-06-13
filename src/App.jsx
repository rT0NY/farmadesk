import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Store, Check } from 'lucide-react'
import { useAuth } from '@/context/AuthProvider'
import { useApp } from '@/context/AppCtx'
import LoginPage from '@/features/auth/LoginPage'
import AppLayout from '@/components/layout/AppLayout'
import EmpresasPage from '@/features/super/EmpresasPage'
import DetalleEmpresaPage from '@/features/super/DetalleEmpresaPage'
import CobranzaPage from '@/features/super/CobranzaPage'
import DashboardSuperPage from '@/features/super/DashboardSuperPage'
import GastosSuperPage from '@/features/super/GastosPage'
import DashboardAdmin from '@/features/dashboard/DashboardAdmin'
import DashboardCajero from '@/features/dashboard/DashboardCajero'
import SuperLayout from '@/features/super/SuperLayout'
import ProductosPage from '@/features/productos/ProductosPage'
import InventarioPage from '@/features/inventario/InventarioPage'
import HistorialInventarioPage from '@/features/inventario/HistorialInventarioPage'
import CaducidadesPage from '@/features/caducidades/CaducidadesPage'
import CajaPage from '@/features/caja/CajaPage'
import VentasPage from '@/features/ventas/VentasPage'
import OfertasPage from '@/features/ofertas/OfertasPage'
import GastosPage from '@/features/gastos/GastosPage'
import CancelacionesPage from '@/features/cancelaciones/CancelacionesPage'
import CuentasPage from '@/features/cuentas/CuentasPage'
import TransferenciasPage from '@/features/transferencias/TransferenciasPage'
import EmpleadosPage from '@/features/empleados/EmpleadosPage'
import ProveedoresPage from '@/features/proveedores/ProveedoresPage'
import PedidosPage from '@/features/pedidos/PedidosPage'
import ProgramacionPage from '@/features/programacion/ProgramacionPage'
import SalariosPage from '@/features/salarios/SalariosPage'
import SucursalesPage from '@/features/sucursales/SucursalesPage'
import BitacoraPage from '@/features/bitacora/BitacoraPage'
import ReportesPage from '@/features/reportes/ReportesPage'
import AjustesPage from '@/features/ajustes/AjustesPage'

function PantallaCarga() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-white/40 border-t-white rounded-full animate-spin" />
        <p className="text-sm text-white/80">Cargando...</p>
      </div>
    </div>
  )
}

function SelectorSucursalGlobal() {
  const { sucursales, confirmarSucursal } = useApp()
  const [sucursalTemp, setSucursalTemp] = useState(null)

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">¿En qué farmacia trabajas hoy?</h1>
          <p className="text-sm text-slate-500 mt-1">Selecciona la sucursal donde abrirás tu turno</p>
        </div>
        <div className="flex flex-col gap-3">
          {sucursales.map(s => {
            const sel = s.id === sucursalTemp
            return (
              <button key={s.id} onClick={() => setSucursalTemp(s.id)}
                className={`flex items-center gap-4 p-4 rounded-3xl border-2 transition-all text-left ${sel ? 'bg-primary-50 border-primary-500 shadow-sm' : 'bg-white border-slate-200 hover:border-primary-300'}`}>
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${sel ? 'bg-primary-100' : 'bg-slate-100'}`}>
                  <Store className={`w-5 h-5 ${sel ? 'text-primary-600' : 'text-slate-400'}`} />
                </div>
                <p className={`flex-1 text-base font-bold ${sel ? 'text-primary-800' : 'text-slate-800'}`}>{s.nombre}</p>
                {sel && <Check className="w-5 h-5 text-primary-600 flex-shrink-0" strokeWidth={3} />}
              </button>
            )
          })}
        </div>
        <button
          disabled={!sucursalTemp}
          onClick={() => {
            const suc = sucursales.find(s => s.id === sucursalTemp)
            if (suc) confirmarSucursal(suc)
          }}
          className="w-full py-3 rounded-2xl bg-primary-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors">
          {sucursalTemp ? `Confirmar — ${sucursales.find(s => s.id === sucursalTemp)?.nombre}` : 'Selecciona una sucursal'}
        </button>
      </div>
    </div>
  )
}

function RutaNormal({ children, roles }) {
  const { autenticado, cargando: cargandoAuth } = useAuth()
  const { cargando: cargandoApp, esSuperAdmin, perfil, esRotativo, sucursalConfirmada } = useApp()

  if (cargandoAuth || cargandoApp) return <PantallaCarga />
  if (!autenticado) return <Navigate to="/login" replace />
  if (esSuperAdmin) return <Navigate to="/super" replace />
  if (roles && perfil && !roles.includes(perfil.rol)) {
    return <Navigate to="/" replace />
  }
  if (esRotativo && !sucursalConfirmada) return <SelectorSucursalGlobal />
  return <AppLayout>{children}</AppLayout>
}

function RutaSuper({ children }) {
  const { autenticado, cargando: cargandoAuth } = useAuth()
  const { cargando: cargandoApp, esSuperAdmin } = useApp()

  if (cargandoAuth || cargandoApp) return <PantallaCarga />
  if (!autenticado) return <Navigate to="/login" replace />
  if (!esSuperAdmin) return <Navigate to="/" replace />
  return <SuperLayout>{children}</SuperLayout>
}

function DashboardRol() {
  const { perfil } = useApp()
  if (perfil?.rol === 'cajero') return <DashboardCajero />
  return <DashboardAdmin />
}

function Placeholder({ titulo }) {
  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl p-8 shadow-sm text-center">
      <h2 className="text-xl font-semibold text-slate-900">{titulo}</h2>
      <p className="text-sm text-slate-500 mt-2">Esta página aún no está construida.</p>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Super admin */}
      <Route path="/super" element={<RutaSuper><DashboardSuperPage /></RutaSuper>} />
      <Route path="/super/dashboard" element={<RutaSuper><DashboardSuperPage /></RutaSuper>} />
      <Route path="/super/empresas" element={<RutaSuper><EmpresasPage /></RutaSuper>} />
      <Route path="/super/empresas/:id" element={<RutaSuper><DetalleEmpresaPage /></RutaSuper>} />
      <Route path="/super/cobranza" element={<RutaSuper><CobranzaPage /></RutaSuper>} />
      <Route path="/super/gastos" element={<RutaSuper><GastosSuperPage /></RutaSuper>} />

      {/* App normal */}
      <Route path="/" element={<RutaNormal><DashboardRol /></RutaNormal>} />

      {/* Principal */}
      <Route path="/ventas" element={<RutaNormal><VentasPage /></RutaNormal>} />
      <Route path="/caja" element={<RutaNormal><CajaPage /></RutaNormal>} />

      {/* Catálogo */}
      <Route path="/productos" element={<RutaNormal roles={['admin','encargado']}><ProductosPage /></RutaNormal>} />
      <Route path="/inventario" element={<RutaNormal roles={['admin','encargado','cajero']}><InventarioPage /></RutaNormal>} />
      <Route path="/historial-inventario" element={<RutaNormal roles={['admin','encargado']}><HistorialInventarioPage /></RutaNormal>} />
      <Route path="/caducidades" element={<RutaNormal roles={['admin','encargado','cajero']}><CaducidadesPage /></RutaNormal>} />
      <Route path="/ofertas" element={<RutaNormal roles={['admin','encargado']}><OfertasPage /></RutaNormal>} />
<Route path="/transferencias" element={<RutaNormal roles={['admin','encargado']}><TransferenciasPage /></RutaNormal>} />

      {/* Finanzas */}
      <Route path="/gastos" element={<RutaNormal roles={['admin','encargado']}><GastosPage /></RutaNormal>} />
      <Route path="/cuentas" element={<RutaNormal roles={['admin','encargado','cajero']}><CuentasPage /></RutaNormal>} />
      <Route path="/cancelaciones" element={<RutaNormal roles={['admin','encargado']}><CancelacionesPage /></RutaNormal>} />

      {/* Equipo */}
      <Route path="/empleados" element={<RutaNormal roles={['admin']}><EmpleadosPage /></RutaNormal>} />
      <Route path="/horarios" element={<RutaNormal roles={['admin','encargado']}><ProgramacionPage /></RutaNormal>} />
      <Route path="/salarios" element={<RutaNormal roles={['admin']}><SalariosPage /></RutaNormal>} />
      <Route path="/proveedores" element={<RutaNormal roles={['admin','encargado']}><ProveedoresPage /></RutaNormal>} />
      <Route path="/pedidos" element={<RutaNormal roles={['admin','encargado','cajero']}><PedidosPage /></RutaNormal>} />

      {/* Administración */}
      <Route path="/sucursales" element={<RutaNormal roles={['admin']}><SucursalesPage /></RutaNormal>} />
      <Route path="/reportes" element={<RutaNormal roles={['admin','encargado']}><ReportesPage /></RutaNormal>} />
      <Route path="/bitacora" element={<RutaNormal roles={['admin']}><BitacoraPage /></RutaNormal>} />
      <Route path="/ajustes" element={<RutaNormal roles={['admin']}><AjustesPage /></RutaNormal>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}