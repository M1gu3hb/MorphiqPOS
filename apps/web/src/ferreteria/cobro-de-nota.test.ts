import { describe, expect, it } from 'vitest';

import {
  billetesSugeridos,
  cambioDe,
  cambioDelMixto,
  faltaDelMixto,
  pagosDelMixto,
} from './cobro-de-nota';

/**
 * C.5 de la etapa 2.4 · La caja de la ferretería sellaba UN método por nota y en
 * efectivo mandaba lo recibido igual al total: ni cambio ni pago mixto. Esto es lo que
 * la cajera decide antes de cobrar; el servidor lo vuelve a comprobar.
 */

describe('billetesSugeridos', () => {
  it('REDONDEA A LOS BILLETES con los que se paga, sin repetir', () => {
    // Una nota de $437.50: se paga con $440, $450 o $500.
    expect(billetesSugeridos(43_750)).toEqual([44_000, 45_000, 50_000]);
  });

  it('no sugiere el exacto: tiene su propio botón', () => {
    expect(billetesSugeridos(50_000)).toEqual([60_000, 100_000]);
  });
});

describe('cambioDe', () => {
  it('EL CAMBIO de $500 por una nota de $437.50 son $62.50', () => {
    expect(cambioDe(43_750, 50_000)).toBe(6_250);
  });

  it('sin alcanzar, no hay cambio que dar y no se cobra', () => {
    expect(cambioDe(43_750, 40_000)).toBeNull();
    expect(cambioDe(43_750, null)).toBeNull();
  });
});

describe('el pago mixto', () => {
  const montos = { efectivo: 20_000, tarjeta: 23_750, transferencia: null } as const;

  it('DICE LO QUE FALTA y lo que sobra', () => {
    expect(faltaDelMixto(43_750, montos)).toBe(0);
    expect(faltaDelMixto(50_000, montos)).toBe(6_250);
    expect(faltaDelMixto(40_000, montos)).toBe(-3_750);
  });

  it('UN PAGO POR MÉTODO, y lo recibido sólo en el efectivo', () => {
    expect(pagosDelMixto(montos, 50_000)).toEqual([
      { metodo: 'efectivo', montoCentavos: 20_000, recibidoCentavos: 50_000 },
      { metodo: 'tarjeta', montoCentavos: 23_750 },
    ]);
  });

  it('sin decir cuánto dio, el efectivo es exacto', () => {
    expect(pagosDelMixto(montos, null)[0]).toEqual({
      metodo: 'efectivo',
      montoCentavos: 20_000,
      recibidoCentavos: 20_000,
    });
  });

  it('EL CAMBIO del mixto es sobre la parte en efectivo', () => {
    expect(cambioDelMixto(montos, 50_000)).toBe(30_000);
    expect(cambioDelMixto(montos, 10_000)).toBeNull();
    expect(cambioDelMixto({ efectivo: null, tarjeta: 43_750, transferencia: null }, null)).toBe(0);
  });
});
