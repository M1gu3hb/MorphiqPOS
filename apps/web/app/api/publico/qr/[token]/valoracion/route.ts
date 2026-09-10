import { valorarVisita, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/valoracion` — E7-3.
 *
 * La carita del final. El emoji lo pone el servidor a partir del número, para
 * que nadie escriba texto libre en la valoración de una venta.
 *
 * `manejadorPublico` resuelve el negocio del despliegue, cuenta el límite de
 * peticiones por token, abre la transacción y aplica la idempotencia. Aquí no
 * hay ninguna decisión que tomar, y ese es el punto.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(valorarVisita);

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
