import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const CAPAS = [
  process.env['MORPHIQPOS_WEB_HTTP_SOURCE_PATH'] ??
    fileURLToPath(new URL('./http.ts', import.meta.url)),
  process.env['MORPHIQPOS_COMMAND_ROUTE_SOURCE_PATH'] ??
    fileURLToPath(new URL('../../../../packages/app/src/http/ruta.ts', import.meta.url)),
  process.env['MORPHIQPOS_PORTAL_HTTP_SOURCE_PATH'] ??
    fileURLToPath(new URL('../../../../packages/app/src/portal/http.ts', import.meta.url)),
] as const;

describe('R-22 · correlación propagada desde el middleware', () => {
  it.each(CAPAS)('%s usa la cabecera interna como fallback', (archivo) => {
    const fuente = readFileSync(archivo, 'utf8');
    expect(fuente).toMatch(
      /get\('x-correlation-id'\)[\s\S]{0,80}\?\?\s*[\s\S]{0,80}get\('x-morphiqpos-correlacion'\)/,
    );
  });
});
