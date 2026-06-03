import { useState, useEffect, useRef} from 'react'
import { Building2, Phone, Mail, FileText, Save, Check, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/clases'

function Campo({ label, icono: Icono, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {Icono && <Icono className="w-3.5 h-3.5" />}
        {label}
      </label>
      {children}
    </div>
  )
}

function InputTexto({ value, onChange, placeholder, maxLength, className, disabled }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={cn(
        'w-full px-4 py-3 border border-slate-200 rounded-2xl text-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white',
        'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
        className
      )}
    />
  )
}

function Seccion({ titulo, descripcion, children }) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
        <p className="text-sm font-bold text-slate-800">{titulo}</p>
        {descripcion && <p className="text-xs text-slate-500 mt-0.5">{descripcion}</p>}
      </div>
      <div className="px-5 py-5 flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}

export default function AjustesPage() {
  const { empresa, recargarDatos } = useApp()

  const [forma, setForma] = useState({
    nombre: '', rfc: '', telefono: '', correo_contacto: '',
    calle: '', colonia: '', ciudad: '', entidad: '', codigo_postal: '',
  })
  const [guardando, setGuardando] = useState(false)
  const [guardado,  setGuardado]  = useState(false)
  const guardandoRef = useRef(false)

  useEffect(() => {
    if (!empresa) return
    setForma({
      nombre:          empresa.nombre          ?? '',
      rfc:             empresa.rfc             ?? '',
      telefono:        empresa.telefono        ?? '',
      correo_contacto: empresa.correo_contacto ?? '',
      calle:           empresa.calle           ?? '',
      colonia:         empresa.colonia         ?? '',
      ciudad:          empresa.ciudad          ?? '',
      entidad:         empresa.entidad         ?? '',
      codigo_postal:   empresa.codigo_postal   ?? '',
    })
  }, [empresa])

  const cambiar = (campo) => (valor) => setForma(f => ({ ...f, [campo]: valor }))

  const guardar = async () => {
    if (!forma.nombre.trim()) return toast.error('El nombre de la empresa es obligatorio')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const payload = { nombre: forma.nombre.trim() }
      if (forma.rfc.trim())             payload.rfc             = forma.rfc.trim().toUpperCase()
      if (forma.telefono.trim())        payload.telefono        = forma.telefono.trim()
      if (forma.correo_contacto.trim()) payload.correo_contacto = forma.correo_contacto.trim().toLowerCase()
      payload.calle         = forma.calle.trim()         || null
      payload.colonia       = forma.colonia.trim()       || null
      payload.ciudad        = forma.ciudad.trim()        || null
      payload.entidad       = forma.entidad.trim()       || null
      payload.codigo_postal = forma.codigo_postal.trim() || null

      const { error } = await supabase.from('empresas').update(payload).eq('id', empresa.id)

      if (error) {
        // Columnas extra aún no existen en DB → guardar solo nombre
        if (error.message?.includes('column') || error.code === '42703') {
          const { error: e2 } = await supabase.from('empresas').update({ nombre: payload.nombre }).eq('id', empresa.id)
          if (e2) throw e2
        } else {
          throw error
        }
      }

      toast.success('Ajustes guardados')
      await recargarDatos()
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2500)
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  if (!empresa) return null

  return (
    <div className="flex flex-col gap-5 max-w-2xl">

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ajustes</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configura los datos de tu empresa</p>
      </div>

      <Seccion
        titulo="Datos de la empresa"
        descripcion="Esta información aparece en los documentos y PDFs generados">

        <Campo label="Nombre comercial" icono={Building2}>
          <InputTexto disabled={guardando}
            value={forma.nombre}
            onChange={cambiar('nombre')}
            placeholder="Farmacia El Sol"
            maxLength={100}
          />
        </Campo>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="RFC" icono={FileText}>
            <InputTexto disabled={guardando}
              value={forma.rfc}
              onChange={v => cambiar('rfc')(v.toUpperCase())}
              placeholder="XXXX000000XXX"
              maxLength={13}
              className="font-mono"
            />
          </Campo>
          <Campo label="Teléfono" icono={Phone}>
            <InputTexto disabled={guardando}
              value={forma.telefono}
              onChange={cambiar('telefono')}
              placeholder="55 1234 5678"
              maxLength={20}
            />
          </Campo>
        </div>

        <Campo label="Correo de contacto" icono={Mail}>
          <InputTexto disabled={guardando}
            value={forma.correo_contacto}
            onChange={cambiar('correo_contacto')}
            placeholder="contacto@mifarmacia.com"
            maxLength={255}
          />
        </Campo>

        <div className="border-t border-slate-100 pt-2">
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
            <MapPin className="w-3.5 h-3.5" />
            Dirección
          </p>
          <div className="flex flex-col gap-3">
            <InputTexto disabled={guardando}
              value={forma.calle}
              onChange={cambiar('calle')}
              placeholder="Calle y número · Ej. Av. Reforma 456"
              maxLength={150}
            />
            <InputTexto disabled={guardando}
              value={forma.colonia}
              onChange={cambiar('colonia')}
              placeholder="Colonia / Fraccionamiento · Ej. Col. Centro"
              maxLength={100}
            />
            <div className="grid grid-cols-2 gap-3">
              <InputTexto disabled={guardando}
                value={forma.ciudad}
                onChange={cambiar('ciudad')}
                placeholder="Ciudad"
                maxLength={80}
              />
              <InputTexto disabled={guardando}
                value={forma.entidad}
                onChange={cambiar('entidad')}
                placeholder="Estado"
                maxLength={80}
              />
            </div>
            <InputTexto disabled={guardando}
              value={forma.codigo_postal}
              onChange={cambiar('codigo_postal')}
              placeholder="Código postal · Ej. 44100"
              maxLength={10}
            />
          </div>

          {(forma.calle || forma.colonia || forma.ciudad) && (
            <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Vista previa</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {[forma.calle, forma.colonia, forma.ciudad, forma.entidad].filter(Boolean).join(', ')}
                {forma.codigo_postal ? ` C.P. ${forma.codigo_postal}` : ''}
              </p>
            </div>
          )}
        </div>
      </Seccion>

      <div className="flex justify-end">
        <Button variante="primario" tamano="md" cargando={guardando} onClick={guardar} className="min-w-[140px]">
          {guardado
            ? <><Check className="w-4 h-4 mr-1.5" /> Guardado</>
            : <><Save className="w-4 h-4 mr-1.5" /> Guardar cambios</>}
        </Button>
      </div>
    </div>
  )
}
