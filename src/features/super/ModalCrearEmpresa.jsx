import { useState } from 'react'
import { toast } from 'sonner'
import {
  X, Building2, User, Mail, Lock, MapPin,
  Eye, EyeOff, Plus, Trash2, Store, Phone, CreditCard, CalendarClock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizar } from '@/lib/sanitizar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const sucursalVacia = () => ({
  id: Math.random().toString(36).slice(2, 9),
  nombre: '',
  calle: '',
  colonia: '',
  ciudad: '',
  estado: '',
  codigo_postal: '',
})

function CampoDir({ label, value, onChange, placeholder, maxLength }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      />
    </div>
  )
}

export default function ModalCrearEmpresa({ abierto, onCerrar, onExito }) {
  const [form, setForm] = useState({
    nombre_empresa: '',
    nombre_admin: '',
    correo_admin: '',
    password_admin: '',
  })
  const [billing, setBilling] = useState({
    cliente_nombre:   '',
    cliente_telefono: '',
    dia_pago:         '',
  })
  const [sucursales, setSucursales] = useState([
    { ...sucursalVacia(), nombre: 'Matriz' }
  ])
  const [verPass, setVerPass] = useState(false)
  const [cargando, setCargando] = useState(false)

  const cambiar = (campo) => (e) =>
    setForm(v => ({ ...v, [campo]: e.target.value }))

  const cambiarSucursal = (id, campo) => (valor) => {
    setSucursales(prev => prev.map(s =>
      s.id === id ? { ...s, [campo]: valor } : s
    ))
  }

  const agregarSucursal = () => setSucursales(prev => [...prev, sucursalVacia()])

  const quitarSucursal = (id) => {
    if (sucursales.length === 1) {
      toast.error('Debe haber al menos una sucursal')
      return
    }
    setSucursales(prev => prev.filter(s => s.id !== id))
  }

  const cambiarBilling = (campo) => (e) =>
    setBilling(v => ({ ...v, [campo]: e.target.value }))

  const resetForm = () => {
    setForm({ nombre_empresa: '', nombre_admin: '', correo_admin: '', password_admin: '' })
    setBilling({ cliente_nombre: '', cliente_telefono: '', dia_pago: '' })
    setSucursales([{ ...sucursalVacia(), nombre: 'Matriz' }])
  }

  const enviar = async (e) => {
    e.preventDefault()

    const nombreEmpresa = sanitizar(form.nombre_empresa)
    const nombreAdmin   = sanitizar(form.nombre_admin)
    const correo        = sanitizar(form.correo_admin).toLowerCase()

    if (!nombreEmpresa) return toast.error('Nombre de empresa requerido')
    if (!nombreAdmin)   return toast.error('Nombre del admin requerido')
    if (!correo)        return toast.error('Correo requerido')
    if (!form.password_admin || form.password_admin.length < 6)
      return toast.error('Contraseña mínimo 6 caracteres')

    const sucursalesValidas = sucursales
      .map(s => ({
        nombre:        sanitizar(s.nombre),
        calle:         s.calle.trim()         || null,
        colonia:       s.colonia.trim()       || null,
        ciudad:        s.ciudad.trim()        || null,
        estado:        s.estado.trim()        || null,
        codigo_postal: s.codigo_postal.trim() || null,
      }))
      .filter(s => s.nombre)

    if (sucursalesValidas.length === 0)
      return toast.error('Agrega al menos una sucursal con nombre')

    for (const s of sucursalesValidas) {
      if (!s.calle)  return toast.error(`Sucursal "${s.nombre}": la calle es obligatoria`)
      if (!s.ciudad) return toast.error(`Sucursal "${s.nombre}": la ciudad es obligatoria`)
    }

    const nombresSet = new Set()
    for (const s of sucursalesValidas) {
      const n = s.nombre.toLowerCase()
      if (nombresSet.has(n)) return toast.error(`La sucursal "${s.nombre}" está duplicada`)
      nombresSet.add(n)
    }

    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      window.__creandoUsuario = true

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/super-api`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            accion:           'crear_empresa_con_admin',
            nombre_empresa:   nombreEmpresa,
            nombre_admin:     nombreAdmin,
            correo_admin:     correo,
            password_admin:   form.password_admin,
            sucursal_inicial: sucursalesValidas[0],
          }),
        }
      )
      const data = await resp.json()
      if (!resp.ok || data.error) {
        toast.error(data.error || 'Error al crear empresa')
        return
      }

      const empresaId = data.empresa.id

      // Guardar datos de cobranza privados si se capturaron
      const billingPayload = {
        cliente_nombre:   sanitizar(billing.cliente_nombre) || null,
        cliente_telefono: sanitizar(billing.cliente_telefono) || null,
        dia_pago:         billing.dia_pago ? parseInt(billing.dia_pago) : null,
      }
      if (billingPayload.cliente_nombre || billingPayload.cliente_telefono || billingPayload.dia_pago) {
        await supabase.from('empresas').update(billingPayload).eq('id', empresaId)
      }

      if (sucursalesValidas.length > 1) {
        const restantes = sucursalesValidas.slice(1).map(s => ({
          empresa_id:    empresaId,
          nombre:        s.nombre,
          calle:         s.calle,
          colonia:       s.colonia,
          ciudad:        s.ciudad,
          estado:        s.estado,
          codigo_postal: s.codigo_postal,
        }))
        const { error: errSuc } = await supabase.from('sucursales').insert(restantes)
        if (errSuc) toast.warning(`Empresa creada, pero algunas sucursales fallaron: ${errSuc.message}`)
      }

      toast.success(`Empresa creada con ${sucursalesValidas.length} sucursal(es)`)
      resetForm()
      onExito?.()
      onCerrar()
    } catch (err) {
      console.error(err)
      toast.error('Error de red al crear empresa')
    } finally {
      setTimeout(() => { window.__creandoUsuario = false }, 500)
      setCargando(false)
    }
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => !cargando && onCerrar()}
      />

      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Nueva empresa</h3>
              <p className="text-xs text-slate-500">Crear farmacia, dueño y sucursales</p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={cargando}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={enviar} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {/* Empresa */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Empresa</p>
            <Input
              label="Nombre de la farmacia"
              iconoIzq={<Building2 className="w-5 h-5" />}
              value={form.nombre_empresa}
              onChange={cambiar('nombre_empresa')}
              placeholder="Farmacia San Rafael"
              required
            />
          </div>

          {/* Dueño */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Dueño (admin principal)</p>
            <div className="space-y-3">
              <Input
                label="Nombre completo"
                iconoIzq={<User className="w-5 h-5" />}
                value={form.nombre_admin}
                onChange={cambiar('nombre_admin')}
                placeholder="Juan Pérez"
                required
              />
              <Input
                label="Correo electrónico"
                type="email"
                iconoIzq={<Mail className="w-5 h-5" />}
                value={form.correo_admin}
                onChange={cambiar('correo_admin')}
                placeholder="juan@farmacia.com"
                autoComplete="off"
                required
              />
              <Input
                label="Contraseña inicial"
                type={verPass ? 'text' : 'password'}
                iconoIzq={<Lock className="w-5 h-5" />}
                iconoDer={
                  <button type="button" onClick={() => setVerPass(v => !v)} className="hover:text-slate-600">
                    {verPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                }
                value={form.password_admin}
                onChange={cambiar('password_admin')}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                required
              />
            </div>
          </div>

          {/* Sucursales */}
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Sucursales ({sucursales.length})
            </p>

            <div className="space-y-3">
              {sucursales.map((s, idx) => (
                <div key={s.id} className="bg-slate-50 rounded-2xl p-3 space-y-2.5">
                  {/* Cabecera */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center">
                        <Store className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                      <span className="text-xs font-medium text-slate-500">Sucursal {idx + 1}</span>
                    </div>
                    {sucursales.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarSucursal(s.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-400 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Nombre */}
                  <input
                    type="text"
                    value={s.nombre}
                    onChange={e => cambiarSucursal(s.id, 'nombre')(e.target.value)}
                    placeholder="Nombre (ej. Matriz, Centro, Norte)"
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  />

                  {/* Dirección */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Dirección</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <CampoDir
                      label="Calle y número *"
                      value={s.calle}
                      onChange={cambiarSucursal(s.id, 'calle')}
                      placeholder="Ej. Av. Reforma 456"
                      maxLength={150}
                    />
                    <CampoDir
                      label="Colonia / Fraccionamiento"
                      value={s.colonia}
                      onChange={cambiarSucursal(s.id, 'colonia')}
                      placeholder="Ej. Col. Centro"
                      maxLength={100}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <CampoDir
                        label="Ciudad *"
                        value={s.ciudad}
                        onChange={cambiarSucursal(s.id, 'ciudad')}
                        placeholder="Ej. Guadalajara"
                        maxLength={80}
                      />
                      <CampoDir
                        label="Estado"
                        value={s.estado}
                        onChange={cambiarSucursal(s.id, 'estado')}
                        placeholder="Ej. Jalisco"
                        maxLength={80}
                      />
                    </div>
                    <CampoDir
                      label="Código postal"
                      value={s.codigo_postal}
                      onChange={cambiarSucursal(s.id, 'codigo_postal')}
                      placeholder="Ej. 44100"
                      maxLength={10}
                    />
                    {(s.calle || s.ciudad) && (
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Vista previa</p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {[s.calle, s.colonia, s.ciudad, s.estado].filter(Boolean).join(', ')}
                          {s.codigo_postal ? ` C.P. ${s.codigo_postal}` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={agregarSucursal}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-medium text-primary-600 bg-primary-50/50 hover:bg-primary-50 border border-dashed border-primary-200 hover:border-primary-300 transition-all"
              >
                <Plus className="w-4 h-4" />
                Agregar otra sucursal
              </button>
            </div>
          </div>

          {/* Cobranza — privado super admin */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-md bg-violet-100 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-3 h-3 text-violet-600" />
              </div>
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Datos del dueño — privado (solo tú lo ves)</p>
            </div>
            <div className="bg-violet-50/60 border border-violet-100 rounded-2xl p-4 space-y-3">
              <Input
                label="Nombre del contacto de pago"
                iconoIzq={<User className="w-5 h-5" />}
                value={billing.cliente_nombre}
                onChange={cambiarBilling('cliente_nombre')}
                placeholder="Ej. Rodrigo García"
              />
              <Input
                label="Teléfono"
                type="tel"
                iconoIzq={<Phone className="w-5 h-5" />}
                value={billing.cliente_telefono}
                onChange={cambiarBilling('cliente_telefono')}
                placeholder="55 1234 5678"
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-500">Día de pago mensual</label>
                <div className="relative">
                  <CalendarClock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="number" min="1" max="28"
                    value={billing.dia_pago}
                    onChange={cambiarBilling('dia_pago')}
                    placeholder="Ej. 15"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>
                <p className="text-[10px] text-slate-400">Día del mes en que te pagan (1–28). Se usará para recordatorios.</p>
              </div>
            </div>
          </div>

        </form>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-2 flex-shrink-0">
          <Button variante="secundario" onClick={onCerrar} disabled={cargando} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={enviar} cargando={cargando} className="flex-1">
            Crear empresa
          </Button>
        </div>
      </div>
    </div>
  )
}
