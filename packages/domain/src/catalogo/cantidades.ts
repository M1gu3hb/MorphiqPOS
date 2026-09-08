import { ErrorDominio } from '@morphiqpos/contracts/errores';

/** Diezmilésimas de unidad. Coincide con numeric(14,4), sin Number. */
export type Cantidad = bigint & { readonly __cantidad: unique symbol };
export const ESCALA_CANTIDAD = 10_000n;
const MAXIMO = 99_999_999_999_999n;

export function cantidad(texto: string): Cantidad {
  const limpio = texto.trim();
  if (!/^\d{1,10}(?:\.\d{1,4})?$/.test(limpio)) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'Usa hasta diez enteros y cuatro decimales.');
  }
  const [entero = '0', decimal = ''] = limpio.split('.');
  return desdeDiezmilesimas(BigInt(entero) * ESCALA_CANTIDAD + BigInt(decimal.padEnd(4, '0')));
}

export function desdeDiezmilesimas(valor: bigint): Cantidad {
  if (valor < 0n || valor > MAXIMO) {
    throw new ErrorDominio('CANTIDAD_INVALIDA', 'La cantidad está fuera del rango de inventario.');
  }
  return valor as Cantidad;
}

export function cantidadATexto(valor: Cantidad): string {
  desdeDiezmilesimas(valor);
  const enteros = (valor / ESCALA_CANTIDAD).toString();
  const fraccion = (valor % ESCALA_CANTIDAD).toString().padStart(4, '0').replace(/0+$/, '');
  return fraccion ? `${enteros}.${fraccion}` : enteros;
}

/** Las conversiones de stock nunca redondean silenciosamente. */
export function cantidadExacta(numerador: bigint, denominador: bigint): Cantidad {
  if (denominador <= 0n || numerador % denominador !== 0n) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      'La conversión no cabe en cuatro decimales exactos.',
    );
  }
  return desdeDiezmilesimas(numerador / denominador);
}
