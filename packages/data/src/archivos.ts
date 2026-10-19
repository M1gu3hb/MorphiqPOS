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

/** Lo que un almacén tiene que saber hacer, sea el de quien sea. */
export interface AlmacenDeArchivos {
  guardar(clave: string, bytes: Uint8Array, contentType: string): Promise<void>;
  copiar(origen: string, destino: string): Promise<void>;
  borrar(clave: string): Promise<void>;
  obtener(clave: string): Promise<ArchivoAlmacenado | null>;
  bytesBajo(prefijo: string): Promise<number>;
}

/**
 * QUÉ HABLA EL OTRO LADO: S3 o la API de Supabase.
 *
 * ── Por qué hacen falta dos ────────────────────────────────────────────────
 * El almacén de este proyecto habla S3 a propósito (A-27): así el backend completo
 * corre en la PC de un cliente con un MinIO al lado, sin internet y sin cuenta de
 * terceros. Eso no se toca.
 *
 * Y a la vez, en producción **no había almacén ninguno**: `STORAGE_ENDPOINT` apuntaba
 * a `http://localhost:9000`, así que subir un logo, una foto de producto o generar el
 * menú QR contestaba 503 con su motivo. El endpoint S3 de Supabase existe, pero exige
 * **llaves de acceso S3** que sólo se crean en su panel; este proyecto usa el formato
 * de llaves nuevo (`sb_secret_…`), que no es un JWT y que su endpoint S3 rechaza con
 * «the session token should be a valid JWT token» —medido—.
 *
 * Lo que SÍ funciona con la credencial que este despliegue tiene es la API de
 * Almacenamiento de Supabase. Así que hay dos conductores y **una sola decisión
 * legible**: si el endpoint termina en `/storage/v1` es la API de Supabase; cualquier
 * otra cosa —un host y un puerto, o un `…/storage/v1/s3`— es S3.
 *
 * No es magia y no adivina por el dominio: lo dice la ruta, que la escribe quien
 * despliega.
 */
export function esEndpointDeSupabase(endpoint: string): boolean {
  try {
    return new URL(endpoint).pathname.replace(/\/+$/, '').endsWith('/storage/v1');
  } catch {
    return false;
  }
}

export function crearAlmacenArchivos(configuracion: ConfiguracionAlmacen): AlmacenDeArchivos {
  return esEndpointDeSupabase(configuracion.endpoint)
    ? almacenDeSupabase(configuracion)
    : almacenS3(configuracion);
}

