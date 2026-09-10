import { crearSolicitudQR, manejadorPublico } from '@morphiqpos/app/portal';

/**
 * `POST /api/publico/qr/:token/solicitud` — E7-3.
 *
 * «Llama al mesero». El anti-duplicado lo impone el índice
 * `solicitudes_qr_una_pendiente`, no una consulta previa que envejece.
 *
 * `manejadorPublico` resuelve el negocio del despliegue, cuenta el límite de
 * peticiones por token, abre la transacción y aplica la idempotencia. Aquí no
 * hay ninguna decisión que tomar, y ese es el punto.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const manejar = manejadorPublico(crearSolicitudQR);

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
