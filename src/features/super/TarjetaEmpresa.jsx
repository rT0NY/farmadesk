import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Building2, MoreVertical, Users, Store, CircleDot,
  Pause, Play, Trash2, ExternalLink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'

const ESTADOS = {
  activa: { etiqueta: 'Activa', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', punto: 'bg-emerald-500' },
  suspendida: { etiqueta: 'Suspendida', color: 'bg-amber-50 text-amber-700 border-amber-200', punto: 'bg-amber-500' },
  eliminada: { etiqueta: 'Eliminada', color: 'bg-red-50 text-red-700 border-red-200', punto: 'bg-red-500' },
}

export default function TarjetaEmpresa({ empresa, onCambio }) {
  const navigate = useNavigate()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const estado = ESTADOS[empresa.estado] || ESTADOS.activa

  const accion = async (tipo, confirmacion) => {
    if (!window.confirm(confirmacion)) return
    setMenuAbierto(false)
    try {
      if (tipo === 'suspender') {
        const motivo = window.prompt('Motivo de la suspensión (opcional):') || null
        const { error } = await supabase.rpc('suspender_empresa', { p_empresa_id: empresa.id, p_motivo: motivo })
        if (error) throw error
        toast.success('Empresa suspendida')
      } else if (tipo === 'reactivar') {
        const { error } = await supabase.rpc('reactivar_empresa', { p_empresa_id: empresa.id })
        if (error) throw error
        toast.success('Empresa reactivada')
      } else if (tipo === 'eliminar') {
        const { error } = await supabase.rpc('eliminar_empresa', { p_empresa_id: empresa.id })
        if (error) throw error
        toast.success('Empresa eliminada')
      }
      onCambio?.()
    } catch (err) {
      toast.error(err.message || 'Error al ejecutar acción')
    }
  }

  const abrirDetalle = () => {
    if (empresa.estado === 'eliminada') {
      toast.info('Esta empresa está eliminada. Restáurala para editarla.')
      return
    }
    navigate(`/super/empresas/${empresa.id}`)
  }

  return (
    <div
      onClick={abrirDetalle}
      className={cn(
        'bg-white/80 backdrop-blur-xl border border-slate-100 rounded-3xl p-5 shadow-card hover:shadow-md transition-all',
        empresa.estado !== 'eliminada' && 'cursor-pointer hover:border-primary-200'
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-primary-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-slate-900 truncate">{empresa.nombre}</p>
              {empresa.estado !== 'eliminada' && (
                <ExternalLink className="w-3 h-3 text-slate-300 flex-shrink-0" />
              )}
            </div>
            <div className={cn(
              'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border mt-1',
              estado.color
            )}>
              <span className={cn('w-1.5 h-1.5 rounded-full', estado.punto)} />
              {estado.etiqueta}
            </div>
          </div>
        </div>

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuAbierto(v => !v)}
            className="w-9 h-9 rounded-2xl hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuAbierto && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-1.5">
                {empresa.estado === 'activa' && (
                  <button
                    onClick={() => accion('suspender', `¿Suspender "${empresa.nombre}"?`)}
                    className="w-full text-left px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2 transition-colors"
                  >
                    <Pause className="w-4 h-4" /> Suspender
                  </button>
                )}
                {empresa.estado === 'suspendida' && (
                  <button
                    onClick={() => accion('reactivar', `¿Reactivar "${empresa.nombre}"?`)}
                    className="w-full text-left px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors"
                  >
                    <Play className="w-4 h-4" /> Reactivar
                  </button>
                )}
                {empresa.estado !== 'eliminada' && (
                  <button
                    onClick={() => accion('eliminar', `¿Eliminar "${empresa.nombre}"? Los datos se conservan pero la empresa dejará de aparecer.`)}
                    className="w-full text-left px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                )}
                {empresa.estado === 'eliminada' && (
                  <button
                    onClick={() => accion('reactivar', `¿Restaurar "${empresa.nombre}"?`)}
                    className="w-full text-left px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 transition-colors"
                  >
                    <Play className="w-4 h-4" /> Restaurar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-slate-50 rounded-2xl py-3 px-2">
          <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-slate-900">{empresa.total_usuarios || 0}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Usuarios</p>
        </div>
        <div className="bg-slate-50 rounded-2xl py-3 px-2">
          <Store className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-slate-900">{empresa.total_sucursales || 0}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Sucursales</p>
        </div>
        <div className="bg-slate-50 rounded-2xl py-3 px-2">
          <CircleDot className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-sm font-semibold text-slate-900">{empresa.total_ventas_mes || 0}</p>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Ventas mes</p>
        </div>
      </div>

      {Number(empresa.monto_ventas_mes) > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between text-xs">
          <span className="text-slate-500">Ingresos mes</span>
          <span className="font-semibold text-slate-900">{formatoMoneda(empresa.monto_ventas_mes)}</span>
        </div>
      )}

      {empresa.motivo_suspension && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-[10px] text-amber-600 uppercase tracking-wider font-semibold mb-1">Motivo suspensión</p>
          <p className="text-xs text-slate-700">{empresa.motivo_suspension}</p>
        </div>
      )}

    </div>
  )
}
