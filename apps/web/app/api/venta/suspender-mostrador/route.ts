import { suspenderVenta } from '@morphiqpos/app/venta';
import { z } from 'zod';

import {
  LineaDeMostrador,
  armarCarrito,
  pasosDe,
  respuestaJson,
} from '~/servidor/carrito-de-mostrador';
import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F6 · APARTAR LA VENTA DEL MOSTRADOR (F-224, C.10 de la 2.4).
 *
 * «Ahorita vengo por la cartera.» En la tienda la venta vive en la pantalla hasta que se
 * cobra, así que apartarla es armarla en el servidor —el mismo carrito que el cobro— y
 * suspenderla con su código corto. Sin esta ruta F6 no hacía nada: `venta.suspender` pide
 * una orden que exista, y la pantalla no tenía ninguna.
 */
export const runtime = 'nodejs';

const Entrada = z.object({
  lineas: z.array(LineaDeMostrador).min(1).max(120),
  /** «El señor de la gorra». Se dice, no se teclea entero. */
  nota: z.string().trim().max(60).nullable().default(null),
});

const suspender = manejadorDeComando(suspenderVenta);

export async function POST(peticion: Request): Promise<Response> {
  const cuerpo: unknown = await peticion.json().catch(() => null);
  const validada = Entrada.safeParse(cuerpo);
  if (!validada.success) {
    return respuestaJson(400, {
      ok: false,
      error: {
        codigo: 'ENTRADA_INVALIDA',
        mensaje: 'La venta llegó incompleta. No se apartó nada.',
      },
    });
  }

  const paso = pasosDe(peticion);
  const carrito = await armarCarrito(paso, validada.data.lineas);
  if (!carrito.ok) return carrito.respuesta;

  // Tal cual: su código corto o su fallo, con su mensaje.
  return suspender(paso({ ordenId: carrito.ordenId, nota: validada.data.nota }, 'apartar'));
}
