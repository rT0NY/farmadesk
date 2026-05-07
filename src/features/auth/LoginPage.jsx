import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizar } from '@/lib/sanitizar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Logo from '@/components/ui/Logo'

// Rate limiting simple en memoria
const intentos = { fallidos: 0, bloqueadoHasta: 0 }
const MAX_INTENTOS = 5
const BLOQUEO_MS = 2 * 60 * 1000 // 2 minutos

const CORREOS_KEY = 'fd_correos_recientes'

function leerCorreosGuardados() {
  try { return JSON.parse(localStorage.getItem(CORREOS_KEY) || '[]') }
  catch { return [] }
}

function guardarCorreo(correo) {
  const prev = leerCorreosGuardados().filter(c => c !== correo)
  localStorage.setItem(CORREOS_KEY, JSON.stringify([correo, ...prev].slice(0, 5)))
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [correo,       setCorreo]       = useState('')
  const [password,     setPassword]     = useState('')
  const [verPassword,  setVerPassword]  = useState(false)
  const [cargando,     setCargando]     = useState(false)
  const [sugerencias,  setSugerencias]  = useState([])
  const [mostrarSugs,  setMostrarSugs]  = useState(false)

  const manejarLogin = async (e) => {
    e.preventDefault()

    if (Date.now() < intentos.bloqueadoHasta) {
      const segundos = Math.ceil((intentos.bloqueadoHasta - Date.now()) / 1000)
      toast.error(`Demasiados intentos. Espera ${segundos} segundos.`)
      return
    }

    const correoLimpio = sanitizar(correo).toLowerCase()
    if (!correoLimpio || !password) {
      toast.error('Ingresa correo y contraseña')
      return
    }

    setCargando(true)
    try {
      const { data: dataLogin, error } = await supabase.auth.signInWithPassword({
        email: correoLimpio,
        password,
      })

      if (error) {
        intentos.fallidos += 1
        if (intentos.fallidos >= MAX_INTENTOS) {
          intentos.bloqueadoHasta = Date.now() + BLOQUEO_MS
          intentos.fallidos = 0
          toast.error('Demasiados intentos fallidos. Bloqueado 2 minutos.')
        } else {
          toast.error('Correo o contraseña incorrectos')
        }
        return
      }

      // Verificar perfil y estado de empresa ANTES de dejarlo entrar
      const userId = dataLogin.user.id
      const { data: perfilData } = await supabase
        .from('perfiles')
        .select('rol, activo, empresa_id')
        .eq('id', userId)
        .maybeSingle()

      if (!perfilData) {
        await supabase.auth.signOut()
        toast.error('Tu cuenta no tiene perfil configurado. Contacta al proveedor.')
        return
      }

      if (!perfilData.activo) {
        await supabase.auth.signOut()
        toast.error('Tu cuenta está inactiva. Contacta al administrador.')
        return
      }

      // Super admin no tiene empresa, puede entrar directo
      if (perfilData.rol === 'super_admin') {
        intentos.fallidos = 0
        toast.success('Bienvenido')
        navigate('/super', { replace: true })
        return
      }

      // Usuarios normales: verificar que su empresa esté activa
      if (!perfilData.empresa_id) {
        await supabase.auth.signOut()
        toast.error('Tu cuenta no está asignada a una empresa. Contacta al administrador.')
        return
      }

      const { data: empresaData } = await supabase
        .from('empresas')
        .select('estado')
        .eq('id', perfilData.empresa_id)
        .maybeSingle()

      if (!empresaData || empresaData.estado === 'eliminada') {
        await supabase.auth.signOut()
        toast.error('Tu empresa no está disponible. Contacta al proveedor de Farmadesk.')
        return
      }

      if (empresaData.estado === 'suspendida') {
        await supabase.auth.signOut()
        toast.error('Tu empresa está suspendida. Contacta al proveedor de Farmadesk para reactivarla.', {
          duration: 6000,
        })
        return
      }

      intentos.fallidos = 0
      guardarCorreo(correoLimpio)
      toast.success('Bienvenido a Farmadesk')
      navigate('/', { replace: true })
    } catch (err) {
      console.error(err)
      toast.error('Error al iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        {/* Logo y título */}
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-24 h-24 mb-4 drop-shadow-xl" />
          <h1 className="text-3xl font-bold text-slate-900">Farmadesk</h1>
        </div>

        {/* Tarjeta de login */}
        <div className="bg-white/95 backdrop-blur-2xl rounded-3xl border border-white/60 shadow-2xl shadow-primary-900/20 p-8">
          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-slate-900">
              Iniciar sesión
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Ingresa con tu cuenta para continuar
            </p>
          </div>

          <form onSubmit={manejarLogin} className="space-y-4">
            {/* Campo correo con sugerencias */}
            <div className="flex flex-col gap-1.5 relative">
              <label className="text-sm font-medium text-slate-700">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  value={correo}
                  onChange={(e) => {
                    setCorreo(e.target.value)
                    const q = e.target.value.toLowerCase()
                    setSugerencias(leerCorreosGuardados().filter(c => c.includes(q) && c !== q))
                    setMostrarSugs(true)
                  }}
                  onFocus={() => {
                    setSugerencias(leerCorreosGuardados())
                    setMostrarSugs(true)
                  }}
                  onBlur={() => setTimeout(() => setMostrarSugs(false), 150)}
                  placeholder="tu@farmacia.com"
                  autoComplete="off"
                  required
                  disabled={cargando}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400 disabled:opacity-50"
                />
              </div>
              {mostrarSugs && sugerencias.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-10 overflow-hidden">
                  {sugerencias.map(c => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={() => { setCorreo(c); setMostrarSugs(false) }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-primary-50 hover:text-primary-700 flex items-center gap-2"
                    >
                      <Mail className="w-3.5 h-3.5 text-slate-400" />{c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Input
              label="Contraseña"
              type={verPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              iconoIzq={<Lock className="w-5 h-5" />}
              iconoDer={
                <button
                  type="button"
                  onClick={() => setVerPassword(!verPassword)}
                  className="hover:text-slate-600 transition-colors"
                  tabIndex={-1}
                >
                  {verPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              }
              autoComplete="current-password"
              required
              disabled={cargando}
            />

            <Button
              type="submit"
              tamano="lg"
              cargando={cargando}
              iconoDer={!cargando && <ArrowRight className="w-5 h-5" />}
              className="w-full mt-6"
            >
              {cargando ? 'Iniciando sesión...' : 'Entrar'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Si olvidaste tu contraseña, contacta al administrador de tu farmacia.
        </p>
      </div>
    </div>
  )
}