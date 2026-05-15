import { useState, useCallback } from 'react'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import { useDevice } from '@/hooks/useDevice'
import { useRealtimeAlertas } from '@/components/ui/NotificacionesPanel'
import BuscadorGlobal, { useBuscadorGlobal } from '@/components/ui/BuscadorGlobal'
import { useActualizacion } from '@/hooks/useActualizacion'
import { useElectronUpdater } from '@/hooks/useElectronUpdater'
import { useConexion } from '@/hooks/useConexion'
import { RefreshCw, Download, X, Check, WifiOff } from 'lucide-react'

function RealtimeWatcher() {
  useRealtimeAlertas(useCallback(() => {}, []))
  return null
}

// Banner de sin conexión — aparece en toda la app cuando se pierde el internet
function BannerSinConexion({ online }) {
  if (online) return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[300] flex items-center justify-center gap-2.5 bg-red-600 text-white px-4 py-2.5 text-sm font-semibold shadow-lg">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      Sin conexión a internet — los cambios no se guardarán hasta reconectarte
    </div>
  )
}

// Banner para actualizaciones en Electron (con progreso de descarga)
function BannerElectron() {
  const { estado, version, progreso, instalar } = useElectronUpdater()
  const [cerrado, setCerrado] = useState(false)

  if (estado === 'idle' || cerrado) return null

  const esLista = estado === 'lista'

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm px-3">
      <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {esLista
            ? <Check   className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            : <Download className="w-4 h-4 text-primary-400 flex-shrink-0 animate-pulse" />
          }
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold leading-tight">
              {esLista
                ? `Farmadesk ${version} listo para instalar`
                : `Descargando Farmadesk ${version ?? ''}…`}
            </p>
            <p className="text-[10px] text-slate-400 leading-tight">
              {esLista
                ? 'Reinicia la app para aplicar la actualización'
                : `${progreso}% — se instala automáticamente al cerrar`}
            </p>
          </div>
          {esLista && (
            <button
              onClick={instalar}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors flex-shrink-0"
            >
              Reiniciar
            </button>
          )}
          <button onClick={() => setCerrado(true)} className="text-slate-400 hover:text-white transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barra de progreso — solo mientras descarga */}
        {!esLista && (
          <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${progreso}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Banner para actualizaciones en web (Vercel) — recarga de página
function BannerWeb() {
  const hayActualizacion = useActualizacion()
  const [cerrado, setCerrado] = useState(false)

  // No mostrar en Electron (tiene su propio sistema)
  if (window.electronAPI) return null
  if (!hayActualizacion || cerrado) return null

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm px-3">
      <div className="bg-slate-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 text-primary-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-tight">Nueva versión disponible</p>
          <p className="text-[10px] text-slate-400 leading-tight">Recarga para obtener la última versión</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-xs font-bold text-white transition-colors flex-shrink-0"
        >
          Actualizar
        </button>
        <button onClick={() => setCerrado(true)} className="text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function AppLayout({ children }) {
  const { isMobile } = useDevice()
  const [abierto, setAbierto] = useState(() => {
    const saved = localStorage.getItem('farmadesk_sidebar')
    return saved === null ? true : saved === 'true'
  })
  const { abierto: buscadorAbierto, setAbierto: setBuscadorAbierto } = useBuscadorGlobal()

  const toggle = () => {
    setAbierto(v => {
      localStorage.setItem('farmadesk_sidebar', String(!v))
      return !v
    })
  }

  // Una sola instancia del hook para todo el layout — evita pings duplicados a Supabase
  const { online, latencia } = useConexion()
  // Sin internet real: o el SO reporta offline, o está "conectado" pero Supabase no responde
  const sinInternet = !online || (online && latencia === null && navigator.onLine === false)

  return (
    <div className="min-h-screen bg-slate-50">
      <RealtimeWatcher />
      <BannerSinConexion online={online} />
      <BannerElectron />
      <BannerWeb />
      {!isMobile && <Sidebar abierto={abierto} onToggle={toggle} />}
      {isMobile  && <MobileNav />}

      <div
        className="transition-[padding] duration-300 ease-in-out"
        style={{
          paddingLeft:   isMobile ? 0 : (abierto ? '272px' : '76px'),
          paddingBottom: isMobile ? '88px' : 0,
        }}
      >
        <main className={isMobile ? 'px-3 pt-4 pb-4' : 'px-6 pt-6 pb-8'} style={sinInternet ? { paddingTop: isMobile ? '52px' : '60px' } : {}}>
          {children}
        </main>
      </div>

      <BuscadorGlobal abierto={buscadorAbierto} onClose={() => setBuscadorAbierto(false)} />
    </div>
  )
}
