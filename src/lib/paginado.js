/**
 * Supabase corta toda consulta en 1,000 filas y NO avisa: no hay error, no hay
 * bandera de "hay más". El código recibe un arreglo válido y cree que eso es
 * todo. Con 961 productos y 1,926 filas de disponibilidad, eso ya nos estaba
 * escondiendo casi mil registros.
 *
 * Peor todavía: una consulta sin ORDER BY explícito la ordena PostgREST por
 * `ctid`, que es la posición FÍSICA de la fila en disco. Y esa posición cambia
 * cada vez que la fila se actualiza. Por eso el síntoma era intermitente: al
 * editar la disponibilidad de un producto, su fila se movía de lugar y podía
 * saltar dentro o fuera de las primeras mil sin que cambiara ningún dato.
 *
 * De ahí las dos reglas de este archivo:
 *   1. Siempre traer por tandas hasta agotar.
 *   2. Siempre ordenar por algo único y estable — la llave primaria.
 */

const TAM = 1000

/**
 * Trae TODAS las filas de una consulta, en tandas.
 *
 * `construir` recibe el tamaño de la tanda y el último registro traído (null en
 * la primera vuelta), y devuelve la consulta ya ordenada y acotada. Es el
 * llamador quien decide cómo avanzar, porque el avance depende de cuál sea la
 * llave de esa tabla.
 *
 * `clave` sirve de red: si un orden mal puesto llegara a repetir una fila, se
 * colapsa sola en vez de contarse dos veces. Es una red, no el arreglo — no
 * puede recuperar una fila que nunca llegó.
 */
export async function traerPorTandas(construir, clave = f => f.id) {
  const porClave = new Map()
  let ultimo = null

  for (;;) {
    const { data, error } = await construir(TAM, ultimo)
    if (error) throw error
    if (!data?.length) break

    data.forEach(f => porClave.set(clave(f), f))
    ultimo = data[data.length - 1]

    // Una tanda incompleta significa que ya no hay más
    if (data.length < TAM) break
  }

  return [...porClave.values()]
}

/**
 * Caso común: tabla con una sola columna de llave primaria.
 *
 * Avanza por cursor y no por posición: en vez de "dame de la 1000 a la 1999"
 * pide "dame las mil siguientes DESPUÉS de este id". Como se ancla a una fila
 * y no a un número de renglón, da igual cuántas filas se agreguen o se borren
 * mientras se descarga — no puede repetir ni saltarse nada.
 */
export function traerTodo(tabla, columnas, afinar = q => q, llave = 'id') {
  return traerPorTandas((tam, ultimo) => {
    let q = afinar(tabla().select(columnas)).order(llave).limit(tam)
    if (ultimo) q = q.gt(llave, ultimo[llave])
    return q
  }, f => f[llave])
}

/**
 * Caso de `productos_sucursales`, cuya llave primaria son DOS columnas y por
 * eso no tiene un `id` con el cual avanzar.
 *
 * El cursor compuesto es el de siempre: "primera columna mayor, O primera igual
 * y segunda mayor". Se ve feo escrito así porque `or()` de Supabase pide la
 * condición en texto, pero es exactamente la misma garantía que el de una sola
 * llave.
 */
export function traerTodoPorParLlave(tabla, columnas, afinar = q => q, a = 'id', b = 'id') {
  return traerPorTandas((tam, ultimo) => {
    let q = afinar(tabla().select(columnas)).order(a).order(b).limit(tam)
    if (ultimo) {
      q = q.or(`${a}.gt.${ultimo[a]},and(${a}.eq.${ultimo[a]},${b}.gt.${ultimo[b]})`)
    }
    return q
  }, f => `${f[a]}|${f[b]}`)
}
