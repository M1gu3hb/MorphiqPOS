import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TODA cookie de las rutas decide `Secure` con `cookiesSeguras(entorno)` (DP-9 · demo local).
 *
 * Una sola ruta que vuelva a `entorno.NODE_ENV === 'production'` rompe la demo de la red local
 * sin que nada más falle: el teléfono descarta esa cookie —la de entrada, la de cierre— y queda
 * a medias. Este contrato lee las rutas y exige que quien escriba una cookie lo decida igual.
 */

const RAIZ_APP = process.cwd().endsWith('web')
  ? join(process.cwd(), 'app')
  : join(process.cwd(), 'apps', 'web', 'app');

const ESCRIBE_COOKIE = /set-cookie|cookieDe(?:Sesion|Cierre|Entrada|Dispositivo)\(/;
const CRITERIO_VIEJO = /NODE_ENV\s*===\s*['"]production['"]/;

function rutas(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return rutas(ruta);
    return /^route\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

describe('las cookies de las rutas deciden Secure por la dirección del despliegue', () => {
  const conCookies = rutas(RAIZ_APP).filter((ruta) =>
    ESCRIBE_COOKIE.test(readFileSync(ruta, 'utf8')),
  );

  it('hay rutas que escriben cookies (si no, el contrato no mira nada)', () => {
    expect(conCookies.length).toBeGreaterThanOrEqual(3);
  });

  it.each(conCookies.map((ruta) => [relative(RAIZ_APP, ruta), ruta]))(
    '%s usa cookiesSeguras y no NODE_ENV a secas',
    (_nombre, ruta) => {
      const texto = readFileSync(ruta, 'utf8');
      expect(texto).toMatch(/cookiesSeguras\(entorno\)/);
      expect(texto).not.toMatch(CRITERIO_VIEJO);
    },
  );
});
