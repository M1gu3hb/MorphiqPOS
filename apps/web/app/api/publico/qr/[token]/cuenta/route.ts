import { pedirCuentaQR, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/cuenta` — E7-3.
 *
 * Pedir la cuenta y elegir propina. La propina se calcula en el servidor sobre
 * el total de la orden y NO entra en `Venta.total` (regla 1 de `F1-01` §3).
 *
 * `manejadorPublico` resuelve el negocio del despliegue, cuenta el límite de
 * peticiones por token, abre la transacción y aplica la idempotencia. Aquí no
 * hay ninguna decisión que tomar, y ese es el punto.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(pedirCuentaQR);

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
