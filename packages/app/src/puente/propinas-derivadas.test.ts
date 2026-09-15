import { describe, expect, it } from 'vitest';

import { calcular } from './consultar.ts';
import { entidadMapeada } from './mapa.ts';

const CAMPOS_DE_PAGO = [
  'propina_monto',
  'propina_efectivo',
  'propina_tarjeta',
  'propina_transferencia',
  'total_cobrado_con_propina',
  'metodo_pago',
  'monto_efectivo',
  'monto_tarjeta',
  'monto_transferencia',
  'cambio',
] as const;

describe('Venta · datos derivados de pagos', () => {
  it('expone cada importe por la vista de pagos y siempre como sólo lectura', () => {
    const venta = entidadMapeada('Venta');
    expect(venta).not.toBeNull();
    if (venta === null) return;

    for (const campo of CAMPOS_DE_PAGO) {
      expect(venta.derivados?.[campo], campo).toMatchObject({
        tabla: 'ordenes_pagos_resumen',
        porColumna: 'id',
        emparejaCon: 'orden_id',
      });
    }
  });

  it('deriva el estado de liquidación de la clave foránea real', () => {
    const venta = entidadMapeada('Venta');
    expect(venta?.calculados?.['propina_liquidada']).toMatchObject({
      formula: 'propinaLiquidada',
    });
    expect(calcular('propinaLiquidada', { propina_liquidacion_id: 'liquidacion-1' })).toBe(true);
    expect(calcular('propinaLiquidada', { propina_liquidacion_id: null })).toBe(false);
  });
});
