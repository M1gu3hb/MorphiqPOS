import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { CERO, centavos, type Centavos } from '../dinero/centavos.ts';
import { restar, sumar } from '../dinero/aritmetica.ts';
import { PUNTOS_BASE_100, aplicarPorcentaje } from '../dinero/redondeo.ts';

/**
 * Totales de una orden (F1.1-A-07).
 *
 * Corrige P0-07 desde la raíz: en las dos fuentes, el subtotal y el total eran
 * un `reduce` del carrito hecho en el navegador e insertado tal cual. Aquí sólo
 * entran producto, cantidad y precio unitario ya resuelto por el catálogo, y
 * **todo lo demás se deriva**. No hay ninguna forma de pasarle un total.
 *
 * También corrige el motivo de `ventaTotales.js`, el archivo de "cálculo
 * defensivo" del restaurante: existía porque la venta guardaba `total = 0` con
 * líneas que sí tenían importe, y había que adivinar cuál creer. Si el total
 * siempre se deriva de las líneas, no hay nada que adivinar y ese archivo
 * sobra — por eso no se porta, se elimina el problema que lo justificaba.
 */

/** Una línea ya valorada. `precioDeLinea` del catálogo produce el subtotal. */
export interface LineaValorada {
  readonly subtotalCentavos: Centavos;
  /** Descuento de la línea, ya en centavos. Nunca un porcentaje del cliente. */
  readonly descuentoCentavos?: Centavos;
  /** Costo total de la línea, para derivar utilidad y margen. */
  readonly costoCentavos?: Centavos;
}

export interface ReglaImpuesto {
  /**
   * Tasa en puntos base: 1600 = 16 %.
   *
   * En puntos base y no en decimal porque `0.16` no existe exactamente en punto
   * flotante, y el redondeo de una tasa mal representada se acumula factura a
   * factura hasta que el arqueo no cuadra por pesos.
   */
  readonly tasaPuntosBase: number;
  /**
   * `true` en México: el precio de anaquel YA lleva IVA y el impuesto se
   * extrae del total. `false` lo suma encima. Confundirlos cambia el total en
   * un 16 %, así que es explícito y no tiene valor por omisión.
   */
  readonly incluidoEnPrecio: boolean;
}

export interface TotalesOrden {
  readonly subtotalCentavos: Centavos;
  readonly descuentoCentavos: Centavos;
  readonly impuestosCentavos: Centavos;
  readonly totalCentavos: Centavos;
  readonly costoTotalCentavos: Centavos;
  readonly utilidadCentavos: Centavos;
  /** Margen en puntos base sobre el total. 2500 = 25 %. */
  readonly margenBp: number;
}

export function calcularTotales(
  lineas: readonly LineaValorada[],
  impuesto: ReglaImpuesto,
): TotalesOrden {
  if (!Number.isInteger(impuesto.tasaPuntosBase) || impuesto.tasaPuntosBase < 0) {
    throw new ErrorDominio(
      'DINERO_PORCENTAJE_INVALIDO',
      'La tasa de impuesto debe ser un entero de puntos base no negativo.',
      { tasaPuntosBase: String(impuesto.tasaPuntosBase) },
    );
  }

  let subtotal = CERO;
  let descuento = CERO;
  let costo = CERO;

  for (const linea of lineas) {
    subtotal = sumar(subtotal, linea.subtotalCentavos);
    descuento = sumar(descuento, linea.descuentoCentavos ?? CERO);
    costo = sumar(costo, linea.costoCentavos ?? CERO);
  }

  // El descuento nunca deja el total en negativo: un cupón mayor que la venta
  // se agota en ella. Sin este tope, `total` negativo entraría a caja como una
  // entrada de dinero y descuadraría el arqueo por el doble.
  const descuentoAplicado = mayor(descuento, subtotal) ? subtotal : descuento;
  const total = restar(subtotal, descuentoAplicado);

  const impuestos = impuesto.incluidoEnPrecio
    ? impuestoExtraido(total, impuesto.tasaPuntosBase)
    : aplicarPorcentaje(total, impuesto.tasaPuntosBase);

  // Si el impuesto se suma, engorda el total; si va incluido, ya está dentro.
  const totalFinal = impuesto.incluidoEnPrecio ? total : sumar(total, impuestos);

  const utilidad = restar(totalFinal, costo);

  return {
    subtotalCentavos: subtotal,
    descuentoCentavos: descuentoAplicado,
    impuestosCentavos: impuestos,
    totalCentavos: totalFinal,
    costoTotalCentavos: costo,
    utilidadCentavos: utilidad,
    margenBp: margenEnPuntosBase(totalFinal, utilidad),
  };
}

/**
 * Extrae el impuesto de un importe que ya lo incluye.
 *
 * `impuesto = total − total / (1 + tasa)`, hecho con enteros:
 *   `impuesto = total × tasa / (10000 + tasa)`, redondeando al centavo.
 *
 * Se calcula así y no dividiendo en punto flotante porque `total / 1.16` no es
 * exacto y el error, multiplicado por doscientas ventas, es lo que hace que el
 * reporte de impuestos no cuadre con la suma de los tickets.
 */
function impuestoExtraido(total: Centavos, tasaPuntosBase: number): Centavos {
  if (tasaPuntosBase === 0) return CERO;
  const base = BigInt(PUNTOS_BASE_100) + BigInt(tasaPuntosBase);
  const numerador = total * BigInt(tasaPuntosBase);
  // Redondeo al centavo más cercano, medio hacia arriba, igual que `redondear`.
  return centavos((numerador * 2n + base) / (base * 2n));
}

function margenEnPuntosBase(total: Centavos, utilidad: Centavos): number {
  if (total === CERO) return 0;
  return Number((utilidad * BigInt(PUNTOS_BASE_100)) / total);
}

function mayor(a: Centavos, b: Centavos): boolean {
  return a > b;
}
