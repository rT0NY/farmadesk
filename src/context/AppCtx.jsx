import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthProvider'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const { usuario } = useAuth()
  // ID primitivo como dependencia — evita re-cargar cuando Supabase renueva el
  // token y cambia la referencia del objeto sesión sin cambiar el usuario real.
  const usuarioId = usuario?.id ?? null

  const [perfil, setPerfil] = useState(null)
  const [empresa, setEmpresa] = useState(null)
  const [sucursales, setSucursales] = useState([])
  const [sucursalActiva, setSucursalActiva] = useState(null)
  const [turnoActivo, setTurnoActivo] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [usuariosEnLinea, setUsuariosEnLinea] = useState(new Set())
  // Evita pantalla en blanco en recargas posteriores a la primera
  const inicializado = useRef(false)
  // Evita ejecuciones concurrentes de carga
  const cargandoRef = useRef(false)

  const cargarDatosUsuario = useCallback(async () => {
    if (cargandoRef.current) return
    cargandoRef.current = true

    if (!usuarioId) {
      inicializado.current = false
      setPerfil(null)
      setEmpresa(null)
      setSucursales([])
      setSucursalActiva(null)
      setTurnoActivo(null)
      setCargando(false)
      cargandoRef.current = false
      return
    }

    // Solo mostrar loading la primera vez; recargas posteriores son silenciosas
    if (!inicializado.current) setCargando(true)
    try {
      const { data: perfilData, error: errPerfil } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', usuarioId)
        .maybeSingle()

      if (errPerfil) throw errPerfil
      setPerfil(perfilData)

      if (!perfilData) {
        setCargando(false)
        return
      }

      if (perfilData.rol === 'super_admin') {
        setEmpresa(null)
        setSucursales([])
        setSucursalActiva(null)
        setCargando(false)
        return
      }

      if (!perfilData.empresa_id) {
        setCargando(false)
        return
      }

      const { data: empresaData } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', perfilData.empresa_id)
        .maybeSingle()

      // Si la empresa no existe o no está activa, cerrar sesión con mensaje claro
      if (!empresaData || empresaData.estado === 'eliminada') {
        sessionStorage.setItem('farmadesk_salida_login', '1')
        toast.error('Tu empresa no está disponible. Contacta al proveedor de Farmadesk.', { duration: 8000 })
        await supabase.auth.signOut()
        return
      }
      if (empresaData.estado === 'suspendida') {
        sessionStorage.setItem('farmadesk_salida_login', '1')
        toast.error('Esta empresa ha sido suspendida. Contacta al proveedor de Farmadesk para reactivarla.', { duration: 8000 })
        await supabase.auth.signOut()
        return
      }

      setEmpresa(empresaData)

      const { data: sucursalesData } = await supabase
        .from('sucursales')
        .select('*')
        .eq('empresa_id', perfilData.empresa_id)
        .eq('activa', true)
        .order('nombre')
      setSucursales(sucursalesData || [])

      // ── Determinar sucursal activa según el rol ──────────────
      let sucursalInicial = null
      if (perfilData.rol === 'admin') {
        const savedId = localStorage.getItem('farmadesk_sucursal_id')
        sucursalInicial = sucursalesData?.find(s => s.id === savedId)
          ?? sucursalesData?.[0]
          ?? null
      } else if (perfilData.sucursal_id) {
        // Empleado con sucursal fija en su perfil
        sucursalInicial = sucursalesData?.find(s => s.id === perfilData.sucursal_id) ?? null
      } else {
        // Rotativo: restaurar sucursal activa con cuatro fuentes en cascada
        let sucIdActivo = null

        // 1) Turno abierto por este usuario
        if (!sucIdActivo) {
          const { data: turnosAbiertos } = await supabase
            .from('turnos_caja')
            .select('sucursal_id')
            .eq('empresa_id', perfilData.empresa_id)
            .eq('usuario_id', usuarioId)
            .eq('estado', 'abierto')
            .order('fecha_apertura', { ascending: false })
            .limit(1)
          sucIdActivo = turnosAbiertos?.[0]?.sucursal_id ?? null
        }

        // 2) Programacion de hoy en la zona horaria de la empresa
        if (!sucIdActivo) {
          const tzEmpresa = empresaData?.zona_horaria || 'America/Mexico_City'
          const hoyLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tzEmpresa }).format(new Date())
          const { data: prog } = await supabase
            .from('programacion')
            .select('sucursal_id')
            .eq('usuario_id', usuarioId)
            .eq('empresa_id', perfilData.empresa_id)
            .eq('fecha', hoyLocal)
            .order('id', { ascending: false })
            .limit(1)
          sucIdActivo = prog?.[0]?.sucursal_id ?? null
        }

        // 3) sessionStorage — sobrevive F5 dentro de la misma sesión del navegador
        if (!sucIdActivo) {
          sucIdActivo = sessionStorage.getItem('farmadesk_sucursal_rotativo') ?? null
          // Validar que la sucursal guardada siga existiendo
          if (sucIdActivo && !sucursalesData?.find(s => s.id === sucIdActivo)) {
            sucIdActivo = null
          }
        }

        if (sucIdActivo) {
          sucursalInicial = sucursalesData?.find(s => s.id === sucIdActivo) ?? null
        }
      }
      setSucursalActiva(sucursalInicial)
      inicializado.current = true
    } catch (error) {
      console.error('Error cargando datos del usuario:', error)
    } finally {
      setCargando(false)
      cargandoRef.current = false
    }
  }, [usuarioId])

  useEffect(() => {
    cargarDatosUsuario()
  }, [cargarDatosUsuario])

  // Cargar turno activo — el turno es PERSONAL al usuario.
  // Cada cajero tiene su propio turno aunque estén en la misma sucursal.
  // Esto permite turnos secuenciales (mañana/tarde) Y simultáneos (2 computadoras).
  const sucursalActivaId = sucursalActiva?.id ?? null
  const perfilId = perfil?.id ?? null
  useEffect(() => {
    const cargarTurno = async () => {
      if (!sucursalActivaId || !perfilId) {
        setTurnoActivo(null)
        return
      }
      try {
        const { data, error } = await supabase
          .from('turnos_caja')
          .select('*')
          .eq('sucursal_id', sucursalActivaId)
          .eq('usuario_id', perfilId)
          .eq('estado', 'abierto')
          .order('fecha_apertura', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) return // no sobreescribir si hay error de red
        setTurnoActivo(data)
      } catch {
        // no sobreescribir si hay error inesperado
      }
    }
    cargarTurno()
  }, [sucursalActivaId, perfilId])

  const cambiarSucursal = useCallback((sucursal) => {
    setSucursalActiva(sucursal)
    if (!sucursal?.id) return
    if (perfil?.rol === 'admin') {
      localStorage.setItem('farmadesk_sucursal_id', sucursal.id)
    } else {
      // Rotativos: sessionStorage persiste en F5 pero no entre sesiones del navegador
      sessionStorage.setItem('farmadesk_sucursal_rotativo', sucursal.id)
    }
  }, [perfil?.rol])

  const recargarTurno = useCallback(async () => {
    if (!sucursalActivaId || !perfilId) return
    try {
      const { data, error } = await supabase
        .from('turnos_caja')
        .select('*')
        .eq('sucursal_id', sucursalActivaId)
        .eq('usuario_id', perfilId)
        .eq('estado', 'abierto')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return // no sobreescribir si hay error de red
      setTurnoActivo(data)
    } catch {
      // no sobreescribir si hay error inesperado
    }
  }, [sucursalActivaId, perfilId])

  // ── Presencia en tiempo real ──────────────────────────────
  // Un canal por empresa. Cada cliente tracka su propio perfil.
  // Los admins leen quién está en línea para mostrar Activo/Ausente.
  useEffect(() => {
    if (!perfil?.id || !empresa?.id) return

    let cancelado = false
    const canal = supabase.channel(`presencia-${empresa.id}`, {
      config: { presence: { key: perfil.id } },
    })

    const sincronizar = () => {
      if (cancelado) return
      const state = canal.presenceState()
      setUsuariosEnLinea(new Set(Object.keys(state)))
    }

    // try-catch: si el canal ya está suscrito (condición de carrera en login),
    // no debe tumbar el árbol React — la presencia simplemente no estará activa.
    try {
      canal
        .on('presence', { event: 'sync'  }, sincronizar)
        .on('presence', { event: 'join'  }, sincronizar)
        .on('presence', { event: 'leave' }, sincronizar)
        .subscribe(async (status) => {
          if (cancelado) return
          if (status === 'SUBSCRIBED') {
            await canal.track({ nombre: perfil.nombre, rol: perfil.rol })
            sincronizar()
          }
        })
    } catch (err) {
      console.warn('Presencia no disponible:', err)
    }

    return () => {
      cancelado = true
      // removeChannel directo (sin .finally) para que Supabase elimine el canal
      // de su registro interno antes de que el efecto vuelva a correr.
      supabase.removeChannel(canal)
    }
  }, [perfil?.id, empresa?.id])

  const valor = useMemo(() => ({
    perfil,
    empresa,
    sucursales,
    sucursalActiva,
    turnoActivo,
    cargando,
    cambiarSucursal,
    recargarTurno,
    recargarDatos: cargarDatosUsuario,
    esSuperAdmin: perfil?.rol === 'super_admin',
    esAdmin: perfil?.rol === 'admin',
    esEncargado: perfil?.rol === 'encargado',
    esCajero: perfil?.rol === 'cajero',
    tz: empresa?.zona_horaria || 'America/Mexico_City',
    usuariosEnLinea,
  }), [perfil, empresa, sucursales, sucursalActiva, turnoActivo, cargando, cambiarSucursal, recargarTurno, cargarDatosUsuario, usuariosEnLinea])

  return (
    <AppContext.Provider value={valor}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider')
  return ctx
}