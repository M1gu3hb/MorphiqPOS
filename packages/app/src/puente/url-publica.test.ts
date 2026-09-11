import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { escribir } from './escribir.ts';

const AMBITO = {
  organizacionId: '11111111-1111-4111-8111-111111111111',
  sucursalId: '22222222-2222-4222-8222-222222222222',
  rol: 'dueno',
} as const;
const FUENTE_MAPA =
  process.env['MORPHIQPOS_URL_MAP_SOURCE_PATH'] ??
  fileURLToPath(new URL('./mapa.ts', import.meta.url));
const FUENTE_ESCRITURA =
  process.env['MORPHIQPOS_URL_WRITE_SOURCE_PATH'] ??
  fileURLToPath(new URL('./escribir.ts', import.meta.url));

describe('R-27 · URLs que llegan al portal público', () => {
  it('mantiene la validación en ambos campos públicos y en el escritor', () => {
    expect(readFileSync(FUENTE_MAPA, 'utf8').match(/validacion: 'url_http'/g)).toHaveLength(2);
    const escritura = readFileSync(FUENTE_ESCRITURA, 'utf8');
    expect(escritura).toContain('z.url().safeParse(valor)');
    expect(escritura).toContain("protocol !== 'https:'");
    expect(escritura).toContain("protocol !== 'http:'");
  });

  it.each(['ProductoTerminado', 'MenuQRSeccion'])(
    '%s rechaza una imagen que no es URL HTTP(S)',
    async (entidad) => {
      await expect(
        escribir({} as Transaccion, AMBITO, {
          entidad,
          operacion: 'create',
          datos: { imagen_url: 'javascript:alert(1)' },
        }),
      ).rejects.toMatchObject({ codigo: 'PUENTE_CAMPO_INVALIDO' });
    },
  );
});