function almacenS3(configuracion: ConfiguracionAlmacen): AlmacenDeArchivos {
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

/**
 * EL CONDUCTOR DE SUPABASE, con la credencial que este despliegue sí tiene.
 *
 * Es la API de Almacenamiento (`/storage/v1`), no el endpoint S3. Las cinco
 * operaciones son las mismas y el contrato de arriba no cambia: quien llama no sabe
 * —ni tiene por qué— con quién está hablando.
 *
 * La credencial viaja en las DOS cabeceras que su puerta espera (`Authorization` y
 * `apikey`) porque el enrutador de Supabase mira la segunda y el servicio de
 * almacenamiento la primera; con una sola, unas rutas contestan y otras no.
 *
 * `accessKey` se ignora a propósito y `secretKey` es la llave: las cuatro variables de
 * entorno siguen siendo las mismas para no partir el contrato del entorno, y lo que
 * cambia es qué significa cada una según el conductor. Está escrito en `.env.example`.
 */
function almacenDeSupabase(configuracion: ConfiguracionAlmacen): AlmacenDeArchivos {
  const raiz = configuracion.endpoint.replace(/\/+$/, '');

  /**
   * LAS DOS VARIABLES TIENEN QUE HABLAR DEL MISMO PROYECTO.
   *
   * `STORAGE_ACCESS_KEY` lleva la referencia del proyecto y `STORAGE_SECRET_KEY` su
   * llave. Aquí se comprueba que la referencia sea la del endpoint, y no es papeleo: el
   * fallo clásico de despliegue es cambiar una de las dos y no la otra —la llave de un
   * proyecto contra el bucket de otro—, y eso se manifiesta como un 400 del
   * almacenamiento cuatro pantallas más adelante. Dicho aquí, se lee una vez.
   */
  const delEndpoint = /^https?:\/\/([a-z0-9]{20})\.(?:storage\.)?supabase\.co\//.exec(
    `${raiz}/`,
  )?.[1];
  if (delEndpoint !== undefined && configuracion.accessKey !== delEndpoint) {
    throw new Error(
      `STORAGE_ACCESS_KEY dice «${configuracion.accessKey}» y STORAGE_ENDPOINT apunta al ` +
        `proyecto «${delEndpoint}». Con el conductor de Supabase, STORAGE_ACCESS_KEY es la ` +
        'referencia del proyecto y STORAGE_SECRET_KEY su llave de servicio: las dos tienen ' +
        'que ser del mismo proyecto.',
    );
  }
  const bucket = encodeURIComponent(configuracion.bucket);
  const cabeceras = {
    authorization: `Bearer ${configuracion.secretKey}`,
    apikey: configuracion.secretKey,
  };

  /** La clave, cada segmento por su cuenta: `fotos/producto 1.png` es una ruta. */
  const ruta = (clave: string): string =>
    clave
      .split('/')
      .map((parte) => encodeURIComponent(parte))
      .join('/');

  /**
   * Un fallo de la API de Supabase, dicho con lo que contestó.
   *
   * Sin el cuerpo, un 400 de almacenamiento es indistinguible de otro y manda a
   * adivinar. Con él, dice «Bucket not found» o «The resource already exists», que es
   * lo que hay que leer.
   */
  async function exigir(respuesta: Response, queHacia: string): Promise<void> {
    if (respuesta.ok) return;
    const cuerpo = await respuesta.text().catch(() => '');
    throw new Error(
      `El almacén de Supabase contestó ${String(respuesta.status)} al ${queHacia}: ` +
        cuerpo.slice(0, 300),
    );
  }

  return {
    async guardar(clave: string, bytes: Uint8Array, contentType: string): Promise<void> {
      await conAlmacen(configuracion.endpoint, async () => {
        const respuesta = await fetch(`${raiz}/object/${bucket}/${ruta(clave)}`, {
          method: 'POST',
          headers: {
            ...cabeceras,
            'content-type': contentType,
            'cache-control': 'private, no-store',
            // Guardar dos veces la misma clave tiene que SOBRESCRIBIR, que es lo que
            // hace S3 y lo que espera quien llama. Sin esto, la segunda vez es un 409.
            'x-upsert': 'true',
          },
          /**
           * En un `Blob`, y con una COPIA de los bytes.
           *
           * Un `Uint8Array<ArrayBufferLike>` no es un `BodyInit` ni un `BlobPart` para los
           * tipos de TS 6: `ArrayBufferLike` incluye `SharedArrayBuffer`, que no se puede
           * enviar por la red. `new Uint8Array(bytes)` devuelve uno respaldado por un
           * `ArrayBuffer` de verdad, que sí lo es —y sin castear nada, que es lo que un
           * `as unknown as BodyInit` habría hecho para tapar justo esa duda—.
           */
          body: new Blob([new Uint8Array(bytes)], { type: contentType }),
        });
        await exigir(respuesta, `guardar «${clave}»`);
      });
    },

    async copiar(origen: string, destino: string): Promise<void> {
      await conAlmacen(configuracion.endpoint, async () => {
        const respuesta = await fetch(`${raiz}/object/copy`, {
          method: 'POST',
          headers: { ...cabeceras, 'content-type': 'application/json' },
          body: JSON.stringify({
            bucketId: configuracion.bucket,
            sourceKey: origen,
            destinationKey: destino,
          }),
        });
        await exigir(respuesta, `copiar «${origen}» a «${destino}»`);
      });
    },

    async borrar(clave: string): Promise<void> {
      await conAlmacen(configuracion.endpoint, async () => {
        const respuesta = await fetch(`${raiz}/object/${bucket}/${ruta(clave)}`, {
          method: 'DELETE',
          headers: cabeceras,
        });
        // Borrar lo que ya no está es el resultado que se quería: no es un fallo.
        if (respuesta.status === 404) return;
        await exigir(respuesta, `borrar «${clave}»`);
      });
    },

    async obtener(clave: string): Promise<ArchivoAlmacenado | null> {
      return conAlmacen(configuracion.endpoint, async () => {
        const respuesta = await fetch(`${raiz}/object/${bucket}/${ruta(clave)}`, {
          headers: cabeceras,
        });
        // Un archivo que no existe NO es un almacén que no responde: devuelve null,
        // igual que el conductor de S3 con su 404.
        if (respuesta.status === 404 || respuesta.status === 400) return null;
        await exigir(respuesta, `obtener «${clave}»`);
        return {
          bytes: new Uint8Array(await respuesta.arrayBuffer()),
          contentType: respuesta.headers.get('content-type') ?? 'application/octet-stream',
        };
      });
    },

    async bytesBajo(prefijo: string): Promise<number> {
      /**
       * EL TAMAÑO DE LO QUE HAY BAJO UN PREFIJO, y por qué es recursivo.
       *
       * `POST /object/list` devuelve **un nivel**: los archivos de esa carpeta y las
       * carpetas hijas, que llegan con `id: null`. S3 no distingue carpetas y su
       * `ListObjectsV2` con `Prefix` devuelve el árbol entero, así que para que las
       * dos cuentas signifiquen lo mismo —la cuota de archivos de un negocio— hay que
       * bajar por las carpetas.
       */
      const PAGINA = 100;
      let total = 0;

      async function sumar(carpeta: string): Promise<void> {
        let desde = 0;
        for (;;) {
          const respuesta = await fetch(`${raiz}/object/list/${bucket}`, {
            method: 'POST',
            headers: { ...cabeceras, 'content-type': 'application/json' },
            body: JSON.stringify({ prefix: carpeta, limit: PAGINA, offset: desde }),
          });
          await exigir(respuesta, `listar «${carpeta}»`);
          const entradas = (await respuesta.json()) as readonly {
            readonly name?: string;
            readonly id?: string | null;
            readonly metadata?: { readonly size?: number } | null;
          }[];
          for (const entrada of entradas) {
            const nombre = entrada.name ?? '';
            if (nombre === '') continue;
            const hijo = carpeta === '' ? nombre : `${carpeta}/${nombre}`;
            if (entrada.id === null || entrada.id === undefined) {
              await sumar(hijo);
              continue;
            }
            total += entrada.metadata?.size ?? 0;
          }
          if (entradas.length < PAGINA) return;
          desde += PAGINA;
        }
      }

      await conAlmacen(configuracion.endpoint, () => sumar(prefijo.replace(/\/+$/, '')));
      return total;
    },
  };
}
