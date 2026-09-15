import { responderConsulta } from '~/servidor/http';
import { claveSolicitada, responderArchivo } from '~/servidor/archivos-almacen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _peticion: Request,
  contexto: { readonly params: Promise<{ readonly ruta: string[] }> },
): Promise<Response> {
  const clave = claveSolicitada((await contexto.params).ruta, 'privado');
  if (clave === null) return new Response(null, { status: 404 });
  const organizacionId = clave.split('/')[1];
  return responderConsulta(
    (sesion) =>
      sesion.organizacionId === organizacionId
        ? responderArchivo(clave, 'private, no-store')
        : new Response(null, { status: 404 }),
    { roles: ['dueno', 'administrador', 'gerente', 'cajero', 'mesero', 'cocina', 'almacen'] },
  );
}
