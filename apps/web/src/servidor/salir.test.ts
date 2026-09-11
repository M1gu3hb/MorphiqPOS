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
    expect(codigo).toContain('peticionDeEscrituraValida(peticion, entorno.APP_URL)');
    expect(codigo).toContain('leerCookie(peticion.headers.get');
    expect(codigo).toContain('await cerrarSesion(');
    expect(codigo).toContain('cookieDeCierre(');
  });
});
