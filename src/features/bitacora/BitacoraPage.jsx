import { useState, useEffect, useCallback } from 'react'
import {
  History, ShoppingCart, Receipt, Wallet, ArrowLeftRight,
  Package, Ban, Check, X, ClipboardList, BadgeCheck,
  LogIn, LogOut, Search, Calendar, ChevronDown, Filter,
  Tag, CreditCard, Archive, PackageCheck, Truck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useApp } from '@/context/AppCtx'

// ─── Tipos con colores ────────────────────────────────────────────────────────

const TIPOS = {
  // ── Ventas ──────────────────────────────────────────────────────────────────
  venta_completada:         { label: 'Venta',                  color: '#0ea5e9', bg: '#e0f2fe', borde: '#0ea5e9', Icono: ShoppingCart   },
  venta_cuenta_pendiente:   { label: 'Cuenta pendiente',       color: '#f59e0b', bg: '#fef3c7', borde: '#f59e0b', Icono: Receipt        },
  venta:                    { label: 'Venta',                  color: '#0ea5e9', bg: '#e0f2fe', borde: '#0ea5e9', Icono: ShoppingCart   },
  cuenta_pendiente:         { label: 'Cuenta pendiente',       color: '#f59e0b', bg: '#fef3c7', borde: '#f59e0b', Icono: Receipt        },

  // ── Cuentas por cobrar ───────────────────────────────────────────────────────
  cuenta_abono:             { label: 'Abono a cuenta',         color: '#0ea5e9', bg: '#e0f2fe', borde: '#0ea5e9', Icono: CreditCard     },
  cuenta_liquidada:         { label: 'Cuenta liquidada',       color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: BadgeCheck     },

  // ── Cancelaciones ───────────────────────────────────────────────────────────
  cancelacion_aprobada:     { label: 'Cancelación aprobada',   color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Check          },
  cancelacion_rechazada:    { label: 'Cancelación rechazada',  color: '#ef4444', bg: '#fee2e2', borde: '#ef4444', Icono: X             },
  cancelacion_solicitada:   { label: 'Cancelación solicit.',   color: '#f59e0b', bg: '#fef3c7', borde: '#f59e0b', Icono: Ban            },
  cancelacion:              { label: 'Cancelación',            color: '#ef4444', bg: '#fee2e2', borde: '#ef4444', Icono: X             },

  // ── Caja ────────────────────────────────────────────────────────────────────
  caja_apertura:            { label: 'Apertura caja',          color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Wallet         },
  caja_cierre:              { label: 'Cierre caja',            color: '#64748b', bg: '#f1f5f9', borde: '#94a3b8', Icono: LogOut         },
  caja_entrada_manual:      { label: 'Entrada caja',           color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Wallet         },
  caja_salida_manual:       { label: 'Salida caja',            color: '#ef4444', bg: '#fee2e2', borde: '#ef4444', Icono: Wallet         },
  apertura_caja:            { label: 'Apertura caja',          color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Wallet         },
  cierre_caja:              { label: 'Cierre caja',            color: '#64748b', bg: '#f1f5f9', borde: '#94a3b8', Icono: LogOut         },

  // ── Gastos ──────────────────────────────────────────────────────────────────
  gasto_registrado:         { label: 'Gasto',                  color: '#f97316', bg: '#ffedd5', borde: '#f97316', Icono: Receipt        },
  gasto:                    { label: 'Gasto',                  color: '#f97316', bg: '#ffedd5', borde: '#f97316', Icono: Receipt        },

  // ── Inventario ──────────────────────────────────────────────────────────────
  inventario_entrada:       { label: 'Entrada inventario',     color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: PackageCheck   },
  entrada_inventario:       { label: 'Entrada inventario',     color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: PackageCheck   },
  ajuste_inventario:        { label: 'Ajuste inventario',      color: '#f97316', bg: '#ffedd5', borde: '#f97316', Icono: Package        },

  // ── Pedidos a proveedores ────────────────────────────────────────────────────
  pedido_creado:            { label: 'Pedido creado',          color: '#8b5cf6', bg: '#ede9fe', borde: '#8b5cf6', Icono: ClipboardList  },
  pedido_recibido:          { label: 'Mercancía recibida',     color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Truck          },
  pedido_recibido_parcial:  { label: 'Recepción parcial',      color: '#f59e0b', bg: '#fef3c7', borde: '#f59e0b', Icono: Truck          },
  pedido_cancelado:         { label: 'Pedido cancelado',       color: '#ef4444', bg: '#fee2e2', borde: '#ef4444', Icono: Ban            },

  // ── Productos ───────────────────────────────────────────────────────────────
  producto_creado:          { label: 'Producto creado',        color: '#0087c6', bg: '#dbeafe', borde: '#0087c6', Icono: Package        },
  producto_editado:         { label: 'Producto editado',       color: '#0087c6', bg: '#dbeafe', borde: '#0087c6', Icono: Package        },
  producto_archivado:       { label: 'Producto archivado',     color: '#64748b', bg: '#f1f5f9', borde: '#94a3b8', Icono: Archive        },
  producto_reactivado:      { label: 'Producto reactivado',    color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Archive        },

  // ── Ofertas ─────────────────────────────────────────────────────────────────
  oferta_creada:            { label: 'Oferta creada',          color: '#8b5cf6', bg: '#ede9fe', borde: '#8b5cf6', Icono: Tag            },
  oferta_editada:           { label: 'Oferta editada',         color: '#8b5cf6', bg: '#ede9fe', borde: '#8b5cf6', Icono: Tag            },
  oferta_activada:          { label: 'Oferta activada',        color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: Tag            },
  oferta_desactivada:       { label: 'Oferta desactivada',     color: '#64748b', bg: '#f1f5f9', borde: '#94a3b8', Icono: Tag            },
  oferta_eliminada:         { label: 'Oferta eliminada',       color: '#ef4444', bg: '#fee2e2', borde: '#ef4444', Icono: Tag            },

  // ── Transferencias ──────────────────────────────────────────────────────────
  transferencia:            { label: 'Transferencia',          color: '#8b5cf6', bg: '#ede9fe', borde: '#8b5cf6', Icono: ArrowLeftRight  },

  // ── Equipo ──────────────────────────────────────────────────────────────────
  salario_pagado:           { label: 'Salario pagado',         color: '#10b981', bg: '#d1fae5', borde: '#10b981', Icono: BadgeCheck     },
  sesion_inicio:            { label: 'Inicio sesión',          color: '#6366f1', bg: '#ede9fe', borde: '#6366f1', Icono: LogIn          },
}

