import { describe, expect, it } from 'vitest';

import { leerCookie } from './ruta.ts';
import { cookieDeCierre, cookieDeSesion, NOMBRE_COOKIE } from './cookies.ts';

/**
 * El puente HTTP: lectura de cookie y banderas de la cookie de sesión.
 *
 * La parte que llama al envoltorio se prueba en `ruta.integracion.test.ts`
 * porque necesita base; lo que se puede probar sin ella —el parseo de la cookie
 * y las banderas de seguridad— se prueba aquí, y es justo donde se cuelan los
 * errores silenciosos: una cookie con espacios, un valor con `=` dentro, o un
 * `Secure` que alguien quitó «porque en local no funcionaba».
 */

describe('leerCookie', () => {
  it('encuentra la cookie entre otras', () => {
    const cabecera = `otra=1; ${NOMBRE_COOKIE}=abc123; tercera=3`;
    expect(leerCookie(cabecera, NOMBRE_COOKIE)).toBe('abc123');
  });

  it('tolera espacios alrededor del nombre y del valor', () => {
    expect(leerCookie(`  ${NOMBRE_COOKIE} = valor  `, NOMBRE_COOKIE)).toBe('valor');
  });

  it('conserva el valor completo cuando trae signos de igual', () => {
    // Un token base64url no lleva `=`, pero uno base64 sí, y truncarlo en el
    // primer `=` rompería la firma sin que nada lo dijera.
    expect(leerCookie(`${NOMBRE_COOKIE}=a.b=c==`, NOMBRE_COOKIE)).toBe('a.b=c==');
  });

  it('no confunde una cookie cuyo nombre es un prefijo', () => {
    const cabecera = `${NOMBRE_COOKIE}_otra=impostora; ${NOMBRE_COOKIE}=buena`;
    expect(leerCookie(cabecera, NOMBRE_COOKIE)).toBe('buena');
  });

  it('devuelve indefinido cuando no está o no hay encabezado', () => {
    expect(leerCookie('otra=1', NOMBRE_COOKIE)).toBeUndefined();
    expect(leerCookie(null, NOMBRE_COOKIE)).toBeUndefined();
  });
});

describe('cookieDeSesion', () => {
  it('trae HttpOnly, SameSite y Secure en producción', () => {
    const cookie = cookieDeSesion({ token: 'tok', maxEdadSegundos: 3600, seguro: true });

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Max-Age=3600');
    expect(cookie).toContain('Path=/');
  });

  it('omite Secure sólo cuando se pide explícitamente', () => {
    // En `http://` local el navegador descarta una cookie `Secure`, y el sistema
    // parecería no loguear nunca. Es la única razón por la que la bandera es
    // configurable, y se decide en el servidor, no adivinando.
    const cookie = cookieDeSesion({ token: 'tok', maxEdadSegundos: 60, seguro: false });
    expect(cookie).not.toContain('Secure');
    expect(cookie).toContain('HttpOnly');
  });

  it('escapa el valor del token', () => {
    const cookie = cookieDeSesion({ token: 'a b;c', maxEdadSegundos: 60, seguro: true });
    // Un `;` sin escapar cortaría la cookie y el resto se leería como atributos.
    expect(cookie).toContain('a%20b%3Bc');
    expect(cookie.split(';')[0]).toBe(`${NOMBRE_COOKIE}=a%20b%3Bc`);
  });

  it('el cierre caduca la cookie de verdad', () => {
    expect(cookieDeCierre(true)).toContain('Max-Age=0');
    expect(cookieDeCierre(true)).toContain('HttpOnly');
  });
});
