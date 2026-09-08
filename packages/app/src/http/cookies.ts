import { NOMBRE_COOKIE } from './ruta.ts';

/**
 * Construcción de la cookie de sesión (F1.1-X-01).
 *
 * Vive aquí y no en cada ruta de autenticación para que las banderas se decidan
 * una sola vez. `morphiq-prs §08` pide `Secure`, `HttpOnly` y `SameSite`
 * explícito; olvidar uno en una de tres rutas es exactamente como se pierde.
 */

export interface OpcionesCookie {
  readonly token: string;
  readonly maxEdadSegundos: number;
  /** En desarrollo local no hay HTTPS, y `Secure` haría que el navegador la descarte. */
  readonly seguro: boolean;
}

/**
 * `SameSite=Lax` y no `Strict`: con `Strict` la cookie no viaja cuando el
 * navegador llega desde un enlace externo, y el cajero que abre el sistema desde
 * un acceso directo aparecería siempre deslogueado. `Lax` no acompaña peticiones
 * POST de otro origen, que es la parte que importa para CSRF.
 */
export function cookieDeSesion({ token, maxEdadSegundos, seguro }: OpcionesCookie): string {
  const partes = [
    `${NOMBRE_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxEdadSegundos}`,
  ];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

/** Cierra la sesión de verdad: caduca la cookie en el navegador. */
export function cookieDeCierre(seguro: boolean): string {
  const partes = [`${NOMBRE_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}

export { NOMBRE_COOKIE };