function tipoCfg(tipo) {
  return TIPOS[tipo] ?? { label: tipo, color: '#64748b', bg: '#f1f5f9', Icono: History }
}

function IconoTipo({ tipo }) {
  const { color, bg, Icono } = tipoCfg(tipo)
  return (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icono style={{ width: 16, height: 16, color }} strokeWidth={2.5} />
    </div>
  )
}

function BadgeTipo({ tipo }) {
  const { label, color, bg, Icono } = tipoCfg(tipo)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: bg, color, flexShrink: 0,
    }}>
      <Icono style={{ width: 11, height: 11, color }} strokeWidth={2.5} />
      {label}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BitacoraPage() {
  const { empresa, sucursales } = useApp()

  const [registros,  setRegistros]  = useState([])
  const [cargando,   setCargando]   = useState(true)
  const [totalCount, setTotalCount] = useState(0)
  const [pagina,     setPagina]     = useState(0)
  const POR_PAGINA = 50

  const [busqueda,    setBusqueda]    = useState('')
  const [busquedaDB,  setBusquedaDB]  = useState('')
  const [fechaFiltro, setFechaFiltro] = useState('')
  const [tipoFiltro,  setTipoFiltro]  = useState('')
  const [sucFiltro,   setSucFiltro]   = useState('')

  // Debounce: espera 400ms sin escribir antes de lanzar la query
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDB(busqueda.trim()), 400)
    return () => clearTimeout(t)
  }, [busqueda])

  const cargar = useCallback(async (pg = 0) => {
    if (!empresa?.id) return
    setCargando(true)
    try {
      let q = supabase
        .from('bitacora')
        .select('*, perfiles(nombre), sucursales(nombre)', { count: 'exact' })
        .eq('empresa_id', empresa.id)
        .order('creado_en', { ascending: false })
        .range(pg * POR_PAGINA, pg * POR_PAGINA + POR_PAGINA - 1)

      if (busquedaDB) q = q.ilike('descripcion', `%${busquedaDB}%`)
      if (fechaFiltro) {
        q = q.gte('creado_en', fechaFiltro + 'T00:00:00+00:00')
             .lte('creado_en', fechaFiltro + 'T23:59:59+00:00')
      }
      if (tipoFiltro) q = q.eq('tipo', tipoFiltro)
      if (sucFiltro)  q = q.eq('sucursal_id', sucFiltro)

      const { data, error, count } = await q
      if (error) throw error
      setRegistros(data ?? [])
      setTotalCount(count ?? 0)
      setPagina(pg)
    } catch (e) {
      console.error(e)
    } finally {
      setCargando(false)
    }
  }, [empresa, busquedaDB, fechaFiltro, tipoFiltro, sucFiltro])

  useEffect(() => { cargar(0) }, [cargar])

  const hayFiltros = busqueda.trim() || fechaFiltro || tipoFiltro || sucFiltro


  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bitácora</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalCount > 0 ? `${totalCount} registros en total` : 'Historial de movimientos'}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 flex flex-col gap-3 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por descripción o usuario..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-slate-50" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Fecha específica */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-slate-50 text-slate-700" />
          </div>

          {/* Tipo */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-slate-50 text-slate-700 appearance-none">
              <option value="">Todos los tipos</option>
              {Object.entries(TIPOS).map(([t, cfg]) => (
                <option key={t} value={t}>{cfg.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Sucursal */}
          {sucursales.length > 1 && (
            <div className="relative">
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select value={sucFiltro} onChange={e => setSucFiltro(e.target.value)}
                className="w-full px-3 pr-8 py-2.5 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 bg-slate-50 text-slate-700 appearance-none">
                <option value="">Todas las sucursales</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
        </div>

        {hayFiltros && (
          <button onClick={() => { setFechaFiltro(''); setTipoFiltro(''); setSucFiltro(''); setBusqueda('') }}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 self-start">
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Timeline */}
      {cargando ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : registros.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <History className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Sin registros</p>
          {hayFiltros && <p className="text-xs text-slate-400">Intenta con otros filtros</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(registros.reduce((acc, r) => {
            const dia = new Date(r.creado_en).toLocaleDateString('es-MX', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            })
            if (!acc[dia]) acc[dia] = []
            acc[dia].push(r)
            return acc
          }, {})).map(([dia, items]) => (
            <div key={dia}>
              {/* Separador de día */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider capitalize">{dia}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="flex flex-col gap-2">
                {items.map(r => {
                  const cfg = tipoCfg(r.tipo)
                  return (
                  <div key={r.id}
                    className="bg-white border border-slate-200 border-l-4 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow"
                    style={{ borderLeftColor: cfg.borde ?? cfg.color }}>
                    <IconoTipo tipo={r.tipo} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 leading-snug flex-1 min-w-0">
                          {r.descripcion}
                        </p>
                        <BadgeTipo tipo={r.tipo} />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        {r.perfiles?.nombre && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                            {r.perfiles.nombre}
                          </span>
                        )}
                        {r.sucursales?.nombre && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                            {r.sucursales.nombre}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(r.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Paginación */}
          {totalCount > POR_PAGINA && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button disabled={pagina === 0} onClick={() => cargar(pagina - 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Anterior
              </button>
              <span className="text-xs text-slate-500">
                Página {pagina + 1} de {Math.ceil(totalCount / POR_PAGINA)}
              </span>
              <button disabled={(pagina + 1) * POR_PAGINA >= totalCount} onClick={() => cargar(pagina + 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
