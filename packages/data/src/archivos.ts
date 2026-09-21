import 'server-only';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface ConfiguracionAlmacen {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKey: string;
  readonly secretKey: string;
}

export interface ArchivoAlmacenado {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

function cliente(configuracion: ConfiguracionAlmacen): S3Client {
  return new S3Client({
    endpoint: configuracion.endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuracion.accessKey,
      secretAccessKey: configuracion.secretKey,
    },
  });
}

function fuenteCopia(bucket: string, clave: string): string {
  return `${encodeURIComponent(bucket)}/${clave.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * EL ALMACÉN QUE NO CONTESTA, dicho con nombre.
 *
 * ── Lo que se veía antes, y por qué no servía ───────────────────────
 * `STORAGE_ENDPOINT` en producción apunta a `http://localhost:9000` —el MinIO de
 * desarrollo—, así que CUALQUIER operación de archivo revienta con `ECONNREFUSED` y
 * el usuario recibe un **500 «No fue posible completar la operación»**: exportar los
 * registros, subir la foto de un producto, generar el menú QR. Lo encontró el
 * rastreador tocando «Exportar a CSV», y el log lo dijo en una línea:
 * `causa=Error sqlstate=ECONNREFUSED`.
 *
 * Un 500 sin texto manda a buscar el fallo al código, y el código está bien: lo que
 * falta es una credencial de despliegue. Esto lo convierte en un error con nombre
 * —que la pantalla ya sabe enseñar— sin esconder nada: si el almacén no responde, no
 * hay archivo, y eso se dice.
 */
const CONEXION_IMPOSIBLE = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'ECONNRESET',
  'EAI_AGAIN',
]);

function esAlmacenInalcanzable(error: unknown): boolean {
  const visto = new Set<unknown>();
  let actual: unknown = error;
  while (typeof actual === 'object' && actual !== null && !visto.has(actual)) {
    visto.add(actual);
    const codigo = (actual as { code?: unknown }).code;
    if (typeof codigo === 'string' && CONEXION_IMPOSIBLE.has(codigo)) return true;
    const nombre = (actual as { name?: unknown }).name;
    if (nombre === 'TimeoutError' || nombre === 'AbortError') return true;
    actual = (actual as { cause?: unknown }).cause;
  }
  return false;
}

/** El error de dominio del almacén, con lo que hay que hacer escrito. */
export class ErrorDeAlmacen extends Error {
  readonly codigo = 'ALMACEN_NO_DISPONIBLE';

  constructor(endpoint: string) {
    super(
      `El almacén de archivos no responde en ${endpoint}. Este despliegue no tiene ` +
        'configurado su bucket: sin él no se pueden subir fotos ni generar exportes. ' +
        'Revisa STORAGE_ENDPOINT, STORAGE_BUCKET, STORAGE_ACCESS_KEY y STORAGE_SECRET_KEY.',
    );
    this.name = 'ErrorDeAlmacen';
  }
}

/** Corre la operación y traduce «no contesta» a un error con nombre. */
async function conAlmacen<T>(endpoint: string, operacion: () => Promise<T>): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    if (esAlmacenInalcanzable(error)) throw new ErrorDeAlmacen(endpoint);
    throw error;
  }
}

export function crearAlmacenArchivos(configuracion: ConfiguracionAlmacen) {
  const s3 = cliente(configuracion);
  return {
    async guardar(clave: string, bytes: Uint8Array, contentType: string): Promise<void> {
      await conAlmacen(configuracion.endpoint, () =>
        s3.send(
          new PutObjectCommand({
            Bucket: configuracion.bucket,
            Key: clave,
            Body: bytes,
            ContentLength: bytes.byteLength,
            ContentType: contentType,
            CacheControl: 'private, no-store',
          }),
        ),
      );
    },

    async copiar(origen: string, destino: string): Promise<void> {
      await conAlmacen(configuracion.endpoint, () =>
        s3.send(
          new CopyObjectCommand({
            Bucket: configuracion.bucket,
            Key: destino,
            CopySource: fuenteCopia(configuracion.bucket, origen),
            MetadataDirective: 'COPY',
          }),
        ),
      );
    },

    async borrar(clave: string): Promise<void> {
      await conAlmacen(configuracion.endpoint, () =>
        s3.send(new DeleteObjectCommand({ Bucket: configuracion.bucket, Key: clave })),
      );
    },

    async obtener(clave: string): Promise<ArchivoAlmacenado | null> {
      try {
        const respuesta = await conAlmacen(configuracion.endpoint, () =>
          s3.send(new GetObjectCommand({ Bucket: configuracion.bucket, Key: clave })),
        );
        if (respuesta.Body === undefined) return null;
        return {
          bytes: await respuesta.Body.transformToByteArray(),
          contentType: respuesta.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
        // Un almacén que no responde NO es un archivo que no existe: se deja pasar.
        if (error instanceof ErrorDeAlmacen) throw error;
        if (
          typeof error === 'object' &&
          error !== null &&
          '$metadata' in error &&
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
        ) {
          return null;
        }
        throw error;
      }
    },

    async bytesBajo(prefijo: string): Promise<number> {
      let total = 0;
      let continuacion: string | undefined;
      do {
        const pagina = await conAlmacen(configuracion.endpoint, () =>
          s3.send(
            new ListObjectsV2Command({
              Bucket: configuracion.bucket,
              Prefix: prefijo,
              ...(continuacion === undefined ? {} : { ContinuationToken: continuacion }),
            }),
          ),
        );
        for (const objeto of pagina.Contents ?? []) total += objeto.Size ?? 0;
        continuacion = pagina.IsTruncated === true ? pagina.NextContinuationToken : undefined;
      } while (continuacion !== undefined);
      return total;
    },
  };
}
