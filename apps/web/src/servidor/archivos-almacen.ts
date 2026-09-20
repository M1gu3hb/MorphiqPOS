import { validarEntorno } from '@morphiqpos/contracts';
import { crearAlmacenArchivos } from '@morphiqpos/app/archivos';

import { esClaveArchivo } from './archivos-claves.ts';

export function almacenArchivos() {
  const entorno = validarEntorno(process.env);
  return crearAlmacenArchivos({
    endpoint: entorno.STORAGE_ENDPOINT,
    bucket: entorno.STORAGE_BUCKET,
    accessKey: entorno.STORAGE_ACCESS_KEY,
    secretKey: entorno.STORAGE_SECRET_KEY,
  });
}

export function claveSolicitada(
  segmentos: readonly string[],
  prefijo: 'privado' | 'publico',
): string | null {
  let clave: string;
  try {
    clave = segmentos.map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  return esClaveArchivo(clave, prefijo) ? clave : null;
}

const MIME_POR_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  csv: 'text/csv; charset=utf-8',
};

/** Lo que NO se pinta en el navegador: se baja. Un CSV es un archivo, no una página. */
const SE_DESCARGA = new Set(['csv']);

export async function responderArchivo(clave: string, cacheControl: string): Promise<Response> {
  const archivo = await almacenArchivos().obtener(clave);
  if (archivo === null) return new Response(null, { status: 404 });
  const extension = clave.slice(clave.lastIndexOf('.') + 1);
  const mime = MIME_POR_EXTENSION[extension];
  if (mime === undefined || archivo.contentType !== mime)
    return new Response(null, { status: 404 });
  const nombre = clave.slice(clave.lastIndexOf('/') + 1);
  // `attachment` para los datos: un CSV abierto dentro de la pestaña no se puede
  // mandar al contador, y con `inline` es lo que hace el navegador.
  const disposicion = SE_DESCARGA.has(extension) ? 'attachment' : 'inline';
  return new Response(Buffer.from(archivo.bytes), {
    headers: {
      'content-type': mime,
      'content-length': String(archivo.bytes.byteLength),
      'content-disposition': `${disposicion}; filename="${nombre}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': cacheControl,
    },
  });
}
