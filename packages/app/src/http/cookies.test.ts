import { describe, expect, it } from 'vitest';

import { cookiesSeguras } from './cookies.ts';

/**
 * `Secure` lo decide la DIRECCIÓN del despliegue, no sólo que esté compilado (DP-9 · demo local).
 *
 * La demo de la red local se sirve compilada (`NODE_ENV=production`) en `http://<IP de la PC>`.
 * Un navegador descarta una cookie `Secure` que llega por http —salvo en `localhost`—, así que
 * con el criterio de antes los teléfonos de la demo nunca podían entrar. En producción, con su
 * dirección https, todo sigue igual.
 */
describe('cookiesSeguras', () => {
  it('en producción con https: Secure', () => {
    expect(
      cookiesSeguras({ NODE_ENV: 'production', APP_URL: 'https://pos-don-poncho.vercel.app' }),
    ).toBe(true);
  });

  it('compilada pero servida por http en la red local: sin Secure (o el teléfono no entra)', () => {
    expect(cookiesSeguras({ NODE_ENV: 'production', APP_URL: 'http://192.168.1.50:3300' })).toBe(
      false,
    );
  });

  it('en desarrollo y en pruebas: sin Secure, aunque la dirección sea https', () => {
    expect(cookiesSeguras({ NODE_ENV: 'development', APP_URL: 'https://ejemplo.mx' })).toBe(false);
    expect(cookiesSeguras({ NODE_ENV: 'test', APP_URL: 'https://ejemplo.mx' })).toBe(false);
  });

  it('el esquema se lee sin importar mayúsculas: HTTPS también es https', () => {
    expect(cookiesSeguras({ NODE_ENV: 'production', APP_URL: 'HTTPS://ejemplo.mx' })).toBe(true);
  });
});
