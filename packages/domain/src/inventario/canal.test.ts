import { describe, expect, it } from 'vitest';

import { lineasDelCanal } from './canal.ts';

/**
 * F-331 · El empaque por canal.
 *
 * Un latte para tomar aquí va en taza; el mismo latte para llevar va en vaso,
 * tapa y funda. Sin esta separación la receta es una sola, el empaque no está
 * en el costo y TODOS los márgenes de la plantilla están inflados entre cinco y
 * ocho puntos: la dueña cree que gana un 68 % donde gana un 61 %.
 */

const RECETA = [
  { insumoId: 'cafe', aplicaCanal: null },
  { insumoId: 'leche', aplicaCanal: null },
  { insumoId: 'vaso', aplicaCanal: ['llevar', 'plataforma'] },
  { insumoId: 'tapa', aplicaCanal: ['llevar', 'plataforma'] },
  { insumoId: 'taza-lavado', aplicaCanal: ['aqui'] },
] as const;

describe('F-331 · qué se descuenta según por dónde sale', () => {
  it('LO QUE SE LLEVA PAGA SU VASO Y SU TAPA', () => {
    const insumos = lineasDelCanal(RECETA, 'llevar').map((l) => l.insumoId);
    expect(insumos).toEqual(['cafe', 'leche', 'vaso', 'tapa']);
  });

  it('LO QUE SE TOMA AQUÍ NO: va en taza, y la taza no se consume', () => {
    const insumos = lineasDelCanal(RECETA, 'aqui').map((l) => l.insumoId);
    expect(insumos).toEqual(['cafe', 'leche', 'taza-lavado']);
  });

  it('plataforma lleva el mismo empaque que para llevar', () => {
    expect(lineasDelCanal(RECETA, 'plataforma').map((l) => l.insumoId)).toEqual([
      'cafe',
      'leche',
      'vaso',
      'tapa',
    ]);
  });

  it('UNA RECETA SIN CANALES es la receta histórica: aplica entera', () => {
    // Es lo que tiene hoy todo el catálogo, y tiene que seguir funcionando
    // igual el día que se aplique la migración.
    const vieja = [
      { insumoId: 'cafe', aplicaCanal: null },
      { insumoId: 'leche', aplicaCanal: null },
    ];
    for (const canal of ['aqui', 'llevar', 'plataforma', 'anticipado']) {
      expect(lineasDelCanal(vieja, canal), canal).toHaveLength(2);
    }
  });

  it('un canal que ninguna línea declara descuenta sólo lo común', () => {
    expect(lineasDelCanal(RECETA, 'anticipado').map((l) => l.insumoId)).toEqual(['cafe', 'leche']);
  });
});
