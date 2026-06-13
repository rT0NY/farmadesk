function generarPDF({ pedido, items, empresa, proveedor, sucursal }) {
  const fechaObj  = new Date(pedido.created_at ?? Date.now())
  const fecha     = fechaObj.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const fechaISO  = fechaObj.toISOString().slice(0, 10)           // YYYY-MM-DD para el nombre
  const numPedido = pedido.id.slice(-6).toUpperCase()
  const total     = items.reduce((s, i) => s + i.cantidad_pedida, 0)
  const VERDE     = '#16a34a'
  const VERDE_OSCURO = '#14532d'

  // Nombre del archivo: "Pedido_NombreProveedor_2026-04-28"
  const nombreArchivo = `Pedido_${proveedor.nombre.replace(/[^a-zA-Z0-9À-ÿ]/g, '_')}_${fechaISO}`

  const dirSucursal = (() => {
    if (!sucursal) return null
    const linea1 = [sucursal.calle, sucursal.colonia].filter(Boolean).join(', ')
    const linea2 = [sucursal.ciudad, sucursal.estado].filter(Boolean).join(', ')
    const cp = sucursal.codigo_postal ? `C.P. ${sucursal.codigo_postal}` : ''
    return [linea1, [linea2, cp].filter(Boolean).join(' ')].filter(Boolean)
  })()

  // Rellenar hasta mínimo 12 filas para que la tabla se vea completa
  const minFilas = Math.max(items.length, 12)
  const filas = Array.from({ length: minFilas }, (_, i) => {
    const item = items[i]
    return item
      ? `<tr>
          <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:11px;color:#374151">${item.nombre_producto}</td>
          <td style="border:1px solid #d1d5db;padding:6px 8px;text-align:center;font-size:11px;font-weight:700;color:#111827">${item.cantidad_pedida}</td>
         </tr>`
      : `<tr>
          <td style="border:1px solid #d1d5db;padding:6px 8px;font-size:11px">&nbsp;</td>
          <td style="border:1px solid #d1d5db;padding:6px 8px">&nbsp;</td>
         </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${nombreArchivo}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;padding:36px 44px;font-size:12px;line-height:1.4}
  @media print{body{padding:16px 22px}@page{margin:.5cm;size:A4}}
</style>
</head>
<body>

<!-- ENCABEZADO -->
<table style="width:100%;border-collapse:collapse;margin-bottom:18px">
  <tr>
    <td style="vertical-align:top;width:55%">
      <div style="font-size:18px;font-weight:900;color:#111827;margin-bottom:4px">${empresa?.nombre ?? '—'}</div>
      ${dirSucursal ? dirSucursal.map(l => `<div style="font-size:11px;color:#6b7280">${l}</div>`).join('') : ''}
      ${sucursal?.telefono ? `<div style="font-size:11px;color:#6b7280">Tel: ${sucursal.telefono}</div>` : ''}
    </td>
    <td style="vertical-align:top;text-align:right">
      <div style="font-size:22px;font-weight:900;color:${VERDE};letter-spacing:-.3px">Nota de Pedido Interno</div>
      <table style="margin-top:8px;margin-left:auto;border-collapse:collapse">
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:2px 8px 2px 0">Fecha</td>
          <td style="font-size:11px;font-weight:700;color:#111827;padding:2px 0">${fecha}</td>
        </tr>
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:2px 8px 2px 0">No.</td>
          <td style="font-size:11px;font-weight:700;color:#111827;padding:2px 0">${numPedido}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- BARRA PROVEEDOR / SOLICITANTE -->
<table style="width:100%;border-collapse:collapse;margin-bottom:0">
  <tr>
    <td style="background:${VERDE};color:#fff;font-size:13px;font-weight:700;padding:8px 14px;width:50%">Proveedor:</td>
    <td style="background:${VERDE};color:#fff;font-size:13px;font-weight:700;padding:8px 14px">Solicitante:</td>
  </tr>
  <tr>
    <td style="border:1px solid #d1d5db;border-top:none;padding:10px 14px;vertical-align:top">
      <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:4px">${proveedor.nombre}</div>
      ${proveedor.contacto ? `<div style="font-size:11px;color:#6b7280">Contacto: ${proveedor.contacto}</div>` : ''}
      ${proveedor.telefono ? `<div style="font-size:11px;color:#6b7280">Tel: ${proveedor.telefono}</div>` : ''}
      ${proveedor.email    ? `<div style="font-size:11px;color:#6b7280">${proveedor.email}</div>` : ''}
    </td>
    <td style="border:1px solid #d1d5db;border-top:none;border-left:none;padding:10px 14px;vertical-align:top">
      <table style="border-collapse:collapse">
        <tr><td style="font-size:11px;color:#6b7280;padding-bottom:3px;width:70px">Empresa</td><td style="font-size:11px;color:#111827;font-weight:600">${empresa?.nombre ?? '—'}</td></tr>
        <tr><td style="font-size:11px;color:#6b7280;padding-bottom:3px">Destino</td><td style="font-size:11px;color:#111827;font-weight:600">${sucursal ? sucursal.nombre : 'General'}</td></tr>
        <tr><td style="font-size:11px;color:#6b7280;padding-bottom:3px">Fecha</td><td style="font-size:11px;color:#111827">${fecha}</td></tr>
      </table>
    </td>
  </tr>
</table>

<!-- TABLA PRODUCTOS -->
<table style="width:100%;border-collapse:collapse;margin-top:18px">
  <thead>
    <tr style="background:${VERDE}">
      <th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;border:1px solid ${VERDE_OSCURO};text-align:left">Descripción</th>
      <th style="padding:8px 10px;color:#fff;font-size:11px;font-weight:700;border:1px solid ${VERDE_OSCURO};text-align:center;width:110px">Cantidad</th>
    </tr>
  </thead>
  <tbody>
    ${filas}
  </tbody>
</table>

<!-- PARTE INFERIOR -->
<table style="width:100%;border-collapse:collapse;margin-top:16px">
  <tr>
    <!-- Instrucciones / notas -->
    <td style="vertical-align:top;width:55%;padding-right:20px">
      <div style="font-size:10px;color:#6b7280;margin-bottom:4px">Instrucciones / Notas</div>
      <div style="border:1px solid #d1d5db;padding:10px 12px;min-height:56px;font-size:11px;color:#374151;border-radius:2px">
        ${pedido.notas ?? ''}
      </div>
    </td>
    <!-- Totales -->
    <td style="vertical-align:top">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:5px 10px 5px 0;border-bottom:1px solid #e5e7eb">Total unidades</td>
          <td style="font-size:13px;font-weight:900;color:${VERDE};text-align:right;padding:5px 0;border-bottom:1px solid #e5e7eb">${total}</td>
        </tr>
        <tr>
          <td style="font-size:11px;color:#6b7280;padding:5px 10px 5px 0;border-bottom:1px solid #e5e7eb">Productos distintos</td>
          <td style="font-size:12px;font-weight:700;color:#111827;text-align:right;padding:5px 0;border-bottom:1px solid #e5e7eb">${items.length}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- FIRMA -->
<div style="margin-top:32px;padding-top:36px">
  <div style="border-top:1px solid #9ca3af;width:220px;padding-top:5px">
    <span style="font-size:10px;color:#6b7280">Autorizado por:</span>
  </div>
</div>

<div style="margin-top:20px;font-size:9px;color:#d1d5db;text-align:right">
  Farmadesk · ${new Date().toLocaleDateString('es-MX')} · #${numPedido}
</div>

</body></html>`

  // Usar iframe oculto para no abrir ventana nueva.
  // El <title> del documento se convierte en el nombre de archivo sugerido
  // cuando el usuario elige "Guardar como PDF" en el diálogo de impresión.
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;visibility:hidden'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument || iframe.contentWindow.document
  doc.open(); doc.write(html); doc.close()

  iframe.contentWindow.focus()
  setTimeout(() => {
    iframe.contentWindow.print()
    // Limpiar el iframe tras el diálogo (2 s dan tiempo suficiente)
    setTimeout(() => document.body.removeChild(iframe), 2000)
  }, 400)
}

export { generarPDF }
