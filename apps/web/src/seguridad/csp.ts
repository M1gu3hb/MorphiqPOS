/**
 * Construccion de la Content-Security-Policy.
 *
 * Vive aparte del middleware para que se pueda probar sin levantar el servidor:
 * es una funcion pura de (nonce, entorno) a cadena.
 */
export function construirCsp(nonce: string, esDesarrollo: boolean): string {
  // En desarrollo, el recargado en caliente de Next evalua codigo generado.
  // Es la UNICA diferencia entre la politica de desarrollo y la de produccion,
  // y esta acotada aqui para que no se cuele a produccion por descuido.
  const scriptDesarrollo = esDesarrollo ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptDesarrollo}`,
    // Los estilos en linea siguen haciendo falta: Next inyecta estilos criticos
    // y las variables de tema se escriben en un atributo style.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // Solo el propio origen. El navegador NO habla con Postgres ni con el
    // almacenamiento directamente: pasa por /api (04-ARQUITECTURA §4).
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}
