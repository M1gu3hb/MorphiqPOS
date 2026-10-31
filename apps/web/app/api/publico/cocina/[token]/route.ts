import { servirTelefonoDeCocina } from '@morphiqpos/app/telefono-de-cocina';

/**
 * `GET /api/publico/cocina/:token` — DP-9.4.
 *
 * Lo que lee el teléfono de una estación de cocina, cada 2,5 s: la comanda pendiente más
 * reciente de SU estación y cuántas quedan. Sin sesión: el token del QR es todo, y se comprueba
 * firma, negocio, día y versión en `packages/app/src/telefono-de-cocina`.
 */

export const runtime = 'nodejs';
// Sin caché de ruta: cada lectura es el estado de la cocina en ese momento.
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function GET(peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  const salida = await servirTelefonoDeCocina(token, peticion.headers.get('host'));
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
