/** Cabecera con la que el servidor pasa el nonce de la peticion a la aplicacion. */
export const CABECERA_NONCE = 'x-morphiqpos-nonce';

/**
 * Construccion de la Content-Security-Policy.
 *
 * Vive aparte del middleware para que se pueda probar sin levantar el servidor:
 * es una funcion pura de (nonce, entorno) a cadena.
 */
export function construirCsp(nonce: string, esDesarrollo: boolean, sirveEnHttps = true): string {
  // En desarrollo, el recargado en caliente de Next evalua codigo generado.
  // Es la UNICA diferencia entre la politica de desarrollo y la de produccion,
  // y esta acotada aqui para que no se cuele a produccion por descuido.
  const scriptDesarrollo = esDesarrollo ? " 'unsafe-eval'" : '';

  /**
   * `upgrade-insecure-requests` SOLO donde el despliegue habla https.
   *
   * La directiva reescribe a `https://` toda peticion `http://` de la pagina. En
   * produccion es exactamente lo que se quiere. En un despliegue que NO sirve TLS es
   * lo contrario: el navegador pide `https://` a un puerto que habla texto plano y la
   * respuesta es `ERR_SSL_PROTOCOL_ERROR` — la peticion no llega, y la pantalla se
   * queda muda sin un solo 500 en el servidor.
   *
   * Y eso no es un caso de laboratorio: A-27 dice que el backend tiene que poder
   * correr en la PC de un cliente SIN INTERNET. Una caja en la trastienda de una
   * tiendita, servida por http en la LAN, es el escenario para el que se escribio esa
   * regla — y ahi esta directiva rompe la aplicacion entera.
   *
   * Se decide con la CONFIGURACION del despliegue —`APP_URL`, que es de donde sale
   * tambien el Origen esperado de una escritura (R-17)— y nunca con la cabecera `Host`
   * de la peticion, que la pone quien llama.
   */
  const directivas = [
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
  ];

  if (sirveEnHttps) directivas.push('upgrade-insecure-requests');
  return directivas.join('; ');
}
