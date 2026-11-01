import { quitarDelCarrito, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/carrito/quitar` — DP-9.5.
 *
 * Quita del carrito compartido lo que agregó ESTE teléfono; lo de otros no.
 * `manejadorPublico` pone el límite por token, la transacción y la idempotencia.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(quitarDelCarrito);

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
