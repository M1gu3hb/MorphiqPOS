import { validarEntorno } from '@morphiqpos/contracts';
import { repoArchivos } from '@morphiqpos/app/archivos';

import { claveSolicitada, responderArchivo } from '~/servidor/archivos-almacen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _peticion: Request,
  contexto: { readonly params: Promise<{ readonly ruta: string[] }> },
): Promise<Response> {
  const clave = claveSolicitada((await contexto.params).ruta, 'publico');
  if (clave === null) return new Response(null, { status: 404 });
  const organizacionId = clave.split('/')[1];
  if (organizacionId === undefined) return new Response(null, { status: 404 });

  const appUrl = new URL(validarEntorno(process.env).APP_URL).origin;
  const url = `${appUrl}/api/publico/archivo/${clave}`;
  if (!(await repoArchivos.referenciaPublicaExiste(organizacionId, url))) {
    return new Response(null, { status: 404 });
  }
  return responderArchivo(clave, 'public, max-age=31536000, immutable');
}
