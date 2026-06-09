import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  TrendingUp, TrendingDown, Users, Receipt, ShoppingCart, Package, Download, Calendar,
} from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'
import { useFocusRefresh } from '@/lib/useFocusRefresh'
import { formatoMoneda, isoEnZona, fechaEnZona, addDias } from '@/lib/formatos'
import { CATEGORIAS_GASTO } from '@/lib/constantes'
import { cn } from '@/lib/clases'

const CAT_COLORES = {
  insumos:       '#0ea5e9',
  servicios:     '#8b5cf6',
  mantenimiento: '#f97316',
  transporte:    '#f59e0b',
  papeleria:     '#10b981',
  otros:         '#64748b',
}

function etiquetaCat(c) {
  return CATEGORIAS_GASTO.find(x => x.valor === c)?.etiqueta ?? c
}

function pct(parte, total) {
  return total > 0 ? ((parte / total) * 100).toFixed(1) : '0.0'
}

function monedaCorta(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`
  return `$${Math.round(v)}`
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, valor, sub, extra, color, Icono, negativo }) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl px-5 py-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
        <div className="w-8 h-8 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: color + '20' }}>
          <Icono style={{ width: 14, height: 14, color }} strokeWidth={2.5} />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold ${negativo ? 'text-red-600' : 'text-slate-900'}`}>
          {negativo ? '–' : ''}{formatoMoneda(Math.abs(valor))}
        </p>
        {sub   && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        {extra && <p className="text-sm font-semibold mt-1" style={{ color }}>{extra}</p>}
      </div>
    </div>
  )
}

// ─── Tooltip personalizado ────────────────────────────────────────────────────

