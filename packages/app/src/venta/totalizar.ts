import 'server-only';

import { PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoOrdenes, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { exigirBorrador } from './carrito.ts';
import { cotizar } from './cotizar.ts';

/**
 * EL TOTAL DEL BORRADOR, ANOTADO (bloque D de la 2.4).
 *
 * `venta.agregar_linea` pone el importe de cada renglón, pero el total de la ORDEN sólo se
 * calculaba al cobrar. Mientras el mostrador armaba y cobraba en la misma llamada nadie lo
 * notaba; cuando la cafetería empezó a armar el pedido para cobrarlo en «Cobro y propina», esa
 * pantalla leía un total de $0: cobraba sólo la propina y el servidor lo rechazaba con «el
 * total cambió». Esto lo anota con la MISMA cotización que usa el cobro —precios, descuentos
 * e impuesto—, así que lo que se enseña es lo que se va a cobrar.
 */

const ROLES = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaTotalizar = z.object({ ordenId: z.uuid() });

export const totalizarBorrador = definirComando<
  Transaccion,
  typeof entradaTotalizar,
  { readonly totalCentavos: string }
>({
  nombre: 'venta.totalizar',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaTotalizar,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await ctx.paso('exigir_borrador', () =>
      exigirBorrador(ctx.tx, organizacionId, entrada.ordenId),
    );
    const { totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );
    await ctx.paso('anotar_totales', () =>
      repoOrdenes.anotarTotales(ctx.tx, organizacionId, entrada.ordenId, totales),
    );
    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: { totalCentavos: totales.totalCentavos.toString() },
    });
    return { totalCentavos: totales.totalCentavos.toString() };
  },
});
