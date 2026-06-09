import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, Users, UserCheck, UserX, Edit2, Phone, Eye, EyeOff, DollarSign, ShieldAlert, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ROLES, ETIQUETAS_ROL } from '@/lib/constantes'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { useFocusRefresh } from '@/lib/useFocusRefresh'

const COLORES_ROL = {
  admin:     'bg-violet-100 text-violet-700 border-violet-200',
  encargado: 'bg-blue-100 text-blue-700 border-blue-200',
  cajero:    'bg-slate-100 text-slate-600 border-slate-200',
}

// ─── Modal invitar empleado ───────────────────────────────────────────────────

function ModalInvitar({ empresa, onClose, onGuardado }) {
  const [forma, setForma] = useState({ nombre: '', correo: '', contrasena: '', rol: 'cajero', telefono: '', sucursal_id: '', salario: '' })
  const [verPass, setVerPass] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const cambiar = (k, v) => setForma((f) => ({ ...f, [k]: v }))

  const telefonoValido = forma.telefono === '' || forma.telefono.length === 10

  const guardar = async () => {
    if (!forma.nombre.trim())    return toast.error('Escribe el nombre')
    if (!forma.correo.trim())    return toast.error('Escribe el correo')
    if (!forma.rol)              return toast.error('Selecciona un rol')
    if (forma.contrasena && forma.contrasena.length < 6)
      return toast.error('La contraseña debe tener al menos 6 caracteres')
    if (forma.telefono && forma.telefono.length !== 10)
      return toast.error('El teléfono debe tener exactamente 10 dígitos')

    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { data, error } = await supabase.functions.invoke('invitar-empleado', {
        body: {
          email:       forma.correo.trim().toLowerCase(),
          nombre:      forma.nombre.trim(),
          rol:         forma.rol,
          empresa_id:  empresa.id,
          sucursal_id: forma.sucursal_id || null,
          telefono:    forma.telefono.trim() || null,
          password:    forma.contrasena.trim() || null,
        },
      })
      if (error) throw error

      const salarioVal = parseFloat(forma.salario)
      if (data?.userId && !isNaN(salarioVal) && salarioVal > 0) {
        await supabase.from('salarios').insert({
          usuario_id:     data.userId,
          empresa_id:     empresa.id,
          salario_diario: salarioVal,
        })
      }

      toast.success(`Empleado creado: ${forma.correo}`)
      onGuardado()
    } catch (e) {
      const msg = e.message ?? ''
      if (msg.toLowerCase().includes('already registered') ||
          msg.toLowerCase().includes('already in use') ||
          msg.toLowerCase().includes('duplicate') ||
          msg.toLowerCase().includes('already exists')) {
        toast.error('Este correo ya está registrado, utiliza otro')
      } else {
        toast.error(msg || 'Error al registrar empleado')
      }
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Crear usuario</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dummy inputs ocultos para engañar al autocompletado del navegador */}
        <input type="text" name="prevent_autofill" style={{ display: 'none' }} readOnly tabIndex={-1} />
        <input type="password" name="prevent_autofill_pass" style={{ display: 'none' }} readOnly tabIndex={-1} />

        {/* Nombre */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Nombre completo</label>
          <input
            type="text" value={forma.nombre} onChange={(e) => cambiar('nombre', e.target.value)}
            placeholder="Ej: María García" autoFocus autoComplete="off"
            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
          />
        </div>

        {/* Correo */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Correo electrónico</label>
          <input
            type="email" value={forma.correo} onChange={(e) => cambiar('correo', e.target.value.toLowerCase())}
            placeholder="empleado@correo.com" autoComplete="off"
            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
          />
        </div>

        {/* Contraseña */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">
            Contraseña <span className="text-slate-400 font-normal">opcional</span>
          </label>
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              value={forma.contrasena}
              onChange={(e) => cambiar('contrasena', e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
              className="w-full pr-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => setVerPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Teléfono */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
            <span>Teléfono WhatsApp <span className="text-slate-400 font-normal">opcional</span></span>
            {forma.telefono.length > 0 && (
              <span className={cn('text-xs font-semibold', telefonoValido ? 'text-emerald-600' : 'text-red-500')}>
                {forma.telefono.length}/10 {telefonoValido ? '✓' : '✗'}
              </span>
            )}
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={forma.telefono}
              onChange={(e) => {
                const solo = e.target.value.replace(/\D/g, '').slice(0, 10)
                cambiar('telefono', solo)
              }}
              placeholder="10 dígitos, ej: 5512345678"
              className={cn(
                'w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl text-sm focus:outline-none focus:ring-2 placeholder:text-slate-400 border',
                forma.telefono.length === 0
                  ? 'border-slate-200 focus:ring-primary-500/30'
                  : telefonoValido
                    ? 'border-emerald-300 focus:ring-emerald-500/30'
                    : 'border-red-300 focus:ring-red-500/30'
              )}
            />
          </div>
        </div>

        {/* Rol */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Rol</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[ROLES.CAJERO, ROLES.ENCARGADO, ROLES.ADMIN].map((r) => (
              <button
                key={r}
                onClick={() => cambiar('rol', r)}
                className={cn(
                  'py-2.5 px-3 rounded-2xl text-sm font-medium border transition-all',
                  forma.rol === r
                    ? COLORES_ROL[r] + ' border-current'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                )}
              >
                {ETIQUETAS_ROL[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Salario diario */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-slate-400" />
            Salario diario <span className="text-slate-400 font-normal">opcional</span>
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">$</span>
            <input
              type="number" min="0" step="0.01"
              value={forma.salario}
              onChange={e => cambiar('salario', e.target.value)}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
            Crear
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal editar empleado ────────────────────────────────────────────────────

function ModalEditar({ empleado, empresa, onClose, onGuardado }) {
  const [forma, setForma] = useState({
    nombre:     empleado.nombre,
    rol:        empleado.rol,
    telefono:   empleado.telefono ?? '',
    contrasena: '',
  })
  const [verPass, setVerPass] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const cambiar = (k, v) => setForma((f) => ({ ...f, [k]: v }))

  const esPropietario = empleado.id === empresa?.propietario
  const telefonoValido = forma.telefono === '' || forma.telefono.length === 10

  const guardar = async () => {
    if (!forma.nombre.trim()) return toast.error('Escribe el nombre')
    if (forma.contrasena && forma.contrasena.length < 6)
      return toast.error('La contraseña debe tener al menos 6 caracteres')
    if (forma.telefono && forma.telefono.length !== 10)
      return toast.error('El teléfono debe tener exactamente 10 dígitos')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const { error } = await supabase.functions.invoke('super-api', {
        body: {
          accion:   'actualizar',
          uid:      empleado.id,
          nombre:   forma.nombre.trim(),
          rol:      esPropietario ? empleado.rol : forma.rol, // propietario no cambia rol
          password: forma.contrasena.trim() || undefined,
        },
      })
      if (error) throw error
      // Actualizar teléfono directamente (super-api no lo maneja)
      await supabase.from('perfiles')
        .update({ telefono: forma.telefono.trim() || null })
        .eq('id', empleado.id)
      toast.success('Empleado actualizado')
      onGuardado()
    } catch (e) {
      toast.error(e.message ?? 'Error al actualizar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Editar empleado</h2>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {esPropietario && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-700">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            Este es el administrador principal. Solo puedes cambiar su nombre, teléfono y contraseña.
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Nombre completo</label>
          <input
            type="text" value={forma.nombre} onChange={(e) => cambiar('nombre', e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Correo</label>
          <div className="bg-slate-100 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-500 select-none">
            {empleado.correo}
          </div>
        </div>

        {/* Nueva contraseña */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">
            Nueva contraseña <span className="text-slate-400 font-normal">opcional</span>
          </label>
          <div className="relative">
            <input
              type={verPass ? 'text' : 'password'}
              value={forma.contrasena}
              onChange={(e) => cambiar('contrasena', e.target.value)}
              placeholder="Dejar vacío para no cambiar"
              className="w-full pr-10 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 placeholder:text-slate-400"
            />
            <button type="button" onClick={() => setVerPass(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {verPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Teléfono */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center justify-between">
            <span>Teléfono WhatsApp <span className="text-slate-400 font-normal">opcional</span></span>
            {forma.telefono.length > 0 && (
              <span className={cn('text-xs font-semibold', telefonoValido ? 'text-emerald-600' : 'text-red-500')}>
                {forma.telefono.length}/10 {telefonoValido ? '✓' : '✗'}
              </span>
            )}
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={forma.telefono}
              onChange={(e) => {
                const solo = e.target.value.replace(/\D/g, '').slice(0, 10)
                cambiar('telefono', solo)
              }}
              placeholder="10 dígitos, ej: 5512345678"
              className={cn(
                'w-full pl-10 pr-4 py-3 bg-slate-50 rounded-2xl text-sm focus:outline-none focus:ring-2 placeholder:text-slate-400 border',
                forma.telefono.length === 0
                  ? 'border-slate-200 focus:ring-primary-500/30'
                  : telefonoValido
                    ? 'border-emerald-300 focus:ring-emerald-500/30'
                    : 'border-red-300 focus:ring-red-500/30'
              )}
            />
          </div>
        </div>

        {/* Rol — solo si no es propietario */}
        {!esPropietario && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Rol</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[ROLES.CAJERO, ROLES.ENCARGADO, ROLES.ADMIN].map((r) => (
                <button key={r} onClick={() => cambiar('rol', r)}
                  className={cn('py-2.5 px-3 rounded-2xl text-sm font-medium border transition-all',
                    forma.rol === r ? COLORES_ROL[r] + ' border-current' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                  {ETIQUETAS_ROL[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EmpleadosPage() {
  const { empresa, sucursales, perfil: perfilActual } = useApp()

  const [empleados, setEmpleados]       = useState([])
  const [salMap, setSalMap]             = useState({})
  const [cargando, setCargando]         = useState(true)
  const [filtroActivo, setFiltroActivo] = useState(true)
  const [modalInvitar,     setModalInvitar]     = useState(false)
  const [modalEditar,      setModalEditar]      = useState(null)
  const [confirmarToggle,  setConfirmarToggle]  = useState(null) // { emp, nuevo }
  const [procesandoToggle, setProcesandoToggle] = useState(false)
  const toggleRef = useRef(false)

  const cargar = useCallback(async () => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      let q = supabase
        .from('perfiles')
        .select('*, sucursales(nombre)')
        .eq('empresa_id', empresa.id)
        .neq('rol', 'super_admin')
        .order('nombre')

      if (filtroActivo !== 'todos') q = q.eq('activo', filtroActivo)

      const [{ data, error }, { data: sals }] = await Promise.all([
        q,
        supabase.from('salarios').select('usuario_id, salario_diario').eq('empresa_id', empresa.id),
      ])
      if (error) throw error
      const map = {}
      ;(sals ?? []).forEach(s => { map[s.usuario_id] = Number(s.salario_diario) })
      setSalMap(map)
      setEmpleados(data ?? [])
    } catch (e) {
      toast.error(e.message ?? 'Error al cargar empleados')
    } finally {
      setCargando(false)
    }
  }, [empresa, filtroActivo])

  useEffect(() => { cargar() }, [cargar])
  useFocusRefresh(cargar)

  const toggleActivo = async (emp) => {
    if (toggleRef.current) return
    toggleRef.current = true
    const nuevo = !emp.activo
    setProcesandoToggle(true)
    try {
      const { error } = await supabase.functions.invoke('toggle-empleado', {
        body: { user_id: emp.id, activo: nuevo },
      })
      if (error) throw error
      toast.success(nuevo ? `${emp.nombre} activado` : `${emp.nombre} eliminado`)
      cargar()
    } catch (e) {
      toast.error(e.message ?? 'Error al actualizar empleado')
    } finally {
      toggleRef.current = false
      setProcesandoToggle(false)
    }
  }

  const activos   = empleados.filter((e) => e.activo).length
  const inactivos = empleados.filter((e) => !e.activo).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Empleados</h1>
          <p className="text-sm text-slate-500 mt-0.5">{empresa?.nombre ?? '—'}</p>
        </div>
        <Button
          variante="primario" tamano="md"
          iconoIzq={<Plus className="w-4 h-4" />}
          onClick={() => setModalInvitar(true)}
        >
          Crear usuario
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200/60 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Activos</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{activos}</p>
        </div>
        <div className="bg-white border border-slate-200/60 rounded-2xl px-5 py-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Inactivos</p>
          <p className="text-2xl font-bold text-slate-400 mt-1">{inactivos}</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex gap-2">
        {[
          { valor: true,    etiqueta: 'Activos'   },
          { valor: false,   etiqueta: 'Inactivos' },
          { valor: 'todos', etiqueta: 'Todos'     },
        ].map((f) => (
          <button
            key={String(f.valor)}
            onClick={() => setFiltroActivo(f.valor)}
            className={cn(
              'px-4 py-2 rounded-2xl text-sm font-medium border transition-all',
              filtroActivo === f.valor
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-slate-700 border-slate-200'
            )}
          >
            {f.etiqueta}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-sm overflow-hidden">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : empleados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Sin empleados</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {empleados.map((emp) => {
              const esMismo = emp.id === perfilActual?.id
              return (
                <div key={emp.id} className={cn('flex items-center gap-3 px-4 py-3', !emp.activo && 'opacity-50')}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-primary-700">
                      {emp.nombre?.charAt(0)?.toUpperCase() ?? '?'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 truncate">{emp.nombre}</p>
                      {esMismo && <span className="text-xs text-slate-400 flex-shrink-0">(tú)</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', COLORES_ROL[emp.rol] ?? COLORES_ROL.cajero)}>
                        {ETIQUETAS_ROL[emp.rol] ?? emp.rol}
                      </span>
                      {salMap[emp.id] > 0 && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <DollarSign className="w-3 h-3" />{formatoMoneda(salMap[emp.id])}/día
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{emp.correo}</p>
                  </div>

                  {/* Acciones */}
                  {!esMismo && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setModalEditar(emp)}
                        className="p-2 rounded-xl text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {/* El propietario (admin principal) NO se puede desactivar */}
                      {emp.id !== empresa?.propietario && (
                        <button
                          onClick={() => setConfirmarToggle({ emp, nuevo: !emp.activo })}
                          className={cn(
                            'p-2 rounded-xl transition-colors',
                            emp.activo
                              ? 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          )}
                          title={emp.activo ? 'Eliminar' : 'Activar'}
                        >
                          {emp.activo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalInvitar && (
        <ModalInvitar
          empresa={empresa}
          sucursales={sucursales}
          onClose={() => setModalInvitar(false)}
          onGuardado={() => { setModalInvitar(false); cargar() }}
        />
      )}
      {modalEditar && (
        <ModalEditar
          empleado={modalEditar}
          empresa={empresa}
          onClose={() => setModalEditar(null)}
          onGuardado={() => { setModalEditar(null); cargar() }}
        />
      )}

      {confirmarToggle && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setConfirmarToggle(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 w-full sm:max-w-sm">
            <div className={cn(
              'w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4',
              confirmarToggle.nuevo ? 'bg-emerald-100' : 'bg-red-100'
            )}>
              <AlertTriangle className={cn('w-6 h-6', confirmarToggle.nuevo ? 'text-emerald-600' : 'text-red-600')} />
            </div>
            <p className="text-center text-sm font-semibold text-slate-900 mb-1">
              {confirmarToggle.nuevo ? 'Activar empleado' : 'Eliminar empleado'}
            </p>
            <p className="text-center text-sm text-slate-500 mb-5">
              {confirmarToggle.nuevo
                ? `¿Activar la cuenta de ${confirmarToggle.emp.nombre}? Podrá iniciar sesión de nuevo.`
                : `¿Eliminar a ${confirmarToggle.emp.nombre}? Ya no podrá acceder al sistema.`}
            </p>
            <div className="flex gap-2">
              <Button variante="secundario" className="flex-1" disabled={procesandoToggle} onClick={() => setConfirmarToggle(null)}>
                Cancelar
              </Button>
              <Button
                className={cn('flex-1 text-white', confirmarToggle.nuevo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700')}
                cargando={procesandoToggle}
                onClick={() => { toggleActivo(confirmarToggle.emp); setConfirmarToggle(null) }}
              >
                {confirmarToggle.nuevo ? 'Activar' : 'Eliminar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
