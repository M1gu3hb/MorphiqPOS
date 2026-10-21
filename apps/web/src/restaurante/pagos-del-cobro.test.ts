import { describe, expect, it } from 'vitest';

import {
  aCubrirEnEfectivo,
  problemaDeLaPropina,
  propinaDelComensal,
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

  it('nunca viaja un renglón vacío: o lleva venta o lleva propina', () => {
    const renglones = renglonesDePago('mixto', PARTES, 20_000, 5_000, null, 'tarjeta');
    expect(renglones.every((r) => r.montoCentavos > 0 || r.propinaCentavos > 0)).toBe(true);
    // La suma de lo cobrado es la venta y la de las propinas, la propina: exacto.
    expect(renglones.reduce((s, r) => s + r.montoCentavos, 0)).toBe(20_000);
    expect(renglones.reduce((s, r) => s + r.propinaCentavos, 0)).toBe(5_000);
  });

  it('si lo que entra por el método de la propina no alcanza para ella, se dice antes', () => {
    expect(problemaDeLaPropina(PARTES, 6_000, 'efectivo')).toContain('efectivo');
    expect(problemaDeLaPropina(PARTES, 5_000, 'tarjeta')).toBeNull();
    expect(problemaDeLaPropina(PARTES, 0, 'transferencia')).toBeNull();
  });

  it('LA CUENTA CON TARJETA Y LA PROPINA SÓLO EN EFECTIVO: el efectivo es sólo propina', () => {
    // El caso que la pantalla rechazaba: $200 con tarjeta y $30 en billete. El renglón de
    // efectivo no lleva venta —no se le inventa un centavo— y lleva la propina entera.
    const partes = { efectivo: 3_000, tarjeta: 20_000, transferencia: null };
    expect(problemaDeLaPropina(partes, 3_000, 'efectivo')).toBeNull();
    expect(renglonesDePago('mixto', partes, 20_000, 3_000, null, 'efectivo')).toEqual([
      { metodo: 'efectivo', montoCentavos: 0, propinaCentavos: 3_000 },
      { metodo: 'tarjeta', montoCentavos: 20_000, propinaCentavos: 0 },
    ]);
  });

  it('con un solo método, la propina puede irse por otro sin pasar por «Mixto»', () => {
    // Tarjeta por la cuenta y la propina en efectivo: dos renglones, el de la propina sin venta.
    expect(renglonesDePago('tarjeta', PARTES, 20_000, 3_000, null, 'efectivo')).toEqual([
      { metodo: 'tarjeta', montoCentavos: 20_000, propinaCentavos: 0 },
      { metodo: 'efectivo', montoCentavos: 0, propinaCentavos: 3_000 },
    ]);
    // Efectivo por la cuenta, con lo recibido, y la propina con tarjeta: el billete sólo
    // tiene que cubrir la venta.
    expect(renglonesDePago('efectivo', PARTES, 20_000, 3_000, 25_000, 'tarjeta')).toEqual([
      { metodo: 'efectivo', montoCentavos: 20_000, propinaCentavos: 0, recibidoCentavos: 25_000 },
      { metodo: 'tarjeta', montoCentavos: 0, propinaCentavos: 3_000 },
    ]);
    // Sin propina, el método de la propina no agrega nada.
    expect(renglonesDePago('tarjeta', PARTES, 20_000, 0, null, 'efectivo')).toEqual([
      { metodo: 'tarjeta', montoCentavos: 20_000, propinaCentavos: 0 },
    ]);
  });

  it('lo que el billete tiene que cubrir: la venta, y la propina sólo si va en efectivo', () => {
    expect(aCubrirEnEfectivo('efectivo', 20_000, 3_000, 'efectivo')).toBe(23_000);
    expect(aCubrirEnEfectivo('efectivo', 20_000, 3_000, 'tarjeta')).toBe(20_000);
    expect(aCubrirEnEfectivo('tarjeta', 20_000, 3_000, 'efectivo')).toBe(0);
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

/**
 * Día completo del restaurante (2.4) · LO QUE EL COMENSAL ESCRIBIÓ EN SU TELÉFONO. El muro de la
 * caja se ponía a ciegas: la cajera no veía el monto que el comensal había escrito en el portal.
 */
describe('la propina que el comensal escribió en su teléfono', () => {
  const delPortal = {
    tipo: 'monto_manual',
    origen: 'portal_qr',
    porcentaje: 28.12,
    pagadaCentavos: null,
  };

  it('se dice, aproximada, sobre la venta y en centavos', () => {
    // $123.45 escritos sobre una cuenta de $439.00: el portal guardó 2812 puntos base.
    expect(propinaDelComensal(43_900, delPortal)).toBe(12_345);
    // Un porcentaje redondo vuelve exacto.
    expect(propinaDelComensal(43_900, { ...delPortal, porcentaje: 10 })).toBe(4_390);
  });

  it('es una cifra APROXIMADA: los puntos base enteros pierden unos centavos', () => {
    // $50.00 sobre $1,210.00 son 413.2 puntos base: el portal guarda 413 y vuelve $49.97.
    expect(propinaDelComensal(121_000, { ...delPortal, porcentaje: 4.13 })).toBe(4_997);
  });

  it('sólo es del comensal si lo escribió en el portal', () => {
    expect(propinaDelComensal(43_900, { ...delPortal, origen: 'mesero' })).toBeNull();
    // Ya confirmada en caja no se vuelve a preguntar.
    expect(propinaDelComensal(43_900, { ...delPortal, origen: 'caja' })).toBeNull();
    expect(propinaDelComensal(43_900, { ...delPortal, tipo: 'porcentaje' })).toBeNull();
    expect(propinaDelComensal(43_900, { ...delPortal, tipo: 'decidir_en_caja' })).toBeNull();
  });

  it('sin puntos base, o con el tope de 100 %, no hay una cifra fiable que decir', () => {
    expect(propinaDelComensal(43_900, { ...delPortal, porcentaje: 0 })).toBeNull();
    expect(propinaDelComensal(43_900, { ...delPortal, porcentaje: null })).toBeNull();
    // El portal recorta a 100 % la propina que supera la cuenta: ese 100 % no es lo que escribió.
    expect(propinaDelComensal(43_900, { ...delPortal, porcentaje: 100 })).toBeNull();
    expect(propinaDelComensal(0, delPortal)).toBeNull();
  });

  it('el muro se pone igual: decir lo que escribió no sustituye a confirmarlo', () => {
    expect(propinaPorConfirmar(delPortal)).toBe(true);
    expect(propinaPrevista(43_900, delPortal)).toBe(0);
  });
});
