import { enviarElCarrito, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/carrito/enviar` — DP-9.5.
 *
 * Manda a cocina el carrito entero UNA vez: el segundo «Enviar» simultáneo encuentra el carrito vacío.
 * `manejadorPublico` pone el límite por token, la transacción y la idempotencia.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(enviarElCarrito);

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
