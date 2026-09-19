/**
 * Impresión de documentos tamaño carta.
 *
 * Deliberadamente aparte de la impresión de tickets. Aquella vive en Ventas y
 * en Caja, y su ruta de Electron manda el HTML a la impresora térmica con un
 * ancho fijo de 302 píxeles — los 80 mm del rollo. Un reporte tamaño carta por
 * ahí saldría cortado, y tocar ese código para que hiciera las dos cosas sería
 * arriesgar la caja, que es lo único que no puede fallar.
 *
 * Limitación conocida: dentro de la app de escritorio esto no funciona. El main
 * de Electron deniega toda ventana nueva (`setWindowOpenHandler` → 'deny'), así
 * que `window.open` devuelve null y se informa como bloqueo. En navegador y en
 * la versión instalada desde el navegador sí opera.
 */

/** Escapa texto que se va a interpolar dentro del HTML del documento. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Abre el documento en una ventana nueva y lanza el diálogo de impresión, desde
 * donde el navegador ofrece "Guardar como PDF".
 *
 * Devuelve `{ ok }` y, cuando falla, un `motivo` para que quien llama redacte el
 * mensaje: esta función no conoce la interfaz y no debería decidir qué se le
 * dice al usuario.
 */
export function imprimirDocumento(html) {
  return porMarcoOculto(html) || porVentana(html)
}

/**
 * Camino preferido: un marco invisible dentro de la propia página.
 *
 * No abre ninguna ventana, así que el navegador no puede bloquearla — hoy, con
 * las emergentes desactivadas, el reporte sencillamente no salía. Y como no
 * necesita `window.open`, debería funcionar también dentro de la app de
 * escritorio, donde Electron deniega toda ventana nueva.
 *
 * Devuelve null si algo falla, para que el llamador caiga al camino de ventana.
 */
function porMarcoOculto(html) {
  let marco
  try {
    marco = document.createElement('iframe')
    marco.setAttribute('aria-hidden', 'true')
    marco.setAttribute('tabindex', '-1')
    marco.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(marco)

    const doc = marco.contentWindow?.document
    if (!doc) throw new Error('sin documento en el marco')

    doc.open()
    doc.write(html)
    doc.close()

    // El marco se retira tarde a propósito: si el usuario eligió "Guardar como
    // PDF", quitarlo antes de que termine de escribirse aborta el guardado.
    const retirar = () => { try { marco.remove() } catch { /* ya no está */ } }
    marco.contentWindow.onafterprint = () => setTimeout(retirar, 500)

    // El respiro deja que el navegador aplique los estilos antes de medir la
    // página; sin él, la primera hoja puede salir sin formato.
    setTimeout(() => {
      try {
        marco.contentWindow.focus()
        marco.contentWindow.print()
      } catch { /* el diálogo no abrió; el retiro de respaldo lo limpia */ }
      setTimeout(retirar, 4000)
    }, 400)

    return { ok: true }
  } catch {
    if (marco) { try { marco.remove() } catch { /* ya no está */ } }
    return null
  }
}

/** Respaldo: la ventana de siempre, por si el marco no prospera. */
function porVentana(html) {
  let win
  try {
    win = window.open('', '_blank', 'width=900,height=700')
  } catch {
    return { ok: false, motivo: 'bloqueado' }
  }

  if (!win || win.closed) return { ok: false, motivo: 'bloqueado' }

  try {
    win.document.write(html)
    win.document.close()

    // El pie del navegador imprime la dirección de la ventana, y como el
    // documento se escribe en una en blanco, eso sale como "about:blank".
    // Darle una ruta la vuelve legible.
    try { win.history.replaceState(null, '', '/documento') } catch { /* se queda igual */ }

    win.focus()
    setTimeout(() => win.print(), 400)
    return { ok: true }
  } catch {
    try { win.close() } catch { /* la ventana ya no existe */ }
    return { ok: false, motivo: 'error' }
  }
}

/**
 * Envoltura del documento: tipografía, márgenes y las reglas de paginación que
 * distinguen un documento de una impresión de pantalla.
 *
 * La ventana NO se cierra sola después de imprimir. Un ticket es de usar y
 * tirar, pero de un reporte la gente quiere revisar el resultado o volver a
 * guardarlo con otro nombre.
 */
