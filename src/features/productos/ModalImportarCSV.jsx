import { useState, useRef } from 'react'
import { X, Upload, Download, Check, AlertTriangle, Package, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { Button } from '@/components/ui/Button'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'

// ─── Columnas del CSV ─────────────────────────────────────────────────────────

const COLUMNAS = [
  { key: 'nombre',          label: 'nombre',          req: true,  tipo: 'texto'  },
  { key: 'categoria',       label: 'categoria',       req: false, tipo: 'texto'  },
  { key: 'precio_compra',   label: 'precio_compra',   req: false, tipo: 'numero' },
  { key: 'precio_venta',    label: 'precio_venta',    req: true,  tipo: 'numero' },
  { key: 'precio_mayoreo',  label: 'precio_mayoreo',  req: false, tipo: 'numero' },
  { key: 'cantidad_mayoreo',label: 'cantidad_mayoreo',req: false, tipo: 'entero' },
  { key: 'stock_minimo',    label: 'stock_minimo',    req: false, tipo: 'entero' },
]

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parsearCSV(texto) {
  const lineas = texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lineas.length < 2) return { headers: [], filas: [] }
  const headers = lineas[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  const filas = lineas.slice(1).map(l => {
    const vals = l.split(',')
    const obj = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim() })
    return obj
  }).filter(f => Object.values(f).some(v => v !== ''))
  return { headers, filas }
}

function validarFila(fila, idx) {
  const errores = []
  if (!fila.nombre?.trim()) errores.push('Nombre requerido')
  const pv = parseFloat(fila.precio_venta)
  if (isNaN(pv) || pv <= 0) errores.push('Precio de venta inválido')
  const pc = parseFloat(fila.precio_compra)
  if (fila.precio_compra && !isNaN(pc) && pc < 0) errores.push('Precio de compra inválido')
  const pm = parseFloat(fila.precio_mayoreo)
  if (fila.precio_mayoreo && !isNaN(pm) && pm > 0) {
    if (!isNaN(pc) && pc > 0 && pm <= pc) errores.push('Precio mayoreo debe ser mayor al de compra')
    if (!isNaN(pv) && pv > 0 && pm >= pv) errores.push('Precio mayoreo debe ser menor al de venta')
  }
  return errores
}

function mapearFila(fila, empresaId) {
  return {
    empresa_id:       empresaId,
    nombre:           fila.nombre.trim(),
    categoria:        fila.categoria?.trim() || null,
    precio_compra:    parseFloat(fila.precio_compra) || 0,
    precio_venta:     parseFloat(fila.precio_venta) || 0,
    precio_mayoreo:   parseFloat(fila.precio_mayoreo) || 0,
    cantidad_mayoreo: parseInt(fila.cantidad_mayoreo) || null,
    stock_minimo:     parseInt(fila.stock_minimo) ?? 10,
    activo:           true,
  }
}

