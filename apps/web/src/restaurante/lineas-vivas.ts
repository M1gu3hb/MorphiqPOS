import { invocarComando } from '~/cliente/api';

/**
 * LAS LÍNEAS QUE SIGUEN EN LA CUENTA (día completo del restaurante, 2.4).
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * Anular una línea no la borra: la deja marcada (`anulada_en`, motivo y quién la quitó) y la
 * cuenta se recalcula sin ella. El puente de lectura (`DetalleVenta`) NO expone esa marca ni
 * filtra por ella, así que toda pantalla que listaba «lo que lleva la cuenta» seguía
 * enseñando la sopa anulada —en la mesa, en la caja, al dividir y en la precuenta que se
 * entrega al comensal— mientras el total ya no la incluía: un papel cuyos renglones no suman
 * su total, y una caja que ofrece repartir unidades que ya no existen.
 *
 * El arreglo de raíz es del puente (exponer `anulada_en` en `DetalleVenta`); aquí se resuelve
 * sin tocarlo, porque la respuesta ya existe en el servidor.
 *
 * ── Qué se hace ──────────────────────────────────────────────────────────────
 * Se le pregunta al SERVIDOR cuáles líneas siguen cobrándose. `venta.estado` cotiza la cuenta
 * con el mismo código del cobro y sólo cuenta las vivas; es una lectura —no escribe, no
 * audita, no cuenta una hoja— y está abierta a los mismos roles que ven la cuenta. Del puente
 * se toma cada línea con su detalle, y sólo se enseñan las que el servidor reconoce como
 * vivas. Si el servidor no contesta bien NO se adivina: se lanza, y la pantalla dice que no
 * pudo leer la cuenta, que es lo que ya hace con cualquier otra lectura fallida.
 */

function esRegistro(valor: unknown): valor is Readonly<Record<string, unknown>> {
  return typeof valor === 'object' && valor !== null;
}

/**
 * Los ids de las líneas vivas que contestó `venta.estado`, o `null` si la respuesta no tiene la
 * forma esperada. Una respuesta ilegible no vale «ninguna línea viva»: valdría esconder la
 * cuenta entera.
 */
export function idsDeLasLineasVivas(estado: unknown): ReadonlySet<string> | null {
  if (!esRegistro(estado)) return null;
  const cotizacion = estado['cotizacion'];
  if (!esRegistro(cotizacion)) return null;
  const lineas = cotizacion['lineas'];
  if (!Array.isArray(lineas)) return null;
  const ids = new Set<string>();
  for (const linea of lineas as readonly unknown[]) {
    if (!esRegistro(linea)) return null;
    const id = linea['id'];
    if (typeof id !== 'string' || id === '') return null;
    ids.add(id);
  }
  return ids;
}

/** De lo que el puente listó, lo que el servidor reconoce como parte de la cuenta. */
export function soloLasVivas<T extends { readonly id: string }>(
  lineas: readonly T[],
  vivas: ReadonlySet<string>,
): readonly T[] {
  return lineas.filter((linea) => vivas.has(linea.id));
}

/**
 * Los ids de las líneas que el servidor SIGUE cobrando de la cuenta. Si no contesta bien NO se
 * adivina —una respuesta ilegible no vale «ninguna viva»—: se lanza, y la pantalla dice que no
 * pudo leer la cuenta.
 *
 * Quien lee las líneas del puente lo hace EN SU PROPIO ARCHIVO, con el tipo de lo que esa pantalla
 * necesita y declarado ahí mismo: el contrato de lecturas del puente lee ese tipo para comprobar
 * que el puente sirve cada campo obligatorio, y un tipo genérico escondido en esta función no lo
 * puede leer. Las dos lecturas van a la vez, y el resultado se pasa por `soloLasVivas`.
 */
export async function lineasQueSigueCobrando(
  ordenId: string,
  signal?: AbortSignal,
): Promise<ReadonlySet<string>> {
  const estado = await invocarComando<unknown>(
    '/api/venta/estado',
    { ordenId },
    signal === undefined ? {} : { signal },
  );
  const vivas = idsDeLasLineasVivas(estado);
  if (vivas === null) {
    throw new Error('El servidor no dijo cuáles líneas siguen en la cuenta.');
  }
  return vivas;
}
