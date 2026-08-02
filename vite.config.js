import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { writeFileSync } from 'fs'

// Versión única por build — se embebe en el bundle y se escribe en public/version.json
const BUILD_VERSION = Date.now().toString()

function versionPlugin() {
  return {
    name: 'farmadesk-version',
    buildStart() {
      // Escribe public/version.json con la versión actual
      // Vite copia public/ → dist/ automáticamente, así que Vercel servirá el archivo correcto
      writeFileSync(
        path.resolve(__dirname, 'public/version.json'),
        JSON.stringify({ v: BUILD_VERSION })
      )
    },
    configureServer() {
      // En dev, sincroniza el archivo para que no dispare falsos positivos
      writeFileSync(
        path.resolve(__dirname, 'public/version.json'),
        JSON.stringify({ v: BUILD_VERSION })
      )
    },
  }
}

// Content-Security-Policy: se inyecta SOLO en el build de producción (web y Electron).
// No se aplica en dev para no romper el HMR inline de Vite/React Refresh.
// connect-src incluye Supabase (REST + Realtime por WebSocket).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
].join('; ')

function cspPlugin() {
  return {
    name: 'farmadesk-csp',
    apply: 'build',
    transformIndexHtml() {
      // head-prepend: la CSP debe ir ANTES de los <script>/<link> del bundle,
      // porque un <meta> CSP solo gobierna los recursos declarados después de él.
      return [
        {
          tag: 'meta',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: CSP,
          },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionPlugin(), cspPlugin()],
  define: {
    // Disponible en el código como __APP_VERSION__ (string literal en tiempo de build)
    __APP_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Rutas relativas para Electron; absolutas para web/Vercel
  base: process.env.ELECTRON === 'true' ? './' : '/',
})