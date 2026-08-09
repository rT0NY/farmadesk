import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Package, Barcode, Trash2, Store, AlertTriangle, AlertCircle, Layers,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizar, sanitizarNum, sanitizarEntero } from '@/lib/sanitizar'
import { Modal, ModalHeader, ModalFooter } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chips } from '@/components/ui/Chips'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda } from '@/lib/formatos'
import { cn } from '@/lib/clases'
import { MAX_FILAS, emparejarPrecios } from './reglasMasivas'
import { SelectCategoria, PopupSucursales, PopupMayoreo } from './piezasMasivas'

const filaNueva = (uid, sucursalesIniciales = []) => ({
  uid,
  nombre: '',
  codigos: [],
  categoria: '',
  precio_compra: '',
  utilidad: '',              // ayuda de captura, no se guarda en la base
  precio_venta: '',
  stock_minimo: '10',
  sucursales: sucursalesIniciales,
  mayoreo: null,             // null = desactivado; { precio, cantidad }
})

// Una fila cuenta como "capturada" en cuanto tiene cualquier dato propio. Las
// sucursales no cuentan: vienen marcadas por defecto y sin esto toda fila
// nueva pareceria llena.
const tieneContenido = (f) =>
  !!(sanitizar(f.nombre) || f.codigos.length || f.categoria ||
     f.precio_compra || f.precio_venta || f.mayoreo)

// Mismas reglas que el alta de uno en uno (ModalProducto, validarPaso1). Si
// alguna cambia alla, tiene que cambiar aqui: son el mismo producto.
function validarFila(f) {
  const errores = []
  const avisos  = []

  if (!sanitizar(f.nombre))   errores.push('falta el nombre')
  if (!f.codigos.length)      errores.push('falta el código de barras')
  if (!f.categoria)           errores.push('falta la categoría')

  const pc = sanitizarNum(f.precio_compra)
  const pv = sanitizarNum(f.precio_venta)
  if (!(pc > 0)) errores.push('falta el precio de compra')
  if (!(pv > 0)) errores.push('falta el precio de venta')

  // sanitizarEntero('') devuelve 0, asi que el vacio se revisa sobre el texto
  if (String(f.stock_minimo).trim() === '') errores.push('falta el stock mínimo')

  if (!f.sucursales.length) errores.push('falta elegir sucursal')

  if (f.mayoreo) {
    const pm   = sanitizarNum(f.mayoreo.precio)
    const cant = sanitizarEntero(f.mayoreo.cantidad)
    if (!(pm > 0))                 errores.push('falta el precio de mayoreo')
    else if (pc > 0 && pm <= pc)   errores.push('el mayoreo debe ser mayor al precio de compra')
    else if (pv > 0 && pm >= pv)   errores.push('el mayoreo debe ser menor al precio de venta')
    if (cant < 1)                  errores.push('falta la cantidad mínima de mayoreo')
  }

  // Vender por debajo del costo se permite a proposito — a veces es
  // intencional. Igual que en el alta de uno en uno: avisa, no bloquea.
  if (pc > 0 && pv > 0 && pv < pc) avisos.push('el precio de venta es menor al de compra')

  return { errores, avisos }
}

