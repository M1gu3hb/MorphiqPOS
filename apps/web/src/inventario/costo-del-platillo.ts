/**
 * EL COSTO DE UN PLATILLO: se calcula o es DESCONOCIDO. Nunca cero.
 *
 * ── El defecto que esto cierra ───────────────────────────────────────────────────
 * Las pantallas heredadas de Recetas y de Productos sumaban las líneas de la receta
 * con `|| 0`: un platillo SIN receta —o con un insumo al que nadie le ha puesto
 * costo— sumaba cero, y cero salía como «costo $0.00, utilidad = precio, margen
 * 100 %». Es la cifra más bonita que puede ver un dueño y la única que seguro es
 * falsa: el platillo sí cuesta, sólo que nadie lo ha dicho todavía.
 *
 * ── Por qué se decide AQUÍ y no en el servidor ───────────────────────────────────
 * El puente ya hace su parte: `costo_linea_calculado` sale NULO cuando falta la
 * cantidad o el costo, y no cero (`puente.test.ts`, «sin costo o sin cantidad
 * devuelve nulo»). Lo que no puede hacer es saber que a un platillo le FALTA su
 * receta: `productos.costo_unitario_centavos` es `not null default 0` (002) y un
 * platillo sin líneas conserva su último costo o su cero (`recalcularCostosRecetas`
 * agrupa sobre `recetas`, y sin líneas no entra en el `from`). «Tiene receta y todos
 * sus insumos tienen costo» es una pregunta sobre las LÍNEAS, que la pantalla ya
 * trae, y es la misma que ya se hace para los productos de venta variable
 * (`hayCosto = costoBase > 0`).
 *
 * ── Los dos orígenes de un costo ─────────────────────────────────────────────────
 *   · Con receta, el costo es la suma de sus líneas.
 *   · Un producto que se REVENDE —el agua embotellada, la cerveza— no tiene receta:
 *     `estrategia_consumo = 'sku'` y un insumo PROPIO (`insumos.producto_id`, el que
 *     lleva su existencia y que crea el alta del producto). Su costo es el del producto.
 *     Llamarlo «Sin receta» sería la mentira contraria: el costo SÍ se conoce.
 *   · Un platillo al que se le quitaron todos los ingredientes también queda en `sku`
 *     (`guardar_receta` con la lista vacía) y guarda su último costo, pero NO tiene
 *     insumo propio: ese costo ya no es «su costo» y sigue siendo «Sin receta».
 *
 * ── Qué cuenta como «sin costo» ──────────────────────────────────────────────────
 * Un insumo sin costo es el que llega con costo unitario NULO, ausente o CERO:
 * `insumos.costo_unitario_centavos` también es `not null default 0`, así que un
 * insumo que se dio de alta y nunca se compró es cero, no «gratis». La excepción
 * real —el agua, el hielo— se resuelve poniéndole un costo simbólico, y la pista lo
 * dice. Una línea cuyo IMPORTE redondea a cero centavos (un gramo de sal) sí tiene
 * costo: lo que cuenta es el costo unitario, no el importe de la línea.
 *
 * Vive aquí, en `src/`, porque `heredado/` no tiene pruebas: las pantallas lo importan.
 */

/** Lo que el puente sirve de cada línea de receta (`RecetaEscandallo`), en pesos. */
export interface LineaDeCosto {
  readonly activo?: boolean | null | undefined;
  readonly ingrediente_nombre?: string | null | undefined;
  /** La cantidad ya en la unidad base del insumo: la que se multiplica por el costo. */
  readonly cantidad_convertida_unidad_base?: number | null | undefined;
  /** La merma en PORCENTAJE (5 = 5 %), tal como la sirve el puente. */
  readonly merma_porcentaje?: number | null | undefined;
  /** Pesos por unidad base. Nulo, ausente o cero: el insumo no tiene costo. */
  readonly costo_unitario_base_snapshot?: number | null | undefined;
  /** El importe de la línea, redondeado al centavo por el servidor. */
  readonly costo_linea_calculado?: number | null | undefined;
}

