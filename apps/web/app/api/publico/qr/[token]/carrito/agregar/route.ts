import { agregarAlCarrito, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/carrito/agregar` — DP-9.5.
 *
 * Agrega algo al carrito compartido de la mesa, con la huella de este teléfono.
 * `manejadorPublico` pone el límite por token, la transacción y la idempotencia.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(agregarAlCarrito);

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
