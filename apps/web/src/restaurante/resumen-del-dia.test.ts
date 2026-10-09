import { describe, expect, it } from 'vitest';

import { esperadoEnCaja, resumirDia, type VentaDelDia } from './resumen-del-dia.ts';

/**
 * El dinero del día del restaurante (auditoría de la 2.4).
 *
 * El puente sirve `Venta` en PESOS. `monto_*` es lo cobrado por método —venta MÁS
 * propina—, y la pantalla lo leía como venta: con una propina de $75 en efectivo el
 * esperado del cajón salía $75 de más y un conteo correcto decía «FALTA».
 */

function venta(cambios: Partial<VentaDelDia>): VentaDelDia {
  return {
    id: 'v1',
    estado: 'pagada',
    total: 500,
    costo_total_snapshot: 200,
    propina_efectivo: 0,
    propina_tarjeta: 0,
    propina_transferencia: 0,
    monto_efectivo: 0,
    monto_tarjeta: 0,
    monto_transferencia: 0,
    usuario_mesero_nombre: 'Ana',
    fecha_apertura: '2026-09-26T18:00:00.000Z',
    ...cambios,
  };
}

describe('el resumen del día del restaurante', () => {
  it('LA PROPINA NO SE CUENTA DOS VECES: fondo $1,000 + venta $500 + propina $75 = $1,575', () => {
    const resumen = resumirDia([venta({ monto_efectivo: 575, propina_efectivo: 75 })], []);

    expect(resumen.porCanal.efectivo).toBe(50_000);
    expect(resumen.propinas.efectivo).toBe(7_500);
    expect(esperadoEnCaja({ fondoInicial: 100_000 }, resumen)).toBe(157_500);
  });

  it('la propina no es venta ni utilidad', () => {
    const resumen = resumirDia([venta({ monto_tarjeta: 580, propina_tarjeta: 80 })], []);

    expect(resumen.ventas).toBe(50_000);
    expect(resumen.utilidad).toBe(30_000);
    expect(resumen.porCanal.tarjeta).toBe(50_000);
    expect(resumen.propinas.tarjeta).toBe(8_000);
  });

  it('mixto: cada método con lo suyo, y la suma de los canales es la venta', () => {
    const resumen = resumirDia(
      [
        venta({
          monto_efectivo: 200,
          propina_efectivo: 0,
          monto_tarjeta: 340,
          propina_tarjeta: 40,
        }),
      ],
      [],
    );

    expect(resumen.porCanal.efectivo + resumen.porCanal.tarjeta).toBe(resumen.ventas);
  });

  it('el gasto en efectivo sale del cajón; el de tarjeta no', () => {
    const resumen = resumirDia(
      [venta({ monto_efectivo: 500 })],
      [
        { id: 'g1', monto: 120, metodo_pago: 'efectivo' },
        { id: 'g2', monto: 300, metodo_pago: 'tarjeta' },
      ],
    );

    expect(esperadoEnCaja({ fondoInicial: 100_000 }, resumen)).toBe(138_000);
    expect(resumen.neta).toBe(30_000 - 42_000);
  });
});