/** Lo que se necesita del producto para saber de dónde sale su costo, en pesos. */
export interface CostoPropioDelProducto {
  /** `sku` = se revende tal cual y su costo es el suyo; `receta` = el costo sale de las líneas. */
  readonly estrategia_consumo?: string | null | undefined;
  /** El insumo que lleva la existencia del producto de reventa. Un platillo sin receta no lo tiene. */
  readonly insumo_propio_id?: string | null | undefined;
  /** Sólo lo ven quienes ven márgenes: para el resto llega ausente, y ausente es desconocido. */
  readonly costo_calculado_actual?: number | null | undefined;
}

export type EstadoDelCosto =
  /** Se conoce: salió de las líneas de la receta o del costo propio de un producto de reventa. */
  | 'conocido'
  /** No tiene receta ni es de reventa: no hay de dónde sacar el costo. */
  | 'sin_receta'
  /** Tiene receta, pero a algún insumo le falta el costo. */
  | 'costo_incompleto'
  /** Es de reventa y nadie le ha puesto costo. */
  | 'sin_costo';

export interface EconomiaDelPlatillo {
  readonly estado: EstadoDelCosto;
  /** De dónde sale el costo conocido. Nulo mientras no se conozca. */
  readonly origen: 'receta' | 'producto' | null;
  /** Pesos. Nulo si el costo es desconocido: no existe, no es cero. */
  readonly costo: number | null;
  /** Pesos. Nula mientras el costo no se conozca. Puede ser negativa. */
  readonly utilidad: number | null;
  /** Porcentaje sobre el precio (70 = 70 %). Nulo sin costo o sin precio. */
  readonly margen: number | null;
  /** Los insumos de la receta a los que les falta el costo, sin repetir. */
  readonly ingredientesSinCosto: readonly string[];
  /** Lo que se escribe donde iría el costo: «Sin receta», «Costo desconocido». */
  readonly etiqueta: string | null;
  /** Qué hacer para que el margen exista. Nula cuando no hay nada que hacer. */
  readonly pista: string | null;
}

export const ETIQUETA_SIN_RECETA = 'Sin receta';
export const ETIQUETA_COSTO_DESCONOCIDO = 'Costo desconocido';
export const PISTA_SIN_RECETA = 'Agrega su receta para calcular el margen';
export const PISTA_SIN_COSTO = 'Registra su costo en una compra para calcular el margen';
export const PISTA_SIN_PRECIO = 'Define su precio de venta para calcular el margen';

/** La estrategia de los productos que se venden tal cual: su costo es el suyo. */
const ESTRATEGIA_DE_REVENTA = 'sku';

/** Cómo se nombra a un insumo que llegó sin nombre. */
const INGREDIENTE_SIN_NOMBRE = 'un ingrediente';
const CENTAVOS_POR_PESO = 100;
const PORCIENTO = 100;

const esNumero = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor);

const aCentavos = (pesos: number): number => Math.round(pesos * CENTAVOS_POR_PESO);

/**
 * El importe de una línea en CENTAVOS, o nulo si no se puede saber.
 *
 * Gana el que calculó el servidor (con la misma aritmética que guarda el producto);
 * si no llegó, se calcula con cantidad, merma y costo unitario.
 */
function centavosDeLaLinea(linea: LineaDeCosto): number | null {
  const unitario = linea.costo_unitario_base_snapshot;
  if (!esNumero(unitario) || unitario <= 0) return null;
  if (esNumero(linea.costo_linea_calculado)) return aCentavos(linea.costo_linea_calculado);

  const cantidad = linea.cantidad_convertida_unidad_base;
  if (!esNumero(cantidad)) return null;
  const merma = esNumero(linea.merma_porcentaje) ? linea.merma_porcentaje : 0;
  return aCentavos(cantidad * (1 + merma / PORCIENTO) * unitario);
}

/** ¿Esta línea tiene costo? Es la pregunta que se hace cada renglón de la ficha. */
export function lineaTieneCosto(linea: LineaDeCosto): boolean {
  return centavosDeLaLinea(linea) !== null;
}

function sinCostoConocido(
  estado: Exclude<EstadoDelCosto, 'conocido'>,
  etiqueta: string,
  pista: string,
  ingredientesSinCosto: readonly string[] = [],
): EconomiaDelPlatillo {
  return {
    estado,
    origen: null,
    costo: null,
    utilidad: null,
    margen: null,
    ingredientesSinCosto,
    etiqueta,
    pista,
  };
}

