import { useState, useRef} from 'react'
import { X, MapPin, Store, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'

function campo(label, value, onChange, placeholder, opts = {}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={opts.type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={opts.max}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-white"
      />
    </div>
  )
}

function formatDireccion(suc) {
  const partes = [suc.calle, suc.colonia, suc.ciudad, suc.estado].filter(Boolean)
  if (!partes.length) return null
  let dir = partes.join(', ')
  if (suc.codigo_postal) dir += ` C.P. ${suc.codigo_postal}`
  return dir
}

function ModalEditarSucursal({ sucursal, onClose, onGuardado }) {
  const [form, setForm] = useState({
    nombre:        sucursal.nombre        ?? '',
    calle:         sucursal.calle         ?? '',
    colonia:       sucursal.colonia       ?? '',
    ciudad:        sucursal.ciudad        ?? '',
    estado:        sucursal.estado        ?? '',
    codigo_postal: sucursal.codigo_postal ?? '',
  })
  const [guardando, setGuardando] = useState(false)
  const guardandoRef = useRef(false)

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = async () => {
    const nom = form.nombre.trim()
    if (!nom) return toast.error('El nombre no puede estar vacío')
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    try {
      const payload = {
        nombre:        nom,
        calle:         form.calle.trim()         || null,
        colonia:       form.colonia.trim()       || null,
        ciudad:        form.ciudad.trim()        || null,
        estado:        form.estado.trim()        || null,
        codigo_postal: form.codigo_postal.trim() || null,
      }
      const { error } = await supabase.from('sucursales')
        .update(payload).eq('id', sucursal.id)
      if (error) throw error
      toast.success('Sucursal actualizada')
      onGuardado({ ...sucursal, ...payload })
    } catch (e) {
      toast.error(e.message ?? 'Error al guardar')
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] animate-modal-in">
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Editar sucursal</h2>
            <p className="text-xs text-slate-400 mt-0.5">Estos datos aparecen en los PDFs de pedidos</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 -mt-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          {campo('Nombre de la sucursal', form.nombre, set('nombre'), 'Ej. Sucursal Centro')}

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Dirección</p>
            <div className="flex flex-col gap-3">
              {campo('Calle y número', form.calle, set('calle'), 'Ej. Av. Reforma 456')}
              {campo('Colonia / Fraccionamiento', form.colonia, set('colonia'), 'Ej. Col. Centro')}
              <div className="grid grid-cols-2 gap-3">
                {campo('Ciudad', form.ciudad, set('ciudad'), 'Ej. Guadalajara')}
                {campo('Estado', form.estado, set('estado'), 'Ej. Jalisco')}
              </div>
              {campo('Código postal', form.codigo_postal, set('codigo_postal'), 'Ej. 44100', { max: 10 })}
            </div>
          </div>

          {/* Vista previa */}
          {(form.calle || form.colonia || form.ciudad) && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Vista previa en PDF</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {[form.calle, form.colonia, form.ciudad, form.estado].filter(Boolean).join(', ')}
                {form.codigo_postal ? ` C.P. ${form.codigo_postal}` : ''}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <div className="flex gap-3">
            <Button variante="secundario" tamano="md" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button variante="primario" tamano="md" className="flex-1" cargando={guardando} onClick={guardar}>Guardar</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SucursalesPage() {
  const { sucursales, recargarDatos } = useApp()
  const [modal, setModal] = useState(null)
  const [lista, setLista] = useState(null)

  const items = lista ?? sucursales

  const onGuardado = (actualizada) => {
    setLista((prev) => (prev ?? sucursales).map((s) => s.id === actualizada.id ? actualizada : s))
    setModal(null)
    recargarDatos()
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-slate-900">Sucursales</h1>
        <p className="text-sm text-slate-500 mt-0.5">Edita el nombre y dirección de tus sucursales.</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Store className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Sin sucursales registradas</p>
          <p className="text-xs text-slate-400">El super admin debe crear las sucursales.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((suc) => {
            const dir = formatDireccion(suc)
            return (
              <div key={suc.id}
                className="bg-white border border-slate-100 rounded-3xl p-5 shadow-card hover:shadow-md transition-all flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5 text-primary-700" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900">{suc.nombre}</p>
                  {dir ? (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-slate-500 leading-relaxed">{dir}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 mt-1">Sin dirección registrada</p>
                  )}
                  {dir && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-[11px] text-emerald-600 font-medium">Dirección guardada</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setModal(suc)}
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 transition-all flex-shrink-0"
                  title="Editar">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
        <p className="text-xs text-slate-500">
          Para <span className="font-semibold text-slate-700">crear o eliminar</span> sucursales, contacta al administrador del sistema.
        </p>
      </div>

      {modal && (
        <ModalEditarSucursal
          sucursal={modal}
          onClose={() => setModal(null)}
          onGuardado={onGuardado}
        />
      )}
    </div>
  )
}
