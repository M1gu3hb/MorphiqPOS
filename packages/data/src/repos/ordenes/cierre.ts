import 'server-only';

import type { Transaccion } from '../../cliente.ts';

/**
 * Lo que se escribe al cobrar: los pagos y el congelado de la orden.
 *
 * Vive aparte del carrito porque son escrituras de naturaleza distinta: el
 * carrito se edita muchas veces y sin consecuencias, esto ocurre una sola vez
 * por venta y es irreversible.
 */

export interface NuevoPago {
  readonly organizacionId: string;
  readonly ordenId: string;
  readonly sesionCajaId: string | null;
  readonly metodo: string;
  readonly montoCentavos: bigint;
  readonly recibidoCentavos: bigint | null;
  readonly cambioCentavos: bigint;
  readonly referencia: string | null;
  readonly idempotencyKey: string | null;
}

/** Un pago mixto son varias llamadas a esto, una por metodo (corrige P1-11). */
export async function registrarPago(tx: Transaccion, pago: NuevoPago): Promise<void> {
  await tx
    .insertInto('pagos')
    .values({
      organizacion_id: pago.organizacionId,
      orden_id: pago.ordenId,
      sesion_caja_id: pago.sesionCajaId,
      metodo: pago.metodo,
      monto_centavos: pago.montoCentavos,
      recibido_centavos: pago.recibidoCentavos,
      cambio_centavos: pago.cambioCentavos,
      referencia: pago.referencia,
      idempotency_key: pago.idempotencyKey,
      estado: 'confirmado',
    })
    .execute();
}

export interface TotalesParaCongelar {
  readonly subtotalCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly impuestosCentavos: bigint;
  readonly totalCentavos: bigint;
  readonly costoTotalCentavos: bigint;
  readonly utilidadCentavos: bigint;
  readonly margenBp: number;
}

/**
 * Los estados desde los que una venta TODAVIA se puede cobrar.
 *
 * Son exactamente los cinco del indice parcial `ordenes_una_activa_por_mesa`
 * (046_restricciones_restaurante.sql:64-67): mientras la base considera que esa
 * orden ocupa la mesa, la caja tiene que poder cobrarla.
 *
 * Antes aqui solo estaba 'borrador', y esa lista de uno dejaba la mesa FUERA DE
 * SERVICIO: `restaurante.enviar_pedido` escribe `estado='confirmada'`, y a
 * partir de ahi la orden no se podia cobrar (esta funcion), ni editar
 * (`venta/carrito.ts`), ni liberar la mesa (`restaurante/mesas.ts`, porque la
 * orden tiene lineas). 'borrador' solo es correcto para el carril de mostrador,
 * donde el carrito ES la orden y nunca sale de ahi hasta cobrarse.
 *
 * 'parcialmente_pagada' NO entra: cerrar con un solo folio una orden que ya
 * tiene pagos parciales exigiria conciliar lo ya cobrado, y eso es otro caso de
 * uso. 'pagada', 'cancelada' y los reembolsos tampoco: esos ya estan cerrados.
 */
export const ESTADOS_COBRABLES = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

/**
 * Congela la orden: totales, folio y estado `pagada`.
 *
 * El `where estado in (...)` no es decorativo: es lo que hace que dos cobros
 * concurrentes de la misma orden no se pisen. El segundo actualiza cero filas y
 * esta funcion lanza, revirtiendo su transaccion entera.
 */
export async function marcarPagada(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly ordenId: string;
    readonly sesionCajaId: string;
    readonly empleadoCobraId: string;
    readonly serie: string;
    readonly folio: bigint;
    readonly totales: TotalesParaCongelar;
    /**
     * El instante del cobro. Viene del comando (`ctx.ahora`) y no de `now()`
     * para que todo lo que escribe una transaccion lleve la MISMA hora: el
     * pago, el movimiento de caja y el cierre de la orden.
     */
    readonly ahora: Date;
  },
): Promise<void> {
  const resultado = await tx
    .updateTable('ordenes')
    .set({
      estado: 'pagada',
      // SIN ESTO NINGUN COBRO PASA. El `check orden_cerrada_con_fecha` de la
      // migracion 045 exige que una orden pagada o cancelada tenga fecha de
      // cierre, y esta funcion nunca la escribia: contra Postgres real, TODO
      // cobro abortaba con 23514 —comprobado—, de mesa y de mostrador.
      //
      // No lo vio ninguna prueba porque el doble en memoria no modela `check`.
      // Es el hueco del que avisa `contratos-por-mutacion`: una suite en verde
      // sobre un sistema que no arranca.
      cerrada_en: datos.ahora,
      folio: datos.folio,
      serie: datos.serie,
      sesion_caja_id: datos.sesionCajaId,
      empleado_cobra_id: datos.empleadoCobraId,
      subtotal_centavos: datos.totales.subtotalCentavos,
      descuento_centavos: datos.totales.descuentoCentavos,
      impuestos_centavos: datos.totales.impuestosCentavos,
      total_centavos: datos.totales.totalCentavos,
      costo_total_centavos: datos.totales.costoTotalCentavos,
      utilidad_centavos: datos.totales.utilidadCentavos,
      margen_bp: datos.totales.margenBp,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenId)
    .where('estado', 'in', [...ESTADOS_COBRABLES])
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new Error(`La orden ${datos.ordenId} ya no estaba cobrable al cobrarla.`);
  }
}
