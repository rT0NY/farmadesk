import { Wifi, WifiOff } from 'lucide-react'
import { useConexion } from '@/hooks/useConexion'
import { cn } from '@/lib/clases'

// ── Configuración visual por calidad de conexión ──────────────────────────────
const CFG = {
  sin_conexion: { color: 'text-red-500',     label: 'Sin internet',  barras: 0 },
  midiendo:     { color: 'text-slate-400',   label: 'Conectando…',   barras: 1 },
  excelente:    { color: 'text-emerald-500', label: 'Excelente',     barras: 3 },
  buena:        { color: 'text-emerald-400', label: 'Buena',         barras: 3 },
  lenta:        { color: 'text-amber-400',   label: 'Lenta',         barras: 2 },
  muy_lenta:    { color: 'text-red-400',     label: 'Muy lenta',     barras: 1 },
}

// Icono de señal con 3 barras animadas (como el símbolo WiFi simplificado)
function BarrasSenal({ barras, colorClass }) {
  return (
    <div className="flex items-end gap-[2px] h-3.5">
      {[1, 2, 3].map(n => (
        <div
          key={n}
          className={cn(
            'w-1 rounded-sm transition-all duration-300',
            n <= barras ? colorClass : 'bg-slate-200',
            n === 1 ? 'h-1.5' : n === 2 ? 'h-2.5' : 'h-3.5'
          )}
        />
      ))}
    </div>
  )
}

// ── Versión colapsada: solo ícono + barras ────────────────────────────────────
export function PuntoConexion() {
  const { online, calidad } = useConexion()
  const { color, label, barras } = CFG[calidad] ?? CFG.midiendo

  if (!online) {
    return (
      <div title="Sin internet" className="flex justify-center">
        <WifiOff className={cn('w-4 h-4', color)} strokeWidth={2.5} />
      </div>
    )
  }

  return (
    <div title={label} className="flex justify-center">
      <BarrasSenal barras={barras} colorClass={color.replace('text-', 'bg-')} />
    </div>
  )
}

// ── Versión expandida: ícono + label + latencia ───────────────────────────────
export default function IndicadorConexion() {
  const { online, latencia, calidad } = useConexion()
  const { color, label, barras } = CFG[calidad] ?? CFG.midiendo

  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      {online ? (
        <BarrasSenal barras={barras} colorClass={color.replace('text-', 'bg-')} />
      ) : (
        <WifiOff className={cn('w-3.5 h-3.5 flex-shrink-0', color)} strokeWidth={2.5} />
      )}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className={cn('text-[11px] font-semibold', color)}>{label}</span>
        {online && latencia !== null && (
          <span className="text-[10px] text-slate-400">{latencia}ms</span>
        )}
      </div>
      {!online && (
        <span className="text-[9px] font-bold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
          OFFLINE
        </span>
      )}
    </div>
  )
}
