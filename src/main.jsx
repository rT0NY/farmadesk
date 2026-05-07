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
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/context/AuthProvider'
import { AppProvider } from '@/context/AppCtx'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
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
    </BrowserRouter>
  </QueryClientProvider>
)
