import { aplicarDescuento, totalizarBorrador } from '@morphiqpos/app/venta';
import { z } from 'zod';

import {
  LineaDeMostrador,
  armarCarrito,
  datosSiSalio,
  fronteraDelMostrador,
  pasosDe,
  respuestaJson,
} from '~/servidor/carrito-de-mostrador';
import { manejadorDeComando } from '~/servidor/ruta';

/**
 * ARMAR LA VENTA DEL MOSTRADOR SIN COBRARLA (bloque D de la 2.4).
 *
 * La cafetería cobra con método y propina en «Cobro y propina» —los cuatro métodos, el
 * mixto y la propina que decide el cliente—, pero su pantalla de Cobrar sólo sabía cobrar
 * en efectivo exacto: un latte con tarjeta no tenía cómo pagarse desde el mostrador, aunque
 * a las siete de la mañana media fila paga con tarjeta. Esto deja el pedido en el borrador
 * de la terminal —las mismas líneas y el mismo descuento que `cobrar-mostrador`— y devuelve
 * su id, para que «Cobro y propina» lo cobre. No mueve dinero ni inventario: eso lo hace el
 * cobro, en una sola transacción.
 */
export const runtime = 'nodejs';

const Entrada = z.object({
  lineas: z.array(LineaDeMostrador).min(1).max(120),
  descuento: z
    .object({
      centavos: z.number().int().positive(),
      motivo: z.string().trim().min(4).max(200),
      autorizacion: z.string().min(20).max(2_000).optional(),
    })
    .optional(),
});

const descontar = manejadorDeComando(aplicarDescuento);
const totalizar = manejadorDeComando(totalizarBorrador);

export async function POST(peticion: Request): Promise<Response> {
  const frontera = fronteraDelMostrador(peticion);
  if (frontera !== null) return frontera;
  const cuerpo: unknown = await peticion.json().catch(() => null);
  const validada = Entrada.safeParse(cuerpo);
  if (!validada.success) {
    return respuestaJson(400, {
      ok: false,
      error: {
        codigo: 'ENTRADA_INVALIDA',
        mensaje: 'El pedido llegó incompleto. No se guardó nada.',
      },
    });
  }

  const paso = pasosDe(peticion);
  const carrito = await armarCarrito(paso, validada.data.lineas);
  if (!carrito.ok) return carrito.respuesta;
  const { ordenId } = carrito;

  const { descuento } = validada.data;
  if (descuento !== undefined) {
    const respuestaDescuento = await descontar(
      paso(
        {
          ordenId,
          descuentoCentavos: descuento.centavos,
          motivo: descuento.motivo,
          ...(descuento.autorizacion === undefined ? {} : { autorizacion: descuento.autorizacion }),
        },
        'descuento',
      ),
    );
    if ((await datosSiSalio(respuestaDescuento)) === null) return respuestaDescuento;
  }

  // El total del borrador, anotado: «Cobro y propina» lo lee de la orden y sin esto leía $0.
  const respuestaTotal = await totalizar(paso({ ordenId }, 'total'));
  const totalizado = await datosSiSalio<{ totalCentavos: string }>(respuestaTotal);
  if (totalizado === null) return respuestaTotal;

  return respuestaJson(200, {
    ok: true,
    datos: { ordenId, totalCentavos: totalizado.totalCentavos },
  });
}
