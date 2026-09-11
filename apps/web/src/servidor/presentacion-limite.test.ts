import { LIMITES } from '@morphiqpos/app/http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RUTA =
  process.env['MORPHIQPOS_PRESENTATION_ROUTE_PATH'] ??
  fileURLToPath(new URL('../../app/api/configuracion/presentacion/route.ts', import.meta.url));
const FUENTE_LIMITES =
  process.env['MORPHIQPOS_APP_RATE_LIMIT_SOURCE_PATH'] ??
  fileURLToPath(new URL('../../../../packages/app/src/http/limite.ts', import.meta.url));

describe('R-19 · límite del desbloqueo de presentación', () => {
  it('declara una ventana estrecha para intentos con Argon2id', () => {
    expect(LIMITES).toMatchObject({
      presentacion: { intentos: 10, ventanaSegundos: 900 },
    });
    expect(readFileSync(FUENTE_LIMITES, 'utf8')).toContain(
      'presentacion: { intentos: 10, ventanaSegundos: 900 }',
    );
  });

  it('gasta cuota antes de ejecutar el comando costoso', () => {
    const fuente = readFileSync(RUTA, 'utf8');
    const limite = fuente.indexOf("permitir('presentacion'");
    const comando = fuente.indexOf('ejecutarComandoHttp(desbloquearPresentacion');
    expect(limite).toBeGreaterThan(-1);
    expect(comando).toBeGreaterThan(limite);
    expect(fuente).toContain('if (!permiso.ok)');
    expect(fuente).toContain('status: 429');
  });
});
