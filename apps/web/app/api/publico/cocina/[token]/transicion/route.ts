import { transicionDelTelefono } from '@morphiqpos/app/telefono-de-cocina';

/**
 * `POST /api/publico/cocina/:token/transicion` — DP-9.4.
 *
 * «Preparar» o «Listo» desde el teléfono de una estación. Sólo comandas de SU estación, con la
 * misma regla que la pantalla de Cocina, idempotente, con límite de tasa y auditado sin
 * identidad.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly token: string }>;
}

export async function POST(peticion: Request, contexto: Contexto): Promise<Response> {
  const { token } = await contexto.params;
  const salida = await transicionDelTelefono(token, peticion);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