function TooltipGrafica({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="text-xs font-bold" style={{ color: p.color }}>
            {formatoMoneda(p.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PERIODOS = [
  { key: '7',       label: '7 días'        },
  { key: '30',      label: '30 días'       },
  { key: '3m',      label: '3 meses'       },
  { key: 'año',     label: 'Este año'      },
  { key: 'año_ant', label: 'Año anterior'  },
  { key: 'todo',    label: 'Todo'          },
  { key: 'custom',  label: 'Personalizado' },
]

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function calcRango(periodo, fechaInicio, fechaFin, tz = 'America/Mexico_City') {
  const hoyStr = fechaEnZona(tz)
  const año    = parseInt(hoyStr.slice(0, 4))
  if (periodo === '7')       { return { inicio: addDias(hoyStr, -6),  fin: hoyStr } }
  if (periodo === '30')      { return { inicio: addDias(hoyStr, -29), fin: hoyStr } }
  if (periodo === '3m')      { return { inicio: addDias(hoyStr, -89), fin: hoyStr } }
  if (periodo === 'año')     { return { inicio: `${año}-01-01`,       fin: hoyStr } }
  if (periodo === 'año_ant') { return { inicio: `${año - 1}-01-01`,   fin: `${año - 1}-12-31` } }
  if (periodo === 'todo')    { return { inicio: '2020-01-01',          fin: hoyStr } }
  return { inicio: fechaInicio, fin: fechaFin }
}

export default function ReportesPage() {
  const { empresa, sucursales, tz } = useApp()

  const [periodo,     setPeriodo]     = useState('30')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin,    setFechaFin]    = useState('')
  const [datos,       setDatos]       = useState(null)
  const [cargando,    setCargando]    = useState(true)
  const [refreshKey,  setRefreshKey]  = useState(0)

  useFocusRefresh(() => setRefreshKey(k => k + 1))

  // Ref para evitar que sucursales (array inestable) cause race conditions
  const sucursalesRef = useRef(sucursales)
  sucursalesRef.current = sucursales

  useEffect(() => {
    if (!empresa?.id) return
    const { inicio, fin } = calcRango(periodo, fechaInicio, fechaFin, tz)
    if (!inicio || !fin) return

    let activo = true
    setCargando(true)

    const run = async () => {
    try {
      const [
        { data: ventas,      error: e1 },
        { data: gastos,      error: e2 },
        { data: semanas,     error: e3 },
        { data: perfilesData,error: e4 },
      ] = await Promise.all([
        supabase.from('ventas')
          .select('id, total, creado_en, sucursal_id')
          .eq('empresa_id', empresa.id)
          .neq('estado', 'cancelada')
          .gte('creado_en', inicio + 'T00:00:00')
          .lte('creado_en', fin   + 'T23:59:59'),
        supabase.from('gastos')
          .select('monto, categoria, sucursal_id')
          .eq('empresa_id', empresa.id)
          .gte('fecha', inicio)
          .lte('fecha', fin),
        supabase.from('semanas_salario')
          .select('total_calculado, semana_inicio, usuario_id')
          .eq('empresa_id', empresa.id),
        supabase.from('perfiles')
          .select('id, nombre, sucursal_id')
          .eq('empresa_id', empresa.id),
      ])

      if (e1 || e2 || e4) toast.error('Error al cargar datos del reporte. Algunos números pueden estar incompletos.')
      if (e3) toast.warning('No se pudieron cargar los salarios. Los costos de nómina no estarán incluidos.')

      // Mapa de perfil por usuario_id
      const perfilMap = {}
      for (const p of (perfilesData ?? [])) perfilMap[p.id] = p

      // Filtrar semanas que se superponen con el período
      const semanasFiltradas = (semanas ?? []).filter(s => {
        if (!s.semana_inicio) return false
        const semFin = new Date(s.semana_inicio + 'T12:00:00')
        semFin.setDate(semFin.getDate() + 6)
        return s.semana_inicio <= fin && isoEnZona(semFin, tz) >= inicio
      })

      // Detalles con costo
      const ventaIds = (ventas ?? []).map(v => v.id)
      let detalles   = []
      if (ventaIds.length > 0) {
        const { data: det } = await supabase
          .from('detalle_ventas')
          .select('venta_id, producto_id, cantidad, precio_unitario, productos(nombre, precio_compra)')
          .in('venta_id', ventaIds)
        detalles = det ?? []
      }

      // Mapa venta_id → {sucursal_id, creado_en}
      const ventaMap = {}
      for (const v of (ventas ?? [])) {
        ventaMap[v.id] = { sucursal_id: v.sucursal_id, creado_en: v.creado_en }
      }

      // ── Totales globales ───────────────────────────────────────────────────
      const totalIngresos = (ventas  ?? []).reduce((a, v) => a + (v.total           ?? 0), 0)
      const totalGastos   = (gastos  ?? []).reduce((a, g) => a + (g.monto           ?? 0), 0)
      const totalSalarios = semanasFiltradas.reduce((a, s) => a + (s.total_calculado ?? 0), 0)
      const totalCOGS     = detalles.reduce((a, d) =>
        a + (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0), 0)

      const margenBruto = totalIngresos - totalCOGS
      const ganancia    = margenBruto - totalGastos - totalSalarios
      const margenPct   = totalIngresos > 0 ? (ganancia    / totalIngresos) * 100 : 0
      const margenBrPct = totalIngresos > 0 ? (margenBruto / totalIngresos) * 100 : 0

      // ── Por sucursal ───────────────────────────────────────────────────────
      const sucMap = {}
      for (const s of sucursalesRef.current) {
        sucMap[s.id] = { nombre: s.nombre, ventas: 0, cogs: 0, gastos: 0, salarios: 0 }
      }
      sucMap['__general__'] = { nombre: 'General (empresa)', ventas: 0, cogs: 0, gastos: 0, salarios: 0 }
      for (const v of (ventas ?? [])) {
        if (sucMap[v.sucursal_id]) sucMap[v.sucursal_id].ventas += v.total ?? 0
      }
      for (const d of detalles) {
        const sid = ventaMap[d.venta_id]?.sucursal_id
        if (sid && sucMap[sid]) {
          sucMap[sid].cogs += (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0)
        }
      }
      for (const g of (gastos ?? [])) {
        const key = (g.sucursal_id && sucMap[g.sucursal_id]) ? g.sucursal_id : '__general__'
        sucMap[key].gastos += g.monto ?? 0
      }
      for (const s of semanasFiltradas) {
        const sid = perfilMap[s.usuario_id]?.sucursal_id
        if (sid && sucMap[sid]) sucMap[sid].salarios += s.total_calculado ?? 0
      }
      const sucursalesData = Object.values(sucMap)
        .map(s => ({
          ...s,
          ganancia: s.ventas - s.cogs - s.gastos - s.salarios,
          margen:   s.ventas > 0 ? ((s.ventas - s.cogs - s.gastos - s.salarios) / s.ventas) * 100 : 0,
        }))
        .filter(s => s.ventas > 0 || s.gastos > 0)
        .sort((a, b) => b.ventas - a.ventas)

      // ── Gráfica ────────────────────────────────────────────────────────────
      const diasRango = Math.round((new Date(fin) - new Date(inicio)) / 86400000) + 1
      const porMes    = diasRango > 90
      const chartDatos = []

      // Mapas de ingresos y COGS por período
      const ingPeriodo  = {}
      const cogsPeriodo = {}

      if (porMes) {
        for (const v of (ventas ?? [])) {
          const k = isoEnZona(new Date(v.creado_en), tz).slice(0, 7)
          ingPeriodo[k] = (ingPeriodo[k] ?? 0) + (v.total ?? 0)
        }
        for (const d of detalles) {
          const fecha = ventaMap[d.venta_id]?.creado_en
          if (!fecha) continue
          const k = isoEnZona(new Date(fecha), tz).slice(0, 7)
          cogsPeriodo[k] = (cogsPeriodo[k] ?? 0) + (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0)
        }
        // Iterar todos los meses del rango
        const cur = new Date(inicio.slice(0, 7) + '-01T12:00:00')
        const end = new Date(fin.slice(0, 7)   + '-01T12:00:00')
        while (cur <= end) {
          const k   = isoEnZona(cur, tz).slice(0, 7)
          const [, m] = k.split('-')
          const v   = ingPeriodo[k]  ?? 0
          const c   = cogsPeriodo[k] ?? 0
          chartDatos.push({ label: k, etiqueta: MESES[parseInt(m) - 1], ventas: v || null, margenBruto: v > 0 ? v - c : null })
          cur.setMonth(cur.getMonth() + 1)
        }
      } else {
        for (const v of (ventas ?? [])) {
          const k = isoEnZona(new Date(v.creado_en), tz)
          ingPeriodo[k] = (ingPeriodo[k] ?? 0) + (v.total ?? 0)
        }
        for (const d of detalles) {
          const fecha = ventaMap[d.venta_id]?.creado_en
          if (!fecha) continue
          const k = isoEnZona(new Date(fecha), tz)
          cogsPeriodo[k] = (cogsPeriodo[k] ?? 0) + (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0)
        }
        const cur = new Date(inicio + 'T12:00:00')
        const end = new Date(fin   + 'T12:00:00')
        while (cur <= end) {
          const ds  = isoEnZona(cur, tz)
          const dia = cur.getDate()
          const mes = cur.getMonth()
          const v   = ingPeriodo[ds]  ?? 0
          const c   = cogsPeriodo[ds] ?? 0
          // Etiqueta: mostrar día + mes abreviado en primer día del mes o primer punto
          const esInicioMes = dia === 1
          const etiqs = diasRango <= 14
            ? `${dia} ${MESES[mes]}`
            : (esInicioMes || dia % Math.ceil(diasRango / 8) === 1 ? `${dia} ${MESES[mes]}` : '')
          chartDatos.push({ label: ds, etiqueta: etiqs, ventas: v || null, margenBruto: v > 0 ? v - c : null })
          cur.setDate(cur.getDate() + 1)
        }
      }

      // ── Gastos por categoría ───────────────────────────────────────────────
      const gastosCat = {}
      for (const g of (gastos ?? [])) {
        gastosCat[g.categoria] = (gastosCat[g.categoria] ?? 0) + (g.monto ?? 0)
      }

      // ── Salarios por empleado ──────────────────────────────────────────────
      const salEmp = {}
      for (const s of semanasFiltradas) {
        const uid = s.usuario_id
        if (!salEmp[uid]) salEmp[uid] = { nombre: perfilMap[uid]?.nombre ?? '—', total: 0 }
        salEmp[uid].total += s.total_calculado ?? 0
      }

      // ── Top productos ──────────────────────────────────────────────────────
      const prodMap = {}
      for (const d of detalles) {
        const id = d.producto_id
        if (!prodMap[id]) prodMap[id] = { nombre: d.productos?.nombre ?? '—', cantidad: 0, ingresos: 0, cogs: 0 }
        prodMap[id].cantidad += d.cantidad ?? 0
        prodMap[id].ingresos += (d.cantidad ?? 0) * (d.precio_unitario ?? 0)
        prodMap[id].cogs     += (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0)
      }
      const topProductos = Object.values(prodMap)
        .map(p => ({ ...p, ganancia: p.ingresos - p.cogs, margen: p.ingresos > 0 ? ((p.ingresos - p.cogs) / p.ingresos) * 100 : 0 }))
        .sort((a, b) => b.ingresos - a.ingresos)
        .slice(0, 5)

      // ── Datos por sucursal para exportación ───────────────────────────────
      const sucursalesExport = sucursalesRef.current.map(suc => {
        const vtsSuc    = (ventas ?? []).filter(v => v.sucursal_id === suc.id)
        const idsVts    = new Set(vtsSuc.map(v => v.id))
        const detSuc    = detalles.filter(d => idsVts.has(d.venta_id))
        const gtsSuc    = (gastos ?? []).filter(g => g.sucursal_id === suc.id)
        const semSuc    = semanasFiltradas.filter(s => perfilMap[s.usuario_id]?.sucursal_id === suc.id)

        const ingSuc = {}; const cogSuc = {}
        for (const v of vtsSuc) {
          const k = porMes ? isoEnZona(new Date(v.creado_en), tz).slice(0,7) : isoEnZona(new Date(v.creado_en), tz)
          ingSuc[k] = (ingSuc[k] ?? 0) + (v.total ?? 0)
        }
        for (const d of detSuc) {
          const f = ventaMap[d.venta_id]?.creado_en; if (!f) continue
          const k = porMes ? isoEnZona(new Date(f), tz).slice(0,7) : isoEnZona(new Date(f), tz)
          cogSuc[k] = (cogSuc[k] ?? 0) + (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0)
        }
        const chartSuc = chartDatos.map(r => {
          const v = ingSuc[r.label] ?? 0; const co = cogSuc[r.label] ?? 0
          return { ...r, ventas: v || null, margenBruto: v > 0 ? v - co : null }
        })

        const pmSuc = {}
        for (const d of detSuc) {
          if (!pmSuc[d.producto_id]) pmSuc[d.producto_id] = { nombre: d.productos?.nombre ?? '—', cantidad: 0, ingresos: 0, cogs: 0 }
          pmSuc[d.producto_id].cantidad += d.cantidad ?? 0
          pmSuc[d.producto_id].ingresos += (d.cantidad ?? 0) * (d.precio_unitario ?? 0)
          pmSuc[d.producto_id].cogs     += (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0)
        }
        const topSuc = Object.values(pmSuc)
          .map(p => ({ ...p, ganancia: p.ingresos - p.cogs, margen: p.ingresos > 0 ? (p.ingresos - p.cogs) / p.ingresos * 100 : 0 }))
          .sort((a, b) => b.ingresos - a.ingresos).slice(0, 5)

        const gcSuc = {}
        for (const g of gtsSuc) gcSuc[g.categoria] = (gcSuc[g.categoria] ?? 0) + (g.monto ?? 0)

        const slSuc = {}
        for (const s of semSuc) {
          if (!slSuc[s.usuario_id]) slSuc[s.usuario_id] = { nombre: perfilMap[s.usuario_id]?.nombre ?? '—', total: 0 }
          slSuc[s.usuario_id].total += s.total_calculado ?? 0
        }

        const tIng  = vtsSuc.reduce((a, v) => a + (v.total ?? 0), 0)
        const tCogs = detSuc.reduce((a, d) => a + (d.cantidad ?? 0) * (d.productos?.precio_compra ?? 0), 0)
        const tGts  = gtsSuc.reduce((a, g) => a + (g.monto ?? 0), 0)
        const tSal  = semSuc.reduce((a, s) => a + (s.total_calculado ?? 0), 0)
        const tGan  = tIng - tCogs - tGts - tSal

        return {
          id: suc.id, nombre: suc.nombre,
          totalIngresos: tIng, totalCOGS: tCogs, margenBruto: tIng - tCogs,
          totalGastos: tGts, totalSalarios: tSal, ganancia: tGan,
          margenBrPct: tIng > 0 ? (tIng - tCogs) / tIng * 100 : 0,
          margenPct:   tIng > 0 ? tGan / tIng * 100 : 0,
          numVentas: vtsSuc.length,
          chartDatos: chartSuc, topProductos: topSuc,
          gastosCat: gcSuc,
          salarios: Object.values(slSuc).sort((a, b) => b.total - a.total),
        }
      })

      if (activo) setDatos({
        totalIngresos, totalCOGS, margenBruto, margenBrPct,
        totalGastos, totalSalarios,
        ganancia, margenPct,
        chartDatos, porMes,
        gastosCat,
        topProductos,
        sucursalesData,
        sucursalesExport,
        salarios:  Object.values(salEmp).sort((a, b) => b.total - a.total),
        numVentas: (ventas ?? []).length,
      })
    } catch (e) {
      toast.error('Error inesperado al generar el reporte.')
    } finally {
      if (activo) setCargando(false)
    }
    }
    run() // eslint-disable-line
    return () => { activo = false }
  }, [empresa?.id, periodo, fechaInicio, fechaFin, refreshKey])

  const { inicio, fin } = calcRango(periodo, fechaInicio, fechaFin)

  function exportarCSV() {
    if (!datos || !inicio || !fin) return

    // ── Helpers ───────────────────────────────────────────────────────────
    const c    = (...vals) => vals.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    const mon  = v => '$' + Number(v || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const pct  = (parte, total) => total > 0 ? (parte / total * 100).toFixed(1) + '%' : '—'
    const fmtD = s => new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

    const porMes    = datos.porMes ?? false
    const tipoSerie = porMes ? 'MENSUALES' : 'DIARIAS'
    const colFecha  = porMes ? 'Mes' : 'Fecha'

    const PERIODO_LABEL = {
      '7': 'Últimos 7 días', '30': 'Últimos 30 días', '3m': 'Últimos 3 meses',
      'año': 'Año actual', 'año_ant': 'Año anterior', 'todo': 'Todo el historial',
      'custom': `${fmtD(inicio)} al ${fmtD(fin)}`,
    }
    const PERIODO_FILE = {
      '7': '7dias', '30': '30dias', '3m': '3meses',
      'año': 'año-actual', 'año_ant': 'año-anterior',
      'todo': 'todo', 'custom': `${inicio}_${fin}`,
    }
    const nombrePeriodo = PERIODO_LABEL[periodo] ?? `${fmtD(inicio)} — ${fmtD(fin)}`
    const nombreArchivo = PERIODO_FILE[periodo] ?? inicio

    // ── Función reutilizable: genera las filas de un bloque (general o por sucursal) ──
    function bloque(d) {
      const rs = []

      // 1. Resumen ejecutivo
      rs.push(c('1. RESUMEN EJECUTIVO'))
      rs.push(c('Concepto', 'Monto', '% de ingresos'))
      rs.push(c('Ingresos totales',       mon(d.totalIngresos), '100.0%'))
      rs.push(c('Costo de ventas (COGS)', mon(d.totalCOGS),     pct(d.totalCOGS,     d.totalIngresos)))
      rs.push(c('Margen bruto',           mon(d.margenBruto),   pct(d.margenBruto,   d.totalIngresos)))
      rs.push(c('Gastos operativos',      mon(d.totalGastos),   pct(d.totalGastos,   d.totalIngresos)))
      rs.push(c('Costo de personal',      mon(d.totalSalarios), pct(d.totalSalarios, d.totalIngresos)))
      rs.push(c('Ganancia neta',          mon(d.ganancia),      pct(d.ganancia,      d.totalIngresos)))
      rs.push(c('Número de ventas',       d.numVentas,          ''))
      rs.push('')

      // 2. Serie de tiempo
      rs.push(c(`2. VENTAS ${tipoSerie}`))
      rs.push(c(colFecha, 'Ventas', 'Margen bruto', 'Margen %'))
      for (const r of d.chartDatos) {
        const v = r.ventas ?? 0; const mb = r.margenBruto ?? 0
        rs.push(c(r.label, mon(v), mon(mb), v > 0 ? pct(mb, v) : '—'))
      }
      rs.push('')

      // 3. Productos más vendidos
      if (d.topProductos.length > 0) {
        rs.push(c('3. PRODUCTOS MÁS VENDIDOS'))
        rs.push(c('Producto', 'Unidades', 'Ingresos', '% de ingresos', 'Costo', 'Ganancia', 'Margen %'))
        for (const p of d.topProductos)
          rs.push(c(p.nombre, p.cantidad, mon(p.ingresos),
            pct(p.ingresos, d.totalIngresos), mon(p.cogs), mon(p.ganancia),
            pct(p.ganancia, p.ingresos)))
        rs.push('')
      }

      // 4. Gastos por categoría
      const gts = Object.entries(d.gastosCat ?? {}).sort((a, b) => b[1] - a[1])
      if (gts.length > 0) {
        rs.push(c('4. GASTOS POR CATEGORÍA'))
        rs.push(c('Categoría', 'Monto', '% del total de gastos'))
        for (const [cat, monto] of gts)
          rs.push(c(etiquetaCat(cat), mon(monto), pct(monto, d.totalGastos)))
        rs.push(c('TOTAL', mon(d.totalGastos), '100.0%'))
        rs.push('')
      }

      // 5. Costo de personal
      if (d.salarios.length > 0) {
        rs.push(c('5. COSTO DE PERSONAL'))
        rs.push(c('Empleado', 'Total', '% del costo de personal'))
        for (const emp of d.salarios)
          rs.push(c(emp.nombre, mon(emp.total), pct(emp.total, d.totalSalarios)))
        rs.push(c('TOTAL', mon(d.totalSalarios), '100.0%'))
        rs.push('')
      }

      return rs
    }

    const rows = []

    // ── Encabezado del documento ──────────────────────────────────────────
    rows.push(c(`REPORTE FINANCIERO — ${empresa?.nombre ?? 'FARMACIA'}`))
    rows.push(c('Período:', nombrePeriodo))
    rows.push(c('Rango de fechas:', `${fmtD(inicio)} al ${fmtD(fin)}`))
    rows.push(c('Generado:', new Date().toLocaleString('es-MX')))
    rows.push('')
    rows.push('')

    // ── SECCIÓN GENERAL ───────────────────────────────────────────────────
    rows.push(c('══════════════════════════════════════'))
    rows.push(c('GENERAL — TODAS LAS SUCURSALES'))
    rows.push(c('══════════════════════════════════════'))
    rows.push('')
    rows.push(...bloque(datos))

    // Tabla comparativa (solo si hay más de una sucursal)
    const sucExp = datos.sucursalesExport ?? []
    if (sucExp.length > 1) {
      rows.push(c('6. COMPARATIVA POR SUCURSAL'))
      rows.push(c('Sucursal', 'Ventas', '% del total', 'Costo ventas', 'Gastos', 'Personal', 'Ganancia', 'Margen %'))
      for (const s of sucExp)
        rows.push(c(s.nombre, mon(s.totalIngresos), pct(s.totalIngresos, datos.totalIngresos),
          mon(s.totalCOGS), mon(s.totalGastos), mon(s.totalSalarios),
          mon(s.ganancia), pct(s.ganancia, s.totalIngresos)))
      rows.push(c('TOTAL', mon(datos.totalIngresos), '100.0%',
        mon(datos.totalCOGS), mon(datos.totalGastos), mon(datos.totalSalarios),
        mon(datos.ganancia), pct(datos.ganancia, datos.totalIngresos)))
      rows.push('')
    }

    // ── SECCIÓN POR SUCURSAL ──────────────────────────────────────────────
    for (const suc of sucExp) {
      rows.push('')
      rows.push(c('══════════════════════════════════════'))
      rows.push(c(`SUCURSAL: ${suc.nombre.toUpperCase()}`))
      rows.push(c('══════════════════════════════════════'))
      rows.push('')
      rows.push(...bloque(suc))
    }

    // ── Descargar ─────────────────────────────────────────────────────────
    const csv  = '﻿' + rows.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `reporte-${(empresa?.nombre ?? 'farmacia').replace(/\s+/g, '-').toLowerCase()}-${nombreArchivo}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const maxCat       = datos ? Math.max(...Object.values(datos.gastosCat), 1) : 1
  const maxSucVentas = datos ? Math.max(...(datos.sucursalesData ?? []).map(s => s.ventas), 1) : 1

  const labelRango = () => {
    if (!inicio || !fin) return 'Selecciona un período'
    const fmt = s => new Date(s + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    return `${fmt(inicio)} — ${fmt(fin)}`
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
          <p className="text-sm text-slate-500 mt-0.5">{labelRango()}</p>
        </div>
        {datos && !cargando && (
          <button onClick={exportarCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm flex-shrink-0">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
            <span className="sm:hidden">CSV</span>
          </button>
        )}
      </div>

      {/* Selector de período */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className={cn(
                'px-4 py-2 rounded-2xl text-sm font-semibold border transition-all',
                periodo === p.key
                  ? 'bg-primary-600 text-white border-primary-600 shadow-sm shadow-primary-500/20'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              )}>
              {p.label}
            </button>
          ))}
        </div>

        {periodo === 'custom' && (
          <div className="flex items-center gap-3 flex-wrap pt-1">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 w-10">Desde</label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-slate-50" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 w-10">Hasta</label>
              <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-slate-50" />
            </div>
          </div>
        )}
      </div>

      {cargando ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : periodo === 'custom' && (!fechaInicio || !fechaFin) ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Calendar className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Selecciona el rango de fechas</p>
          <p className="text-xs text-slate-400">Elige una fecha de inicio y una fecha de fin para ver el reporte.</p>
        </div>
      ) : datos && (
        <>
          {/* ── Estado de resultados ── */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Ingresos" valor={datos.totalIngresos}
              sub={`${datos.numVentas} venta${datos.numVentas !== 1 ? 's' : ''}`}
              color="#10b981" Icono={ShoppingCart} />
            <StatCard label="Costo de ventas" valor={datos.totalCOGS}
              sub={`${pct(datos.totalCOGS, datos.totalIngresos)}% de los ingresos`}
              color="#ef4444" Icono={Package} />
            <div className="col-span-2 lg:col-span-1 bg-emerald-50 border border-emerald-200 rounded-3xl px-5 py-4 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Margen bruto</span>
                <span className="text-xs font-semibold text-emerald-500">{datos.margenBrPct.toFixed(1)}%</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">{formatoMoneda(datos.margenBruto)}</p>
              <p className="text-xs text-emerald-500">Ingresos − Costo de ventas</p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard label="Gastos operativos" valor={datos.totalGastos}
              color="#f97316" Icono={Receipt} />
            <StatCard label="Costo de personal" valor={datos.totalSalarios}
              sub={`${datos.salarios.length} empleado${datos.salarios.length !== 1 ? 's' : ''}`}
              color="#8b5cf6" Icono={Users} />
            <div className={cn(
              'col-span-2 lg:col-span-1 rounded-3xl px-5 py-4 shadow-sm flex flex-col gap-3 border',
              datos.ganancia >= 0 ? 'bg-sky-50 border-sky-200' : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wide ${datos.ganancia >= 0 ? 'text-sky-600' : 'text-red-600'}`}>
                  Ganancia neta
                </span>
                <span className={`text-xs font-semibold ${datos.ganancia >= 0 ? 'text-sky-500' : 'text-red-500'}`}>
                  {datos.margenPct >= 0 ? '' : '–'}{Math.abs(datos.margenPct).toFixed(1)}% margen
                </span>
              </div>
              <p className={`text-2xl font-bold ${datos.ganancia >= 0 ? 'text-sky-700' : 'text-red-600'}`}>
                {datos.ganancia < 0 ? '–' : ''}{formatoMoneda(Math.abs(datos.ganancia))}
              </p>
              <p className={`text-xs ${datos.ganancia >= 0 ? 'text-sky-500' : 'text-red-400'}`}>
                Margen bruto − Gastos − Salarios
              </p>
            </div>
          </div>

          {/* ── Gráfica ── */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm font-semibold text-slate-700">Ventas en el período</p>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-sky-500 inline-block rounded-full" />
                  Ventas
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-emerald-500 inline-block rounded-full" />
                  Margen bruto
                </span>
              </div>
            </div>

            {datos.totalIngresos === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10">Sin ventas en este período</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={datos.chartDatos} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradVentas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#0ea5e9" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}    />
                    </linearGradient>
                    <linearGradient id="gradMargen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="etiqueta"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tickFormatter={monedaCorta}
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    axisLine={false} tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<TooltipGrafica />} />
                  <Area
                    type="monotone" dataKey="ventas" name="Ventas"
                    stroke="#0ea5e9" strokeWidth={2}
                    fill="url(#gradVentas)"
                    connectNulls
                    dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#0ea5e9' }}
                  />
                  <Area
                    type="monotone" dataKey="margenBruto" name="Margen bruto"
                    stroke="#10b981" strokeWidth={2}
                    fill="url(#gradMargen)"
                    connectNulls
                    dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: '#10b981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Por sucursal */}
          {datos.sucursalesData.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-5">
              <p className="text-sm font-semibold text-slate-700">Desglose por sucursal</p>
              <div className="flex flex-col gap-5">
                {datos.sucursalesData.map((s, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-800">{s.nombre}</span>
                      <span className={`text-sm font-bold ${s.ganancia >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {s.ganancia >= 0 ? '+' : '–'}{formatoMoneda(Math.abs(s.ganancia))}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Ventas <span className="font-semibold text-slate-700">{formatoMoneda(s.ventas)}</span></span>
                      <span>COGS <span className="font-semibold text-slate-700">{formatoMoneda(s.cogs)}</span></span>
                      <span>Gastos <span className="font-semibold text-slate-700">{formatoMoneda(s.gastos)}</span></span>
                      <span>Personal <span className="font-semibold text-slate-700">{formatoMoneda(s.salarios)}</span></span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-sky-400 transition-all"
                        style={{ width: `${(s.ventas / maxSucVentas) * 100}%` }} />
                    </div>
                    <p className="text-xs text-slate-400">
                      Margen neto:{' '}
                      <span className={s.margen >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                        {s.margen.toFixed(1)}%
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gastos + Salarios */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Gastos por categoría</p>
                <span className="text-xs text-slate-400">{formatoMoneda(datos.totalGastos)}</span>
              </div>
              {Object.keys(datos.gastosCat).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Sin gastos en este período</p>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {Object.entries(datos.gastosCat)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, monto]) => (
                      <div key={cat} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-slate-600">{etiquetaCat(cat)}</span>
                          <span className="text-xs font-semibold text-slate-700">{formatoMoneda(monto)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ width: `${(monto / maxCat) * 100}%`, background: CAT_COLORES[cat] ?? '#64748b' }} />
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Costo de personal</p>
                <span className="text-xs text-slate-400">{formatoMoneda(datos.totalSalarios)}</span>
              </div>
              {datos.salarios.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">Sin semanas registradas en este período</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {datos.salarios.map((emp, i) => {
                    const maxSal = datos.salarios[0].total
                    return (
                      <div key={i} className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-violet-700">
                                {emp.nombre.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-700 truncate">{emp.nombre}</p>
                          </div>
                          <span className="text-sm font-semibold text-slate-800 flex-shrink-0">
                            {formatoMoneda(emp.total)}
                          </span>
                        </div>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden ml-9">
                          <div className="h-full rounded-full bg-violet-400"
                            style={{ width: `${(emp.total / maxSal) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top productos con margen */}
          {datos.topProductos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col gap-4">
              <p className="text-sm font-semibold text-slate-700">Productos más vendidos</p>
              <div className="flex flex-col gap-3">
                {datos.topProductos.map((prod, i) => {
                  const maxI = datos.topProductos[0].ingresos
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-slate-300 w-4 text-center flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium text-slate-700 truncate">{prod.nombre}</span>
                          <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                            <span className="text-slate-400">{prod.cantidad} uds</span>
                            <span className="text-slate-600 font-medium">{formatoMoneda(prod.ingresos)}</span>
                            <span className={`font-bold min-w-[36px] text-right ${prod.margen >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {prod.margen.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                          <div className="h-full rounded-full bg-sky-400 absolute inset-0"
                            style={{ width: `${(prod.ingresos / maxI) * 100}%` }} />
                          <div className="h-full rounded-full bg-red-300 absolute inset-0"
                            style={{ width: `${(prod.cogs / maxI) * 100}%` }} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                            Venta {formatoMoneda(prod.ingresos)}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-300 inline-block" />
                            Costo {formatoMoneda(prod.cogs)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
