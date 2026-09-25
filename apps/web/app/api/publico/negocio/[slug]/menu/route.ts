import { servirMenuAnticipado } from '@morphiqpos/app/portal';

/**
 * C.14 · El menú que se puede apartar de una cafetería, SIN sesión.
 *
 * El negocio es el slug de la dirección, dentro de los de este despliegue: lo mismo
 * que la entrada del bloque A. Todo lo demás —límite, 404 indistinguible, sin caché—
 * vive en `packages/app/src/portal/anticipado-http.ts`.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Contexto {
  readonly params: Promise<{ readonly slug: string }>;
}

export async function GET(peticion: Request, contexto: Contexto): Promise<Response> {
  const { slug } = await contexto.params;
  const salida = await servirMenuAnticipado(slug, peticion);
  return new Response(JSON.stringify(salida.cuerpo), {
    status: salida.estado,
    headers: salida.cabeceras,
  });
}
