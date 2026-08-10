import { useState, useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Barcode, Store, Layers, Search, X, Check,
  AlertTriangle, AlertCircle, ChevronLeft, PencilLine,
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

// Arma la fila editable a partir del producto tal como está en la base. La
// utilidad no se guarda en ningún lado, se deduce de los dos precios — igual
// que hace la ventana de editar producto al abrirse.
function filaDesde(p, cantidadMayoreo, sucursalesHabilitadas) {
  const pc = Number(p.precio_compra)  || 0
  const pv = Number(p.precio_venta)   || 0
  const pm = Number(p.precio_mayoreo) || 0
  return {
    id:            p.id,
    nombre:        (p.nombre || '').toUpperCase(),
    codigos:       [...(p.codigos || [])],
    categoria:     p.categoria || '',
    precio_compra: pc ? String(pc) : '',
    utilidad:      pc > 0 && pv > 0 ? (((pv - pc) / pc) * 100).toFixed(2) : '',
    precio_venta:  pv ? String(pv) : '',
    stock_minimo:  String(p.stock_minimo ?? 10),
    sucursales:    sucursalesHabilitadas,
    mayoreo:       pm > 0 ? { precio: String(pm), cantidad: String(cantidadMayoreo ?? '') } : null,
  }
}

// Compara la fila contra la copia que llegó de la base y devuelve SOLO lo que
// cambió. Es el corazón de esta ventana: lo que el usuario no tocó ni siquiera
// viaja, así que no puede pisar el trabajo de otra persona ni vaciar un campo
// por descuido. De paso alimenta el resaltado de celdas.
function calcularCambios(act, ori) {
  const c = {}

  if (sanitizar(act.nombre) !== sanitizar(ori.nombre))   c.nombre = sanitizar(act.nombre)
  if (act.categoria !== ori.categoria)                   c.categoria = act.categoria
  if (sanitizarNum(act.precio_compra) !== sanitizarNum(ori.precio_compra))
    c.precio_compra = sanitizarNum(act.precio_compra)
  if (sanitizarNum(act.precio_venta) !== sanitizarNum(ori.precio_venta))
    c.precio_venta = sanitizarNum(act.precio_venta)
  if (sanitizarEntero(act.stock_minimo) !== sanitizarEntero(ori.stock_minimo))
    c.stock_minimo = sanitizarEntero(act.stock_minimo)

  // El mayoreo son dos datos que no tienen sentido por separado: si se mueve
  // uno viajan los dos, y apagarlo manda precio 0 y cantidad nula.
  const mA = act.mayoreo ? `${sanitizarNum(act.mayoreo.precio)}|${sanitizarEntero(act.mayoreo.cantidad)}` : ''
  const mO = ori.mayoreo ? `${sanitizarNum(ori.mayoreo.precio)}|${sanitizarEntero(ori.mayoreo.cantidad)}` : ''
  if (mA !== mO) {
    c.precio_mayoreo   = act.mayoreo ? sanitizarNum(act.mayoreo.precio) : 0
    c.cantidad_mayoreo = act.mayoreo ? sanitizarEntero(act.mayoreo.cantidad) : null
  }

  const agregados = act.codigos.filter(x => !ori.codigos.includes(x))
  const quitados  = ori.codigos.filter(x => !act.codigos.includes(x))
  if (agregados.length) c.codigos_add = agregados
  if (quitados.length)  c.codigos_del = quitados

  const sA = [...act.sucursales].sort().join('|')
  const sO = [...ori.sucursales].sort().join('|')
  if (sA !== sO) c.sucursales = act.sucursales

  return c
}

// Mismas reglas que el alta de uno en uno. Aquí toda fila es un producto real,
// así que no existe el concepto de "fila vacía": todo es obligatorio siempre.
function validarFila(f) {
  const errores = []
  const avisos  = []

  if (!sanitizar(f.nombre)) errores.push('falta el nombre')
  if (!f.codigos.length)    errores.push('debe tener al menos un código de barras')
  if (!f.categoria)         errores.push('falta la categoría')

  const pc = sanitizarNum(f.precio_compra)
  const pv = sanitizarNum(f.precio_venta)
  if (!(pc > 0)) errores.push('falta el precio de compra')
  if (!(pv > 0)) errores.push('falta el precio de venta')
  if (String(f.stock_minimo).trim() === '') errores.push('falta el stock mínimo')
  if (!f.sucursales.length) errores.push('falta elegir sucursal')

  if (f.mayoreo) {
    const pm   = sanitizarNum(f.mayoreo.precio)
    const cant = sanitizarEntero(f.mayoreo.cantidad)
    if (!(pm > 0))                errores.push('falta el precio de mayoreo')
    else if (pc > 0 && pm <= pc)  errores.push('el mayoreo debe ser mayor al precio de compra')
    else if (pv > 0 && pm >= pv)  errores.push('el mayoreo debe ser menor al precio de venta')
    if (cant < 1)                 errores.push('falta la cantidad mínima de mayoreo')
  }

  if (pc > 0 && pv > 0 && pv < pc) avisos.push('el precio de venta es menor al de compra')

  return { errores, avisos }
}

// Campo de nombre que crece hacia abajo en vez de recortar. Un `input` de una
// sola línea escondía la mayor parte de nombres como "A-MIGDOBIS BISMUTA 2
// SUPOSITORIOS ADULTO", y ensanchar la columna habría empujado los precios
// fuera de la vista. Así se acomoda en varias líneas, igual que los códigos.
function CampoNombre({ valor, onChange, className }) {
  const ref = useRef(null)

  const ajustar = (el) => {
    if (!el) return
    el.style.height = 'auto'                    // primero encoge, si no nunca baja
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => { ajustar(ref.current) }, [valor])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={valor}
      onChange={e => onChange(e.target.value.toUpperCase())}
      className={className}
    />
  )
}

