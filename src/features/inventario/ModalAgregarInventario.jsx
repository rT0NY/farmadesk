import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  X, Search, Package, Store, Calendar, Hash, Plus, Check,
  ScanBarcode, AlertTriangle, ChevronLeft, ChevronRight, Minus,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { log as logBitacora } from '@/lib/bitacora'
import { useApp } from '@/context/AppCtx'
import { sanitizarEntero } from '@/lib/sanitizar'
import { formatoMoneda, formatoFecha, fechaEnZona } from '@/lib/formatos'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/clases'

// Indicador de paso
function PasoIndicador({ pasos, actual }) {
  return (
    <div className="flex items-center px-5 py-3 border-b border-slate-100">
      {pasos.map((p, i) => {
        const done = actual > p.num
        const active = actual === p.num
        return (
          <div key={p.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                done ? 'bg-emerald-500 text-white' :
                active ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-500'
              )}>
                {done ? <Check className="w-4 h-4" /> : p.num}
              </div>
              <span className={cn(
                'text-[10px] font-semibold',
                active ? 'text-primary-700' : done ? 'text-emerald-600' : 'text-slate-400'
              )}>{p.label}</span>
            </div>
            {i < pasos.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 mx-2 mb-5 rounded-full transition-all',
                actual > p.num ? 'bg-emerald-500' : 'bg-slate-200'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ModalAgregarInventario({ abierto, onCerrar, onExito }) {
  const { sucursales, empresa, tz, perfil } = useApp()

  // Estado principal
  const [paso, setPaso] = useState(1)
  const [productos, setProductos] = useState([])
  const [lotes, setLotes] = useState([])
  const [codigosCat, setCodigosCat] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [productoSel, setProductoSel] = useState(null)

  // Paso 2 — Lote
  const [modoLote, setModoLote] = useState('nuevo') // 'existente' | 'nuevo'
  const [loteSelId, setLoteSelId] = useState('')
  const [caducidad, setCaducidad] = useState('')

  // Paso 3 — Cantidades
  const [cantidades, setCantidades] = useState({})
  const [sucursalesHabilitadas, setSucursalesHabilitadas] = useState([])

  // Escáner / código de barras
  const [barcodeInput, setBarcodeInput] = useState('')
  const [modalAsociar, setModalAsociar] = useState(null)
  const [searchAsociar, setSearchAsociar] = useState('')
  const [guardandoBC, setGuardandoBC] = useState(false)

  const [cargando, setCargando] = useState(false)
  const [errors, setErrors] = useState({})
  const barcodeRef = useRef(null)
  const searchRef = useRef(false)
  const asociarRef = useRef(false)

  const PASOS = [
    { num: 1, label: 'Producto' },
    { num: 2, label: 'Lote' },
    { num: 3, label: 'Cantidad' },
  ]

  // Cargar datos al abrir
  useEffect(() => {
    if (!abierto) return
    setPaso(1)
    setBusqueda('')
    setProductoSel(null)
    setModoLote('nuevo')
    setLoteSelId('')
    setCaducidad('')
    setErrors({})
    setModalAsociar(null)
    setSearchAsociar('')
    setBarcodeInput('')
    const init = {}
    sucursales.forEach(s => { init[s.id] = '' })
    setCantidades(init)
    setSucursalesHabilitadas(sucursales)
    fetchData()
  }, [abierto, sucursales])

  // Focus en el input del escáner cuando estamos en paso 1
  // Solo refocusa si el usuario lleva 600ms sin interactuar (teclado o mouse)
  useEffect(() => {
    if (!abierto || paso !== 1) return
    let ultimaInteraccion = 0
    const marcarInteraccion = () => { ultimaInteraccion = Date.now() }
    document.addEventListener('keydown', marcarInteraccion)
    document.addEventListener('mousedown', marcarInteraccion)
    document.addEventListener('pointerdown', marcarInteraccion)

    const interval = setInterval(() => {
      if (!barcodeRef.current) return
      const active = document.activeElement
      const otroActivo = active && active !== barcodeRef.current && (
        active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' || active.isContentEditable
      )
      const graciaPasada = Date.now() - ultimaInteraccion > 600
      if (!otroActivo && graciaPasada) barcodeRef.current.focus()
    }, 300)

    return () => {
      clearInterval(interval)
      document.removeEventListener('keydown', marcarInteraccion)
      document.removeEventListener('mousedown', marcarInteraccion)
      document.removeEventListener('pointerdown', marcarInteraccion)
    }
  }, [abierto, paso])

  async function fetchData() {
    const [{ data: prod }, { data: lot }, { data: cod }] = await Promise.all([
      supabase.from('productos').select('*').eq('activo', true).order('nombre'),
      supabase.from('lotes').select('*').eq('activo', true),
      supabase.from('codigos_barras').select('*'),
    ])
    setProductos(prod || [])
    setLotes(lot || [])
    setCodigosCat(cod || [])
  }

  // Derivados
  const lotesProducto = productoSel ? lotes.filter(l => l.producto_id === productoSel.id) : []
  const tieneLotes = lotesProducto.length > 0
  const loteObj = lotesProducto.find(l => l.id === loteSelId)
  const totalCantidad = sucursalesHabilitadas.reduce((a, s) => a + (Number(cantidades[s.id]) || 0), 0)

  // Productos filtrados por búsqueda
  const prodFiltrados = busqueda.trim()
    ? productos.filter(p => {
        const q = busqueda.toLowerCase()
        const matchNombre = p.nombre.toLowerCase().includes(q)
        const matchCodigo = codigosCat.some(bc =>
          bc.producto_id === p.id && bc.codigo.toLowerCase().includes(q))
        return matchNombre || matchCodigo
      })
    : productos

  async function seleccionarProducto(prod) {
    setProductoSel(prod)
    setErrors({})
    const lots = lotes.filter(l => l.producto_id === prod.id)
    if (lots.length > 0) {
      setModoLote('existente')
      setLoteSelId(lots[0].id)
    } else {
      setModoLote('nuevo')
      setCaducidad('')
    }
    // Filtrar sucursales habilitadas para este producto
    const { data: ps } = await supabase
      .from('productos_sucursales')
      .select('sucursal_id, habilitado')
      .eq('producto_id', prod.id)
    const deshabIds = new Set((ps || []).filter(r => !r.habilitado).map(r => r.sucursal_id))
    setSucursalesHabilitadas(sucursales.filter(s => !deshabIds.has(s.id)))
  }

  const normalizarCodigo = (s) => (s || '').replace(/[\x00-\x1F\x7F]/g, '').trim().toUpperCase()

  function procesarCodigoInventario(val, limpiar) {
    val = normalizarCodigo(val)
    if (!val) return
    const encontrado = codigosCat.find(bc => normalizarCodigo(bc.codigo) === val)
    if (encontrado) {
      const prod = productos.find(p => p.id === encontrado.producto_id)
      if (prod) { seleccionarProducto(prod); limpiar(); setPaso(2) }
    } else {
      setModalAsociar(val); limpiar()
    }
  }

  function handleBarcodeKey(e) {
    if (e.key !== 'Enter' && e.key !== 'Tab') return
    if (e.key === 'Tab') e.preventDefault()
    procesarCodigoInventario(barcodeInput, () => setBarcodeInput(''))
  }

  // Auto-procesar 300ms después del último carácter (escáneres sin Enter)
  useEffect(() => {
    const val = barcodeInput.trim()
    if (!val || val.length < 3) return
    const t = setTimeout(() => procesarCodigoInventario(val, () => setBarcodeInput('')), 300)
    return () => clearTimeout(t)
  }, [barcodeInput]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchKey(e) {
    if (e.key !== 'Enter') return
    const val = busqueda.trim()
    if (!val) return
    const encontrado = codigosCat.find(bc => normalizarCodigo(bc.codigo) === normalizarCodigo(val))
    if (encontrado) {
      const prod = productos.find(p => p.id === encontrado.producto_id)
      if (prod) { seleccionarProducto(prod); setBusqueda(''); setPaso(2) }
    } else if (/^\d+$/.test(val)) {
      setModalAsociar(val); setBusqueda('')
    }
  }

  async function guardarNuevoCodigoBarras(prodId) {
    if (!prodId || !modalAsociar) return
    setGuardandoBC(true)
    try {
      const { data } = await supabase.from('codigos_barras')
        .insert([{ empresa_id: empresa.id, producto_id: prodId, codigo: modalAsociar }])
        .select().single()
      if (data) setCodigosCat(b => [...b, data])
      const prod = productos.find(p => p.id === prodId)
      if (prod) seleccionarProducto(prod)
      setModalAsociar(null)
      setSearchAsociar('')
      setPaso(2)
      toast.success('Código de barras vinculado')
    } catch (err) {
      toast.error(err.message || 'Error al vincular código')
    } finally {
      setGuardandoBC(false)
    }
  }

  function setCant(sucursalId, valor) {
    if (!/^\d*$/.test(valor)) return
    setCantidades(c => ({ ...c, [sucursalId]: valor }))
    setErrors(e => ({ ...e, cantidades: '' }))
  }

  function validarPaso(p) {
    const e = {}
    if (p === 1 && !productoSel) e.producto = 'Selecciona un producto'
    if (p === 2) {
      if (modoLote === 'existente' && !loteSelId) e.lote = 'Selecciona un lote'
      if (modoLote === 'nuevo' && !caducidad) e.caducidad = 'Fecha de caducidad obligatoria'
    }
    if (p === 3 && totalCantidad === 0) e.cantidades = 'Ingresa al menos 1 unidad'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function avanzar() {
    // En paso 1: si no hay producto seleccionado pero hay texto de búsqueda, intentar como código
    if (paso === 1 && !productoSel && busqueda.trim()) {
      const val = busqueda.trim()
      const encontrado = codigosCat.find(bc => bc.codigo === val)
      if (encontrado) {
        const prod = productos.find(p => p.id === encontrado.producto_id)
        if (prod) { seleccionarProducto(prod); setBusqueda(''); setPaso(2); return }
      } else if (/^\d+$/.test(val)) {
        setModalAsociar(val)
        setBusqueda('')
        return
      }
    }
    if (validarPaso(paso)) setPaso(s => s + 1)
  }

  async function handleGuardar() {
    if (!validarPaso(3)) return
    setCargando(true)
    try {
      if (modoLote === 'nuevo') {
        // Crear UN SOLO lote para todas las sucursales.
        // agregar_inventario retorna {lote_id} — usarlo en las sucursales restantes
        // para no crear lotes duplicados con la misma fecha.
        const sucsConCant = sucursalesHabilitadas.filter(s => Number(cantidades[s.id]) > 0)
        if (sucsConCant.length === 0) throw new Error('Ingresa al menos una cantidad')

        const [primera, ...resto] = sucsConCant

        const { data: resultado, error: errPrimero } = await supabase.rpc('agregar_inventario', {
          p_producto_id:     productoSel.id,
          p_sucursal_id:     primera.id,
          p_cantidad:        Number(cantidades[primera.id]),
          p_fecha_caducidad: caducidad,
        })
        if (errPrimero) throw errPrimero

        const loteId = resultado?.lote_id

        for (const suc of resto) {
          const cant = Number(cantidades[suc.id])
          const { data: invActual } = await supabase
            .from('inventario').select('cantidad')
            .eq('lote_id', loteId).eq('sucursal_id', suc.id).maybeSingle()
          const actual = invActual?.cantidad || 0
          const { error } = await supabase.rpc('ajustar_inventario', {
            p_lote_id:        loteId,
            p_sucursal_id:    suc.id,
            p_nueva_cantidad: actual + cant,
            p_motivo:         'entrada_inventario',
          })
          if (error) throw error
        }
      } else {
        // Lote existente — agregar stock solo a sucursales habilitadas para este producto
        for (const suc of sucursalesHabilitadas) {
          const cant = Number(cantidades[suc.id]) || 0
          if (cant <= 0) continue
          // Obtener cantidad actual de este lote en esta sucursal
          const { data: invActual } = await supabase
            .from('inventario')
            .select('cantidad')
            .eq('lote_id', loteSelId)
            .eq('sucursal_id', suc.id)
            .maybeSingle()
          const actual = invActual?.cantidad || 0
          const { error } = await supabase.rpc('ajustar_inventario', {
            p_lote_id: loteSelId,
            p_sucursal_id: suc.id,
            p_nueva_cantidad: actual + cant,
            p_motivo: 'entrada_inventario',
          })
          if (error) throw error
        }
      }

      const sucursalesAfectadas = sucursalesHabilitadas
        .filter(s => Number(cantidades[s.id]) > 0)
        .map(s => `${s.nombre}: +${cantidades[s.id]}`)
        .join(', ')

      await logBitacora({
        empresa_id:    empresa?.id,
        tipo:          'inventario_entrada',
        descripcion:   `${totalCantidad} uds añadidas a "${productoSel.nombre}" · ${sucursalesAfectadas}`,
        usuario_id:    perfil?.id ?? null,
        referencia_id: productoSel.id,
      })

      toast.success(`${totalCantidad} unidades agregadas a ${productoSel.nombre}`)
      onExito?.()
      onCerrar()
    } catch (err) {
      toast.error(err.message || 'Error al guardar')
      setErrors({ submit: err.message })
    } finally {
      setCargando(false)
    }
  }

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => !cargando && onCerrar()} />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 flex items-center justify-center">
              <Plus className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Agregar inventario</h3>
              <p className="text-xs text-slate-500">
                {paso === 1 ? 'Seleccionar producto' : paso === 2 ? 'Definir lote' : 'Ingresar cantidades'}
              </p>
            </div>
          </div>
          <button onClick={onCerrar} disabled={cargando} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wizard steps */}
        <PasoIndicador pasos={PASOS} actual={paso} />

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* ═══ PASO 1: Producto ═══ */}
          {paso === 1 && (
            <>
              {/* Input oculto para escáner */}
              <input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKey}
                className="absolute opacity-0 pointer-events-none w-px h-px"
                tabIndex={-1}
              />

              <div className="bg-primary-50 border border-primary-200 rounded-2xl p-3 flex items-center gap-2">
                <ScanBarcode className="w-5 h-5 text-primary-600 flex-shrink-0" />
                <p className="text-xs font-medium text-primary-800">
                  Escáner activo — escanea el código de barras o busca por nombre
                </p>
              </div>

              <Input
                placeholder="Buscar por nombre o código de barras..."
                iconoIzq={<Search className="w-5 h-5" />}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={handleSearchKey}
                onFocus={() => { searchRef.current = true }}
                onBlur={() => { searchRef.current = false }}
              />

              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {prodFiltrados.map(p => {
                  const sel = productoSel?.id === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => seleccionarProducto(p)}
                      className={cn(
                        'w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-3',
                        sel ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-slate-500">{p.categoria || 'Sin categoría'} · {formatoMoneda(p.precio_venta)}</p>
                      </div>
                      {sel && (
                        <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
                {prodFiltrados.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-400">Sin resultados</p>
                  </div>
                )}
              </div>
              {errors.producto && <p className="text-xs text-red-600 font-medium">{errors.producto}</p>}
            </>
          )}

          {/* ═══ PASO 2: Lote ═══ */}
          {paso === 2 && productoSel && (
            <>
              <div className="bg-primary-50 border border-primary-200 rounded-2xl p-3 flex items-center gap-3">
                <Package className="w-5 h-5 text-primary-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary-900">{productoSel.nombre}</p>
                  <p className="text-xs text-primary-700">{productoSel.categoria} · {formatoMoneda(productoSel.precio_venta)}</p>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                {tieneLotes ? '¿Usas un lote existente o creas uno nuevo?' : 'Este producto no tiene lotes. Se creará uno nuevo:'}
              </p>

              {/* Toggle lote existente/nuevo */}
              {tieneLotes && (
                <div className="grid grid-cols-2 gap-2 bg-slate-100 rounded-2xl p-1">
                  {[{ id: 'existente', label: 'Lote existente' }, { id: 'nuevo', label: 'Nuevo lote' }].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setModoLote(opt.id)
                        setErrors({})
                        if (opt.id === 'nuevo') setCaducidad('')
                        if (opt.id === 'existente' && lotesProducto.length > 0) setLoteSelId(lotesProducto[0].id)
                      }}
                      className={cn(
                        'py-2.5 px-3 rounded-xl text-sm font-semibold transition-all',
                        modoLote === opt.id ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Lotes existentes */}
              {tieneLotes && modoLote === 'existente' && (
                <div className="space-y-2">
                  {lotesProducto.map(l => {
                    const sel = loteSelId === l.id
                    const dias = l.fecha_caducidad
                      ? Math.ceil((new Date(l.fecha_caducidad) - new Date()) / (1000 * 60 * 60 * 24))
                      : null
                    const caducado = dias !== null && dias < 0
                    const porCaducar = dias !== null && dias >= 0 && dias <= 30
                    return (
                      <button
                        key={l.id}
                        onClick={() => { setLoteSelId(l.id); setErrors({}) }}
                        className={cn(
                          'w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-3',
                          sel ? 'bg-primary-50 border-primary-300 ring-2 ring-primary-500/20' : 'bg-white border-slate-200 hover:border-slate-300'
                        )}
                      >
                        <div>
                          <span className="text-sm font-mono font-bold text-slate-800">{l.codigo_lote || l.id.slice(0, 8)}</span>
                          <span className="text-xs text-slate-500 ml-3">
                            Caduca: {l.fecha_caducidad || 'Sin fecha'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {caducado && <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">CADUCADO</span>}
                          {porCaducar && !caducado && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{dias}d</span>}
                          {sel && <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                        </div>
                      </button>
                    )
                  })}
                  {errors.lote && <p className="text-xs text-red-600 font-medium">{errors.lote}</p>}
                </div>
              )}

              {/* Nuevo lote */}
              {(modoLote === 'nuevo' || !tieneLotes) && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <p className="text-xs text-slate-500">
                    El código de lote se genera automáticamente (L-AAAAMM-NNN).
                  </p>
                  <Input
                    label="Fecha de caducidad *"
                    type="date"
                    iconoIzq={<Calendar className="w-5 h-5" />}
                    value={caducidad}
                    onChange={e => { setCaducidad(e.target.value); setErrors(er => ({ ...er, caducidad: '' })) }}
                    min={fechaEnZona(tz)}
                    error={errors.caducidad}
                    required
                  />
                </div>
              )}
            </>
          )}

          {/* ═══ PASO 3: Cantidades ═══ */}
          {paso === 3 && productoSel && (
            <>
              {/* Resumen */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Producto</span>
                  <span className="font-semibold text-slate-900">{productoSel.nombre}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Lote</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {modoLote === 'nuevo' ? 'Nuevo (auto)' : loteObj?.codigo_lote || loteSelId.slice(0, 8)}
                    {modoLote === 'nuevo' && <span className="text-[10px] text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-full ml-2">Nuevo</span>}
                  </span>
                </div>
                {caducidad && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Caducidad</span>
                    <span className="font-medium text-slate-700">{caducidad}</span>
                  </div>
                )}
              </div>

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Cantidad por sucursal
              </p>

              <div className="space-y-3">
                {sucursalesHabilitadas.length === 0 && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                    Este producto está deshabilitado en todas las sucursales. Actívalo primero desde Productos.
                  </p>
                )}
                {sucursalesHabilitadas.map(s => {
                  const val = cantidades[s.id] || ''
                  const numVal = Number(val) || 0
                  return (
                    <div
                      key={s.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-2xl border transition-all',
                        numVal > 0 ? 'bg-primary-50 border-primary-200' : 'bg-white border-slate-200'
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={cn(
                          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                          numVal > 0 ? 'bg-primary-100' : 'bg-slate-100'
                        )}>
                          <Store className={cn('w-4 h-4', numVal > 0 ? 'text-primary-600' : 'text-slate-500')} />
                        </div>
                        <span className={cn(
                          'text-sm font-semibold truncate',
                          numVal > 0 ? 'text-primary-900' : 'text-slate-700'
                        )}>
                          {s.nombre}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCant(s.id, String(Math.max(0, numVal - 1)))}
                          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={val}
                          onChange={e => setCant(s.id, e.target.value)}
                          placeholder="0"
                          className="w-16 h-9 rounded-xl border border-slate-200 bg-white text-center text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                        />
                        <button
                          onClick={() => setCant(s.id, String(numVal + 1))}
                          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {totalCantidad > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">Total a ingresar</p>
                    <p className="text-2xl font-bold text-emerald-900">{totalCantidad} uds</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-emerald-700">Valor estimado</p>
                    <p className="text-lg font-bold text-emerald-900">
                      {formatoMoneda(totalCantidad * (productoSel?.precio_compra || 0))}
                    </p>
                  </div>
                </div>
              )}

              {errors.cantidades && <p className="text-xs text-red-600 font-medium">{errors.cantidades}</p>}
              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-800">{errors.submit}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <div>
            {paso > 1 && (
              <Button variante="fantasma" onClick={() => setPaso(s => s - 1)} iconoIzq={<ChevronLeft className="w-4 h-4" />}>
                Atrás
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={onCerrar} disabled={cargando}>Cancelar</Button>
            {paso < 3 ? (
              <Button onClick={avanzar} iconoDer={<ChevronRight className="w-4 h-4" />}>Siguiente</Button>
            ) : (
              <Button onClick={handleGuardar} cargando={cargando}>Confirmar entrada</Button>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Modal: Código de barras no registrado ═══ */}
      {modalAsociar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => { setModalAsociar(null); setSearchAsociar('') }} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Código no registrado</h3>
              <button onClick={() => { setModalAsociar(null); setSearchAsociar('') }} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-700 mb-1">Código escaneado:</p>
                <p className="text-lg font-mono font-bold text-amber-900">{modalAsociar}</p>
              </div>
              <p className="text-sm text-slate-600">
                Este código no está registrado. ¿A qué producto pertenece?
              </p>
              <Input
                placeholder="Buscar producto por nombre..."
                iconoIzq={<Search className="w-5 h-5" />}
                value={searchAsociar}
                onChange={e => setSearchAsociar(e.target.value)}
                onFocus={() => { asociarRef.current = true }}
                onBlur={() => { asociarRef.current = false }}
                autoFocus
              />
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
                {productos
                  .filter(p => !searchAsociar.trim() || p.nombre.toLowerCase().includes(searchAsociar.toLowerCase()))
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => !guardandoBC && guardarNuevoCodigoBarras(p.id)}
                      disabled={guardandoBC}
                      className="w-full text-left p-3 rounded-2xl border border-slate-200 hover:border-primary-300 transition-all flex items-center justify-between gap-3 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{p.nombre}</p>
                        <p className="text-xs text-slate-500">{p.categoria}</p>
                      </div>
                      <span className="text-xs font-semibold text-primary-600 flex-shrink-0">
                        {guardandoBC ? 'Guardando...' : 'Vincular'}
                      </span>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => { setModalAsociar(null); setSearchAsociar('') }}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-700 transition-colors py-2"
              >
                Cancelar — buscar manualmente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}