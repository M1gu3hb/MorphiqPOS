import { archivoEnUso, repoArchivos } from '@morphiqpos/app/archivos';

import { conSesion, responderConsulta } from '~/servidor/http';
import { almacenArchivos, claveSolicitada, responderArchivo } from '~/servidor/archivos-almacen';

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

/**
 * BORRAR UN ARCHIVO PRIVADO del negocio (bloque B.3 de la 2.4).
 *
 * No existía: una imagen subida se quedaba para siempre, y `humo-archivos` —que sube una
 * contra producción para comprobar el almacén— dejaba un archivo por corrida y la cuota
 * del negocio subiendo sola. Ahora se puede borrar, con tres condiciones:
 *
 *   · la clave es del negocio de la sesión (otro negocio: 404, igual que no existir);
 *   · la pide un mando, los mismos que pueden subir;
 *   · NINGUNA fila la nombra —foto de producto, firma, comprobante, logo—: borrar una
 *     imagen en uso la dejaría rota, así que contesta 409 y no la toca.
 *
 * Y devuelve a la cuota lo que ocupaba.
 */
export async function DELETE(
  peticion: Request,
  contexto: { readonly params: Promise<{ readonly ruta: string[] }> },
): Promise<Response> {
  const clave = claveSolicitada((await contexto.params).ruta, 'privado');
  return conSesion(
    peticion,
    async (sesion) => {
      if (clave === null) return new Response(null, { status: 404 });
      if (clave.split('/')[1] !== sesion.organizacionId) {
        return new Response(null, { status: 404 });
      }
      if (await archivoEnUso(sesion.organizacionId, clave)) {
        return Response.json(
          {
            ok: false,
            error: { codigo: 'ARCHIVO_EN_USO', mensaje: 'Esa imagen está en uso: no se borra.' },
          },
          { status: 409, headers: { 'cache-control': 'no-store' } },
        );
      }
      const almacen = almacenArchivos();
      const archivo = await almacen.obtener(clave);
      if (archivo === null) return new Response(null, { status: 404 });
      await almacen.borrar(clave);
      await repoArchivos.liberarCuotaArchivo(sesion.organizacionId, archivo.bytes.byteLength);
      return { borrado: true, bytes: archivo.bytes.byteLength };
    },
    { roles: ['dueno', 'administrador', 'gerente'] },
  );
}
