export const COOKIE_PRESENTACION = 'morphiqpos_presentador';

export function cookieDePresentacion(token: string, seguro: boolean, segundos = 8 * 60 * 60) {
  return `${COOKIE_PRESENTACION}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(segundos)}${seguro ? '; Secure' : ''}`;
}
