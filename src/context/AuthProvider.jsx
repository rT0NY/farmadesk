import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null)
  const [cargando, setCargando] = useState(true)
  const cierreIntencional = useRef(false)

  // Mantener sesión activa aunque la PC esté sin interacción todo el día.
  // getSession() lee solo localStorage (sin red). refreshSession() sí hace
  // llamada de red y adquiere un lock interno de Supabase — por eso se
  // envuelve en try-catch y solo se llama si ya hay sesión activa.
  useEffect(() => {
    const refrescar = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session) await supabase.auth.refreshSession()
      } catch {
        // Sin conexión — ignorar silenciosamente, Supabase reintentará sólo
      }
    }

    // Al volver online o recuperar el foco de la pestaña
    const onVisible = () => { if (!document.hidden) refrescar() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', refrescar)

    // Heartbeat cada 25 minutos
    const heartbeat = setInterval(refrescar, 25 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', refrescar)
      clearInterval(heartbeat)
    }
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (evento, nuevaSesion) => {
        if (typeof window !== 'undefined' && window.__creandoUsuario) return

        // TOKEN_REFRESHED: Supabase ya actualizó el token en localStorage internamente.
        // Si la sesión sigue válida no actualizamos el estado de React (evita re-render
        // y pantalla en blanco). Si nuevaSesion es null el token no pudo renovarse
        // → tratar como SIGNED_OUT para no dejar al usuario en un estado inválido.
        if (evento === 'TOKEN_REFRESHED') {
          if (!nuevaSesion) {
            toast.error('Tu sesión expiró. Inicia sesión de nuevo.', { duration: 6000 })
            sessionStorage.removeItem('farmadesk_sucursal_rotativo')
            setSesion(null)
          }
          setCargando(false)
          return
        }

        if (evento === 'SIGNED_OUT' && !cierreIntencional.current) {
          // Si el cierre vino del login (suspensión, cuenta inactiva, etc.)
          // no mostrar "sesión expiró" — el LoginPage ya mostró el mensaje correcto
          const salidaLogin = sessionStorage.getItem('farmadesk_salida_login')
          if (!salidaLogin) {
            toast.error('Tu sesión expiró. Inicia sesión de nuevo.', { duration: 6000 })
          }
          sessionStorage.removeItem('farmadesk_salida_login')
          sessionStorage.removeItem('farmadesk_sucursal_rotativo')
        }
        cierreIntencional.current = false
        setSesion(nuevaSesion)
        setCargando(false)
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  // ── Corte de acceso: cuenta desactivada o empresa suspendida ────────────────
  // Va por RPC y no por consulta directa a propósito: al suspender la empresa,
  // get_empresa_id_seguro() devuelve NULL y el RLS deja de entregarle al usuario
  // hasta su propio perfil, así que una consulta normal no podría distinguir
  // "cuenta desactivada" de "empresa suspendida".
  const verificandoRef = useRef(false)
  const verificarAcceso = useCallback(async () => {
    if (!sesion?.user) return
    if (typeof window !== 'undefined' && window.__creandoUsuario) return
    if (verificandoRef.current) return
    verificandoRef.current = true
    try {
      const { data, error } = await supabase.rpc('estado_sesion')
      // Error de red: no cerrar sesión por un fallo de conexión
      if (error) return
      const estado = Array.isArray(data) ? data[0] : data
      if (!estado) return

      if (!estado.usuario_activo) {
        toast.error('Tu cuenta fue desactivada', { duration: 6000 })
        sessionStorage.setItem('farmadesk_salida_login', '1')
        await supabase.auth.signOut()
        return
      }

      if (estado.empresa_estado && estado.empresa_estado !== 'activa') {
        toast.error(
          estado.empresa_estado === 'suspendida'
            ? 'Tu empresa fue suspendida. Contacta al administrador.'
            : 'Tu empresa ya no está disponible.',
          { duration: 8000 }
        )
        sessionStorage.setItem('farmadesk_salida_login', '1')
        await supabase.auth.signOut()
      }
    } finally {
      verificandoRef.current = false
    }
  }, [sesion?.user?.id])

  useEffect(() => {
    if (!sesion?.user) return

    verificarAcceso()                       // al entrar, sin esperar al intervalo

    const t = setInterval(verificarAcceso, 15_000)
    const alVolver = () => { if (!document.hidden) verificarAcceso() }
    window.addEventListener('focus', verificarAcceso)
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      clearInterval(t)
      window.removeEventListener('focus', verificarAcceso)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [sesion?.user?.id, verificarAcceso])

  const cerrarSesion = async () => {
    cierreIntencional.current = true
    sessionStorage.removeItem('farmadesk_sucursal_rotativo')
    await supabase.auth.signOut()
    setSesion(null)
  }

  const valor = {
    sesion,
    usuario: sesion?.user ?? null,
    cargando,
    autenticado: !!sesion,
    cerrarSesion,
    verificarAcceso,
  }

  return (
    <AuthContext.Provider value={valor}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}