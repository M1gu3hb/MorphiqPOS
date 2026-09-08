import 'server-only';

import type { Kysely } from 'kysely';

import type { Esquema } from '../../esquema.ts';

/**
 * Lecturas para el ticket (F1.1-A-12).
 *
 * Se leen los totales CONGELADOS de la orden, no se recalculan: un ticket
 * reimpreso seis meses después con el precio de hoy no es el mismo documento
 * que se le dio al cliente.
 */

/** La orden completa para el ticket: cabecera, lineas y pagos. */
export interface OrdenParaTicket {
  readonly id: string;
  readonly serie: string;
  readonly folio: bigint | null;
  readonly estado: string;
  readonly subtotalCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly impuestosCentavos: bigint;
  readonly totalCentavos: bigint;
  readonly createdAt: Date;
  readonly organizacionNombre: string;
  readonly sucursalNombre: string;
}

export async function ordenParaTicket(
  db: Kysely<Esquema>,
  organizacionId: string,
  ordenId: string,
): Promise<OrdenParaTicket | null> {
  const fila = await db
    .selectFrom('ordenes')
    .innerJoin('organizaciones', 'organizaciones.id', 'ordenes.organizacion_id')
    .innerJoin('sucursales', 'sucursales.id', 'ordenes.sucursal_id')
    .select([
      'ordenes.id as id',
      'ordenes.serie as serie',
      'ordenes.folio as folio',
      'ordenes.estado as estado',
      'ordenes.subtotal_centavos as subtotalCentavos',
      'ordenes.descuento_centavos as descuentoCentavos',
      'ordenes.impuestos_centavos as impuestosCentavos',
      'ordenes.total_centavos as totalCentavos',
      'ordenes.created_at as createdAt',
      'organizaciones.nombre as organizacionNombre',
      'sucursales.nombre as sucursalNombre',
    ])
    .where('ordenes.organizacion_id', '=', organizacionId)
    .where('ordenes.id', '=', ordenId)
    .executeTakeFirst();

  return fila ?? null;
}

export interface PagoDeTicket {
  readonly metodo: string;
  readonly montoCentavos: bigint;
  readonly recibidoCentavos: bigint | null;
  readonly cambioCentavos: bigint;
}

export async function pagosDeOrden(
  db: Kysely<Esquema>,
  organizacionId: string,
  ordenId: string,
): Promise<PagoDeTicket[]> {
  return db
    .selectFrom('pagos')
    .select([
      'metodo',
      'monto_centavos as montoCentavos',
      'recibido_centavos as recibidoCentavos',
      'cambio_centavos as cambioCentavos',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('estado', '=', 'confirmado')
    .orderBy('created_at')
    .execute();
}
