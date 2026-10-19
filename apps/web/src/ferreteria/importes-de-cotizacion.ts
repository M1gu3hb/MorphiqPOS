/**
 * LOS IMPORTES DE LA COTIZACIÓN, con enteros (C.10 de la 2.4).
 *
 * La cotización multiplicaba el dinero en flotante —`precio × cantidad × (1 − d / 100)`
 * con `Math.round` al final— y mandaba al servidor OTRA cuenta —`round(precio × (1 − d))`
 * por línea—: con un descuento con decimales, lo que la pantalla enseñaba y lo que se
 * cotizaba podían diferir en un centavo. Aquí es UNA cuenta, la del servidor: el precio
 * con descuento al centavo (medio hacia arriba) y el importe, ese precio por la cantidad.
 */

/** El descuento en puntos base: «7.5 %» son 750. Es un porcentaje, no dinero. */
function puntosBase(descuentoPct: number): bigint {
  const acotado = Math.min(100, Math.max(0, descuentoPct));
  return BigInt(Math.round(acotado * 100));
}

/** La cantidad en diezmilésimas: «12.5» m son 125 000. Es una cantidad, no dinero. */
function diezmilesimas(cantidad: number): bigint {
  return BigInt(Math.round(cantidad * 10_000));
}

/** El precio unitario con el descuento aplicado, al centavo y medio hacia arriba. */
export function precioConDescuento(precioCentavos: number, descuentoPct: number): number {
  const conDescuento = BigInt(precioCentavos) * (10_000n - puntosBase(descuentoPct));
  return Number((conDescuento + 5_000n) / 10_000n);
}

/** El importe de la línea: ese precio por la cantidad, al centavo. */
export function importeDeLinea(
  precioCentavos: number,
  cantidad: number,
  descuentoPct: number,
): number {
  const unitario = BigInt(precioConDescuento(precioCentavos, descuentoPct));
  return Number((unitario * diezmilesimas(cantidad) + 5_000n) / 10_000n);
}
