import { describe, expect, it } from 'vitest';

import {
  problemaDeLaPropina,
  propinaPorConfirmar,
  propinaPrevista,
  renglonesDePago,
} from './pagos-del-cobro.ts';

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

/**
 * Día completo del restaurante (2.4) · LA PROPINA QUE EL MESERO YA ACORDÓ EN LA MESA. El
 * cobro leía sólo `propina_monto`, que antes de cobrar no existe: el 10 % que el mesero
 * pactó con el comensal se cobraba como cero, sin muro y sin aviso.
 */
describe('la propina que llega del mesero', () => {
  const nada = { tipo: null, origen: null, porcentaje: null, pagadaCentavos: null };

  it('el PORCENTAJE que eligió el mesero se cobra, sobre la venta y en centavos', () => {
    const mesero = { ...nada, tipo: 'porcentaje', origen: 'mesero', porcentaje: 10 };
    expect(propinaPrevista(17_400, mesero)).toBe(1_740);
    // 12.5 % de $329: 4112.5 centavos se redondean UNA vez, con la regla del dominio.
    expect(propinaPrevista(32_900, { ...mesero, porcentaje: 12.5 })).toBe(4_113);
    expect(propinaPorConfirmar(mesero)).toBe(false);
  });

  it('un MONTO a mano del mesero no viaja: la caja lo vuelve a preguntar', () => {
    const manual = { ...nada, tipo: 'monto_manual', origen: 'mesero' };
    expect(propinaPorConfirmar(manual)).toBe(true);
    expect(propinaPrevista(17_400, manual)).toBe(0);
    // Ya confirmado en caja no se vuelve a preguntar.
    expect(propinaPorConfirmar({ ...manual, origen: 'caja' })).toBe(false);
  });

  it('lo diferido a caja pone el muro; «sin propina» no', () => {
    for (const tipo of ['pendiente', 'pendiente_cliente', 'decidir_en_caja']) {
      expect(propinaPorConfirmar({ ...nada, tipo })).toBe(true);
    }
    expect(propinaPorConfirmar({ ...nada, tipo: 'sin_propina' })).toBe(false);
    expect(propinaPrevista(17_400, { ...nada, tipo: 'sin_propina' })).toBe(0);
  });

  it('una propina ya pagada manda sobre el porcentaje', () => {
    const pagada = { ...nada, tipo: 'porcentaje', porcentaje: 10, pagadaCentavos: 2_000 };
    expect(propinaPrevista(17_400, pagada)).toBe(2_000);
  });
});
