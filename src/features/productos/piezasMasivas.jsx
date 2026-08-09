import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Store, Check, X, ChevronDown, Tag } from 'lucide-react'
import { sanitizarNum, sanitizarEntero } from '@/lib/sanitizar'
import { Button } from '@/components/ui/Button'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { CATEGORIAS_PRODUCTO } from '@/lib/constantes'

/**
 * Componentes que comparten el ingreso masivo y la edición masiva.
 *
 * Viven aquí y no duplicados en cada ventana a propósito: llevan reglas de
 * negocio dentro —el rango válido del mayoreo, por ejemplo— y si mañana cambia
 * una tiene que cambiar en los dos lados. Duplicarlos es cómo se desincronizan
 * sin que nadie lo note.
 *
 * El tope por tanda y el emparejado utilidad/precio viven en reglasMasivas.js:
 * un archivo que exporta componentes no debe exportar además constantes,
 * porque rompe la recarga en caliente.
 */

// ── Selector de categoría ────────────────────────────────────────────────────
const ALTO_MAX = 240   // igual que el Select del sistema (max-h-60)
const ALTO_MIN = 150   // por debajo de esto la lista se ve como rendija
const MARGEN   = 12    // aire contra el borde de la pantalla

// Es el mismo look que el Select del sistema, pero la lista se dibuja en un
// portal con posicion fija en vez de posicion absoluta. El motivo: dentro del
// contenedor con scroll de la tabla, una lista absoluta se recorta y las filas
// de abajo no alcanzarian a mostrarla.
export function SelectCategoria({ valor, onChange, invalido }) {
  const [abierto, setAbierto] = useState(false)
  const [caja, setCaja] = useState(null)
  const btnRef   = useRef(null)
  const listaRef = useRef(null)

  const abrir = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return

    const vh = window.innerHeight
    const vw = window.innerWidth

    // La altura se decide primero y se calcula la posición a partir de ella,
    // no al revés. Al revés era el bug: en la última fila el hueco de abajo
    // vale unos pocos píxeles y la lista salía como una rendija con las letras
    // cortadas — o con maxHeight negativo, que el navegador ignora y la deja
    // saliéndose de la pantalla.
    const alto = Math.min(
      ALTO_MAX,
      Math.max(ALTO_MIN, Math.max(vh - r.bottom - MARGEN, r.top - MARGEN))
    )

    // Se prefiere abajo; si no cabe se sube; si tampoco cabe arriba se pega al
    // borde de la pantalla. Cualquiera de los tres casos deja la lista entera
    // dentro de la vista.
    let top = r.bottom + 4
    if (top + alto > vh - MARGEN) {
      const arriba = r.top - 4 - alto
      top = arriba >= MARGEN ? arriba : Math.max(MARGEN, vh - MARGEN - alto)
    }

    // Si la columna quedó a medias por el scroll horizontal de la tabla, la
    // lista se recorre para no salirse por el costado.
    const ancho = Math.max(r.width, 170)
    const left  = Math.min(Math.max(MARGEN, r.left), Math.max(MARGEN, vw - ancho - MARGEN))

    setCaja({ top, left, width: ancho, maxHeight: alto })
    setAbierto(true)
  }

  useEffect(() => {
    if (!abierto) return
    const alClic = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (listaRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    const alTeclear = (e) => { if (e.key === 'Escape') setAbierto(false) }
    // Al ir fija, la lista no sigue a la tabla si esta se desplaza: se cierra.
    // Pero la propia lista tambien scrollea —son 18 categorias en 240px— y ese
    // scroll llega hasta aqui por la fase de captura. Sin esta guarda, mover la
    // rueda dentro de la lista para llegar a "Otros" la cerraba en la cara.
    const cerrar = (e) => {
      if (e?.target?.nodeType && listaRef.current?.contains(e.target)) return
      setAbierto(false)
    }
    document.addEventListener('mousedown', alClic)
    document.addEventListener('keydown', alTeclear)
    document.addEventListener('scroll', cerrar, true)
    window.addEventListener('resize', cerrar)
    return () => {
      document.removeEventListener('mousedown', alClic)
      document.removeEventListener('keydown', alTeclear)
      document.removeEventListener('scroll', cerrar, true)
      window.removeEventListener('resize', cerrar)
    }
  }, [abierto])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => abierto ? setAbierto(false) : abrir()}
        className={cn(
          'w-full h-10 rounded-xl border text-left relative',
          'flex items-center gap-2 px-3 pr-8 transition-all',
          abierto  && 'bg-white ring-2 ring-primary-500/25 border-primary-300',
          !abierto && invalido && 'bg-red-50/60 border-red-200',
          !abierto && !invalido && 'bg-slate-100/70 border-transparent hover:bg-slate-100'
        )}
      >
        <Tag className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
        <span className={cn('flex-1 truncate text-sm', valor ? 'text-slate-900' : 'text-slate-400')}>
          {valor || 'Seleccionar...'}
        </span>
        <ChevronDown className={cn(
          'w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 transition-transform',
          abierto && 'rotate-180'
        )} />
      </button>

      {abierto && caja && createPortal(
        <div
          ref={listaRef}
          style={caja}
          className="fixed z-[70] bg-white rounded-2xl border border-slate-100 shadow-card-hover overflow-y-auto"
        >
          {CATEGORIAS_PRODUCTO.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setAbierto(false) }}
              className={cn(
                'w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2',
                c === valor
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              )}
            >
              <span className="flex-1 truncate">{c}</span>
              {c === valor && <Check className="w-4 h-4 flex-shrink-0" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

// ── Ventanita: sucursales ────────────────────────────────────────────────────
export function PopupSucursales({ sucursales, seleccionadas, onConfirmar, onCerrar }) {
  const [sel, setSel] = useState(seleccionadas)
  const alternar = (id) =>
    setSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Sucursales</h3>
            <p className="text-xs text-slate-400 mt-0.5">Dónde estará disponible el producto</p>
          </div>
          <button onClick={onCerrar} className="p-2 -mt-1 -mr-1 rounded-xl text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 max-h-72 overflow-y-auto space-y-1.5">
          {sucursales.map(s => {
            const activa = sel.includes(s.id)
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => alternar(s.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors',
                  activa ? 'bg-primary-50 text-primary-700' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <Store className="w-4 h-4 flex-shrink-0 text-slate-400" />
                <span className="flex-1 text-sm font-medium truncate">{s.nombre}</span>
                <span className={cn(
                  'w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0',
                  activa ? 'bg-primary-600 border-primary-600' : 'border-slate-300'
                )}>
                  {activa && <Check className="w-3 h-3 text-white" />}
                </span>
              </button>
            )
          })}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          <Button variante="secundario" className="flex-1" onClick={onCerrar}>Cancelar</Button>
          <Button
            className="flex-1"
            disabled={sel.length === 0}
            onClick={() => onConfirmar(sel)}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Ventanita: mayoreo ───────────────────────────────────────────────────────
export function PopupMayoreo({ valor, precioCompra, precioVenta, onConfirmar, onQuitar, onCerrar }) {
  const [precio,   setPrecio]   = useState(valor?.precio   ?? '')
  const [cantidad, setCantidad] = useState(valor?.cantidad ?? '')

  const pc = sanitizarNum(precioCompra)
  const pv = sanitizarNum(precioVenta)
  const pm = sanitizarNum(precio)

  // El mismo rango que valida el alta de uno en uno, pero aqui se ve mientras
  // se escribe en vez de salir como aviso flotante al intentar avanzar.
  const problema =
    pm <= 0                    ? null
    : (pc > 0 && pm <= pc)     ? `Debe ser mayor al precio de compra (${formatoMoneda(pc)})`
    : (pv > 0 && pm >= pv)     ? `Debe ser menor al precio de venta (${formatoMoneda(pv)})`
    : null

  const listo = pm > 0 && !problema && sanitizarEntero(cantidad) >= 1

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full sm:max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Precio de mayoreo</h3>
            <p className="text-xs text-slate-400 mt-0.5">Precio especial por volumen</p>
          </div>
          <button onClick={onCerrar} className="p-2 -mt-1 -mr-1 rounded-xl text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de mayoreo</label>
            <input
              type="text"
              inputMode="decimal"
              value={precio}
              autoFocus
              onChange={e => /^\d*\.?\d*$/.test(e.target.value) && setPrecio(e.target.value)}
              placeholder="0.00"
              className={cn(
                'w-full h-11 px-4 rounded-2xl border text-sm transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white',
                problema ? 'bg-red-50/60 border-red-300' : 'bg-slate-100/70 border-transparent'
              )}
            />
            {problema && <p className="mt-1.5 text-xs text-red-600">{problema}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Cantidad mínima</label>
            <input
              type="text"
              inputMode="numeric"
              value={cantidad}
              onChange={e => /^\d*$/.test(e.target.value) && setCantidad(e.target.value)}
              placeholder="6"
              className="w-full h-11 px-4 rounded-2xl border border-transparent bg-slate-100/70 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white transition-all"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              A partir de cuántas piezas se aplica el precio
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex gap-2">
          {valor
            ? <Button variante="peligro-suave" onClick={onQuitar}>Quitar</Button>
            : <Button variante="secundario" className="flex-1" onClick={onCerrar}>Cancelar</Button>}
          <Button
            className="flex-1"
            disabled={!listo}
            onClick={() => onConfirmar({ precio, cantidad })}
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  )
}
