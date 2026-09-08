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
 * Congela la orden: totales, folio y estado `pagada`.
 *
 * El `where estado = 'borrador'` no es decorativo: es lo que hace que dos
 * cobros concurrentes de la misma orden no se pisen. El segundo actualiza cero
 * filas y esta funcion lanza, revirtiendo su transaccion entera.
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
  },
): Promise<void> {
  const resultado = await tx
    .updateTable('ordenes')
    .set({
      estado: 'pagada',
      serie: datos.serie,
      folio: datos.folio,
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
    .where('estado', '=', 'borrador')
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new Error(`La orden ${datos.ordenId} ya no estaba en borrador al cobrarla.`);
  }
}
