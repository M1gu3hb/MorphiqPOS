import { validarEntorno } from '@morphiqpos/contracts';
import { permitirOrganizacion } from '@morphiqpos/app/http';

import { almacenArchivos } from '~/servidor/archivos-almacen';
import { crearClavePrivada } from '~/servidor/archivos-claves';
import { ErrorImagen, analizarYRecodificarImagen } from '~/servidor/archivos-imagen';
import { ErrorMultipart, archivoDeMultipart } from '~/servidor/archivos-multipart';
import { conSesionMultipart } from '~/servidor/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;
const MAX_CUERPO_MULTIPART_BYTES = MAX_ARCHIVO_BYTES + 64 * 1024;
export const CUOTA_ORGANIZACION_BYTES = 500 * 1024 * 1024;
const ROLES_ARCHIVOS = ['dueno', 'administrador', 'gerente'] as const;

function error(codigo: string, mensaje: string, estado: number): Response {
  return Response.json(
    { ok: false, error: { codigo, mensaje } },
    { status: estado, headers: { 'cache-control': 'no-store' } },
  );
}

export function POST(peticion: Request): Promise<Response> {
  return conSesionMultipart(peticion, ROLES_ARCHIVOS, async (sesion) => {
    const entorno = validarEntorno(process.env);
    const permiso = await permitirOrganizacion(
      'archivos',
      sesion.organizacionId,
      entorno.PIN_PEPPER,
      peticion.headers.get('x-correlation-id') ?? undefined,
    );
    if (!permiso.ok) {
      return error(
        'LIMITE_DE_TASA',
        'Demasiadas subidas. Espera antes de intentarlo de nuevo.',
        429,
      );
    }

    try {
      const archivo = await archivoDeMultipart(peticion, MAX_CUERPO_MULTIPART_BYTES);
      if (archivo.size > MAX_ARCHIVO_BYTES) {
        return error('ARCHIVO_DEMASIADO_GRANDE', 'La imagen supera 5 MB.', 413);
      }
      const imagen = await analizarYRecodificarImagen(new Uint8Array(await archivo.arrayBuffer()));
      if (imagen.bytes.byteLength > MAX_ARCHIVO_BYTES) {
        return error('ARCHIVO_DEMASIADO_GRANDE', 'La imagen procesada supera 5 MB.', 413);
      }

      const almacen = almacenArchivos();
      const usados = await almacen.bytesBajo(`privado/${sesion.organizacionId}/`);
      if (usados + imagen.bytes.byteLength > CUOTA_ORGANIZACION_BYTES) {
        return error('CUOTA_DE_ARCHIVOS', 'La organización agotó su cuota de archivos.', 413);
      }

      const clave = crearClavePrivada(sesion.organizacionId, imagen.extension);
      await almacen.guardar(clave, imagen.bytes, imagen.mime);
      return { file_url: `${new URL(entorno.APP_URL).origin}/api/archivos/${clave}` };
    } catch (causa) {
      if (causa instanceof ErrorMultipart) {
        const estado =
          causa.codigo === 'LONGITUD_REQUERIDA'
            ? 411
            : causa.codigo === 'CUERPO_DEMASIADO_GRANDE'
              ? 413
              : 400;
        return error(causa.codigo, causa.message, estado);
      }
      if (causa instanceof ErrorImagen) {
        const estado = causa.codigo === 'TIPO_NO_ADMITIDO' ? 415 : 422;
        return error(causa.codigo, causa.message, estado);
      }
      throw causa;
    }
  });
}
