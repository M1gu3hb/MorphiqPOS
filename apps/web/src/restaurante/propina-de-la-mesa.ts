/**
 * LA PROPINA QUE EL MESERO PREGUNTA AL PEDIR LA CUENTA, sin pantalla (día completo del
 * restaurante, 2.4).
 *
 * ── El defecto que esto arregla ──────────────────────────────────────────────
 * `02-DINERO-Y-CAJA` §4.3 dice que la propina se decide en TRES momentos y el primero es el
 * mesero, en la mesa, preguntándole al comensal: `porcentaje`, `monto_manual` o
 * `sin_propina`, con origen `mesero`. `restaurante.solicitar_cuenta` ya lo recibe —puntos
 * base enteros y el tipo—, y la pantalla de la mesa pedía la cuenta SIEMPRE con
 * `decidir_en_caja`, sin preguntar nada: «la mesa que dice “déjale el diez por ciento”»
 * llegaba a caja sin su propina y era la cajera quien tenía que adivinarla. Lo encontró el
 * día completo: Lupita pide la cuenta de la mesa 1 con el 10 % y no había dónde decirlo.
 *
 * Lo que NO se ofrece aquí es un monto tecleado: `solicitar_cuenta` no lleva importes (la
 * propina vive en `pagos`, no en la orden) y un monto a mano lo decide la caja al cobrar,
 * donde sí existe «otra cantidad».
 *
 * Los porcentajes son los MISMOS del muro de la caja (`ParedDePropina`): una mesa a la que se
 * le dijo «el 12.5 %» tiene que ver el 12.5 % cuando llegue a pagar.
 */

import { aplicarPorcentaje, centavos } from '@morphiqpos/domain/dinero';

/** Los tipos de propina que el mesero puede fijar desde la mesa (`solicitar_cuenta`). */
export type TipoDePropinaDeLaMesa = 'porcentaje' | 'sin_propina' | 'decidir_en_caja';

export interface OpcionDePropina {
  readonly clave: string;
  /** Lo que se lee en la tesela: «10 %», «Sin propina». */
  readonly etiqueta: string;
  readonly tipo: TipoDePropinaDeLaMesa;
  /** Sólo en `porcentaje`: los puntos base enteros del comando (10 % es 1000). */
  readonly puntosBase?: number;
}

/**
 * Las cinco, en el orden en que la mesa las dice. «Sin propina» pesa lo mismo que los
 * porcentajes —es voluntaria, y Profeco 2026 no admite un enlace chico abajo—, y la última es
 * la salida de quien no preguntó: la decide la caja, con su muro.
 */
export const OPCIONES_DE_PROPINA: readonly OpcionDePropina[] = [
  { clave: 'diez', etiqueta: '10 %', tipo: 'porcentaje', puntosBase: 1000 },
  { clave: 'doce-y-medio', etiqueta: '12.5 %', tipo: 'porcentaje', puntosBase: 1250 },
  { clave: 'quince', etiqueta: '15 %', tipo: 'porcentaje', puntosBase: 1500 },
  { clave: 'sin', etiqueta: 'Sin propina', tipo: 'sin_propina' },
  { clave: 'caja', etiqueta: 'La decide la caja', tipo: 'decidir_en_caja' },
];

/**
 * Lo que esa propina sumaría a la cuenta, en centavos, con el mismo redondeo del dominio que
 * usan la precuenta y el cobro. `null` cuando no hay un importe que decir: la decide la caja,
 * o todavía no se conoce el total.
 */
export function importeSugerido(
  totalCentavos: number | null,
  opcion: OpcionDePropina,
): number | null {
  if (opcion.tipo === 'sin_propina') return 0;
  if (opcion.tipo !== 'porcentaje' || opcion.puntosBase === undefined) return null;
  if (totalCentavos === null || !Number.isSafeInteger(totalCentavos) || totalCentavos < 0) {
    return null;
  }
  return Number(aplicarPorcentaje(centavos(totalCentavos), opcion.puntosBase));
}

/** El cuerpo de `restaurante.solicitar_cuenta` para la opción elegida. */
export function entradaDePedirLaCuenta(
  ordenId: string,
  opcion: OpcionDePropina,
): {
  readonly ordenId: string;
  readonly propinaTipo: TipoDePropinaDeLaMesa;
  readonly propinaPuntosBase?: number;
} {
  return {
    ordenId,
    propinaTipo: opcion.tipo,
    ...(opcion.tipo === 'porcentaje' && opcion.puntosBase !== undefined
      ? { propinaPuntosBase: opcion.puntosBase }
      : {}),
  };
}
