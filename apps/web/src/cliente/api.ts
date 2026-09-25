import type { ErrorComando, Resultado } from '@morphiqpos/contracts';

/**
 * El único camino del navegador al servidor (F1.1-X-01).
 *
 * Todo comando se invoca por aquí. La razón no es comodidad: es que
 * `Idempotency-Key` no puede ser opcional. Si cada pantalla hace su `fetch`, la
 * que se olvide de mandarla duplica un cobro en el primer doble clic, y no se
 * descubre hasta que un arqueo no cuadre.
 *
 * Aquí la clave se genera sola y se conserva entre reintentos, así que
 * olvidarla no es una opción disponible.
 *
 * ── Sobre la fusión de los dos carriles ────────────────────────────────────
 * Había dos clientes distintos, uno por carril. Este es el que conserva la
 * idempotencia; `obtenerApi` y `ejecutarApi` sobreviven como envoltorios finos
 * sobre él para que las pantallas de gestión no cambien, y así **hay un solo
 * sitio donde se decide qué cabeceras lleva una escritura**.
 */

export class ErrorApi extends Error {
  constructor(
    readonly error: ErrorComando,
    readonly estado: number,
    readonly correlationId: string | null,
  ) {
    super(error.mensaje);
    this.name = 'ErrorApi';
  }
}

export interface OpcionesComando {
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

/**
 * Cabecera que marca la petición como propia de la aplicación.
 *
 * Un formulario de otro origen no puede ponerla —añadirla dispara el preflight
 * de CORS y el servidor no lo autoriza—, así que su presencia distingue una
 * escritura nuestra de un CSRF por formulario. Es defensa en profundidad junto
 * a la validación de `Origin`, no en lugar de ella.
 */
export const CABECERA_PETICION_PROPIA = 'x-morphiqpos-request';

/**
 * Invoca un comando del servidor.
 *
 * Devuelve los datos, o lanza `ErrorApi` con el código estable. Lanzar aquí sí
 * es correcto —al revés que en el envoltorio del servidor— porque quien llama
 * es un manejador de React que ya vive dentro de un `try`, y el tipo de retorno
 * queda limpio para el camino feliz.
 */
export async function invocarComando<T>(
  ruta: string,
  entrada: unknown,
  opciones: OpcionesComando = {},
): Promise<T> {
  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': opciones.idempotencyKey ?? nuevaClave(),
      [CABECERA_PETICION_PROPIA]: '1',
    },
    body: JSON.stringify(entrada),
    credentials: 'same-origin',
    ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
  });
  return leerResultado<T>(respuesta);
}

/** Alias histórico del carril B. Misma función, mismas garantías. */
export const ejecutarApi = <T>(ruta: string, entrada: unknown): Promise<T> =>
  invocarComando<T>(ruta, entrada);

/**
 * Una lectura. No lleva clave de idempotencia porque no cambia nada.
 *
 * `cache: 'no-store'` no es opcional: son datos del negocio y de la sesión, y
 * el `bfcache` del navegador mostraría los de la organización anterior tras un
 * cambio de sesión.
 */
export async function obtenerApi<T>(ruta: string, signal?: AbortSignal): Promise<T> {
  const respuesta = await fetch(ruta, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...(signal === undefined ? {} : { signal }),
  });

  return leerResultado<T>(respuesta);
}

/**
 * Lee una entidad por el PUENTE, que es el único camino de lectura.
 *
 * ── Por qué todas las pantallas leen por aquí ─────────────────────────────
 * Porque el puente es donde viven `rolesLectura` y el recorte de campos: una
 * pantalla que hiciera su propio `select` se saltaría los dos, y el primer
 * recorte que se olvide expone el costo de un producto al mesero.
 *
 * ── Y por qué es POST si sólo lee ────────────────────────────────────────
 * Porque el filtro va en el cuerpo. En la URL acabaría en los registros del
 * proxy, en el historial del navegador y en el `Referer` de cualquier recurso
 * externo que la página cargue — con nombres de cliente dentro.
 */
