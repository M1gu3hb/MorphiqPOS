import { describe, expect, it } from 'vitest';

import {
  areaDelCorte,
  materialParaCortar,
  pedazoDondeCabe,
  tipoDeCorte,
} from './corte-por-tipo.ts';

describe('las tres formas de cortar', () => {
  it('lo que no dice su tipo se corta como rollo', () => {
    expect(tipoDeCorte('tubular')).toBe('tubular');
    expect(tipoDeCorte('plano')).toBe('plano');
    expect(tipoDeCorte(null)).toBe('lineal');
    expect(tipoDeCorte('otro')).toBe('lineal');
  });

  it('TRAMO: el pedazo más chico donde cabe, y el suelto antes que abrir uno nuevo', () => {
    const piezas = [
      { id: 'tramo-6', abierta: false, restante: 6 },
      { id: 'pedazo-1.2', abierta: true, restante: 1.2 },
      { id: 'pedazo-0.8', abierta: true, restante: 0.8 },
      { id: 'otro-tramo-1.2', abierta: false, restante: 1.2 },
    ];
    expect(pedazoDondeCabe(piezas, 0.9)?.id).toBe('pedazo-1.2');
    expect(pedazoDondeCabe(piezas, 0.8)?.id).toBe('pedazo-0.8');
    expect(pedazoDondeCabe(piezas, 2)?.id).toBe('tramo-6');
    expect(pedazoDondeCabe(piezas, 7)).toBeNull();
    expect(pedazoDondeCabe(piezas, 0)).toBeNull();
  });

  it('LÁMINA: el área, ancho × alto, con cuatro decimales y sin flotantes', () => {
    expect(areaDelCorte('1.2', '0.8')).toBe('0.9600');
    expect(areaDelCorte('0,35', '0,35')).toBe('0.1225');
    expect(areaDelCorte('2.4401', '1.0003')).toBe('2.4408');
    expect(areaDelCorte('0', '1')).toBeNull();
    expect(areaDelCorte('uno', '1')).toBeNull();
  });
});

describe('de qué se corta', () => {
  const materiales = [{ id: 'cable' }, { id: 'manguera' }, { id: 'cadena' }];

  it('el que pidió el mostrador, no el primero del catálogo', () => {
    expect(materialParaCortar(materiales, 'manguera')).toEqual({
      material: { id: 'manguera' },
      noEsDeCorte: false,
    });
  });

  it('sin pedido, el primero', () => {
    expect(materialParaCortar(materiales, null).material).toEqual({ id: 'cable' });
  });

  it('una pieza que no se corta se DICE, y se ofrece el primero', () => {
    expect(materialParaCortar(materiales, 'martillo')).toEqual({
      material: { id: 'cable' },
      noEsDeCorte: true,
    });
    expect(materialParaCortar([], 'martillo')).toEqual({ material: null, noEsDeCorte: true });
  });
});
