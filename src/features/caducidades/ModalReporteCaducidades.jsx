import { useState } from 'react'
import { toast } from 'sonner'
import { Timer, Store, FileText, Check, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginado'
import { useApp } from '@/context/AppCtx'
import { fechaEnZona, addDias, formatoMoneda } from '@/lib/formatos'
import { imprimirDocumento, envolverDocumento, esc } from '@/lib/documento'
import { Modal, ModalHeader, ModalFooter } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/clases'

const RANGOS = [
  { dias: 30,  etiqueta: '30 días'  },
  { dias: 60,  etiqueta: '60 días'  },
  { dias: 90,  etiqueta: '90 días'  },
  { dias: 180, etiqueta: '6 meses'  },
]

// Copiado del asistente de Agregar inventario en vez de extraerlo a un archivo
// común: sacarlo de ahí obliga a editar una ventana que se usa a diario, y el
// beneficio sería solo no repetir veinte líneas. Queda pendiente unificarlos.
function PasoIndicador({ pasos, actual }) {
  return (
    <div className="flex items-center px-5 py-3 border-b border-slate-100">
      {pasos.map((p, i) => {
        const hecho  = actual > p.num
        const activo = actual === p.num
        return (
          <div key={p.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                hecho ? 'bg-emerald-500 text-white'
                      : activo ? 'bg-primary-600 text-white'
                               : 'bg-slate-200 text-slate-500'
              )}>
                {hecho ? <Check className="w-4 h-4" /> : p.num}
              </div>
              <span className={cn(
                'text-[10px] font-semibold',
                activo ? 'text-primary-700' : hecho ? 'text-emerald-600' : 'text-slate-400'
              )}>{p.label}</span>
            </div>
            {i < pasos.length - 1 && (
              <div className={cn('h-0.5 flex-1 mx-2 rounded-full transition-all',
                hecho ? 'bg-emerald-500' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Armado de la hoja ────────────────────────────────────────────────────────

// Anclada al mediodía UTC: una fecha suelta la interpreta JavaScript como
// medianoche UTC y en horario de México retrocede un día. Ya nos pasó con las
// caducidades en pantalla.
const fechaLarga = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('es-MX',
    { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

function construirHtml({ empresaNombre, titulo, filas, resumen, meta, conCosto, agrupado, sinLotes }) {
  const columnas = () => `
    <thead><tr>
      <th class="casilla"></th>
      <th>Producto</th>
      <th>Lote</th>
      <th class="num">Caduca</th>
      <th class="num">Días</th>
      <th class="num">Cant.</th>
      ${conCosto ? '<th class="num">Costo</th>' : ''}
    </tr></thead>`

  const renglon = (f) => `
    <tr>
      <td class="casilla"><span></span></td>
      <td${f.dias < 0 ? ' class="vencido"' : ''}>${esc(f.producto)}</td>
      <td class="mono">${esc(f.lote)}</td>
      <td class="num">${fechaLarga(f.fecha)}</td>
      <td class="num${f.dias < 0 ? ' vencido' : ''}">${f.dias >= 0 ? '+' : ''}${f.dias}</td>
      <td class="num">${f.cantidad}</td>
      ${conCosto ? `<td class="num">${formatoMoneda(f.costo)}</td>` : ''}
    </tr>`

  const bloque = (nombre, lista) => {
    const uds   = lista.reduce((s, f) => s + f.cantidad, 0)
    const costo = lista.reduce((s, f) => s + f.costo, 0)
    // El subtotal solo tiene sentido cuando hay varias secciones que cuadrar.
    // Con una sola sucursal repetiría exactamente el total del resumen.
    const conSubtotal = agrupado
    return `
    <div class="doc-grupo">
      ${nombre ? `<div class="doc-seccion">${esc(nombre)} — ${lista.length} lote${lista.length !== 1 ? 's' : ''} · ${uds} uds</div>` : ''}
      <table>
        ${columnas()}
        <tbody>
          ${lista.map(renglon).join('')}
          ${conSubtotal ? `
          <tr class="doc-subtotal">
            <td colspan="5">Subtotal</td>
            <td class="num">${uds}</td>
            ${conCosto ? `<td class="num">${formatoMoneda(costo)}</td>` : ''}
          </tr>` : ''}
        </tbody>
      </table>
    </div>`
  }

  const grupos = agrupado
    ? [...new Map(filas.map(f => [f.sucursalId, f.sucursalNombre])).entries()]
        .map(([id, nombre]) => bloque(nombre, filas.filter(f => f.sucursalId === id))).join('')
    : bloque('', filas)

  const cuerpo = `
    <div class="doc-encabezado">
      <div class="doc-empresa">${esc(empresaNombre)}</div>
      <div class="doc-titulo">${esc(titulo)}</div>
      <div class="doc-alcance">Lotes con vencimiento hasta el ${fechaLarga(meta.corte)}, incluidos los ya vencidos.</div>
      <div class="doc-meta">
        <span><b>Criterio:</b> ${esc(meta.criterio)}</span>
        <span><b>Sucursales:</b> ${esc(meta.sucursales)}</span>
        <span><b>Emitido:</b> ${esc(meta.emitido)}</span>
        <span><b>Elaboró:</b> ${esc(meta.elaboro)}</span>
      </div>
    </div>

    <div class="doc-seccion">Resumen</div>
    <div class="doc-resumen">
      <table>
        <thead><tr>
          <th></th>
          <th class="num">Renglones</th>
          <th class="num">Unidades</th>
          ${conCosto ? '<th class="num">Costo</th>' : ''}
        </tr></thead>
        <tbody>
        <tr><td>Vencidos</td><td class="num">${resumen.vencidos.filas}</td><td class="num">${resumen.vencidos.uds}</td>${conCosto ? `<td class="num">${formatoMoneda(resumen.vencidos.costo)}</td>` : ''}</tr>
        <tr><td>Vencen en 30 días o menos</td><td class="num">${resumen.criticos.filas}</td><td class="num">${resumen.criticos.uds}</td>${conCosto ? `<td class="num">${formatoMoneda(resumen.criticos.costo)}</td>` : ''}</tr>
        <tr><td>Vencen después de 30 días</td><td class="num">${resumen.proximos.filas}</td><td class="num">${resumen.proximos.uds}</td>${conCosto ? `<td class="num">${formatoMoneda(resumen.proximos.costo)}</td>` : ''}</tr>
        <tr class="total"><td>Total</td><td class="num">${resumen.total.filas}</td><td class="num">${resumen.total.uds}</td>${conCosto ? `<td class="num">${formatoMoneda(resumen.total.costo)}</td>` : ''}</tr>
      </tbody></table>
      <div class="doc-nota">
        Cada renglón es un retiro: un lote presente en varias sucursales aparece
        una vez por cada una. Lotes distintos: <b>${resumen.lotesUnicos}</b>.
      </div>
    </div>
    ${sinLotes?.length ? `<div class="doc-aviso">Sin lotes por vencer en: ${esc(sinLotes.join(', '))}</div>` : ''}

    ${grupos}

    <div class="doc-cierre">
      <div class="doc-firma">
        <span>Revisó ______________________________</span>
        <span>Fecha ____________________</span>
      </div>
      <div class="doc-pie">Documento generado por Farmadesk · ${esc(meta.emitido)}</div>
    </div>`

  return envolverDocumento({ titulo, cuerpo })
}

// ─── Ventana ──────────────────────────────────────────────────────────────────

export default function ModalReporteCaducidades({ abierto, onCerrar }) {
  const { empresa, sucursales, tz, perfil, sucursalActiva } = useApp()

  const esCajero = perfil?.rol === 'cajero'
  const sucursalPropia = esCajero
    ? (sucursalActiva ?? sucursales.find(s => s.id === perfil?.sucursal_id) ?? null)
    : null

  // El cajero no elige sucursal —va forzado a la suya— y una empresa de una sola
  // sucursal no tiene nada que preguntar.
  const preguntaSucursal = !esCajero && sucursales.length > 1
  // El costo es dato de admin y encargado, igual que en el punto de venta.
  const puedeVerCosto = !esCajero

  const [paso, setPaso]         = useState(1)
  const [dias, setDias]         = useState(90)
  const [sucSel, setSucSel]     = useState('')      // '' = todas
  const [conCosto, setConCosto] = useState(true)
  const [datos, setDatos]       = useState(null)
  const [cargando, setCargando] = useState(false)
  const [generando, setGenerando] = useState(false)

  const pasos = preguntaSucursal
    ? [{ num: 1, label: 'Rango' }, { num: 2, label: 'Sucursal' }, { num: 3, label: 'Generar' }]
    : [{ num: 1, label: 'Rango' }, { num: 2, label: 'Generar' }]

  const pasoFinal = preguntaSucursal ? 3 : 2

  // Consulta propia, independiente de lo que haya en pantalla: el usuario pudo
  // pedir 6 meses mientras la pantalla muestra 90 días.
  async function cargarDatos() {
    setCargando(true)
    setDatos(null)
    try {
      const hoy    = fechaEnZona(tz)
      const corte  = addDias(hoy, dias)

      const cols = `id, codigo_lote, fecha_caducidad, producto_id, productos(nombre, categoria${puedeVerCosto ? ', precio_compra' : ''})`

      const lotes = await traerTodo(() => supabase.from('lotes'), cols,
        q => q.eq('empresa_id', empresa.id)
              .eq('activo', true)
              .not('fecha_caducidad', 'is', null)
              .lte('fecha_caducidad', corte))

      const inv = await traerTodo(() => supabase.from('inventario'),
        'id, lote_id, cantidad, sucursal_id',
        q => q.eq('empresa_id', empresa.id).gt('cantidad', 0))

      const porLote = new Map(lotes.map(l => [l.id, l]))
      const sucFiltro = esCajero ? sucursalPropia?.id : (sucSel || null)

      // Una fila por lote y sucursal: el documento sirve para bajar producto del
      // anaquel, y cada sucursal baja el suyo.
      const filas = inv
        .filter(i => porLote.has(i.lote_id))
        .filter(i => !sucFiltro || i.sucursal_id === sucFiltro)
        .map(i => {
          const l = porLote.get(i.lote_id)
          const d = Math.round(
            (new Date(l.fecha_caducidad + 'T12:00:00Z') - new Date(hoy + 'T12:00:00Z')) / 86400000
          )
          return {
            loteId:         i.lote_id,
            sucursalId:     i.sucursal_id,
            sucursalNombre: sucursales.find(s => s.id === i.sucursal_id)?.nombre ?? '—',
            producto:  l.productos?.nombre ?? '—',
            lote:      l.codigo_lote ?? '—',
            fecha:     l.fecha_caducidad,
            dias:      d,
            cantidad:  Number(i.cantidad || 0),
            costo:     Number(i.cantidad || 0) * Number(l.productos?.precio_compra || 0),
          }
        })
        .sort((a, b) =>
          a.sucursalNombre.localeCompare(b.sucursalNombre) ||
          a.fecha.localeCompare(b.fecha))

      // Se cuentan RENGLONES, no lotes: un mismo lote en tres sucursales son
      // tres retiros distintos. Llamarlos "lotes" decía 17 donde había 9.
      const acumular = (lista) => ({
        filas: lista.length,
        uds:   lista.reduce((s, f) => s + f.cantidad, 0),
        costo: lista.reduce((s, f) => s + f.costo, 0),
      })

      // Sucursales habilitadas que no tuvieron ningún lote por vencer. Sirve
      // para que el documento afirme que se revisaron, en vez de callar.
      const conLotes = new Set(filas.map(f => f.sucursalId))
      const sinLotes = sucFiltro
        ? []
        : sucursales.filter(s => !conLotes.has(s.id)).map(s => s.nombre)

      setDatos({
        filas,
        corte,
        sinLotes,
        resumen: {
          vencidos: acumular(filas.filter(f => f.dias <  0)),
          criticos: acumular(filas.filter(f => f.dias >= 0 && f.dias <= 30)),
          proximos: acumular(filas.filter(f => f.dias >  30)),
          total:    acumular(filas),
          // Por identificador y no por codigo: en Farmacias GI trece productos
          // distintos comparten el codigo L-202608-100, y contarlos como uno solo
          // daba 25 donde habia 38.
          lotesUnicos: new Set(filas.map(f => f.loteId)).size,
        },
      })
    } catch (e) {
      console.error('Reporte de caducidades:', e)
      toast.error('No se pudieron cargar los datos del reporte.')
      setDatos({ filas: [], corte: null, resumen: null })
    } finally {
      setCargando(false)
    }
  }

  function siguiente() {
    const proximo = paso + 1
    setPaso(proximo)
    if (proximo === pasoFinal) cargarDatos()
  }

  function generar() {
    if (!datos?.filas.length) return
    setGenerando(true)

    const ahora = new Date()
    const nombreSuc = esCajero
      ? (sucursalPropia?.nombre ?? '—')
      : sucSel ? (sucursales.find(s => s.id === sucSel)?.nombre ?? '—') : 'Todas'

    const html = construirHtml({
      empresaNombre: empresa?.nombre ?? 'Farmadesk',
      titulo: 'Control de caducidades',
      filas: datos.filas,
      resumen: datos.resumen,
      sinLotes: datos.sinLotes,
      conCosto: puedeVerCosto && conCosto,
      // Agrupado solo cuando hay varias sucursales en la hoja; con una sola,
      // encabezarla con su nombre repetido sería ruido.
      agrupado: nombreSuc === 'Todas' && sucursales.length > 1,
      meta: {
        corte:      datos.corte,
        criterio:   RANGOS.find(r => r.dias === dias)?.etiqueta ?? `${dias} días`,
        sucursales: nombreSuc,
        emitido:    ahora.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' }),
        elaboro:    perfil?.nombre ?? '—',
      },
    })

    const { ok, motivo } = imprimirDocumento(html)
    setGenerando(false)

    if (!ok) {
      toast.error('No se pudo abrir el documento', {
        description: motivo === 'bloqueado'
          ? 'El navegador bloqueó la ventana. Permite ventanas emergentes para este sitio e intenta de nuevo.'
          : 'Ocurrió un error al preparar el documento.',
        duration: 8000,
      })
      return
    }
    onCerrar()
  }

  if (!abierto) return null

  const hojas = datos?.filas.length ? Math.max(1, Math.ceil((datos.filas.length + 18) / 40)) : 0

  return (
    <Modal onClose={onCerrar} maxWidth="sm:max-w-lg">
      <ModalHeader
        titulo="Reporte de caducidades"
        subtitulo="Documento para imprimir o guardar como PDF"
        onClose={onCerrar}
      />

      <PasoIndicador pasos={pasos} actual={paso} />

      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* ── Paso 1: rango ── */}
        {paso === 1 && (
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-1">¿Hasta cuándo?</p>
            <p className="text-xs text-slate-400 mb-4">
              Los lotes ya vencidos se incluyen siempre, sin importar el rango.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {RANGOS.map(r => (
                <button key={r.dias} onClick={() => setDias(r.dias)}
                  className={cn(
                    'flex items-center gap-2.5 p-3.5 rounded-2xl border text-left transition-all',
                    dias === r.dias
                      ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-500/20'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}>
                  <Timer className={cn('w-4 h-4 flex-shrink-0',
                    dias === r.dias ? 'text-primary-600' : 'text-slate-400')} />
                  <span className={cn('text-sm font-semibold',
                    dias === r.dias ? 'text-primary-700' : 'text-slate-700')}>{r.etiqueta}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Paso 2: sucursal (solo si hay varias y no es cajero) ── */}
        {paso === 2 && preguntaSucursal && (
          <div>
            <p className="text-sm font-semibold text-slate-800 mb-1">¿Qué sucursal?</p>
            <p className="text-xs text-slate-400 mb-4">
              Con todas, el documento se separa por sucursal con su propio subtotal.
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={() => setSucSel('')}
                className={cn('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all',
                  sucSel === '' ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-500/20'
                                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
                <Store className={cn('w-4 h-4', sucSel === '' ? 'text-primary-600' : 'text-slate-400')} />
                <span className={cn('text-sm font-semibold',
                  sucSel === '' ? 'text-primary-700' : 'text-slate-700')}>Todas las sucursales</span>
              </button>
              {sucursales.map(s => (
                <button key={s.id} onClick={() => setSucSel(s.id)}
                  className={cn('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all',
                    sucSel === s.id ? 'border-primary-300 bg-primary-50 ring-2 ring-primary-500/20'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50')}>
                  <Store className={cn('w-4 h-4', sucSel === s.id ? 'text-primary-600' : 'text-slate-400')} />
                  <span className={cn('text-sm font-semibold',
                    sucSel === s.id ? 'text-primary-700' : 'text-slate-700')}>{s.nombre}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Paso final: confirmación ── */}
        {paso === pasoFinal && (
          <div>
            {cargando ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="w-7 h-7 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                <p className="text-sm text-slate-400">Calculando…</p>
              </div>
            ) : !datos?.filas.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <FileText className="w-8 h-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No hay nada que reportar</p>
                <p className="text-xs text-slate-400">
                  Ningún lote con existencias vence en ese rango. Prueba con un plazo mayor.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-xs text-slate-400 mb-2">Se generará un documento con</p>
                  <p className="text-lg font-bold text-slate-900">
                    {datos.filas.length} renglón{datos.filas.length !== 1 ? 'es' : ''}
                    <span className="text-slate-300"> · </span>
                    {datos.resumen.total.uds} uds
                    <span className="text-slate-300"> · </span>
                    ~{hojas} hoja{hojas !== 1 ? 's' : ''}
                  </p>
                  {datos.resumen.vencidos.lotes > 0 && (
                    <p className="text-xs font-semibold text-red-600 mt-1.5">
                      {datos.resumen.vencidos.lotes} ya vencido{datos.resumen.vencidos.lotes !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                {puedeVerCosto && (
                  <label className="flex items-start gap-3 mt-4 p-3.5 rounded-2xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input type="checkbox" checked={conCosto}
                      onChange={e => setConCosto(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-primary-600" />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Incluir valor al costo</span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        Desactívalo si vas a compartir el documento fuera de la administración.
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <ModalFooter>
        <div className="flex items-center justify-between gap-2">
          {paso > 1 ? (
            <Button variante="fantasma" onClick={() => setPaso(p => p - 1)}
              iconoIzq={<ChevronLeft className="w-4 h-4" />}>Atrás</Button>
          ) : <span />}

          <div className="flex gap-2">
            <Button variante="secundario" onClick={onCerrar}>Cancelar</Button>
            {paso < pasoFinal ? (
              <Button onClick={siguiente} iconoDer={<ChevronRight className="w-4 h-4" />}>
                Siguiente
              </Button>
            ) : (
              <Button onClick={generar}
                cargando={generando}
                disabled={cargando || !datos?.filas.length}
                iconoIzq={<Printer className="w-4 h-4" />}>
                Generar PDF
              </Button>
            )}
          </div>
        </div>
      </ModalFooter>
    </Modal>
  )
}
