import { describe, expect, it } from 'vitest';

import {
  MOTIVO_DEL_CONTEO,
  RUTA_DE_AJUSTE,
  RUTA_DE_MERMA,
  cantidadEnTexto,
  motivoVigente,
  motivosDeMermaParaBajar,
  ordenDelAjuste,
  type MotivoDeMerma,
} from './ajuste-de-inventario.ts';

/**
 * LA MERMA DE LA COCINA SE REGISTRA COMO MERMA.
 *
 * Todo lo que bajaba de la alacena entraba como «diferencia de conteo»: la crema caducada y el
 * faltante del conteo quedaban juntos y el reporte de merma no podía separarlos. Estas pruebas
 * fijan a qué comando va cada cosa y con qué forma, porque cada uno pide la suya: el ajuste
 * recibe el delta CON signo, la merma recibe lo perdido en positivo.
 */

const ALMACEN = '11111111-1111-4111-8111-111111111111';
const INSUMO = '22222222-2222-4222-8222-222222222222';

const MOTIVOS: readonly MotivoDeMerma[] = [
  { clave: 'ajuste_conteo', etiqueta: 'Diferencia de conteo físico' },
  { clave: 'caducado', etiqueta: 'Caducado' },
  { clave: 'roto', etiqueta: 'Roto al manipular' },
  { clave: 'roto', etiqueta: 'Roto al manipular (repetido)' },
];

describe('cantidadEnTexto', () => {
  it('manda texto y no arrastra el ruido de la coma flotante', () => {
    expect(cantidadEnTexto(50)).toBe('50');
    expect(cantidadEnTexto(-50)).toBe('-50');
    expect(cantidadEnTexto(0.1 + 0.2)).toBe('0.3');
    expect(cantidadEnTexto(2.5)).toBe('2.5');
    expect(cantidadEnTexto(0.12345)).toBe('0.1235');
  });
});

describe('motivosDeMermaParaBajar', () => {
  it('quita el motivo de conteo —ya es la opción de omisión— y los repetidos', () => {
    expect(motivosDeMermaParaBajar(MOTIVOS).map((m) => m.clave)).toEqual(['caducado', 'roto']);
  });
});

describe('motivoVigente', () => {
  it('una alta es siempre un conteo: nadie mermó de más', () => {
    expect(motivoVigente(50, 'caducado', MOTIVOS)).toBe(MOTIVO_DEL_CONTEO);
    expect(motivoVigente(0, 'caducado', MOTIVOS)).toBe(MOTIVO_DEL_CONTEO);
  });

  it('una baja conserva el motivo elegido si sigue en la lista, y si no vuelve al conteo', () => {
    expect(motivoVigente(-50, 'caducado', MOTIVOS)).toBe('caducado');
    expect(motivoVigente(-50, 'robo', MOTIVOS)).toBe(MOTIVO_DEL_CONTEO);
    expect(motivoVigente(-50, 'caducado', [])).toBe(MOTIVO_DEL_CONTEO);
  });
});

describe('ordenDelAjuste', () => {
  const base = { almacenId: ALMACEN, insumoId: INSUMO, unidad: 'g', nota: ' se cayó la charola ' };

  it('un conteo va a `inventario.ajustar` con el delta con signo y la clave de conteo', () => {
    expect(ordenDelAjuste({ ...base, delta: -50, motivoClave: MOTIVO_DEL_CONTEO })).toEqual({
      ruta: RUTA_DE_AJUSTE,
      cuerpo: {
        almacenId: ALMACEN,
        insumoId: INSUMO,
        cantidad: '-50',
        motivo: 'ajuste_conteo',
        nota: 'se cayó la charola',
      },
    });
  });

  it('una alta va al ajuste aunque traiga un motivo de merma: no se mermó nada', () => {
    const orden = ordenDelAjuste({ ...base, delta: 100, motivoClave: 'caducado' });
    expect(orden.ruta).toBe(RUTA_DE_AJUSTE);
    expect(orden.cuerpo['cantidad']).toBe('100');
    expect(orden.cuerpo['motivo']).toBe('ajuste_conteo');
  });

  it('una baja con motivo de merma va a `inventario.registrar_merma`, en positivo', () => {
    expect(ordenDelAjuste({ ...base, delta: -300, motivoClave: 'roto' })).toEqual({
      ruta: RUTA_DE_MERMA,
      cuerpo: {
        almacenId: ALMACEN,
        insumoId: INSUMO,
        estrategia: 'insumo',
        cantidad: '300',
        unidad: 'g',
        motivoClave: 'roto',
        nota: 'se cayó la charola',
      },
    });
  });

  it('sin unidad la merma usa la pieza, y sin nota no manda una vacía', () => {
    const orden = ordenDelAjuste({
      ...base,
      unidad: null,
      nota: '   ',
      delta: -1,
      motivoClave: 'caducado',
    });
    expect(orden.cuerpo['unidad']).toBe('pieza');
    expect(orden.cuerpo).not.toHaveProperty('nota');
  });

  it('respeta el largo de la nota de cada comando (300 el ajuste, 200 la merma)', () => {
    const larga = 'x'.repeat(400);
    expect(
      ordenDelAjuste({ ...base, nota: larga, delta: -1, motivoClave: MOTIVO_DEL_CONTEO }).cuerpo[
        'nota'
      ],
    ).toHaveLength(300);
    expect(
      ordenDelAjuste({ ...base, nota: larga, delta: -1, motivoClave: 'roto' }).cuerpo['nota'],
    ).toHaveLength(200);
  });
});
