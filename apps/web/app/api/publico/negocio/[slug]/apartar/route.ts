import { atenderApartado } from '@morphiqpos/app/portal';

/**
 * C.14 · Apartar un pedido anticipado de la cafetería, SIN sesión y sin pago: se
 * cobra al recoger. Idempotente por su clave, con límite por IP y por negocio.
 * La lógica vive en `packages/app/src/portal/anticipado-http.ts`.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function POST(peticion: Request, contexto: Contexto): Promise<Response> {
  const { slug } = await contexto.params;
  const salida = await atenderApartado(slug, peticion);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
