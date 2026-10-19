import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import type { ContextoComando } from '../definicion.ts';

import { bajarSaldoDeLaFicha, espejarEnLaRemision } from './cobranza.ts';
import { cargarCliente } from './documento.ts';

/**
 * LA DEVOLUCIÓN DE UNA VENTA A CUENTA (182, cierre de la 2.4).
 *
 * `ferreteria/02-DINERO-Y-CAJA` §8.3: «Devolución de venta a crédito · Encargado · cero ·
 * Resta de ventas y del saldo». El fiado de la tienda es el mismo hecho con otro papel
 * (`documento.ts`: «un fiado, una remisión y una nota de mostrador son el mismo hecho»). Lo
 * que se devuelve de una venta a cuenta no sale del cajón: baja lo que el cliente debe.
 *
 * Para la cartera es un ABONO al documento de esa venta —como un pago aplicado, sin
 * dinero—, y por eso usa las MISMAS piezas que la cobranza: el documento baja con guarda,
 * la remisión de la ferretería baja igual (`espejarEnLaRemision`) y la ficha del cliente
 * también (`bajarSaldoDeLaFicha`; el fiado de la tienda lleva su saldo en los documentos y
 * su ficha en cero). El orden de los candados es el de la cobranza —primero el cliente,
 * después el documento—, así que una devolución y un pago del mismo cliente se forman en
 * fila y no se cruzan.
 */

/** Los métodos de una venta a cuenta: no entra dinero, sube lo que el cliente debe. */
export const METODOS_A_CUENTA = ['fiado', 'credito'] as const;
export type MetodoACuenta = (typeof METODOS_A_CUENTA)[number];

export function esACuenta(metodo: string): metodo is MetodoACuenta {
  return (METODOS_A_CUENTA as readonly string[]).includes(metodo);
}

/** Lo que de verdad se puede devolver por cobranza: lo que entra por esos métodos. */
const DEVUELVE_LA_COBRANZA = ['efectivo', 'tarjeta', 'transferencia'] as const;

export interface DocumentoDeLaVenta {
  readonly id: string;
  readonly clienteId: string;
  readonly saldoCentavos: bigint;
}

/**
 * El documento de cartera que dejó una venta: el del fiado (origen `venta`, la orden) o el
 * de su remisión (origen `remision`, la remisión de esa orden). `null` si la venta no dejó
 * deuda. Con `bloquear`, el renglón queda tomado hasta el final de la transacción.
 */
export async function documentoDeLaVenta(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  bloquear = false,
): Promise<DocumentoDeLaVenta | null> {
  let consulta = tx
    .selectFrom('documentos_credito')
    .select(['id', 'cliente_id as clienteId', 'saldo_centavos as saldoCentavos'])
    .where('organizacion_id', '=', organizacionId)
    .where((eb) =>
      eb.or([
        eb.and([eb('origen_tipo', '=', 'venta'), eb('origen_id', '=', ordenId)]),
        eb.and([
          eb('origen_tipo', '=', 'remision'),
          eb(
            'origen_id',
            'in',
            eb
              .selectFrom('remisiones')
              .select('id')
              .where('organizacion_id', '=', organizacionId)
              .where('orden_id', '=', ordenId),
          ),
        ]),
      ]),
    )
    .orderBy('emitido_en');
  if (bloquear) consulta = consulta.forUpdate();
  const filas = await consulta.execute();
  if (filas.length > 1) {
    // Una venta deja UN documento: dos son una deuda contada dos veces, y devolver contra
    // cualquiera de ellos sería elegir a ciegas cuál de las dos cuentas mentía.
    throw new ErrorDominio(
      'CONFIGURACION_CONFLICTO',
      'Esa venta tiene más de un documento de cartera: hay que revisarla antes de devolver.',
      { ordenId },
    );
  }
  return filas[0] ?? null;
}

/**
 * Lo que entró por COBRANZA a ese documento, por método: los abonos confirmados que se le
 * aplicaron. Es dinero de esta venta que entró después, y se devuelve por donde entró.
 */
export async function cobradoDelDocumento(
  tx: Transaccion,
  organizacionId: string,
  documentoId: string,
): Promise<ReadonlyMap<string, bigint>> {
  const { rows } = await sql<{ metodo: string; centavos: string }>`
    select p.metodo as "metodo", sum(a.monto_centavos)::text as "centavos"
      from aplicaciones_pago a
      join pagos_credito p on p.id = a.pago_id
     where p.organizacion_id = ${organizacionId}
       and a.documento_id = ${documentoId}
       and p.confirmado
     group by p.metodo
  `.execute(tx);
  return new Map(
    rows
      .filter((f) => (DEVUELVE_LA_COBRANZA as readonly string[]).includes(f.metodo))
      .map((f) => [f.metodo, BigInt(f.centavos)]),
  );
}

/**
 * Baja lo devuelto del documento de la venta, de su remisión y de la ficha del cliente.
 * Devuelve el documento como quedó. Falla —y con él la devolución entera— si lo devuelto
 * pasa de lo que todavía se debe: lo ya pagado se devuelve por el método con que se pagó.
 */
export async function abonarDevolucion(
  ctx: ContextoComando<Transaccion>,
  datos: { readonly ordenId: string; readonly montoCentavos: bigint },
): Promise<DocumentoDeLaVenta> {
  const { organizacionId } = ctx.ambito;
  const sinBloquear = await ctx.paso('leer_documento', () =>
    documentoDeLaVenta(ctx.tx, organizacionId, datos.ordenId),
  );
  if (sinBloquear === null) {
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      'Esa venta no dejó deuda: no hay saldo de dónde descontar la devolución.',
    );
  }
  // El cliente PRIMERO, como en la cobranza; después el documento.
  await cargarCliente(ctx, sinBloquear.clienteId);
  const documento = await ctx.paso('bloquear_documento', () =>
    documentoDeLaVenta(ctx.tx, organizacionId, datos.ordenId, true),
  );
  if (documento === null) {
    throw new ErrorDominio('PAGO_NO_CUADRA', 'El documento de esa venta ya no existe.');
  }
  if (datos.montoCentavos > documento.saldoCentavos) {
    throw new ErrorDominio(
      'PAGO_NO_CUADRA',
      'De esa venta se debe menos de lo que se quiere devolver a cuenta: lo que ya pagó se devuelve por el método con que pagó.',
      { saldoCentavos: documento.saldoCentavos.toString() },
    );
  }
  const despues = documento.saldoCentavos - datos.montoCentavos;
  const bajado = await ctx.paso('bajar_documento', () =>
    ctx.tx
      .updateTable('documentos_credito')
      .set({ saldo_centavos: despues })
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', documento.id)
      .where('saldo_centavos', '=', documento.saldoCentavos)
      .executeTakeFirst(),
  );
  if (Number(bajado.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'CONFIGURACION_CONFLICTO',
      'El saldo de ese documento cambió mientras se devolvía.',
      { documentoId: documento.id },
    );
  }
  await espejarEnLaRemision(ctx, documento.id, datos.montoCentavos);
  await bajarSaldoDeLaFicha(ctx, documento.clienteId, datos.montoCentavos);
  return { ...documento, saldoCentavos: despues };
}