export async function consultarPuente<T>(
  entidad: string,
  opciones: {
    readonly filtro?: Readonly<Record<string, unknown>>;
    /**
     * Un RANGO sobre un campo de fecha, que es lo que necesita cualquier pantalla
     * de un día o de un periodo.
     *
     * La ruta `/api/datos/consultar` lo acepta desde que existe —`esRango` lo
     * estrecha ahí mismo— y este ayudante no lo pasaba, así que **ninguna
     * pantalla podía pedir un rango**. La agenda del día del salón lo intentó
     * como pudo: filtrando `Cita` por un campo `fecha` que no existe, y el puente
     * respondía «no es un campo de Cita» mientras la pantalla enseñaba «Hoy no
     * hay citas todavía» con las citas agendadas.
     */
    readonly rango?: { readonly campo: string; readonly desde?: string; readonly hasta?: string };
    readonly orden?: string;
    readonly limite?: number;
    readonly signal?: AbortSignal;
  } = {},
): Promise<readonly T[]> {
  const cuerpo: Record<string, unknown> = { entidad, operacion: 'listar' };
  if (opciones.filtro !== undefined) cuerpo['filtro'] = opciones.filtro;
  if (opciones.rango !== undefined) cuerpo['rango'] = opciones.rango;
  if (opciones.orden !== undefined) cuerpo['orden'] = opciones.orden;
  if (opciones.limite !== undefined) cuerpo['limite'] = opciones.limite;

  const respuesta = await fetch('/api/datos/consultar', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      [CABECERA_PETICION_PROPIA]: '1',
    },
    body: JSON.stringify(cuerpo),
    ...(opciones.signal === undefined ? {} : { signal: opciones.signal }),
  });

  const datos = await leerResultado<unknown>(respuesta);
  // El puente devuelve `{ filas }` en las listas y el arreglo pelado en algunas
  // entidades derivadas. Se aceptan las dos formas aquí, en un solo sitio, en
  // vez de que cada pantalla adivine cuál le toca.
  if (Array.isArray(datos)) return datos as readonly T[];
  if (typeof datos === 'object' && datos !== null && 'filas' in datos) {
    const filas = (datos as { filas?: unknown }).filas;
    if (Array.isArray(filas)) return filas as readonly T[];
  }
  return [];
}

export function nuevaClave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function leerResultado<T>(respuesta: Response): Promise<T> {
  const correlationId = respuesta.headers.get('x-correlation-id');
  const cuerpo: unknown = await respuesta.json().catch(() => null);

  if (!esResultado<T>(cuerpo)) {
    throw new ErrorApi(
      { codigo: 'ERROR_INTERNO', mensaje: 'El servidor respondió algo inesperado.' },
      respuesta.status,
      correlationId,
    );
  }

  if (!cuerpo.ok) throw new ErrorApi(cuerpo.error, respuesta.status, correlationId);
  return cuerpo.datos;
}

function esResultado<T>(valor: unknown): valor is Resultado<T> {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as { ok?: unknown };
  return typeof v.ok === 'boolean';
}

/**
 * SUBIR UNA IMAGEN (`/api/archivos/subir`), la única escritura que no es JSON: una imagen
 * viaja en `multipart`. Devuelve la URL que el comando del dominio guarda —la foto de la
 * pieza, la del expediente— (C.10 de la 2.4).
 *
 * Mismas cabeceras que `invocarComando` —la propia y la clave de idempotencia— y la misma
 * lectura del resultado: un 403 de un rol que no sube archivos llega como `ErrorApi` con
 * su mensaje, que es lo que la pantalla enseña.
 */
export async function subirImagen(archivo: File): Promise<string> {
  const cuerpo = new FormData();
  cuerpo.append('archivo', archivo);
  const respuesta = await fetch('/api/archivos/subir', {
    method: 'POST',
    headers: { 'idempotency-key': nuevaClave(), [CABECERA_PETICION_PROPIA]: '1' },
    body: cuerpo,
    credentials: 'same-origin',
  });
  const { file_url: url } = await leerResultado<{ readonly file_url: string }>(respuesta);
  return url;
}
