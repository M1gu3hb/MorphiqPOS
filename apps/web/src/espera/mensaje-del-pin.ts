import { ErrorApi, ErrorSinRespuesta } from '~/cliente/api';

const HTTP_PIN_INCORRECTO = 401;
const HTTP_DEMASIADOS_INTENTOS = 429;

/**
 * Lo que se le dice a quien teclea su PIN al despertar (DP-11.2), según lo que contestó el
 * servidor: no es lo mismo un PIN equivocado que quedarse sin conexión o que el bloqueo por
 * intentos (cuyo mensaje, con el tiempo que falta, lo da el servidor).
 */
export function mensajeDelPin(error: unknown): string {
  if (error instanceof ErrorSinRespuesta)
    return 'No hay conexión con el servidor: no se pudo comprobar el PIN. Vuelve a intentarlo.';
  if (error instanceof ErrorApi && error.estado === HTTP_PIN_INCORRECTO)
    return 'Ese no es tu PIN. Vuelve a intentarlo.';
  if (error instanceof ErrorApi && error.estado === HTTP_DEMASIADOS_INTENTOS) return error.message;
  return error instanceof Error ? error.message : 'No se pudo comprobar el PIN.';
}