// ── Ventana principal ────────────────────────────────────────────────────────
// El padre monta esta ventana solo cuando se abre. Eso importa: al montarse,
// las sucursales de la empresa ya estan cargadas en el contexto, asi que cada
// fila puede nacer con todas marcadas sin tener que rellenarlas despues.
export default function ModalIngresoMasivo({ onCerrar, onExito }) {
  const { sucursales, empresa } = useApp()
  const todasLasSucursales = useMemo(() => sucursales.map(s => s.id), [sucursales])

  const [filas, setFilas] = useState(() => [0, 1, 2].map(i => filaNueva(i, todasLasSucursales)))
  const [guardando, setGuardando] = useState(false)
  // codigo -> nombre del producto que ya lo tiene. Se llena tras consultar la
  // base al intentar registrar.
  const [ocupados, setOcupados] = useState({})
  const [popup, setPopup] = useState(null)   // { tipo: 'sucursales'|'mayoreo', uid }

  // `campo` solo se manda desde las tres celdas de precio, para saber cuál de
  // las dos —utilidad o precio de venta— hay que recalcular.
  const actualizar = (uid, cambios, campo = null) => {
    setFilas(prev => {
      const base = prev.map(f => {
        if (f.uid !== uid) return f
        const tocada = { ...f, ...cambios }
        return campo ? emparejarPrecios(tocada, campo) : tocada
      })
      const ultima = base[base.length - 1]
      if (ultima && tieneContenido(ultima) && base.length < MAX_FILAS) {
        const siguienteUid = Math.max(-1, ...base.map(f => f.uid)) + 1
        return [...base, filaNueva(siguienteUid, todasLasSucursales)]
      }
      return base
    })
    // Un codigo corregido deja de estar "ocupado" hasta la proxima consulta
    if (cambios.codigos) setOcupados({})
  }

  const borrarFila = (uid) => {
    setFilas(prev => {
      const quedan = prev.filter(f => f.uid !== uid)
      // Nunca dejar la tabla sin ninguna fila donde escribir
      return quedan.length ? quedan : [filaNueva(0, todasLasSucursales)]
    })
  }

  // Analisis vivo: alimenta los colores de la tabla y la lista de errores del
  // pie. Se recalcula en cada tecla, sin tocar la red.
  const analisis = useMemo(() => {
    const porFila = filas.map((f, i) => ({
      uid:    f.uid,
      numero: i + 1,
      vacia:  !tieneContenido(f),
      ...validarFila(f),
    }))

    // Repetidos dentro de la misma tanda: la base los rechazaria uno por uno,
    // mejor verlos antes de mandar nada.
    const vistos = new Map()
    filas.forEach((f, i) => {
      if (porFila[i].vacia) return
      f.codigos.forEach(c => {
        if (vistos.has(c)) porFila[i].errores.push(`el código ${c} se repite en la fila ${vistos.get(c) + 1}`)
        else vistos.set(c, i)
      })
    })

    // Ya usados por otro producto de la empresa
    filas.forEach((f, i) => {
      if (porFila[i].vacia) return
      f.codigos.forEach(c => {
        if (ocupados[c]) porFila[i].errores.push(`el código ${c} ya es de "${ocupados[c]}"`)
      })
    })

    return porFila
  }, [filas, ocupados])

  const usadas    = analisis.filter(a => !a.vacia)
  const conError  = usadas.filter(a => a.errores.length)
  const conAviso  = usadas.filter(a => !a.errores.length && a.avisos.length)
  const listas    = usadas.filter(a => !a.errores.length)

  const cerrar = () => {
    if (guardando) return
    onCerrar?.()   // al desmontarse la ventana se lleva su estado; no hay que limpiarlo
  }

  const registrar = async () => {
    if (!usadas.length)  { toast.error('Captura al menos un producto'); return }
    if (conError.length) { toast.error(`Hay ${conError.length} fila${conError.length > 1 ? 's' : ''} con errores`); return }
    if (!empresa?.id)    { toast.error('No se pudo identificar la empresa'); return }

    setGuardando(true)
    try {
      const paraGuardar = filas.filter(f => tieneContenido(f))
      const codigos = paraGuardar.flatMap(f => f.codigos)

      // Petición 1: los códigos de toda la tanda de una vez. Va antes de
      // escribir nada para que los choques salgan con su número de fila y se
      // corrijan sin haber creado nada a medias.
      const { data: yaExisten, error: errCodigos } = await supabase
        .from('codigos_barras')
        .select('codigo, productos(nombre)')
        .in('codigo', codigos)

      if (!errCodigos && yaExisten?.length) {
        const mapa = {}
        yaExisten.forEach(c => { mapa[c.codigo] = c.productos?.nombre ?? 'otro producto' })
        setOcupados(mapa)
        toast.error('Hay códigos de barras que ya pertenecen a otros productos')
        return
      }

      // Petición 2: los productos completos en una sola llamada. El ciclo
      // ocurre dentro de la base y en una sola transacción: o entran todos o
      // no entra ninguno, nunca la mitad.
      const { data, error } = await supabase.rpc('crear_productos_masivo', {
        p_productos: paraGuardar.map(f => ({
          nombre:           sanitizar(f.nombre).toUpperCase(),
          categoria:        sanitizar(f.categoria),
          codigos:          f.codigos,
          precio_compra:    sanitizarNum(f.precio_compra),
          precio_venta:     sanitizarNum(f.precio_venta),
          precio_mayoreo:   f.mayoreo ? sanitizarNum(f.mayoreo.precio) : 0,
          cantidad_mayoreo: f.mayoreo ? sanitizarEntero(f.mayoreo.cantidad) : null,
          stock_minimo:     sanitizarEntero(f.stock_minimo),
          sucursales:       f.sucursales,
        })),
      })
      if (error) throw error

      const creados = data?.creados ?? paraGuardar.length
      toast.success(`${creados} producto${creados > 1 ? 's' : ''} registrado${creados > 1 ? 's' : ''}`)
      onExito?.()
      cerrar()
    } catch (e) {
      toast.error(e.message ?? 'No se pudieron registrar los productos')
    } finally {
      setGuardando(false)
    }
  }

  const filaPopup = popup ? filas.find(f => f.uid === popup.uid) : null

  return (
    <>
      {/* Sin cierre al tocar fuera: aqui puede haber hasta 50 productos
          capturados a mano y un clic distraido los borraria todos. Se sale por
          la X o por Cancelar. */}
      <Modal onClose={cerrar} maxWidth="sm:max-w-[95vw] lg:sm:max-w-7xl" cerrarAlTocarFuera={false}>
        <ModalHeader
          titulo="Ingreso masivo"
          subtitulo={`Máximo ${MAX_FILAS} productos por registro · ${usadas.length}/${MAX_FILAS} capturados`}
          onClose={cerrar}
        />

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="text-xs font-semibold text-slate-500 text-left">
                <th className="w-10 px-2 py-2.5 border-b border-slate-200 text-center">#</th>
                <th className="min-w-[180px] px-2 py-2.5 border-b border-slate-200">Nombre *</th>
                <th className="min-w-[190px] px-2 py-2.5 border-b border-slate-200">Códigos de barras *</th>
                <th className="min-w-[160px] px-2 py-2.5 border-b border-slate-200">Categoría *</th>
                <th className="w-28 px-2 py-2.5 border-b border-slate-200">Compra *</th>
                <th className="w-24 px-2 py-2.5 border-b border-slate-200">Utilidad</th>
                <th className="w-28 px-2 py-2.5 border-b border-slate-200">Venta *</th>
                <th className="w-24 px-2 py-2.5 border-b border-slate-200">Stock mín. *</th>
                <th className="w-36 px-2 py-2.5 border-b border-slate-200">Sucursales *</th>
                <th className="w-36 px-2 py-2.5 border-b border-slate-200">Mayoreo</th>
                <th className="w-10 px-2 py-2.5 border-b border-slate-200" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const est   = analisis[i]
                const malo  = est.errores.length > 0
                const aviso = !malo && est.avisos.length > 0
                const pc    = sanitizarNum(f.precio_compra)
                const pv    = sanitizarNum(f.precio_venta)
                const bajoCosto = pc > 0 && pv > 0 && pv < pc

                return (
                  <tr
                    key={f.uid}
                    id={`fila-masiva-${est.numero}`}
                    className={cn(
                      'align-top transition-colors',
                      malo  && 'bg-red-50/40',
                      aviso && 'bg-amber-50/40'
                    )}
                  >
                    <td className="px-2 py-2 border-b border-slate-100 text-center text-xs font-semibold text-slate-400">
                      {est.numero}
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <input
                        value={f.nombre}
                        onChange={e => actualizar(f.uid, { nombre: e.target.value.toUpperCase() })}
                        placeholder="Ej. PARACETAMOL 500MG"
                        className="w-full h-10 px-3 rounded-xl border border-transparent bg-slate-100/70 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white transition-all"
                      />
                    </td>

                    {/* Mismo componente que el alta de uno en uno: la pistola
                        teclea el codigo y manda Enter, y queda como etiqueta.
                        Admite varios codigos por producto. */}
                    <td className="px-2 py-2 border-b border-slate-100">
                      <Chips
                        valores={f.codigos}
                        onChange={c => actualizar(f.uid, { codigos: c })}
                        placeholder="Escanear o escribir y Enter"
                        iconoChip={<Barcode className="w-3 h-3" />}
                      />
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <SelectCategoria
                        valor={f.categoria}
                        invalido={!est.vacia && !f.categoria}
                        onChange={c => actualizar(f.uid, { categoria: c })}
                      />
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <input
                        value={f.precio_compra}
                        inputMode="decimal"
                        onChange={e => /^\d*\.?\d*$/.test(e.target.value) && actualizar(f.uid, { precio_compra: e.target.value }, 'precio_compra')}
                        placeholder="0.00"
                        className="w-full h-10 px-3 rounded-xl border border-transparent bg-slate-100/70 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white transition-all"
                      />
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <div className="relative">
                        <input
                          value={f.utilidad}
                          inputMode="decimal"
                          onChange={e => /^\d*\.?\d*$/.test(e.target.value) && actualizar(f.uid, { utilidad: e.target.value }, 'utilidad')}
                          placeholder="30"
                          className="w-full h-10 pl-3 pr-6 rounded-xl border border-transparent bg-slate-100/70 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white transition-all"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
                      </div>
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <input
                        value={f.precio_venta}
                        inputMode="decimal"
                        onChange={e => /^\d*\.?\d*$/.test(e.target.value) && actualizar(f.uid, { precio_venta: e.target.value }, 'precio_venta')}
                        placeholder="0.00"
                        className={cn(
                          'w-full h-10 px-3 rounded-xl border text-sm text-right transition-all',
                          'focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white',
                          bajoCosto
                            ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                            : 'bg-slate-100/70 border-transparent'
                        )}
                      />
                      {bajoCosto && (
                        <p className="mt-1 flex items-start gap-1 text-[10px] leading-tight text-red-600 font-medium">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-px" />
                          Menor al precio de compra ({formatoMoneda(pc)})
                        </p>
                      )}
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <input
                        value={f.stock_minimo}
                        inputMode="numeric"
                        onChange={e => /^\d*$/.test(e.target.value) && actualizar(f.uid, { stock_minimo: e.target.value })}
                        placeholder="10"
                        className="w-full h-10 px-3 rounded-xl border border-transparent bg-slate-100/70 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white transition-all"
                      />
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      {sucursales.length <= 1 ? (
                        <span className="inline-flex items-center gap-1.5 h-10 px-3 text-xs text-slate-500">
                          <Store className="w-3.5 h-3.5 text-slate-400" />
                          {sucursales[0]?.nombre ?? '—'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPopup({ tipo: 'sucursales', uid: f.uid })}
                          className={cn(
                            'w-full h-10 px-3 rounded-xl text-xs font-medium text-left transition-colors',
                            'flex items-center gap-1.5',
                            f.sucursales.length
                              ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                              : 'bg-slate-100/70 text-slate-400 hover:bg-slate-100'
                          )}
                        >
                          <Store className="w-3.5 h-3.5 flex-shrink-0" />
                          {f.sucursales.length
                            ? `${f.sucursales.length} seleccionada${f.sucursales.length > 1 ? 's' : ''}`
                            : 'Seleccionar'}
                        </button>
                      )}
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <button
                        type="button"
                        onClick={() => setPopup({ tipo: 'mayoreo', uid: f.uid })}
                        className={cn(
                          'w-full h-10 px-3 rounded-xl text-xs font-medium text-left transition-colors',
                          'flex items-center gap-1.5',
                          f.mayoreo
                            ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                            : 'bg-slate-100/70 text-slate-400 hover:bg-slate-100'
                        )}
                      >
                        <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                        {f.mayoreo
                          ? `${formatoMoneda(sanitizarNum(f.mayoreo.precio))} · ${f.mayoreo.cantidad}+`
                          : 'Activar'}
                      </button>
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100 text-center">
                      <button
                        type="button"
                        onClick={() => borrarFila(f.uid)}
                        title="Vaciar esta fila"
                        className="p-2 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {usadas.length >= MAX_FILAS && (
            <p className="px-4 py-3 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
              Llegaste al máximo de {MAX_FILAS} productos. Regístralos y continúa con los siguientes.
            </p>
          )}
        </div>

        <ModalFooter>
          {/* Los problemas van con su numero de fila para no tener que buscarlos
              celda por celda. Al hacer clic, la tabla se desplaza a esa fila. */}
          {(conError.length > 0 || conAviso.length > 0) && (
            <div className="mb-3 max-h-28 overflow-y-auto space-y-1">
              {conError.map(a => (
                <button
                  key={`e-${a.uid}`}
                  type="button"
                  onClick={() => document.getElementById(`fila-masiva-${a.numero}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="w-full flex items-start gap-1.5 text-left text-xs text-red-700 hover:underline"
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  <span><b>Fila {a.numero}:</b> {a.errores.join(' · ')}</span>
                </button>
              ))}
              {conAviso.map(a => (
                <button
                  key={`a-${a.uid}`}
                  type="button"
                  onClick={() => document.getElementById(`fila-masiva-${a.numero}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="w-full flex items-start gap-1.5 text-left text-xs text-amber-700 hover:underline"
                >
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  <span><b>Fila {a.numero}:</b> {a.avisos.join(' · ')}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-emerald-600">{listas.length}</span> listo{listas.length !== 1 ? 's' : ''}
              {' · '}
              <span className="font-semibold text-amber-600">{conAviso.length}</span> aviso{conAviso.length !== 1 ? 's' : ''}
              {' · '}
              <span className="font-semibold text-red-600">{conError.length}</span> con error
            </p>
            <div className="flex gap-2">
              <Button variante="secundario" onClick={cerrar} disabled={guardando}>Cancelar</Button>
              <Button
                onClick={registrar}
                cargando={guardando}
                disabled={guardando || listas.length === 0 || conError.length > 0}
                iconoIzq={<Package className="w-4 h-4" />}
              >
                Registrar {listas.length > 0 ? listas.length : ''} producto{listas.length !== 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        </ModalFooter>
      </Modal>

      {popup?.tipo === 'sucursales' && filaPopup && (
        <PopupSucursales
          sucursales={sucursales}
          seleccionadas={filaPopup.sucursales}
          onCerrar={() => setPopup(null)}
          onConfirmar={(sel) => { actualizar(popup.uid, { sucursales: sel }); setPopup(null) }}
        />
      )}

      {popup?.tipo === 'mayoreo' && filaPopup && (
        <PopupMayoreo
          valor={filaPopup.mayoreo}
          precioCompra={filaPopup.precio_compra}
          precioVenta={filaPopup.precio_venta}
          onCerrar={() => setPopup(null)}
          onQuitar={() => { actualizar(popup.uid, { mayoreo: null }); setPopup(null) }}
          onConfirmar={(v) => { actualizar(popup.uid, { mayoreo: v }); setPopup(null) }}
        />
      )}
    </>
  )
}
