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
