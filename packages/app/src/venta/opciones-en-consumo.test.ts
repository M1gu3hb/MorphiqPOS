import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { efectosDeOpcionesPorLinea } from './opciones-en-consumo.ts';

/**
 * F-027 · Lo que las opciones elegidas le hacen a la receta, leído al cobrar.
 *
 * El latte de la línea `l-1` se pidió de 16 oz y con avena; el de `l-2`, tal cual.
 */
const ORG = 'org-cafe';

function base(extra: Record<string, readonly Record<string, unknown>[]> = {}) {
  return crearBaseFalsa({
    orden_linea_modificadores: [
      { orden_linea_id: 'l-1', opcion_id: 'op-16oz' },
      { orden_linea_id: 'l-1', opcion_id: 'op-avena' },
      // Una nota libre de la barra, sin opción de catálogo detrás.
      { orden_linea_id: 'l-1', opcion_id: null },
    ],
    modificador_opciones: [
      {
        id: 'op-16oz',
        modificador_id: 'g-tamano',
        insumo_sustituto_id: null,
        factor_cantidad: '1.4400',
      },
      {
        id: 'op-avena',
        modificador_id: 'g-leche',
        insumo_sustituto_id: 'ins-avena',
        factor_cantidad: '1.0000',
      },
    ],
    modificadores: [
      { id: 'g-tamano', organizacion_id: ORG },
      { id: 'g-leche', organizacion_id: ORG },
    ],
    insumos: [{ id: 'ins-avena', organizacion_id: ORG, activo: true, unidad_base: 'ml' }],
    ...extra,
  });
}

describe('los efectos de las opciones, al cobrar', () => {
  it('trae el tamaño que escala y la leche que sustituye, por línea', async () => {
    const efectos = await efectosDeOpcionesPorLinea(base().tx, ORG, ['l-1', 'l-2']);
    expect(efectos.get('l-1')).toEqual([
      { grupoId: 'g-tamano', insumoSustitutoId: null, unidadBaseSustituto: null, factor: '1.4400' },
      {
        grupoId: 'g-leche',
        insumoSustitutoId: 'ins-avena',
        unidadBaseSustituto: 'ml',
        factor: '1.0000',
      },
    ]);
    expect(efectos.has('l-2')).toBe(false);
  });

  it('una opción cuyo grupo es de OTRO negocio no hace nada aquí', async () => {
    const ajena = base({
      modificadores: [
        { id: 'g-tamano', organizacion_id: 'otra-org' },
        { id: 'g-leche', organizacion_id: ORG },
      ],
    });
    const efectos = await efectosDeOpcionesPorLinea(ajena.tx, ORG, ['l-1']);
    expect(efectos.get('l-1')?.map((e) => e.grupoId)).toEqual(['g-leche']);
  });

  it('un sustituto archivado no sustituye: se descuenta lo de la receta', async () => {
    const archivado = base({
      insumos: [{ id: 'ins-avena', organizacion_id: ORG, activo: false, unidad_base: 'ml' }],
    });
    const efectos = await efectosDeOpcionesPorLinea(archivado.tx, ORG, ['l-1']);
    expect(efectos.get('l-1')?.[1]).toMatchObject({
      grupoId: 'g-leche',
      insumoSustitutoId: null,
      unidadBaseSustituto: null,
    });
  });

  it('un sustituto de otro negocio tampoco', async () => {
    const ajeno = base({
      insumos: [{ id: 'ins-avena', organizacion_id: 'otra-org', activo: true, unidad_base: 'ml' }],
    });
    const efectos = await efectosDeOpcionesPorLinea(ajeno.tx, ORG, ['l-1']);
    expect(efectos.get('l-1')?.[1]?.insumoSustitutoId).toBeNull();
  });

  it('sin líneas no pregunta nada', async () => {
    const efectos = await efectosDeOpcionesPorLinea(base().tx, ORG, []);
    expect(efectos.size).toBe(0);
  });
});

/**
 * El CABLE entre el cobro y el dominio: `recetaConOpciones` tiene sus pruebas, y
 * pasarían igual con el cable cortado —es exactamente lo que pasó con las recetas en
 * F1.3 (`consumo-al-cobrar.test.ts`)—. Se afirma sobre el bloque de la estrategia
 * `receta` de `planearConsumo`, sin comentarios, y sobre el ORDEN: los ingredientes que
 * se empujan son los que salen de `recetaConOpciones`, con los efectos de ESA línea.
 */
describe('el cobro aplica las opciones a la receta', () => {
  const fuente = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'cobrar.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const inicio = fuente.indexOf("if (producto.estrategiaConsumo === 'receta')");
  const bloque = fuente.slice(inicio, fuente.indexOf('return calcularConsumo(', inicio));

  it('los ingredientes de la receta pasan por las opciones de su línea', () => {
    expect(inicio).toBeGreaterThan(0);
    expect(bloque).toMatch(
      /const\s+ingredientes\s*=\s*recetaConOpciones\(\s*lineasDelCanal\([\s\S]*?\),\s*efectos\.get\(\s*linea\.id\s*\)/,
    );
    expect(bloque).toMatch(/receta:\s*ingredientes\.map\(/);
  });

  it('y los efectos se leen de las líneas de ESTA orden', () => {
    expect(fuente).toMatch(
      /const\s+efectos\s*=\s*await\s+efectosDeOpcionesPorLinea\(\s*tx,\s*organizacionId,\s*lineas\.map\(/,
    );
  });
});
