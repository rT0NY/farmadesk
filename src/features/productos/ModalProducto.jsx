import { useState, useEffect, useMemo, useRef } from 'react'

import { toast } from 'sonner'
import {
  X, Package, Tag, DollarSign, Hash, ShoppingBag,
  Barcode, Store, Calendar, FileText, Check, Percent,
  TrendingUp, TrendingDown, AlertCircle, AlertTriangle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sanitizar, sanitizarNum, sanitizarEntero } from '@/lib/sanitizar'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chips } from '@/components/ui/Chips'
import { useApp } from '@/context/AppCtx'
import { formatoMoneda, fechaEnZona } from '@/lib/formatos'
import { log as logBitacora } from '@/lib/bitacora'
import { cn } from '@/lib/clases'
import { CATEGORIAS_PRODUCTO } from '@/lib/constantes'

const formVacio = () => ({
  nombre: '',
  categoria: '',
  proveedor_id: '',
  precio_compra: '',
  utilidad_porcentaje: '',
  precio_venta: '',
  precio_mayoreo: '',
  cantidad_mayoreo: '',
  stock_minimo: '10',
  codigos: [],
})

// Calcular color y texto según el porcentaje de utilidad
function analizarUtilidad(porcentaje, ganancia) {
  const p = Number(porcentaje) || 0
  if (p <= 0) return null

  if (p < 15) {
    return {
      nivel: 'bajo',
      clases: 'bg-red-50 border-red-200 text-red-700',
      iconoClase: 'text-red-600',
      Icono: TrendingDown,
      mensaje: 'Poca ganancia',
      porcentaje: p,
      ganancia,
    }
  } else if (p < 30) {
    return {
      nivel: 'regular',
      clases: 'bg-amber-50 border-amber-200 text-amber-700',
      iconoClase: 'text-amber-600',
      Icono: AlertCircle,
      mensaje: 'Ganancia regular',
      porcentaje: p,
      ganancia,
    }
  } else if (p < 60) {
    return {
      nivel: 'buena',
      clases: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      iconoClase: 'text-emerald-600',
      Icono: TrendingUp,
      mensaje: 'Buena ganancia',
      porcentaje: p,
      ganancia,
    }
  } else {
    return {
      nivel: 'excelente',
      clases: 'bg-emerald-100 border-emerald-300 text-emerald-800',
      iconoClase: 'text-emerald-700',
      Icono: TrendingUp,
      mensaje: 'Excelente ganancia',
      porcentaje: p,
      ganancia,
    }
  }
}

