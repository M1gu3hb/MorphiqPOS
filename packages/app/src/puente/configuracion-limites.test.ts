import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { guardarConfiguracionParcial } from './configuracion.ts';

const ORG = '11111111-1111-4111-8111-111111111111';
const FUENTE =
  process.env['MORPHIQPOS_PARTIAL_CONFIG_SOURCE_PATH'] ??
  fileURLToPath(new URL('./configuracion.ts', import.meta.url));

function codigoDe(promesa: Promise<unknown>): Promise<string> {
  return promesa.then(
    () => 'NO_LANZO',
    (error: unknown) =>
      typeof error === 'object' && error !== null && 'codigo' in error
        ? String(error.codigo)
        : 'INESPERADO',
  );
}

describe('C-11 · límites del documento de configuración', () => {
  it('rechaza claves fuera de la allowlist antes de consultar la base', async () => {
    const codigo = await codigoDe(
      guardarConfiguracionParcial({} as Transaccion, ORG, {
        clave_inventada: true,
        constructor: { contaminado: true },
      }),
    );

    expect(codigo).toBe('PUENTE_CAMPO_INVALIDO');
  });

  it('limita el nombre del negocio y el documento serializado', async () => {
    expect(
      await codigoDe(
        guardarConfiguracionParcial({} as Transaccion, ORG, {
          nombre_negocio: 'N'.repeat(161),
        }),
      ),
    ).toBe('PUENTE_CAMPO_INVALIDO');
    expect(
      await codigoDe(
        guardarConfiguracionParcial({} as Transaccion, ORG, {
          portal_qr_mensaje_bienvenida: 'x'.repeat(70 * 1024),
        }),
      ),
    ).toBe('PUENTE_CAMPO_INVALIDO');

    const fuente = readFileSync(FUENTE, 'utf8');
    expect(fuente).toContain('MAX_BYTES_CONFIGURACION = 64 * 1024');
    expect(fuente).toContain('if (!CLAVES_EDITABLES.has(clave))');
    expect(fuente).toContain('nombre.length > 160');
  });
});
