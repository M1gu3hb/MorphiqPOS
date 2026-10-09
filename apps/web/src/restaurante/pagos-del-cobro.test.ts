import { describe, expect, it } from 'vitest';

import { problemaDeLaPropina, renglonesDePago } from './pagos-del-cobro.ts';

/**
 * El pago mixto del restaurante (auditoría de la 2.4): la propina sale del método que se
 * elige, no «del efectivo hacia abajo», y nunca viaja un renglón con importe cero.
 */

const PARTES = { efectivo: 5_000, tarjeta: 20_000, transferencia: null };

describe('los renglones del cobro del restaurante', () => {
  it('LA PROPINA SALE DEL MÉTODO ELEGIDO: con tarjeta, la tarjeta la lleva', () => {
    // Venta $200, propina $50: efectivo $50 + tarjeta $200 (la tarjeta trae la propina).
    const renglones = renglonesDePago('mixto', PARTES, 20_000, 5_000, null, 'tarjeta');
    expect(renglones).toEqual([
      { metodo: 'efectivo', montoCentavos: 5_000, propinaCentavos: 0 },
      { metodo: 'tarjeta', montoCentavos: 15_000, propinaCentavos: 5_000 },
    ]);
  });

  it('nunca viaja un renglón de importe cero (el servidor lo rechazaba)', () => {
    const renglones = renglonesDePago('mixto', PARTES, 20_000, 5_000, null, 'tarjeta');
    expect(renglones.every((r) => r.montoCentavos > 0)).toBe(true);
    // La suma de lo cobrado es la venta y la de las propinas, la propina: exacto.
    expect(renglones.reduce((s, r) => s + r.montoCentavos, 0)).toBe(20_000);
    expect(renglones.reduce((s, r) => s + r.propinaCentavos, 0)).toBe(5_000);
  });

  it('si el método de la propina no la cubre con algo de cuenta, se dice antes', () => {
    expect(problemaDeLaPropina(PARTES, 5_000, 'efectivo')).toContain('efectivo');
    expect(problemaDeLaPropina(PARTES, 5_000, 'tarjeta')).toBeNull();
    expect(problemaDeLaPropina(PARTES, 0, 'transferencia')).toBeNull();
  });

  it('un solo método: venta y propina en un renglón, con lo recibido si es efectivo', () => {
    expect(renglonesDePago('efectivo', PARTES, 20_000, 3_000, 25_000, 'efectivo')).toEqual([
      {
        metodo: 'efectivo',
        montoCentavos: 20_000,
        propinaCentavos: 3_000,
        recibidoCentavos: 25_000,
      },
    ]);
  });
});