function generarPlantilla() {
  const header = COLUMNAS.map(c => c.label).join(',')
  const ejemplo = [
    'Paracetamol 500mg,Analgésicos,8.00,15.00,12.00,10,20',
    'Omeprazol 20mg,Gastroenterología,12.00,22.00,,, 15',
    'Ibuprofeno 400mg,Analgésicos,7.50,14.00,11.00,6,25',
  ].join('\n')
  return `${header}\n${ejemplo}`
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function ModalImportarCSV({ onClose, onExito }) {
  const { empresa, perfil } = useApp()
  const fileRef = useRef(null)
  const [paso, setPaso]           = useState('upload') // upload | preview | importando | listo
  const [filas, setFilas]         = useState([])       // { ...data, _errores: [] }
  const [importados, setImportados] = useState(0)
  const [cargando, setCargando]   = useState(false)

  const filasValidas   = filas.filter(f => f._errores.length === 0)
  const filasInvalidas = filas.filter(f => f._errores.length > 0)

  function descargarPlantilla() {
    const csv  = generarPlantilla()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'plantilla_productos.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  function procesarArchivo(file) {
    if (!file) return
    if (!file.name.endsWith('.csv')) { toast.error('Solo se aceptan archivos .csv'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const { headers, filas: rawFilas } = parsearCSV(e.target.result)
      if (!headers.includes('nombre') || !headers.includes('precio_venta')) {
        toast.error('El CSV no tiene las columnas requeridas: nombre, precio_venta')
        return
      }
      const procesadas = rawFilas.map((f, i) => ({
        ...f,
        _errores: validarFila(f, i),
      }))
      setFilas(procesadas)
      setPaso('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function importar() {
    if (filasValidas.length === 0) return
    setCargando(true)
    setPaso('importando')
    try {
      const rows = filasValidas.map(f => mapearFila(f, empresa.id))
      // Insertar en lotes de 50
      const LOTE = 50
      let total = 0
      for (let i = 0; i < rows.length; i += LOTE) {
        const lote = rows.slice(i, i + LOTE)
        const { error } = await supabase.from('productos').insert(lote)
        if (error) throw error
        total += lote.length
        setImportados(total)
      }
      await logBitacora({
        empresa_id:  empresa?.id,
        tipo:        'producto_creado',
        descripcion: `Importación CSV: ${total} producto${total !== 1 ? 's' : ''} creados`,
        usuario_id:  perfil?.id ?? null,
      })
      setPaso('listo')
      setImportados(total)
    } catch (err) {
      toast.error(err.message || 'Error al importar')
      setPaso('preview')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !cargando && onClose()} />
      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Upload className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Importar productos</h3>
              <p className="text-xs text-slate-500">
                {paso === 'upload' ? 'Sube un archivo CSV' :
                 paso === 'preview' ? `${filas.length} filas encontradas — ${filasValidas.length} válidas` :
                 paso === 'importando' ? `Importando ${importados} de ${filasValidas.length}...` :
                 `¡${importados} productos importados!`}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={cargando}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── PASO: Upload ── */}
          {paso === 'upload' && (
            <>
              {/* Zona de drop / click */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); procesarArchivo(e.dataTransfer.files[0]) }}
                className="border-2 border-dashed border-slate-300 rounded-3xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary-400 hover:bg-primary-50/30 transition-all"
              >
                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <FileText className="w-7 h-7 text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">Arrastra tu CSV aquí o haz clic para seleccionar</p>
                  <p className="text-xs text-slate-400 mt-1">Solo archivos .csv</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => procesarArchivo(e.target.files[0])} />
              </div>

              {/* Formato requerido */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-xs font-bold text-slate-700 mb-2">Columnas del CSV</p>
                <div className="flex flex-wrap gap-2">
                  {COLUMNAS.map(c => (
                    <span key={c.key} className={cn(
                      'text-[11px] font-mono px-2 py-1 rounded-lg border',
                      c.req ? 'bg-primary-50 border-primary-200 text-primary-700 font-bold' : 'bg-slate-100 border-slate-200 text-slate-500'
                    )}>
                      {c.label}{c.req ? ' *' : ''}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">* obligatorio · El orden de las columnas debe coincidir exactamente</p>
              </div>

              <button onClick={descargarPlantilla}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">
                <Download className="w-4 h-4" /> Descargar plantilla de ejemplo
              </button>
            </>
          )}

          {/* ── PASO: Preview ── */}
          {paso === 'preview' && (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-900">{filas.length}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Total leídas</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{filasValidas.length}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Listas para importar</p>
                </div>
                <div className={cn('border rounded-2xl p-3 text-center', filasInvalidas.length > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200')}>
                  <p className={cn('text-2xl font-bold', filasInvalidas.length > 0 ? 'text-red-700' : 'text-slate-400')}>{filasInvalidas.length}</p>
                  <p className={cn('text-xs mt-0.5', filasInvalidas.length > 0 ? 'text-red-500' : 'text-slate-400')}>Con errores</p>
                </div>
              </div>

              {/* Filas con error */}
              {filasInvalidas.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {filasInvalidas.length} fila{filasInvalidas.length !== 1 ? 's' : ''} con errores (se omitirán)
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {filasInvalidas.map((f, i) => (
                      <div key={i} className="text-xs text-red-700">
                        <span className="font-semibold">{f.nombre || `Fila ${i + 1}`}:</span> {f._errores.join(' · ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Preview tabla de válidas */}
              {filasValidas.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                    <p className="text-xs font-bold text-slate-600">Vista previa — primeras 10 filas válidas</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50/50">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Nombre</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-500">Categoría</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Compra</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Venta</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Mayoreo</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-500">Mín.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filasValidas.slice(0, 10).map((f, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800 truncate max-w-[180px]">{f.nombre}</td>
                            <td className="px-3 py-2 text-slate-500">{f.categoria || '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{f.precio_compra ? formatoMoneda(f.precio_compra) : '—'}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">{formatoMoneda(f.precio_venta)}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{f.precio_mayoreo ? formatoMoneda(f.precio_mayoreo) : '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{f.stock_minimo || '10'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filasValidas.length > 10 && (
                    <p className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">
                      +{filasValidas.length - 10} productos más
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── PASO: Importando ── */}
          {paso === 'importando' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-700">Importando productos...</p>
                <p className="text-xs text-slate-400 mt-1">{importados} de {filasValidas.length}</p>
              </div>
              {/* Barra progreso */}
              <div className="w-48 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${filasValidas.length > 0 ? (importados / filasValidas.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          {/* ── PASO: Listo ── */}
          {paso === 'listo' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" strokeWidth={2.5} />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-slate-900">{importados} producto{importados !== 1 ? 's' : ''} importado{importados !== 1 ? 's' : ''}</p>
                <p className="text-sm text-slate-500 mt-1">Ya están disponibles en el catálogo</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
          {paso === 'upload' && (
            <Button variante="secundario" className="flex-1" onClick={onClose}>Cancelar</Button>
          )}
          {paso === 'preview' && (
            <>
              <Button variante="secundario" className="flex-1" onClick={() => { setPaso('upload'); setFilas([]) }}>
                Cambiar archivo
              </Button>
              <Button className="flex-[2]" onClick={importar} disabled={filasValidas.length === 0}>
                <Package className="w-4 h-4 mr-1.5" />
                Importar {filasValidas.length} producto{filasValidas.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
          {paso === 'listo' && (
            <Button className="flex-1" onClick={() => { onExito?.(); onClose() }}>
              <Check className="w-4 h-4 mr-1.5" /> Listo
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
