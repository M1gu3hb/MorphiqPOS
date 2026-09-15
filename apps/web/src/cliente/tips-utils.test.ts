import { describe, expect, it } from 'vitest';

import {
  agruparPropinasPorMesero,
  desgloseMetodosPagoExacto,
  filtrarVentasConPropina,
  propinaDerivada,
  sumarPropinas,
} from '../../heredado/utils/tipsUtils.js';

const VENTA_POR_PORCENTAJE = {
  id: 'venta-porcentaje',
  estado: 'pagada',
  total: 439,
  propina_tipo: 'porcentaje',
  propina_porcentaje: 10,
  usuario_mesero_id: 'mesero-1',
  usuario_mesero_nombre: 'Toño',
};

describe('propinas que llegan por el puente', () => {
  it('prefiere el importe exacto agregado desde pagos', () => {
    expect(
      propinaDerivada({
        ...VENTA_POR_PORCENTAJE,
        propina_monto: 43.9,
        propina_porcentaje: 99,
      }),
    ).toBe(43.9);
  });

  it('deriva el importe desde el porcentaje cuando todavía no existe un pago', () => {
    expect(propinaDerivada(VENTA_POR_PORCENTAJE)).toBe(43.9);
    expect(filtrarVentasConPropina([VENTA_POR_PORCENTAJE])).toEqual([VENTA_POR_PORCENTAJE]);
  });

  it('suma y agrupa importes derivados sin depender de propina_monto', () => {
    const manual = {
      ...VENTA_POR_PORCENTAJE,
      id: 'venta-manual',
      total: 200,
      propina_tipo: 'monto_manual',
      propina_porcentaje: 12.5,
    };

    expect(sumarPropinas([VENTA_POR_PORCENTAJE, manual])).toBe(68.9);
    expect(agruparPropinasPorMesero([VENTA_POR_PORCENTAJE, manual])).toEqual([
      {
        mesero_id: 'mesero-1',
        mesero_nombre: 'Toño',
        total: 68.9,
        num_ventas: 2,
        venta_ids: ['venta-porcentaje', 'venta-manual'],
      },
    ]);
  });

  it('conserva el desglose exacto por método y nunca lo prorratea', () => {
    const desglose = desgloseMetodosPagoExacto([
      {
        total: 439,
        propina_monto: 43.9,
        monto_efectivo: 300,
        monto_tarjeta: 182.9,
        monto_transferencia: 0,
        propina_efectivo: 20,
        propina_tarjeta: 23.9,
        propina_transferencia: 0,
      },
    ]);

    expect(desglose.efectivo).toEqual({ ventas: 280, propinas: 20, total: 300 });
    expect(desglose.tarjeta).toEqual({ ventas: 159, propinas: 23.9, total: 182.9 });
    expect(desglose.transferencia).toEqual({ ventas: 0, propinas: 0, total: 0 });
    expect(desglose.propinas_sin_metodo).toBe(0);
  });
});
