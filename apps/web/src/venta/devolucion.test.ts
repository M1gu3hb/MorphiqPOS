import { describe, expect, it } from 'vitest';

import {
  diezmilesimasDe,
  importeDeLinea,
  pendienteDe,
  porcentajeDeTope,
  type LineaParaDevolver,
} from './devolucion.ts';

/**
 * La cuenta de la devolución en la pantalla es la del servidor (D-29): tres aceites que
 * costaron $100.00 se devuelven en $33.33, $33.34 y $33.33, y nunca más de lo vendido.
 */

const aceite = (devuelta = '0'): LineaParaDevolver => ({
  ordenLineaId: 'l1',
  producto: 'Aceite 1 L',
  cantidad: '3.0000',
  unidad: 'pieza',
  devuelta,
  cobradoCentavos: '10000',
  devueltoCentavos: '0',
});

describe('la cuenta de la devolución en la pantalla', () => {
  it('a pedazos suma exacto lo cobrado de la línea', () => {
    expect(importeDeLinea(aceite('0'), '1')).toBe(3_333n);
    expect(importeDeLinea(aceite('1'), '1')).toBe(3_334n);
    expect(importeDeLinea(aceite('2'), '1')).toBe(3_333n);
    expect(importeDeLinea(aceite('0'), '3')).toBe(10_000n);
  });

  it('no deja devolver más de lo que queda, ni una cantidad que no lo es', () => {
    expect(importeDeLinea(aceite('2'), '2')).toBeNull();
    expect(importeDeLinea(aceite('0'), 'dos')).toBeNull();
  });

  it('lo pendiente se escribe como se teclea', () => {
    expect(pendienteDe(aceite('1'))).toBe('2');
    expect(pendienteDe({ ...aceite('0.25'), cantidad: '1.0000' })).toBe('0.75');
    expect(diezmilesimasDe('1,5')).toBe(15_000n);
  });

  it('el tope se lee en porcentaje sin dividir dinero en la pantalla', () => {
    expect(porcentajeDeTope(1_000)).toBe('10');
    expect(porcentajeDeTope(1_250)).toBe('12.5');
    expect(porcentajeDeTope(305)).toBe('3.05');
  });
});