// ── Ventana ──────────────────────────────────────────────────────────────────
export default function ModalEdicionMasiva({ productos, onCerrar, onExito }) {
  const { sucursales, empresa } = useApp()

  const [paso, setPaso] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [sel, setSel] = useState(() => new Set())
  const [filas, setFilas] = useState([])
  const [originales, setOriginales] = useState(new Map())
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ocupados, setOcupados] = useState({})   // codigo -> nombre del dueño
  const [popup, setPopup] = useState(null)

  // ── Paso 1: elegir ────────────────────────────────────────────────────────
  const candidatos = useMemo(() => {
    const activos = productos.filter(p => p.activo)
    const q = busqueda.trim().toLowerCase()
    if (!q) return activos
    return activos.filter(p =>
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.codigos || []).some(c => c.toLowerCase().includes(q))
    )
  }, [productos, busqueda])

  const alternar = (id) => setSel(prev => {
    const s = new Set(prev)
    if (s.has(id)) s.delete(id)
    else if (s.size < MAX_FILAS) s.add(id)
    else { toast.error(`El máximo es ${MAX_FILAS} productos por tanda`); return prev }
    return s
  })

  const siguiente = async () => {
    if (sel.size === 0) { toast.error('Elige al menos un producto'); return }
    setCargando(true)
    try {
      const ids = [...sel]
      // Dos datos que la lista de Productos no trae: la cantidad de mayoreo
      // (el RPC del catálogo no la devuelve) y en qué sucursales está activo.
      // Son 50 ids como máximo, muy lejos del tope de filas.
      const [{ data: extras, error: e1 }, { data: disp, error: e2 }] = await Promise.all([
        supabase.from('productos').select('id, cantidad_mayoreo').in('id', ids),
        supabase.from('productos_sucursales').select('producto_id, sucursal_id, habilitado').in('producto_id', ids),
      ])
      if (e1) throw e1
      if (e2) throw e2

      const cantPorId = new Map((extras || []).map(r => [r.id, r.cantidad_mayoreo]))
      // Sin fila guardada, la sucursal cuenta como habilitada — misma regla que
      // usa la ventana de editar producto.
      const sucPorId = new Map(ids.map(id => [id, new Set(sucursales.map(s => s.id))]))
      ;(disp || []).forEach(r => {
        if (!r.habilitado) sucPorId.get(r.producto_id)?.delete(r.sucursal_id)
      })

      const nuevas = ids
        .map(id => productos.find(p => p.id === id))
        .filter(Boolean)
        .map(p => filaDesde(p, cantPorId.get(p.id), [...(sucPorId.get(p.id) ?? [])]))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))

      setFilas(nuevas)
      setOriginales(new Map(nuevas.map(f => [f.id, structuredClone(f)])))
      setPaso(2)
    } catch (e) {
      toast.error(e.message ?? 'No se pudieron cargar los productos')
    } finally {
      setCargando(false)
    }
  }

  // ── Paso 2: editar ────────────────────────────────────────────────────────
  const actualizar = (id, cambios, campo = null) => {
    setFilas(prev => prev.map(f => {
      if (f.id !== id) return f
      const tocada = { ...f, ...cambios }
      return campo ? emparejarPrecios(tocada, campo) : tocada
    }))
    if (cambios.codigos) setOcupados({})
  }

  const analisis = useMemo(() => {
    const porFila = filas.map((f, i) => {
      const ori = originales.get(f.id)
      return {
        id: f.id, numero: i + 1, nombre: f.nombre,
        cambios: ori ? calcularCambios(f, ori) : {},
        ...validarFila(f),
      }
    })

    // Códigos repetidos dentro de la misma tanda
    const vistos = new Map()
    filas.forEach((f, i) => {
      f.codigos.forEach(c => {
        if (vistos.has(c)) porFila[i].errores.push(`el código ${c} se repite en la fila ${vistos.get(c) + 1}`)
        else vistos.set(c, i)
      })
    })

    // Códigos que ya pertenecen a otro producto de la empresa
    filas.forEach((f, i) => {
      f.codigos.forEach(c => {
        if (ocupados[c]) porFila[i].errores.push(`el código ${c} ya es de "${ocupados[c]}"`)
      })
    })

    return porFila
  }, [filas, originales, ocupados])

  const conError   = analisis.filter(a => a.errores.length)
  const conAviso   = analisis.filter(a => !a.errores.length && a.avisos.length)
  const conCambios = analisis.filter(a => Object.keys(a.cambios).length > 0)
  const totalCeldas = conCambios.reduce((s, a) => s + Object.keys(a.cambios).length, 0)

  const cerrar = () => { if (!guardando) onCerrar?.() }

  const guardar = async () => {
    if (conError.length)   { toast.error(`Hay ${conError.length} producto${conError.length > 1 ? 's' : ''} con errores`); return }
    if (!conCambios.length){ toast.error('No hay ningún cambio que guardar'); return }
    if (!empresa?.id)      { toast.error('No se pudo identificar la empresa'); return }

    setGuardando(true)
    try {
      // Solo hay que revisar los códigos NUEVOS: los que el producto ya tenía
      // son suyos. Y si un código se está moviendo de un producto a otro dentro
      // de esta misma tanda, no es choque — se borra de uno antes de ponerlo en
      // el otro.
      const nuevos    = conCambios.flatMap(a => a.cambios.codigos_add ?? [])
      const liberados = new Set(conCambios.flatMap(a => a.cambios.codigos_del ?? []))

      if (nuevos.length) {
        const { data: existentes, error } = await supabase
          .from('codigos_barras')
          .select('codigo, producto_id, productos(nombre)')
          .in('codigo', nuevos)

        if (!error && existentes?.length) {
          const mapa = {}
          existentes.forEach(c => {
            const seLibera = liberados.has(c.codigo) && filas.some(f => f.id === c.producto_id)
            if (!seLibera) mapa[c.codigo] = c.productos?.nombre ?? 'otro producto'
          })
          if (Object.keys(mapa).length) {
            setOcupados(mapa)
            toast.error('Hay códigos de barras que ya pertenecen a otros productos')
            return
          }
        }
      }

      const { data, error } = await supabase.rpc('actualizar_productos_masivo', {
        p_productos: conCambios.map(a => ({ id: a.id, ...a.cambios })),
      })
      if (error) throw error

      const n = data?.actualizados ?? conCambios.length
      toast.success(`${n} producto${n > 1 ? 's' : ''} actualizado${n > 1 ? 's' : ''}`)
      onExito?.()
      cerrar()
    } catch (e) {
      toast.error(e.message ?? 'No se pudieron guardar los cambios')
    } finally {
      setGuardando(false)
    }
  }

  const filaPopup = popup ? filas.find(f => f.id === popup.id) : null

  // ── Paso 1 ────────────────────────────────────────────────────────────────
  if (paso === 1) {
    return (
      <Modal onClose={cerrar} maxWidth="sm:max-w-2xl" cerrarAlTocarFuera={false}>
        <ModalHeader
          titulo="Edición masiva"
          subtitulo={`Elige los productos a editar · ${sel.size}/${MAX_FILAS}`}
          onClose={cerrar}
        />

        <div className="px-6 pt-4 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código de barras..."
              autoFocus
              className="w-full h-11 pl-9 pr-9 rounded-2xl border border-transparent bg-slate-100/70 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white transition-all"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-1">
          {candidatos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Sin resultados</p>
          ) : candidatos.map(p => {
            const marcado = sel.has(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => alternar(p.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors',
                  marcado ? 'bg-primary-50' : 'hover:bg-slate-50'
                )}
              >
                <span className={cn(
                  'w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0',
                  marcado ? 'bg-primary-600 border-primary-600' : 'border-slate-300'
                )}>
                  {marcado && <Check className="w-3 h-3 text-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm font-medium truncate',
                    marcado ? 'text-primary-800' : 'text-slate-800')} title={p.nombre}>
                    {p.nombre}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">
                    {p.categoria || 'Sin categoría'} · {(p.codigos || []).length} código{(p.codigos || []).length !== 1 ? 's' : ''}
                  </span>
                </span>
                <span className="text-xs text-slate-500 tabular-nums flex-shrink-0">
                  {formatoMoneda(p.precio_venta)}
                </span>
              </button>
            )
          })}
        </div>

        <ModalFooter>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-primary-700">{sel.size}</span> seleccionado{sel.size !== 1 ? 's' : ''}
              {sel.size >= MAX_FILAS && <span className="text-amber-600"> · máximo alcanzado</span>}
            </p>
            <div className="flex gap-2">
              <Button variante="secundario" onClick={cerrar}>Cancelar</Button>
              <Button onClick={siguiente} cargando={cargando} disabled={sel.size === 0 || cargando}>
                Siguiente
              </Button>
            </div>
          </div>
        </ModalFooter>
      </Modal>
    )
  }

  // ── Paso 2 ────────────────────────────────────────────────────────────────
  // Las celdas modificadas se resaltan. Con 50 filas precargadas, es lo único
  // que distingue lo que el usuario tocó de lo que solo está de paso.
  // `alto` se separa para que el campo de nombre pueda crecer con su contenido
  // mientras el resto de celdas conserva su altura fija.
  const claseCelda = (cambiada, alto = 'h-10') => cn(
    'w-full px-3 rounded-xl border text-sm transition-colors', alto,
    'focus:outline-none focus:ring-2 focus:ring-primary-500/25 focus:bg-white',
    cambiada ? 'bg-amber-50 border-amber-300 font-semibold' : 'bg-slate-100/70 border-transparent'
  )

  return (
    <>
      <Modal onClose={cerrar} maxWidth="sm:max-w-[95vw] lg:sm:max-w-7xl" cerrarAlTocarFuera={false}>
        <ModalHeader
          titulo="Edición masiva"
          subtitulo={`${filas.length} producto${filas.length !== 1 ? 's' : ''} · las celdas modificadas se marcan en ámbar`}
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
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const est   = analisis[i]
                const cam   = est.cambios
                const malo  = est.errores.length > 0
                const aviso = !malo && est.avisos.length > 0
                const pc    = sanitizarNum(f.precio_compra)
                const pv    = sanitizarNum(f.precio_venta)
                const bajoCosto = pc > 0 && pv > 0 && pv < pc

                return (
                  <tr
                    key={f.id}
                    id={`fila-edicion-${est.numero}`}
                    className={cn('align-top transition-colors',
                      malo && 'bg-red-50/40', aviso && 'bg-amber-50/30')}
                  >
                    <td className="px-2 py-2 border-b border-slate-100 text-center text-xs font-semibold text-slate-400">
                      {est.numero}
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <CampoNombre
                        valor={f.nombre}
                        onChange={v => actualizar(f.id, { nombre: v })}
                        className={claseCelda('nombre' in cam,
                          'min-h-10 py-2 leading-snug resize-none overflow-hidden')}
                      />
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <div className={cn('rounded-xl',
                        ('codigos_add' in cam || 'codigos_del' in cam) && 'ring-2 ring-amber-300')}>
                        <Chips
                          valores={f.codigos}
                          onChange={c => actualizar(f.id, { codigos: c })}
                          placeholder="Escanear o escribir y Enter"
                          iconoChip={<Barcode className="w-3 h-3" />}
                        />
                      </div>
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <div className={cn('rounded-xl', 'categoria' in cam && 'ring-2 ring-amber-300')}>
                        <SelectCategoria
                          valor={f.categoria}
                          invalido={!f.categoria}
                          onChange={c => actualizar(f.id, { categoria: c })}
                        />
                      </div>
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <input
                        value={f.precio_compra}
                        inputMode="decimal"
                        onChange={e => /^\d*\.?\d*$/.test(e.target.value) && actualizar(f.id, { precio_compra: e.target.value }, 'precio_compra')}
                        className={cn(claseCelda('precio_compra' in cam), 'text-right')}
                      />
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <div className="relative">
                        <input
                          value={f.utilidad}
                          inputMode="decimal"
                          onChange={e => /^-?\d*\.?\d*$/.test(e.target.value) && actualizar(f.id, { utilidad: e.target.value }, 'utilidad')}
                          className={cn(claseCelda(false), 'text-right pr-6')}
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
                      </div>
                    </td>

                    <td className="px-2 py-2 border-b border-slate-100">
                      <input
                        value={f.precio_venta}
                        inputMode="decimal"
                        onChange={e => /^\d*\.?\d*$/.test(e.target.value) && actualizar(f.id, { precio_venta: e.target.value }, 'precio_venta')}
                        className={cn(
                          claseCelda('precio_venta' in cam), 'text-right',
                          bajoCosto && 'bg-red-50 border-red-300 text-red-700 font-semibold'
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
                        onChange={e => /^\d*$/.test(e.target.value) && actualizar(f.id, { stock_minimo: e.target.value })}
                        className={cn(claseCelda('stock_minimo' in cam), 'text-right')}
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
                          onClick={() => setPopup({ tipo: 'sucursales', id: f.id })}
                          className={cn(
                            'w-full h-10 px-3 rounded-xl text-xs font-medium text-left transition-colors flex items-center gap-1.5',
                            'sucursales' in cam ? 'bg-amber-50 text-amber-800 ring-2 ring-amber-300'
                            : f.sucursales.length ? 'bg-primary-50 text-primary-700 hover:bg-primary-100'
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
                        onClick={() => setPopup({ tipo: 'mayoreo', id: f.id })}
                        className={cn(
                          'w-full h-10 px-3 rounded-xl text-xs font-medium text-left transition-colors flex items-center gap-1.5',
                          'precio_mayoreo' in cam ? 'bg-amber-50 text-amber-800 ring-2 ring-amber-300'
                          : f.mayoreo ? 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                          : 'bg-slate-100/70 text-slate-400 hover:bg-slate-100'
                        )}
                      >
                        <Layers className="w-3.5 h-3.5 flex-shrink-0" />
                        {f.mayoreo
                          ? `${formatoMoneda(sanitizarNum(f.mayoreo.precio))} · ${f.mayoreo.cantidad}+`
                          : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <ModalFooter>
          {(conError.length > 0 || conAviso.length > 0) && (
            <div className="mb-3 max-h-28 overflow-y-auto space-y-1">
              {conError.map(a => (
                <button
                  key={`e-${a.id}`}
                  type="button"
                  onClick={() => document.getElementById(`fila-edicion-${a.numero}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className="w-full flex items-start gap-1.5 text-left text-xs text-red-700 hover:underline"
                >
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  <span><b>Fila {a.numero}:</b> {a.errores.join(' · ')}</span>
                </button>
              ))}
              {conAviso.map(a => (
                <button
                  key={`a-${a.id}`}
                  type="button"
                  onClick={() => document.getElementById(`fila-edicion-${a.numero}`)
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
              {conCambios.length === 0
                ? 'Sin cambios todavía'
                : <>
                    <span className="font-semibold text-amber-600">{totalCeldas}</span> cambio{totalCeldas !== 1 ? 's' : ''}
                    {' en '}
                    <span className="font-semibold text-amber-600">{conCambios.length}</span> producto{conCambios.length !== 1 ? 's' : ''}
                  </>}
              {conError.length > 0 && <> · <span className="font-semibold text-red-600">{conError.length}</span> con error</>}
            </p>
            <div className="flex gap-2">
              <Button
                variante="secundario"
                onClick={() => setPaso(1)}
                disabled={guardando}
                iconoIzq={<ChevronLeft className="w-4 h-4" />}
              >
                Atrás
              </Button>
              <Button
                onClick={guardar}
                cargando={guardando}
                disabled={guardando || conCambios.length === 0 || conError.length > 0}
                iconoIzq={<PencilLine className="w-4 h-4" />}
              >
                Guardar cambios
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
          onConfirmar={(s) => { actualizar(popup.id, { sucursales: s }); setPopup(null) }}
        />
      )}

      {popup?.tipo === 'mayoreo' && filaPopup && (
        <PopupMayoreo
          valor={filaPopup.mayoreo}
          precioCompra={filaPopup.precio_compra}
          precioVenta={filaPopup.precio_venta}
          onCerrar={() => setPopup(null)}
          onQuitar={() => { actualizar(popup.id, { mayoreo: null }); setPopup(null) }}
          onConfirmar={(v) => { actualizar(popup.id, { mayoreo: v }); setPopup(null) }}
        />
      )}
    </>
  )
}
