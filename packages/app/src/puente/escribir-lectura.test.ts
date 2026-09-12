import { describe, expect, it } from 'vitest';

import { contextoCatalogo } from '../catalogo/pruebas.ts';
import { escribir } from './escribir.ts';

const FUENTE =
  process.env['MORPHIQPOS_WRITE_OUTPUT_SOURCE_PATH'] ??
  fileURLToPath(new URL('./escribir.ts', import.meta.url));

describe('S-4 · el eco de escritura respeta rolesLectura', () => {
  it('ni selecciona ni devuelve el costo a un rol sin permiso', async () => {
    const { ctx, operaciones } = contextoCatalogo([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        nombre: 'Café',
        costo_calculado_actual: 1234n,
        utilidad_bruta_actual: 567n,
        margen_bruto_actual: 3150n,
      },
    ]);

    const salida = await escribir(
      ctx.tx,
      { ...ctx.ambito, rol: 'mesero' },
      { entidad: 'ProductoTerminado', operacion: 'create', datos: { nombre: 'Café' } },
    );

    expect(operaciones[0]?.retornos).not.toContain(
      'costo_unitario_centavos as costo_calculado_actual',
    );
    expect(operaciones[0]?.retornos).not.toContain(
      'utilidad_unitaria_centavos as utilidad_bruta_actual',
    );
    expect(salida).not.toHaveProperty('costo_calculado_actual');
    expect(salida).not.toHaveProperty('utilidad_bruta_actual');
    expect(salida).not.toHaveProperty('margen_bruto_actual');
    expect(salida['nombre']).toBe('Café');
    const fuente = readFileSync(FUENTE, 'utf8');
    expect(fuente).toContain('campo.constante === undefined && puedeLeerCampo(campo, rol)');
    expect(fuente).toContain('if (!puedeLeerCampo(campo, rol)) continue;');
  });
});
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
