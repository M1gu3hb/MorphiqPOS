import { servirElCarrito } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/carrito` — DP-9.5.
 *
 * El sondeo del carrito compartido de la mesa: el teléfono deja su latido y recibe lo que hay.
 * Cada 2-3 s, con límite por token. Ver `servirElCarrito`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function POST(peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  const salida = await servirElCarrito(token, peticion);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