export default function ModalProducto({ abierto, onCerrar, onExito, productoEditar = null }) {
  const { sucursales, empresa, tz, perfil } = useApp()
  const [proveedores, setProveedores] = useState([])
  const [paso, setPaso] = useState(1)
  const [incluirStock, setIncluirStock] = useState(false)
  const [form, setForm] = useState(formVacio())
  const [stockPorSucursal, setStockPorSucursal] = useState({})
  const [loteInfo, setLoteInfo] = useState({ codigo_lote: '', fecha_caducidad: '' })
  const [categorias, setCategorias] = useState([])
  const [sugerencias, setSugerencias] = useState([])
  const [cargando, setCargando] = useState(false)
  const cargandoRef = useRef(false)
  // Para saber cuál campo fue editado por el usuario y no sobreescribirlo en el efecto
  const [ultimoCampoEditado, setUltimoCampoEditado] = useState(null)

  // { [sucursal_id]: boolean } — disponibilidad por sucursal, solo edición
  const [disponibilidad, setDisponibilidad] = useState({})

  const esEdicion = !!productoEditar

  // Cargar cantidad_mayoreo en edición (no viene en el RPC listar_productos_completo)
  useEffect(() => {
    if (!abierto || !esEdicion) return
    supabase.from('productos')
      .select('cantidad_mayoreo')
      .eq('id', productoEditar.id)
      .single()
      .then(({ data, error }) => {
        if (error) { console.error('cantidad_mayoreo fetch:', error.message); return }
        if (data != null) {
          setForm(prev => ({ ...prev, cantidad_mayoreo: String(data.cantidad_mayoreo ?? '') }))
        }
      })
  }, [abierto, esEdicion, productoEditar?.id])

  // Cargar disponibilidad por sucursal en edición
  useEffect(() => {
    if (!abierto || !esEdicion || sucursales.length <= 1) return
    supabase.from('productos_sucursales')
      .select('sucursal_id, habilitado')
      .eq('producto_id', productoEditar.id)
      .then(({ data }) => {
        const map = {}
        if (!data || data.length === 0) {
          // Sin filas → producto antiguo o sin configuración → todas habilitadas
          sucursales.forEach(suc => { map[suc.id] = true })
        } else {
          // Con filas → respetar exactamente lo que dice la BD
          sucursales.forEach(suc => { map[suc.id] = false })
          data.forEach(row => { map[row.sucursal_id] = row.habilitado })
        }
        setDisponibilidad(map)
      })
  }, [abierto, esEdicion, productoEditar?.id, sucursales])

  useEffect(() => {
    if (!abierto) return

    if (esEdicion) {
      const pc = Number(productoEditar.precio_compra) || 0
      const pv = Number(productoEditar.precio_venta) || 0
      const util = pc > 0 ? ((pv - pc) / pc * 100) : 0
      setForm({
        nombre: (productoEditar.nombre || '').toUpperCase(),
        categoria: productoEditar.categoria || '',
        proveedor_id: productoEditar.proveedor_id || '',
        precio_compra: String(pc || ''),
        utilidad_porcentaje: util > 0 ? util.toFixed(2) : '',
        precio_venta: String(pv || ''),
        precio_mayoreo:   String(productoEditar.precio_mayoreo || ''),
        cantidad_mayoreo: String(productoEditar.cantidad_mayoreo || ''),
        stock_minimo:     String(productoEditar.stock_minimo || 10),
        codigos: productoEditar.codigos || [],
      })
    } else {
      setForm(formVacio())
      setStockPorSucursal({})
      setLoteInfo({ codigo_lote: '', fecha_caducidad: '' })
      setIncluirStock(false)
      setPaso(1)
      // Inicializar disponibilidad con todas las sucursales habilitadas por defecto
      if (sucursales.length > 1) {
        const map = {}
        sucursales.forEach(suc => { map[suc.id] = true })
        setDisponibilidad(map)
      }
    }

    cargarCategorias()
    cargarProveedores()
  }, [abierto, productoEditar, esEdicion])

  const cargarCategorias = async () => {
    const { data } = await supabase.rpc('listar_categorias')
    setCategorias(data || [])
  }

  const cargarProveedores = async () => {
    if (!empresa?.id) return
    const { data } = await supabase
      .from('proveedores')
      .select('id, nombre')
      .eq('empresa_id', empresa.id)
      .eq('activo', true)
      .order('nombre')
    setProveedores(data || [])
  }

  useEffect(() => {
    const texto = form.categoria.trim().toLowerCase()
    if (!texto || categorias.length === 0) {
      setSugerencias([])
      return
    }
    const coinciden = categorias
      .filter(c => c.categoria.toLowerCase().includes(texto) && c.categoria.toLowerCase() !== texto)
      .slice(0, 5)
    setSugerencias(coinciden)
  }, [form.categoria, categorias])

  // Efecto: cálculos automáticos entre precio_compra, utilidad_porcentaje y precio_venta
  useEffect(() => {
    const pc = Number(form.precio_compra) || 0
    const pv = Number(form.precio_venta) || 0
    const util = Number(form.utilidad_porcentaje) || 0

    if (pc <= 0) return

    if (ultimoCampoEditado === 'utilidad' || ultimoCampoEditado === 'precio_compra') {
      // Recalcular precio_venta desde precio_compra + utilidad
      if (util > 0) {
        const nuevoPV = pc * (1 + util / 100)
        const nuevoPVRedondeado = Math.round(nuevoPV * 100) / 100
        if (Math.abs(nuevoPVRedondeado - pv) > 0.001) {
          setForm(v => ({ ...v, precio_venta: nuevoPVRedondeado.toFixed(2) }))
        }
      }
    } else if (ultimoCampoEditado === 'precio_venta') {
      // Recalcular utilidad desde precio_compra + precio_venta
      if (pv > 0) {
        const nuevaUtil = ((pv - pc) / pc) * 100
        const nuevaUtilRedondeada = Math.round(nuevaUtil * 100) / 100
        if (Math.abs(nuevaUtilRedondeada - util) > 0.01) {
          setForm(v => ({ ...v, utilidad_porcentaje: nuevaUtilRedondeada.toFixed(2) }))
        }
      }
    }
  }, [form.precio_compra, form.utilidad_porcentaje, form.precio_venta, ultimoCampoEditado])

  const cambiarCampo = (campo) => (e) => {
    setUltimoCampoEditado(campo === 'utilidad_porcentaje' ? 'utilidad' : campo)
    const valor = campo === 'nombre' ? e.target.value.toUpperCase() : e.target.value
    setForm(v => ({ ...v, [campo]: valor }))
  }

  const cambiarStock = (sucursalId, valor) => {
    setStockPorSucursal(prev => ({ ...prev, [sucursalId]: valor }))
  }

  const toggleDisponibilidad = (sucursalId) =>
    setDisponibilidad(prev => ({ ...prev, [sucursalId]: !(prev[sucursalId] ?? true) }))

  // Análisis de utilidad para mostrar indicador
  const analisisUtilidad = useMemo(() => {
    const pc = Number(form.precio_compra) || 0
    const pv = Number(form.precio_venta) || 0
    if (pc <= 0 || pv <= 0) return null
    const ganancia = pv - pc
    const porcentaje = (ganancia / pc) * 100
    return analizarUtilidad(porcentaje, ganancia)
  }, [form.precio_compra, form.precio_venta])

  // Validación del precio mayoreo en tiempo real
  const analisisMayoreo = useMemo(() => {
    const pm = Number(form.precio_mayoreo) || 0
    const pc = Number(form.precio_compra) || 0
    const pv = Number(form.precio_venta) || 0
    if (pm <= 0) return null
    if (pc > 0 && pm <= pc)  return { ok: false, msg: `El precio de mayoreo debe ser mayor al costo de compra (${formatoMoneda(pc)})` }
    if (pv > 0 && pm >= pv)  return { ok: false, msg: `El precio de mayoreo debe ser menor al precio de venta al público (${formatoMoneda(pv)})` }
    if (pv > 0) {
      const desc = ((pv - pm) / pv * 100).toFixed(1)
      return { ok: true, msg: `${desc}% de descuento sobre precio público${pc > 0 ? ` · ganancia: ${formatoMoneda(pm - pc)} por unidad` : ''}` }
    }
    return { ok: true, msg: 'Precio de mayoreo válido' }
  }, [form.precio_mayoreo, form.precio_compra, form.precio_venta])

  const validarPaso1 = () => {
    if (!sanitizar(form.nombre)) {
      toast.error('El nombre del producto es obligatorio')
      return false
    }
    if (!sanitizar(form.categoria)) {
      toast.error('La categoría es obligatoria')
      return false
    }
    const pc = sanitizarNum(form.precio_compra)
    if (pc <= 0) {
      toast.error('El precio de compra es obligatorio')
      return false
    }
    if (sanitizarNum(form.precio_venta) <= 0) {
      toast.error('El precio de venta es obligatorio')
      return false
    }
    const pm = sanitizarNum(form.precio_mayoreo)
    if (pm <= 0) {
      toast.error('El precio de mayoreo es obligatorio')
      return false
    }
    if (pm <= pc) {
      toast.error('El precio de mayoreo debe ser mayor al costo de compra')
      return false
    }
    if (pm >= sanitizarNum(form.precio_venta)) {
      toast.error('El precio de mayoreo debe ser menor al precio de venta')
      return false
    }
    if (!sanitizarEntero(form.cantidad_mayoreo) || sanitizarEntero(form.cantidad_mayoreo) < 1) {
      toast.error('La cantidad mínima de mayoreo es obligatoria')
      return false
    }
    if (!sanitizarEntero(form.stock_minimo) && sanitizarEntero(form.stock_minimo) !== 0) {
      toast.error('El stock mínimo es obligatorio')
      return false
    }
    if (!form.codigos || form.codigos.length === 0) {
      toast.error('Debes agregar al menos un código de barras')
      return false
    }
    // Verificar disponibilidad: al menos una sucursal habilitada
    if (sucursales.length > 1) {
      const hayHabilitada = sucursales.some(s => disponibilidad[s.id] !== false)
      if (!hayHabilitada) {
        toast.error('El producto debe estar disponible en al menos una sucursal')
        return false
      }
    }
    return true
  }

  const guardar = async () => {
    if (!validarPaso1()) return
    if (cargandoRef.current) return
    cargandoRef.current = true
    setCargando(true)
    try {
      if (esEdicion) {
        const { error: errEd } = await supabase.rpc('editar_producto', {
          p_producto_id:    productoEditar.id,
          p_nombre:         sanitizar(form.nombre),
          p_categoria:      sanitizar(form.categoria) || null,
          p_precio_compra:  sanitizarNum(form.precio_compra),
          p_precio_venta:   sanitizarNum(form.precio_venta),
          p_precio_mayoreo: sanitizarNum(form.precio_mayoreo),
          p_stock_minimo:   sanitizarEntero(form.stock_minimo),
        })
        if (errEd) throw errEd

        // cantidad_mayoreo no está en el RPC — actualizar directamente
        await supabase.from('productos')
          .update({ cantidad_mayoreo: sanitizarEntero(form.cantidad_mayoreo) || null })
          .eq('id', productoEditar.id)

        const { error: errProv } = await supabase
          .from('productos')
          .update({ proveedor_id: form.proveedor_id || null })
          .eq('id', productoEditar.id)
        if (errProv) throw errProv

        const codigosOriginales = productoEditar.codigos || []
        const codigosNuevos = form.codigos

        const { data: codigosDB } = await supabase
          .from('codigos_barras')
          .select('id, codigo')
          .eq('producto_id', productoEditar.id)

        for (const cb of (codigosDB || [])) {
          if (!codigosNuevos.includes(cb.codigo)) {
            await supabase.rpc('eliminar_codigo_barras', { p_codigo_id: cb.id })
          }
        }

        for (const cod of codigosNuevos) {
          if (!codigosOriginales.includes(cod)) {
            const { error } = await supabase.rpc('agregar_codigo_barras', {
              p_producto_id: productoEditar.id,
              p_codigo: cod,
            })
            if (error) throw error
          }
        }

        // Guardar disponibilidad por sucursal
        if (sucursales.length > 1 && Object.keys(disponibilidad).length > 0) {
          const rowsDisp = Object.entries(disponibilidad).map(([sid, hab]) => ({
            producto_id: productoEditar.id,
            sucursal_id: sid,
            habilitado:  hab,
          }))
          const { error: errDisp } = await supabase.from('productos_sucursales')
            .upsert(rowsDisp, { onConflict: 'producto_id,sucursal_id' })
          if (errDisp) throw errDisp
        }

        await logBitacora({
          empresa_id:    empresa?.id,
          tipo:          'producto_editado',
          descripcion:   `Producto editado: "${sanitizar(form.nombre)}"`,
          usuario_id:    perfil?.id ?? null,
          referencia_id: productoEditar.id,
        })
        toast.success('Producto actualizado')

      } else {
        // Validar: si incluirStock está activo y hay cantidades, la fecha de caducidad es obligatoria
        if (incluirStock) {
          const hayStock = Object.values(stockPorSucursal).some(
            v => sanitizarEntero(v) > 0
          )
          if (hayStock && !loteInfo.fecha_caducidad) {
            toast.error('La fecha de caducidad es obligatoria cuando registras stock')
            setCargando(false)
            return
          }
        }

        const stockArr = incluirStock
          ? Object.entries(stockPorSucursal)
              .filter(([_, cant]) => sanitizarEntero(cant) > 0)
              .map(([sucursal_id, cant]) => ({
                sucursal_id,
                cantidad: sanitizarEntero(cant),
                codigo_lote: loteInfo.codigo_lote?.trim() || null,
                fecha_caducidad: loteInfo.fecha_caducidad || null,
              }))
          : []

        // Disponibilidad por sucursal — se pasa al RPC para guardarse con SECURITY DEFINER
        const dispArr = sucursales.length > 1
          ? Object.entries(disponibilidad).map(([sucursal_id, habilitado]) => ({ sucursal_id, habilitado }))
          : []

        // El RPC retorna el UUID del producto creado
        const { data: nuevoProductoId, error } = await supabase.rpc('crear_producto_completo', {
          p_empresa_id:       empresa?.id,
          p_nombre:           sanitizar(form.nombre),
          p_categoria:        sanitizar(form.categoria) || null,
          p_precio_compra:    sanitizarNum(form.precio_compra),
          p_precio_venta:     sanitizarNum(form.precio_venta),
          p_precio_mayoreo:   sanitizarNum(form.precio_mayoreo),
          p_cantidad_mayoreo: sanitizarEntero(form.cantidad_mayoreo) || null,
          p_stock_minimo:     sanitizarEntero(form.stock_minimo),
          p_codigos:          form.codigos,
          p_stock_inicial:    stockArr,
          p_disponibilidad:   dispArr,
        })
        if (error) throw error

        if (nuevoProductoId && form.proveedor_id) {
          await supabase.from('productos')
            .update({ proveedor_id: form.proveedor_id })
            .eq('id', nuevoProductoId)
        }

        await logBitacora({
          empresa_id:    empresa?.id,
          tipo:          'producto_creado',
          descripcion:   `Producto creado: "${sanitizar(form.nombre)}"${incluirStock && stockArr.length > 0 ? ` con stock en ${stockArr.length} sucursal(es)` : ''}`,
          usuario_id:    perfil?.id ?? null,
        })
        toast.success(
          incluirStock && stockArr.length > 0
            ? `Producto creado con stock en ${stockArr.length} sucursal(es)`
            : 'Producto creado'
        )
      }

      onExito?.()
      onCerrar()
    } catch (err) {
      toast.error(err.message || 'Error al guardar producto')
    } finally {
      cargandoRef.current = false
      setCargando(false)
    }
  }

  const siguienteAStock = () => {
    if (!validarPaso1()) return
    setPaso(2)
  }

  if (!abierto) return null

  const totalStockACapturar = Object.values(stockPorSucursal)
    .reduce((s, v) => s + sanitizarEntero(v), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => !cargando && onCerrar()}
      />

      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {esEdicion ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <p className="text-xs text-slate-500">
                {esEdicion ? form.nombre : paso === 1 ? 'Datos del producto' : 'Stock inicial'}
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            disabled={cargando}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Indicador de pasos (solo al crear) */}
        {!esEdicion && (
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
              paso === 1 ? 'bg-primary-100 text-primary-700' : 'bg-emerald-50 text-emerald-700'
            )}>
              <span>{paso === 1 ? '1' : <Check className="w-3 h-3" />}</span>
              <span>Datos</span>
            </div>
            <div className="flex-1 h-0.5 bg-slate-200 rounded-full">
              <div className={cn(
                'h-full bg-primary-500 rounded-full transition-all',
                paso === 1 ? 'w-0' : 'w-full'
              )} />
            </div>
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors',
              paso === 2 ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
            )}>
              <span>2</span>
              <span>Stock inicial</span>
            </div>
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {(paso === 1 || esEdicion) && (
            <>
              <Input
                label="Nombre del producto *"
                iconoIzq={<ShoppingBag className="w-5 h-5" />}
                value={form.nombre}
                onChange={cambiarCampo('nombre')}
                placeholder="Ej. Paracetamol 500mg"
                required
                autoFocus
              />

              <Chips
                label="Códigos de barras"
                iconoChip={<Barcode className="w-3 h-3" />}
                valores={form.codigos}
                onChange={(c) => setForm(v => ({ ...v, codigos: c }))}
                placeholder="Escanear o escribir y Enter"
              />

              <Select
                label="Categoría *"
                iconoIzq={<Tag className="w-5 h-5" />}
                valor={form.categoria}
                onChange={(v) => setForm(prev => ({ ...prev, categoria: v || '' }))}
                opciones={CATEGORIAS_PRODUCTO.map(c => ({ valor: c, etiqueta: c }))}
                placeholder="Seleccionar categoría..."
                permitirVacio
              />

              <Select
                label="Proveedor"
                iconoIzq={<Store className="w-5 h-5" />}
                valor={form.proveedor_id}
                onChange={(v) => setForm(prev => ({ ...prev, proveedor_id: v || '' }))}
                opciones={proveedores.map(p => ({ valor: p.id, etiqueta: p.nombre }))}
                placeholder={proveedores.length === 0 ? 'Sin proveedores registrados' : 'Seleccionar proveedor...'}
                permitirVacio
              />

              {/* Precio compra + utilidad + precio venta */}
              <div className="space-y-3">
                <Input
                  label="Precio de compra *"
                  type="number"
                  step="0.01"
                  min="0"
                  iconoIzq={<DollarSign className="w-5 h-5" />}
                  value={form.precio_compra}
                  onChange={cambiarCampo('precio_compra')}
                  placeholder="0.00"
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="% Utilidad"
                    type="number"
                    step="0.1"
                    min="0"
                    iconoIzq={<Percent className="w-5 h-5" />}
                    value={form.utilidad_porcentaje}
                    onChange={cambiarCampo('utilidad_porcentaje')}
                    placeholder="30"
                  />
                  <Input
                    label="Precio venta *"
                    type="number"
                    step="0.01"
                    min="0"
                    iconoIzq={<DollarSign className="w-5 h-5" />}
                    value={form.precio_venta}
                    onChange={cambiarCampo('precio_venta')}
                    placeholder="0.00"
                    required
                  />
                </div>

                {/* Indicador de utilidad */}
                {analisisUtilidad && (
                  <div className={cn(
                    'rounded-2xl border p-3 flex items-center gap-3 transition-all',
                    analisisUtilidad.clases
                  )}>
                    <analisisUtilidad.Icono className={cn('w-5 h-5 flex-shrink-0', analisisUtilidad.iconoClase)} />
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold">
                        {analisisUtilidad.porcentaje.toFixed(1)}%
                      </span>
                      <span className="text-sm opacity-80">·</span>
                      <span className="text-sm font-medium">{analisisUtilidad.mensaje}</span>
                      <span className="text-sm opacity-80">·</span>
                      <span className="text-sm">
                        Ganancia: <strong>{formatoMoneda(analisisUtilidad.ganancia)}</strong> / ud
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 items-end">
                <Input
                  label="Precio mayoreo *"
                  type="number"
                  step="0.01"
                  min="0"
                  iconoIzq={<DollarSign className="w-5 h-5" />}
                  value={form.precio_mayoreo}
                  onChange={cambiarCampo('precio_mayoreo')}
                  placeholder="0.00"
                />
                <Input
                  label="Cant. mínima mayoreo *"
                  type="number"
                  min="1"
                  iconoIzq={<Hash className="w-5 h-5" />}
                  value={form.cantidad_mayoreo}
                  onChange={cambiarCampo('cantidad_mayoreo')}
                  placeholder="ej. 5"
                />
                <Input
                  label="Stock mínimo *"
                  type="number"
                  min="0"
                  iconoIzq={<Hash className="w-5 h-5" />}
                  value={form.stock_minimo}
                  onChange={cambiarCampo('stock_minimo')}
                  placeholder="10"
                />
              </div>
              {analisisMayoreo && (
                <div className={cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium -mt-1',
                  analisisMayoreo.ok
                    ? 'bg-purple-50 border border-purple-200 text-purple-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                )}>
                  {analisisMayoreo.ok
                    ? <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} />
                    : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {analisisMayoreo.msg}
                </div>
              )}
              {/* Disponibilidad por sucursal — cuando hay múltiples sucursales */}
              {sucursales.length > 1 && Object.keys(disponibilidad).length > 0 && (
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-700">Disponibilidad por sucursal</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Los productos desactivados no aparecen en la caja de esa sucursal
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {sucursales.map(suc => {
                      const hab = disponibilidad[suc.id] ?? true
                      return (
                        <div key={suc.id} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <Store className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-slate-700 truncate">{suc.nombre}</span>
                            {!hab && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 flex-shrink-0">
                                Desactivado
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleDisponibilidad(suc.id)}
                            style={{
                              position: 'relative', width: 44, height: 24,
                              borderRadius: 9999, border: 'none', cursor: 'pointer',
                              backgroundColor: hab ? '#10b981' : '#cbd5e1',
                              transition: 'background-color 0.2s',
                              flexShrink: 0, marginLeft: 12,
                            }}
                          >
                            <span style={{
                              position: 'absolute',
                              top: 4, left: hab ? 24 : 4,
                              width: 16, height: 16,
                              backgroundColor: 'white',
                              borderRadius: '50%',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {!esEdicion && paso === 2 && (
            <>
              <div className="bg-primary-50/50 border border-primary-200 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">¿Agregar stock inicial?</p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Opcional. También lo puedes hacer después desde Inventario.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncluirStock(v => !v)}
                    style={{
                      position: 'relative', width: 44, height: 24,
                      borderRadius: 9999, border: 'none', cursor: 'pointer',
                      backgroundColor: incluirStock ? '#4f46e5' : '#cbd5e1',
                      transition: 'background-color 0.2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      top: 4, left: incluirStock ? 24 : 4,
                      width: 16, height: 16,
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                    }} />
                  </button>
                </div>
              </div>

              {incluirStock && (
                <>
                  {sucursales.length === 0 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
                      No tienes sucursales activas. Crea al menos una sucursal primero.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Cantidad por sucursal
                        </p>
                        {sucursales.filter(suc => disponibilidad[suc.id] !== false).map(suc => (
                          <div key={suc.id} className="flex items-center gap-3 bg-slate-50 rounded-2xl p-3">
                            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                              <Store className="w-4 h-4 text-slate-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {suc.nombre}
                              </p>
                              <p className="text-xs text-slate-500">Sucursal</p>
                            </div>
                            <div className="w-20 flex-shrink-0">
                              <input
                                type="number"
                                min="0"
                                value={stockPorSucursal[suc.id] || ''}
                                onChange={(e) => cambiarStock(suc.id, e.target.value)}
                                placeholder="0"
                                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-right text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-3 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                          Fecha de caducidad *
                        </p>
                        <Input
                          label="Caduca el *"
                          type="date"
                          iconoIzq={<Calendar className="w-5 h-5" />}
                          value={loteInfo.fecha_caducidad}
                          onChange={(e) => setLoteInfo(v => ({ ...v, fecha_caducidad: e.target.value }))}
                          min={fechaEnZona(tz)}
                          required
                        />
                        <p className="text-xs text-slate-400 mt-2">
                          Obligatoria. El código de lote se genera automáticamente (L-AAAAMM-NNN).
                        </p>
                      </div>

                      {totalStockACapturar > 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <p className="text-sm text-emerald-900">
                            Total a registrar: <strong>{totalStockACapturar} unidades</strong>
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
          {!esEdicion && paso === 2 ? (
            <>
              <Button variante="secundario" onClick={() => setPaso(1)} disabled={cargando} className="flex-1">
                Volver
              </Button>
              <Button onClick={guardar} cargando={cargando} className="flex-1">
                Crear producto
              </Button>
            </>
          ) : esEdicion ? (
            <>
              <Button variante="secundario" onClick={onCerrar} disabled={cargando} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={guardar} cargando={cargando} className="flex-1">
                Guardar cambios
              </Button>
            </>
          ) : (
            <>
              <Button variante="secundario" onClick={onCerrar} disabled={cargando} className="flex-1">
                Cancelar
              </Button>
              <Button onClick={siguienteAStock} className="flex-1">
                Siguiente
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}