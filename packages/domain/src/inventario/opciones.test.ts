import { describe, expect, it } from 'vitest';

import { calcularConsumo } from './consumo.ts';
import { recetaConOpciones, type EfectoDeOpcion } from './opciones.ts';

/**
 * F-027 · El latte de avena descuenta avena, y el de 16 oz descuenta lo de uno de 16.
 *
 * La receta de catálogo del latte de 12 oz: 18 g de café y 180 ml de leche entera,
 * con la leche declarada sustituible por el grupo «Leche».
 */
const LATTE = [
  { insumoId: 'cafe', cantidad: '18', unidad: 'g', unidadBase: 'g', sustituiblePorGrupoId: null },
  {
    insumoId: 'entera',
    cantidad: '180',
    unidad: 'ml',
    unidadBase: 'ml',
    sustituiblePorGrupoId: 'grupo-leche',
  },
] as const;

const AVENA: EfectoDeOpcion = {
  grupoId: 'grupo-leche',
  insumoSustitutoId: 'avena',
  unidadBaseSustituto: 'ml',
  factor: '1',
};
const DIECISEIS: EfectoDeOpcion = {
  grupoId: 'grupo-tamano',
  insumoSustitutoId: null,
  unidadBaseSustituto: null,
  factor: '1.44',
};

describe('la receta con las opciones que eligió el cliente', () => {
  it('sin opciones, la receta es la del catálogo', () => {
    expect(recetaConOpciones(LATTE, [])).toEqual(LATTE);
  });

  it('la leche de avena sustituye SÓLO la línea que su grupo puede reemplazar', () => {
    const receta = recetaConOpciones(LATTE, [AVENA]);
    expect(receta.map((l) => [l.insumoId, l.cantidad])).toEqual([
      ['cafe', '18'],
      ['avena', '180'],
    ]);
  });

  it('el tamaño escala la receta ENTERA, no sólo la leche', () => {
    const receta = recetaConOpciones(LATTE, [DIECISEIS]);
    expect(receta.map((l) => [l.insumoId, l.cantidad])).toEqual([
      ['cafe', '25.92'],
      ['entera', '259.2'],
    ]);
  });

  it('lo que se CUENTA no se escala: un 16 oz lleva un vaso, no 1.44', () => {
    const conVaso = [
      ...LATTE,
      { insumoId: 'vaso-12', cantidad: '1', unidad: 'pieza', unidadBase: 'pieza' },
    ];
    const receta = recetaConOpciones(conVaso, [DIECISEIS]);
    expect(receta.map((l) => [l.insumoId, l.cantidad])).toEqual([
      ['cafe', '25.92'],
      ['entera', '259.2'],
      ['vaso-12', '1'],
    ]);
  });

  it('el vaso grande es una SUSTITUCIÓN del grupo «Tamaño», sin escalar', () => {
    const conVaso = [
      ...LATTE,
      {
        insumoId: 'vaso-12',
        cantidad: '1',
        unidad: 'pieza',
        unidadBase: 'pieza',
        sustituiblePorGrupoId: 'grupo-tamano',
      },
    ];
    const receta = recetaConOpciones(conVaso, [
      { ...DIECISEIS, insumoSustitutoId: 'vaso-16', unidadBaseSustituto: 'pieza' },
    ]);
    expect(receta[2]).toMatchObject({ insumoId: 'vaso-16', cantidad: '1' });
    expect(receta[0]?.cantidad).toBe('25.92');
  });

  it('las dos a la vez: avena en el vaso grande', () => {
    const receta = recetaConOpciones(LATTE, [DIECISEIS, AVENA]);
    expect(receta.map((l) => [l.insumoId, l.cantidad])).toEqual([
      ['cafe', '25.92'],
      ['avena', '259.2'],
    ]);
  });

  it('los factores se multiplican entre sí', () => {
    const doble: EfectoDeOpcion = { ...DIECISEIS, grupoId: 'grupo-carga', factor: '2' };
    const receta = recetaConOpciones(LATTE, [DIECISEIS, doble]);
    expect(receta[0]?.cantidad).toBe('51.84');
  });

  it('una razón que no es redonda se redondea a la diezmilésima, sin reventar el cobro', () => {
    const tercio: EfectoDeOpcion = { ...DIECISEIS, factor: '1.3333' };
    const receta = recetaConOpciones(
      [{ insumoId: 'cafe', cantidad: '18.005', unidad: 'g', unidadBase: 'g' }],
      [tercio],
    );
    // 18.005 × 1.3333 = 24.0060665 → 24.0061
    expect(receta[0]?.cantidad).toBe('24.0061');
  });

  it('un sustituto de otra dimensión NO se inventa: la línea queda como estaba', () => {
    const enGramos: EfectoDeOpcion = { ...AVENA, unidadBaseSustituto: 'g' };
    const receta = recetaConOpciones(LATTE, [enGramos]);
    expect(receta[1]?.insumoId).toBe('entera');
  });

  it('una opción de OTRO grupo no toca la línea de leche', () => {
    const otra: EfectoDeOpcion = { ...AVENA, grupoId: 'grupo-jarabe' };
    expect(recetaConOpciones(LATTE, [otra])[1]?.insumoId).toBe('entera');
  });

  it('una línea sin grupo declarado no se sustituye aunque haya sustituto', () => {
    const sinDeclarar = LATTE.map((l) => ({ ...l, sustituiblePorGrupoId: null }));
    expect(recetaConOpciones(sinDeclarar, [AVENA])[1]?.insumoId).toBe('entera');
  });

  it('un sustituto en litros se acepta: el consumo convierte a su unidad base', () => {
    const enLitros: EfectoDeOpcion = { ...AVENA, unidadBaseSustituto: 'l' };
    const receta = recetaConOpciones(LATTE, [enLitros]);
    const [, leche] = calcularConsumo([
      {
        organizacionId: 'org',
        almacenId: 'alm',
        ordenId: 'orden',
        lineaId: 'linea',
        cantidad: '1',
        permiteVentaSinStock: true,
        estrategiaConsumo: 'receta',
        receta,
      },
    ]);
    expect([leche?.insumoId, leche?.cantidad, leche?.unidad]).toEqual(['avena', '0.18', 'l']);
  });
});
