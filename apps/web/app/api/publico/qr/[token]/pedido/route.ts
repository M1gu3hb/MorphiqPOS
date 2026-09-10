import { enviarPedidoDesdeQR, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/pedido` — E7-3.
 *
 * El pedido del carrito. El comensal manda QUÉ quiere y CUÁNTO quiere; el
 * precio lo recalcula el servidor desde el catálogo. No descuenta stock: eso
 * ocurre sólo al cobrar (regla 5 de `F1-01` §3).
 *
 * `manejadorPublico` resuelve el negocio del despliegue, cuenta el límite de
 * peticiones por token, abre la transacción y aplica la idempotencia. Aquí no
 * hay ninguna decisión que tomar, y ese es el punto.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(enviarPedidoDesdeQR);

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function POST(peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  const salida = await manejar(token, peticion);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
