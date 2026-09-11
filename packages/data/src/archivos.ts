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

export function crearAlmacenArchivos(configuracion: ConfiguracionAlmacen) {
  const s3 = cliente(configuracion);
  return {
    async guardar(clave: string, bytes: Uint8Array, contentType: string): Promise<void> {
      await s3.send(
        new PutObjectCommand({
          Bucket: configuracion.bucket,
          Key: clave,
          Body: bytes,
          ContentLength: bytes.byteLength,
          ContentType: contentType,
          CacheControl: 'private, no-store',
        }),
      );
    },

    async copiar(origen: string, destino: string): Promise<void> {
      await s3.send(
        new CopyObjectCommand({
          Bucket: configuracion.bucket,
          Key: destino,
          CopySource: fuenteCopia(configuracion.bucket, origen),
          MetadataDirective: 'COPY',
        }),
      );
    },

    async borrar(clave: string): Promise<void> {
      await s3.send(new DeleteObjectCommand({ Bucket: configuracion.bucket, Key: clave }));
    },

    async obtener(clave: string): Promise<ArchivoAlmacenado | null> {
      try {
        const respuesta = await s3.send(
          new GetObjectCommand({ Bucket: configuracion.bucket, Key: clave }),
        );
        if (respuesta.Body === undefined) return null;
        return {
          bytes: await respuesta.Body.transformToByteArray(),
          contentType: respuesta.ContentType ?? 'application/octet-stream',
        };
      } catch (error) {
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
        const pagina = await s3.send(
          new ListObjectsV2Command({
            Bucket: configuracion.bucket,
            Prefix: prefijo,
            ...(continuacion === undefined ? {} : { ContinuationToken: continuacion }),
          }),
        );
        for (const objeto of pagina.Contents ?? []) total += objeto.Size ?? 0;
        continuacion = pagina.IsTruncated === true ? pagina.NextContinuationToken : undefined;
      } while (continuacion !== undefined);
      return total;
    },
  };
}
