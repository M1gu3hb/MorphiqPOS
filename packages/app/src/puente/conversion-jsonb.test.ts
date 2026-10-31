import { describe, expect, it } from 'vitest';

import { MAPA } from './mapa.ts';
import { valorHaciaLaBase, valorHaciaEl } from './tipos.ts';

/**
 * UN ARREGLO HACIA UNA COLUMNA `jsonb` VIAJA COMO TEXTO JSON (DP-5).
 *
 * `pg` convierte un arreglo de JavaScript en un arreglo NATIVO de Postgres: `[0.25, 0.5, 1]` sale
 * como `{0.25,0.5,1}`, y una columna `jsonb` lo rechaza con `22P02`. Por eso los atajos de peso de
 * un producto (`presets_variable_qr`) no se podían guardar, ni desde la pantalla ni desde el
 * cargador del menú, y las líneas de una plantilla de compra tampoco.
 *
 * `json` se queda como estaba para lo que SÍ es un arreglo nativo: `dia_visita` es `int[]`, y ahí
 * mandar el arreglo tal cual es lo correcto.
 */
const JSONB = { columna: 'x', conversion: 'jsonb' } as const;
const ARREGLO_NATIVO = { columna: 'x', conversion: 'json' } as const;

describe('jsonb, hacia la base', () => {
  it('un arreglo sale como texto JSON, no como arreglo de Postgres', () => {
    expect(valorHaciaLaBase([0.25, 0.5, 1], JSONB)).toBe('[0.25,0.5,1]');
  });

  it('un arreglo de documentos también', () => {
    expect(valorHaciaLaBase([{ insumo: 'Carnero', kg: 2 }], JSONB)).toBe(
      '[{"insumo":"Carnero","kg":2}]',
    );
  });

  it('nulo se queda nulo: «sin atajos» no es el texto «null»', () => {
    expect(valorHaciaLaBase(null, JSONB)).toBeNull();
    expect(valorHaciaLaBase(undefined, JSONB)).toBeNull();
  });

  it('hacia él llega tal cual, como `json`', () => {
    expect(valorHaciaEl([0.25, 0.5, 1], JSONB)).toEqual([0.25, 0.5, 1]);
  });

  it('un arreglo NATIVO (`json`, `dia_visita int[]`) sigue yendo como arreglo', () => {
    expect(valorHaciaLaBase([1, 3, 5], ARREGLO_NATIVO)).toEqual([1, 3, 5]);
  });
});

describe('los campos que se escriben en una columna jsonb usan `jsonb`', () => {
  it.each([
    ['ProductoTerminado', 'presets_variable_qr'],
    ['ProductoTerminado', 'presets_porcion_qr'],
    ['PlantillaCompra', 'lineas'],
  ])('%s.%s', (entidad, campo) => {
    expect(MAPA[entidad]?.campos[campo]?.conversion).toBe('jsonb');
  });

  it('`dia_visita` (int[]) no', () => {
    expect(MAPA['Proveedor']?.campos['dia_visita']?.conversion).toBe('json');
  });
});
