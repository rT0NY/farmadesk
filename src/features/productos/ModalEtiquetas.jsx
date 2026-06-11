import { useState, useMemo } from 'react'
import { X, Printer, Tag } from 'lucide-react'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'

// Dimensiones fijas: etiqueta estilo farmacia (3 por fila)
const COLS   = 3
const W      = 210  // px
const H      = 110  // px
const FS     = 11   // font-size base

function htmlEtiqueta(producto, empresaNombre) {
  const { nombre, precio_venta, precio_mayoreo, cantidad_mayoreo, categoria } = producto
  const pv = Number(precio_venta  || 0)
  const pm = Number(precio_mayoreo || 0)
  const cm = Number(cantidad_mayoreo || 0)

  return `
    <div style="width:${W}px;height:${H}px;border:1px solid #cbd5e1;border-radius:6px;
      padding:8px 10px;box-sizing:border-box;display:flex;flex-direction:column;
      justify-content:space-between;background:white;font-family:Arial,sans-serif;
      page-break-inside:avoid;overflow:hidden;">
      <div style="font-size:${FS - 2}px;color:#64748b;font-weight:600;
        text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;
        overflow:hidden;text-overflow:ellipsis">
        ${empresaNombre}${categoria ? ` · ${categoria}` : ''}
      </div>
      <div style="font-size:${FS}px;font-weight:700;color:#0f172a;line-height:1.25;flex:1;
        display:flex;align-items:center;margin:4px 0">
        <span style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
          ${nombre}
        </span>
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:6px">
        <div>
          <div style="font-size:${FS - 2}px;color:#64748b">Precio venta</div>
          <div style="font-size:${FS + 7}px;font-weight:800;color:#1e293b;line-height:1">
            $${pv.toFixed(2)}
          </div>
        </div>
        ${pm > 0 ? `
          <div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:5px;
            padding:4px 8px;text-align:right;flex-shrink:0">
            <div style="font-size:${FS - 2}px;color:#7c3aed;font-weight:700">
              ${cm > 0 ? `Mayoreo ×${cm}` : 'Precio mayoreo'}
            </div>
            <div style="font-size:${FS + 3}px;font-weight:800;color:#6d28d9;line-height:1">
              $${pm.toFixed(2)}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `
}

export default function ModalEtiquetas({ productos, onClose }) {
  const { empresa } = useApp()
  const [copias, setCopias] = useState(1)
  const empresaNombre = empresa?.nombre ?? 'Farmadesk'

  const totalEtiquetas = productos.length * copias

  const filas = useMemo(() => {
    const all = []
    productos.forEach(p => { for (let i = 0; i < copias; i++) all.push(p) })
    const result = []
    for (let i = 0; i < all.length; i += COLS) result.push(all.slice(i, i + COLS))
    return result
  }, [productos, copias])

  function imprimir() {
    const win = window.open('', '_blank', 'width=900,height=700')
    const html = filas.map(fila =>
      `<div style="display:flex;gap:8px;margin-bottom:8px">
        ${fila.map(p => htmlEtiqueta(p, empresaNombre)).join('')}
      </div>`
    ).join('')

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Etiquetas — ${empresaNombre}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:10px;background:white}
        @media print{body{padding:4mm}@page{margin:8mm}}
      </style>
    </head><body>
      ${html}
      <script>window.onload=()=>{window.print();window.close()}</script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-modal-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-violet-100 flex items-center justify-center">
              <Tag className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Imprimir etiquetas</h3>
              <p className="text-xs text-slate-500">
                {productos.length} producto{productos.length !== 1 ? 's' : ''} · {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Copias */}
        <div className="px-5 py-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Copias por producto</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCopias(v => Math.max(1, v - 1))}
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 text-lg font-bold">
                −
              </button>
              <span className="w-8 text-center font-bold text-slate-900 text-lg">{copias}</span>
              <button onClick={() => setCopias(v => Math.min(20, v + 1))}
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 text-lg font-bold">
                +
              </button>
            </div>
          </div>

          {/* Lista de productos */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-52 overflow-y-auto">
            {productos.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                  {p.categoria && <p className="text-xs text-slate-400">{p.categoria}</p>}
                </div>
                <span className="text-sm font-bold text-slate-700 flex-shrink-0">
                  ${Number(p.precio_venta || 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-400 text-center">
            Se imprimirán {COLS} etiquetas por fila · formato estándar de farmacia
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
          <Button variante="secundario" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-[2] bg-violet-600 hover:bg-violet-700 text-white" onClick={imprimir}>
            <Printer className="w-4 h-4 mr-1.5" />
            Imprimir {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
