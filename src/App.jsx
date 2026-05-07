import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthProvider'
import { useApp } from '@/context/AppCtx'
import LoginPage from '@/features/auth/LoginPage'
import AppLayout from '@/components/layout/AppLayout'
import EmpresasPage from '@/features/super/EmpresasPage'
import DetalleEmpresaPage from '@/features/super/DetalleEmpresaPage'
import CobranzaPage from '@/features/super/CobranzaPage'
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

function RutaNormal({ children, roles }) {
  const { autenticado, cargando: cargandoAuth } = useAuth()
  const { cargando: cargandoApp, esSuperAdmin, perfil } = useApp()

  if (cargandoAuth || cargandoApp) return <PantallaCarga />
  if (!autenticado) return <Navigate to="/login" replace />
  if (esSuperAdmin) return <Navigate to="/super" replace />
  if (roles && perfil && !roles.includes(perfil.rol)) {
    return <Navigate to="/" replace />
  }
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
      <Route path="/super" element={<RutaSuper><EmpresasPage /></RutaSuper>} />
      <Route path="/super/empresas" element={<RutaSuper><EmpresasPage /></RutaSuper>} />
      <Route path="/super/empresas/:id" element={<RutaSuper><DetalleEmpresaPage /></RutaSuper>} />
      <Route path="/super/cobranza" element={<RutaSuper><CobranzaPage /></RutaSuper>} />

      {/* App normal */}
      <Route path="/" element={<RutaNormal><DashboardRol /></RutaNormal>} />

      {/* Principal */}
      <Route path="/ventas" element={<RutaNormal><VentasPage /></RutaNormal>} />
      <Route path="/caja" element={<RutaNormal><CajaPage /></RutaNormal>} />

      {/* Catálogo */}
      <Route path="/productos" element={<RutaNormal roles={['admin','encargado']}><ProductosPage /></RutaNormal>} />
      <Route path="/inventario" element={<RutaNormal roles={['admin','encargado','cajero']}><InventarioPage /></RutaNormal>} />
      <Route path="/historial-inventario" element={<RutaNormal roles={['admin','encargado']}><HistorialInventarioPage /></RutaNormal>} />
      <Route path="/caducidades" element={<RutaNormal roles={['admin','encargado']}><CaducidadesPage /></RutaNormal>} />
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

      {/* Administración */}
      <Route path="/sucursales" element={<RutaNormal roles={['admin']}><SucursalesPage /></RutaNormal>} />
      <Route path="/reportes" element={<RutaNormal roles={['admin','encargado']}><ReportesPage /></RutaNormal>} />
      <Route path="/bitacora" element={<RutaNormal roles={['admin']}><BitacoraPage /></RutaNormal>} />
      <Route path="/ajustes" element={<RutaNormal roles={['admin']}><AjustesPage /></RutaNormal>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}