/** Con el costo en la mano, lo demás es aritmética en centavos enteros. */
function conCostoConocido(
  precioVenta: number | null | undefined,
  costoCentavos: number,
  origen: 'receta' | 'producto',
): EconomiaDelPlatillo {
  const precio = esNumero(precioVenta) ? precioVenta : 0;
  const utilidadCentavos = aCentavos(precio) - costoCentavos;
  const conPrecio = precio > 0;
  return {
    estado: 'conocido',
    origen,
    costo: costoCentavos / CENTAVOS_POR_PESO,
    utilidad: utilidadCentavos / CENTAVOS_POR_PESO,
    // Se multiplica ANTES de dividir: 0.7 × 100 es 70.00000000000001 en coma flotante.
    margen: conPrecio ? (utilidadCentavos * PORCIENTO) / aCentavos(precio) : null,
    ingredientesSinCosto: [],
    etiqueta: null,
    pista: conPrecio ? null : PISTA_SIN_PRECIO,
  };
}

/** Sin líneas: o se revende y tiene su costo, o no hay de dónde sacarlo. */
function sinLineas(
  precioVenta: number | null | undefined,
  producto: CostoPropioDelProducto | undefined,
): EconomiaDelPlatillo {
  const esDeReventa =
    producto?.estrategia_consumo === ESTRATEGIA_DE_REVENTA &&
    typeof producto.insumo_propio_id === 'string' &&
    producto.insumo_propio_id !== '';
  if (producto === undefined || !esDeReventa) {
    return sinCostoConocido('sin_receta', ETIQUETA_SIN_RECETA, PISTA_SIN_RECETA);
  }
  const propio = producto.costo_calculado_actual;
  if (!esNumero(propio) || propio <= 0) {
    return sinCostoConocido('sin_costo', ETIQUETA_COSTO_DESCONOCIDO, PISTA_SIN_COSTO);
  }
  return conCostoConocido(precioVenta, aCentavos(propio), 'producto');
}

/**
 * La economía de un platillo: costo, utilidad y margen, o por qué no se pueden dar.
 *
 * @param precioVenta pesos; ausente se lee como cero.
 * @param lineas las líneas de SU receta; vacías o ausentes, no tiene receta.
 * @param producto de dónde sale el costo cuando NO hay líneas (un producto de reventa).
 */
export function economiaDelPlatillo(
  precioVenta: number | null | undefined,
  lineas: readonly LineaDeCosto[] | null | undefined,
  producto?: CostoPropioDelProducto,
): EconomiaDelPlatillo {
  const vivas = (lineas ?? []).filter((linea) => linea.activo !== false);
  if (vivas.length === 0) return sinLineas(precioVenta, producto);

  let totalCentavos = 0;
  const sinCosto: string[] = [];
  for (const linea of vivas) {
    const centavos = centavosDeLaLinea(linea);
    if (centavos === null) {
      const nombre = linea.ingrediente_nombre?.trim();
      const dicho = nombre === undefined || nombre === '' ? INGREDIENTE_SIN_NOMBRE : nombre;
      if (!sinCosto.includes(dicho)) sinCosto.push(dicho);
      continue;
    }
    totalCentavos += centavos;
  }
  if (sinCosto.length > 0) {
    const pista = `Falta el costo de ${sinCosto.join(', ')}. Regístralo en una compra para calcular el margen`;
    return sinCostoConocido('costo_incompleto', ETIQUETA_COSTO_DESCONOCIDO, pista, sinCosto);
  }
  return conCostoConocido(precioVenta, totalCentavos, 'receta');
}

/**
 * Lo mismo, leyendo del producto lo que necesita: su precio y, si se revende, su costo.
 * Es lo que llaman las pantallas, para no repetir en cada una de dónde sale cada dato.
 */
export function economiaDelProducto(
  producto: CostoPropioDelProducto & { readonly precio_venta?: number | null | undefined },
  lineas: readonly LineaDeCosto[] | null | undefined,
): EconomiaDelPlatillo {
  return economiaDelPlatillo(producto.precio_venta, lineas, producto);
}
