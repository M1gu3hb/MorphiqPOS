import type { EstadoCaja } from '@morphiqpos/app/caja';
import { describe, expect, it } from 'vitest';

import { estadoDelSalon, type EstadoCajaDelSalon } from './estado-del-salon.ts';

/**
 * «Caja y corte» del salón lee lo que `caja.estado` DEVUELVE (D.1 de la 2.4): la tabla
 * «El día» pintaba «$NaN» en sus cuatro renglones porque leía campos que el comando no
 * tiene.
 */

describe('el estado de la caja del salón, como lo pinta «El día»', () => {
  it('cobrado de los pagos, y cada salida del cajón con su signo, sin la apertura', () => {
    // TIPADO con el del comando: si `caja.estado` cambia de forma, esto deja de compilar.
    const delComando: EstadoCaja = {
      abierta: true,
      puedeAdministrar: true,
      sesionCajaId: 's1',
      abiertaEn: '2026-10-09T15:40:00.000Z',
      fondoInicialCentavos: '80000',
      ventasCentavos: '226900',
      numeroVentas: 4,
      movimientos: [
        { tipo: 'apertura', montoCentavos: '80000', motivo: null, registradoEn: 'a' },
        { tipo: 'venta', montoCentavos: '25000', motivo: null, registradoEn: 'b' },
        { tipo: 'propina', montoCentavos: '3000', motivo: null, registradoEn: 'c' },
        { tipo: 'gasto', montoCentavos: '-8500', motivo: 'toallas', registradoEn: 'd' },
        { tipo: 'retiro', montoCentavos: '-50000', motivo: 'al banco', registradoEn: 'e' },
        { tipo: 'devolucion', montoCentavos: '-14400', motivo: 'esmalte', registradoEn: 'f' },
        { tipo: 'devolucion', montoCentavos: '-18000', motivo: 'lavado', registradoEn: 'g' },
        { tipo: 'liquidacion', montoCentavos: '-76089', motivo: 'Karla', registradoEn: 'h' },
      ],
    };
    const leido: EstadoCajaDelSalon = delComando;

    const estado = estadoDelSalon(leido);

    expect(estado.sesionCajaId).toBe('s1');
    expect(estado.puedeAdministrar).toBe(true);
    expect(estado.renglones.map((r) => [r.concepto, r.centavos])).toEqual([
      ['Cobrado', 226_900],
      ['Propina al cajón', 3_000],
      ['Gastos pagados del cajón', -8_500],
      ['Devoluciones', -32_400],
      ['Retiros', -50_000],
      ['Liquidaciones pagadas', -76_089],
    ]);
    // Ningún renglón es NaN: es lo que pintaba la pantalla.
    expect(estado.renglones.every((r) => Number.isFinite(r.centavos))).toBe(true);
  });

  it('un día recién abierto enseña lo cobrado y la liquidación en cero, nada inventado', () => {
    const estado = estadoDelSalon({
      abierta: true,
      sesionCajaId: 's1',
      ventasCentavos: '0',
      movimientos: [{ tipo: 'apertura', montoCentavos: '80000' }],
    });

    expect(estado.renglones).toEqual([
      { clave: 'cobrado', concepto: 'Cobrado', centavos: 0 },
      expect.objectContaining({ clave: 'liquidacion', centavos: 0 }),
    ]);
    expect(estado.puedeAdministrar).toBe(false);
  });

  it('cerrada no tiene sesión, y un movimiento que no conoce también se enseña', () => {
    expect(
      estadoDelSalon({ abierta: false, sesionCajaId: null, ventasCentavos: '0', movimientos: [] })
        .sesionCajaId,
    ).toBeNull();
    const conAjuste = estadoDelSalon({
      abierta: true,
      sesionCajaId: 's1',
      ventasCentavos: '0',
      movimientos: [{ tipo: 'ajuste', montoCentavos: '-100' }],
    });
    expect(conAjuste.renglones.at(-1)).toEqual({
      clave: 'ajuste',
      concepto: 'ajuste',
      centavos: -100,
    });
  });
});
