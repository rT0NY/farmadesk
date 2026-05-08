// Silenciar logs en producción para no exponer detalles internos en DevTools
if (import.meta.env.PROD) {
  console.log  = () => {}
  console.warn = () => {}
  console.error = () => {}
  console.info  = () => {}
  console.debug = () => {}
}

import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/context/AuthProvider'
import { AppProvider } from '@/context/AppCtx'
import App from './App.jsx'
import './index.css'

// Electron carga desde file:// — BrowserRouter no funciona ahí.
// HashRouter usa /#/ruta que sí es compatible con file://.
// En web (Vercel) sigue usando BrowserRouter normal.
const Router = navigator.userAgent.includes('Electron') ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <Router>
      <AuthProvider>
        <AppProvider>
          <App />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              style: {
                borderRadius: '16px',
                fontFamily: 'Inter, system-ui, sans-serif',
              },
            }}
          />
        </AppProvider>
      </AuthProvider>
    </Router>
  </QueryClientProvider>
)
