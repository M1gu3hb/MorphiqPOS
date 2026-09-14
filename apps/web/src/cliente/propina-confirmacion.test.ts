import { describe, expect, it } from 'vitest';

import { requiereConfirmarPropinaAntesDeCobrar } from '../../heredado/utils/tipsUtils.js';

describe('confirmación de propina antes del cobro', () => {
  it('deja cobrar al segundo intento una propina manual confirmada en caja', () => {
    const confirmada = { propina_tipo: 'monto_manual', propina_origen: 'caja' };

    expect(requiereConfirmarPropinaAntesDeCobrar(confirmada, {})).toBe(false);
  });

  it('fuerza una sola confirmación para la propina manual que llegó del QR', () => {
    const desdeQr = { propina_tipo: 'monto_manual', propina_origen: 'portal_qr' };
    expect(requiereConfirmarPropinaAntesDeCobrar(desdeQr, {})).toBe(true);

    const confirmadaPorCaja = { ...desdeQr, propina_origen: 'caja' };
    expect(requiereConfirmarPropinaAntesDeCobrar(confirmadaPorCaja, {})).toBe(false);
  });

  it('sigue forzando los estados realmente pendientes', () => {
    for (const propina_tipo of ['pendiente', 'pendiente_cliente', 'decidir_en_caja']) {
      expect(requiereConfirmarPropinaAntesDeCobrar({ propina_tipo }, {}), propina_tipo).toBe(true);
    }
  });
});
