import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import { desdeDiezmilesimas, ESCALA_CANTIDAD, type Cantidad } from '../../catalogo/index.ts';
import type { ConsumoDeInsumo } from './tipos.ts';

/**
 * V3 · Presentaciones. La variante de abarrotes, ferretería y farmacia.
 *
 * ── El corazón del modelo de retail ────────────────────────────────────────
 * El mismo producto se compra en caja y se vende en pieza; el refresco se vende
 * suelto y en six; el cigarro se vende suelto de una cajetilla de veinte. Hoy la
 * plantilla `esencial` no tiene inventario en absoluto: se vende y el stock no
 * baja, así que el dueño no puede saber qué le falta ni qué le robaron.
 *
 * ── La existencia se lleva en UNIDAD BASE, siempre ────────────────────────
 * Vender un six descuenta seis piezas, no un six. Llevar la existencia en la
 * presentación que se vendió obligaría a sumar manzanas con cajas de manzanas,
 * y el día que alguien venda una caja y tres piezas el inventario deja de
 * poderse sumar.
 *
 * ── Por qué el factor es `numeric(14,4)` y no entero ──────────────────────
 * Porque el cigarro suelto tiene factor 1/20 = 0.05 y el huevo por kilo ≈16.6.
 * Un entero obligaría a invertir la unidad base y a llevar el inventario de
 * cigarros en cigarros, que es contraintuitivo para el tendero. El factor puede
 * ser fraccionario; la existencia sigue siendo entera en unidad base.
 *
 * ── Lo que esta variante NO decide ────────────────────────────────────────
 * No decide el precio. El precio de una presentación vive en el catálogo y lo
 * resuelve `precioDeLinea`; aquí sólo se traduce cuánto sale del almacén. Meter
 * el precio aquí sería el segundo sitio donde se calcula un importe.
 */

export interface LineaConPresentacion {
  /** El insumo que lleva la existencia, en unidad base. */
  readonly insumoId: string;
  /**
   * Cuántas unidades base contiene una unidad de la presentación vendida.
   *
   * `1` para la base, `6` para el six, `0.05` para el cigarro suelto. Texto y no
   * número por la misma razón que el dinero: `0.05 × 3` en coma flotante es
   * `0.15000000000000002`, y el inventario de cigarros dejaría de cuadrar por
   * décimas cada venta.
   */
  readonly factor: string;
  readonly unidadBase: string;
}

/**
 * Traduce «tres six» a «dieciocho piezas».
 *
 * `cantidadLinea` viene ya normalizada por el tronco: son unidades de la
 * PRESENTACIÓN, y el factor las convierte a unidad base.
 */
export function consumoDePresentacion(
  linea: LineaConPresentacion,
  cantidadLinea: Cantidad,
): readonly ConsumoDeInsumo[] {
  const factor = aEscala(linea.factor);

  if (factor <= 0n) {
    // Un factor cero o negativo haría que vender no descontara nada —o que
    // sumara al almacén—, que son las dos formas de que el inventario deje de
    // significar algo sin que nada falle.
    throw new ErrorDominio(
      CODIGOS_ERROR.CATALOGO_INVALIDO,
      'Una presentación tiene que contener una cantidad positiva de unidades base.',
      { factor: linea.factor },
    );
  }

  // En enteros escalados: `(cantidad × factor) / ESCALA`. Dividir al final y no
  // al principio es lo que conserva los decimales del cigarro suelto.
  const enBase = ((cantidadLinea as bigint) * factor) / ESCALA_CANTIDAD;

  if (enBase <= 0n) {
    // Vender menos de una unidad base —media pieza de algo que no se parte— no
    // descuenta nada, y decirlo en voz alta es mejor que descontar cero en
    // silencio: el inventario se iría drenando sin registro.
    throw new ErrorDominio(
      CODIGOS_ERROR.CANTIDAD_INVALIDA,
      'Esa cantidad no llega a una unidad base del producto.',
      { factor: linea.factor },
    );
  }

  return [
    {
      insumoId: linea.insumoId,
      cantidad: desdeDiezmilesimas(enBase),
      unidadBase: linea.unidadBase,
    },
  ];
}

/** `'0.0500'` → `500n`, en la escala de `numeric(14,4)`. Nunca pasa por `Number`. */
function aEscala(valor: string): bigint {
  const negativo = valor.startsWith('-');
  const limpio = negativo ? valor.slice(1) : valor;
  const [entera = '0', decimal = ''] = limpio.split('.');
  const escalado =
    BigInt(entera || '0') * ESCALA_CANTIDAD + BigInt(decimal.padEnd(4, '0').slice(0, 4));
  return negativo ? -escalado : escalado;
}
