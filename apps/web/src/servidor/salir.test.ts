import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RUTA =
  process.env['MORPHIQPOS_SALIR_ROUTE_PATH'] ??
  join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'app',
    'api',
    'auth',
    'salir',
    'route.ts',
  );

describe('POST /api/auth/salir', () => {
  it('valida la escritura y revoca la sesión identificada por la cookie', () => {
    const codigo = readFileSync(RUTA, 'utf8');

    expect(codigo).toMatch(/async function POST\(peticion: Request\)/);
    // Con la canónica Y los orígenes alternos: sin los alternos, cerrar sesión
    // contestaba 403 desde la URL del despliegue, igual que entrar.
    expect(codigo).toMatch(
      /peticionDeEscrituraValida\(peticion, entorno\.APP_URL, entorno\.APP_URL_ALTERNAS\)/,
    );
    // Revoca LAS DOS sesiones, cada una por su cookie: la del puesto y la de presentación
    // del dueño general (D-42). Con un solo `toContain('await cerrarSesion(')`, quitar la
    // primera llamada pasaba —la segunda seguía en el archivo— y la mutación de
    // `verify:mutaciones-backend` sobrevivía desde c1ada17.
    expect(codigo).toMatch(
      /await cerrarSesion\(\s*leerCookie\(peticion\.headers\.get\('cookie'\), NOMBRE_COOKIE\)/,
    );
    expect(codigo).toMatch(
      /await cerrarSesion\(\s*leerCookie\(peticion\.headers\.get\('cookie'\), COOKIE_PRESENTACION\)/,
    );
    expect(codigo).toContain('cookieDeCierre(');
  });
});
