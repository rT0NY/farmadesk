import { useState, useCallback } from 'react'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import { useDevice } from '@/hooks/useDevice'
import { useRealtimeAlertas } from '@/components/ui/NotificacionesPanel'
import BuscadorGlobal, { useBuscadorGlobal } from '@/components/ui/BuscadorGlobal'
import { useActualizacion } from '@/hooks/useActualizacion'
import { RefreshCw, X } from 'lucide-react'

function RealtimeWatcher() {
  useRealtimeAlertas(useCallback(() => {}, []))
  return null
}

function BannerActualizacion() {
  const hayActualizacion = useActualizacion()
  const [cerrado, setCerrado] = useState(false)

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

  return (
    <div className="min-h-screen bg-slate-50">
      <RealtimeWatcher />
      <BannerActualizacion />
      {!isMobile && <Sidebar abierto={abierto} onToggle={toggle} />}
      {isMobile  && <MobileNav />}

      <div
        className="transition-[padding] duration-300 ease-in-out"
        style={{
          paddingLeft:   isMobile ? 0 : (abierto ? '272px' : '76px'),
          paddingBottom: isMobile ? '88px' : 0,
        }}
      >
        <main className={isMobile ? 'px-3 pt-4 pb-4' : 'px-6 pt-6 pb-8'}>
          {children}
        </main>
      </div>

      <BuscadorGlobal abierto={buscadorAbierto} onClose={() => setBuscadorAbierto(false)} />
    </div>
  )
}