export function envolverDocumento({ titulo, cuerpo }) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>
  /* Los márgenes de @page están repartidos a propósito.
     Chrome dibuja SU encabezado —fecha y título— en el margen superior, y SU
     pie —dirección y número de hoja— en el inferior. Al dejar el superior en
     cero, el encabezado no tiene dónde ir y desaparece: repetía en cada hoja el
     título y la hora que la portada ya declara. El inferior se conserva para no
     perder la numeración, que es lo único que avisa si falta una página.
     El margen real de lectura lo pone el relleno del body. */
  @page { size: letter; margin: 0 0 11mm; }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 14mm 12mm 4mm;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.35;
    color: #000;
    background: #fff;
  }

  /* Todo en negro. Los fondos de color se vuelven manchas grises ilegibles en
     impresora láser monocromática; la jerarquía la carga la tipografía. */

  .doc-encabezado { border-bottom: 1.5pt solid #000; padding-bottom: 8pt; margin-bottom: 12pt; }
  .doc-empresa    { font-size: 12pt; font-weight: 700; letter-spacing: .02em; }
  .doc-titulo     { font-size: 15pt; font-weight: 700; margin-top: 6pt; }
  .doc-alcance    { font-size: 9pt; margin-top: 2pt; }
  .doc-meta       { display: flex; flex-wrap: wrap; gap: 4pt 24pt; margin-top: 8pt; font-size: 8.5pt; }
  .doc-meta b     { font-weight: 600; }

  .doc-seccion    { font-size: 8.5pt; font-weight: 700; letter-spacing: .08em;
                    text-transform: uppercase; margin: 14pt 0 5pt; }

  table { width: 100%; border-collapse: collapse; }
  th { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
       text-align: left; border-bottom: .75pt solid #000; padding: 4pt 3pt; }
  td { padding: 3.5pt 3pt; border-bottom: .25pt solid #bbb; vertical-align: top; }

  /* Los dígitos caen uno debajo del otro; sin esto las columnas se ven torcidas
     y el documento pierde formalidad. */
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: "Courier New", monospace; font-size: 8.5pt; white-space: nowrap; }
  .vencido { font-weight: 700; }
  .casilla { width: 14pt; text-align: center; }
  .casilla span { display: inline-block; width: 8pt; height: 8pt; border: .75pt solid #000; }

  .doc-subtotal td { border-top: .75pt solid #000; border-bottom: none;
                     font-weight: 700; padding-top: 4pt; }

  .doc-resumen { border: .75pt solid #000; padding: 8pt 10pt; margin-bottom: 4pt; }
  .doc-resumen table { width: auto; min-width: 62%; }
  .doc-resumen td { border: none; padding: 2pt 0; }
  .doc-resumen th { border-bottom: .25pt solid #888; padding: 0 0 3pt; }
  .doc-resumen td.num, .doc-resumen th.num { padding-left: 18pt; }
  .doc-resumen .total td { border-top: .5pt solid #000; font-weight: 700; padding-top: 4pt; }

  /* Aclara que la primera columna cuenta retiros y no lotes distintos: el mismo
     lote en tres sucursales son tres renglones y una sola caducidad. */
  .doc-nota { font-size: 7.5pt; color: #444; margin-top: 6pt; max-width: 78%; }

  /* Afirma que las sucursales ausentes sí se revisaron. Sin esto, el lector no
     puede distinguir "no tienen nada" de "no se incluyeron". */
  .doc-aviso { font-size: 8.5pt; margin: 6pt 0 0; padding: 4pt 8pt;
               border-left: 2pt solid #000; }

  /* Firma y pie viajan juntos: si no caben al final de una hoja, bajan los dos.
     Antes el pie se iba solo a una página nueva con un renglón suelto. */
  .doc-cierre { break-inside: avoid; page-break-inside: avoid; margin-top: 24pt; }
  .doc-firma { padding-top: 10pt; border-top: .5pt solid #000;
               display: flex; gap: 40pt; font-size: 9pt; }
  .doc-pie { margin-top: 10pt; font-size: 7.5pt; color: #444; }

  /* ── Reglas de paginación ────────────────────────────────────────────────
     Sin esto el documento se rompe feo en la segunda hoja. */

  /* El encabezado de la tabla se repite en cada página: si solo la primera dice
     qué columna es cuál, las demás son ilegibles. */
  thead { display: table-header-group; }

  /* Ningún renglón se parte a la mitad entre dos hojas. */
  tr { break-inside: avoid; page-break-inside: avoid; }

  /* Una sucursal no arranca con su título solo al final de una hoja. */
  .doc-grupo { break-inside: auto; }
  .doc-seccion { break-after: avoid; page-break-after: avoid; }

  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head>
<body>${cuerpo}</body></html>`
}
