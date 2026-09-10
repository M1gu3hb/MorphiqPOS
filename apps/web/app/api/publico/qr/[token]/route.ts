import { servirPortal, type RespuestaDelPortal } from '@morphiqpos/app/portal';

/**
 * `GET /api/publico/qr/:token` — E7-1.
 *
 * La ÚNICA petición que hace el portal para pintarse entero: configuración
 * pública, menú visible, secciones y estado de la mesa. Hoy son cinco consultas
 * anónimas desde el navegador, una de ellas la configuración COMPLETA del
 * negocio dos veces (D-14).
 *
 * Todo lo que decide qué sale de aquí está en `packages/app/src/portal`. Esta
 * ruta sólo traduce entre la Web API y la respuesta neutra.
 */

export const runtime = 'nodejs';
// Sin caché de ruta: la respuesta lleva el estado de la cuenta de ESA mesa.
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function GET(_peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  const salida: RespuestaDelPortal = await servirPortal(token);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
