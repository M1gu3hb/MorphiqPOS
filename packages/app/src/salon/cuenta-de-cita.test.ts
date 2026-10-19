import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  baseDeLinea,
  cuentaDeCita,
  propinasPorCamino,
  repartirDescuento,
  type PagoPedido,
} from './cuenta-de-cita.ts';

/**
 * C.3 de la etapa 2.4 · La cuenta de una cita, contra `02-DINERO-Y-CAJA` del salón.
 *
 * Cada caso es una frase del documento con su cifra: si el código se aparta, la
 * cifra que falla es la que el salón vería mal en su corte o en la liquidación.
 */

const IVA_INCLUIDO = { tasaPuntosBase: 1600, incluidoEnPrecio: true } as const;

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('repartirDescuento', () => {
  it('SUMA EXACTAMENTE el descuento, aunque no se divida parejo', () => {
    // $100 de descuento entre tres líneas iguales: 33.33 cada una no suma 100.
    const reparto = repartirDescuento([10_000n, 10_000n, 10_000n], 10_000n);
    expect(reparto.reduce((a, p) => a + p, 0n)).toBe(10_000n);
    expect(reparto).toEqual([3_334n, 3_333n, 3_333n]);
  });

  it('EN PROPORCIÓN AL PRECIO: la línea cara se lleva la parte grande', () => {
    expect(repartirDescuento([90_000n, 10_000n], 10_000n)).toEqual([9_000n, 1_000n]);
  });

  it('sin descuento, ceros', () => {
    expect(repartirDescuento([95_000n, 18_000n], 0n)).toEqual([0n, 0n]);
  });
});

describe('cuentaDeCita', () => {
  it('EL IVA SE EXTRAE DEL TOTAL, una vez (§2.1): $1,130 llevan $155.86', () => {
    const cuenta = cuentaDeCita([95_000n, 18_000n], 0, 0n, IVA_INCLUIDO);
    expect(cuenta.totalCentavos).toBe(113_000n);
    expect(cuenta.impuestosCentavos).toBe(15_586n);
  });

  it('EL DESCUENTO DEL 20 % baja el ticket de $1,130 a $904 (§3)', () => {
    const cuenta = cuentaDeCita([95_000n, 18_000n], 2_000, 0n, IVA_INCLUIDO);
    expect(cuenta.descuentoCentavos).toBe(22_600n);
    expect(cuenta.totalCentavos).toBe(90_400n);
    // Y el IVA sale de lo cobrado, no de la lista.
    expect(cuenta.impuestosCentavos).toBe(12_469n);
    expect(cuenta.descuentoPorLinea.reduce((a, p) => a + p, 0n)).toBe(22_600n);
  });

  it('EL ANTICIPO baja lo que se cobra hoy, NO la venta (§6.1)', () => {
    const cuenta = cuentaDeCita([95_000n, 18_000n], 0, 30_000n, IVA_INCLUIDO);
    expect(cuenta.totalCentavos).toBe(113_000n);
    expect(cuenta.porCobrarCentavos).toBe(83_000n);
  });

  it('UN ANTICIPO MAYOR que la cuenta no se cobra callando', () => {
    expect(codigoDe(() => cuentaDeCita([20_000n], 5_000, 15_000n, IVA_INCLUIDO))).toBe(
      'PAGO_NO_CUADRA',
    );
  });
});

describe('baseDeLinea', () => {
  it('LA COMISIÓN VA SIN IVA (§7.2, pregunta 2): $950 son $819 de base', () => {
    const base = baseDeLinea(95_000n, 0n, IVA_INCLUIDO);
    expect(base.cobradoSinIvaCentavos).toBe(81_897n);
    expect(base.listaSinIvaCentavos).toBe(81_897n);
    expect(base.ivaCentavos).toBe(13_103n);
  });

  it('con descuento, lo cobrado y la lista se separan', () => {
    const base = baseDeLinea(95_000n, 19_000n, IVA_INCLUIDO);
    expect(base.cobradoSinIvaCentavos).toBe(65_517n);
    expect(base.listaSinIvaCentavos).toBe(81_897n);
  });
});

describe('propinasPorCamino', () => {
  const efectivo: PagoPedido = { metodo: 'efectivo', montoCentavos: 113_000 };
  const tarjeta: PagoPedido = { metodo: 'tarjeta', montoCentavos: 113_000 };
  const KARLA = 'z1111111-1111-4111-8111-111111111111';

  it('SUMA POR CAMINO, y la de la mano no pide nada', () => {
    const porCamino = propinasPorCamino(
      [
        { profesionalId: KARLA, montoCentavos: 15_000, camino: 'mano' },
        { profesionalId: KARLA, montoCentavos: 5_000, camino: 'cajon' },
      ],
      [efectivo],
      113_000n,
    );
    expect(porCamino).toEqual({ mano: 15_000n, cajon: 5_000n, terminal: 0n });
  });

  it('LA DE TERMINAL sin tarjeta no tiene cargo que la lleve', () => {
    expect(
      codigoDe(() =>
        propinasPorCamino(
          [{ profesionalId: KARLA, montoCentavos: 15_000, camino: 'terminal' }],
          [efectivo],
          113_000n,
        ),
      ),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('LA DE CAJÓN sin efectivo no entró por el cajón', () => {
    expect(
      codigoDe(() =>
        propinasPorCamino(
          [{ profesionalId: KARLA, montoCentavos: 15_000, camino: 'cajon' }],
          [tarjeta],
          113_000n,
        ),
      ),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('UN CERO DE MÁS se rechaza: el tope es diez veces la venta, con piso de $1,000', () => {
    expect(
      codigoDe(() =>
        propinasPorCamino(
          [{ profesionalId: KARLA, montoCentavos: 1_200_000, camino: 'terminal' }],
          [tarjeta],
          113_000n,
        ),
      ),
    ).toBe('PAGO_NO_CUADRA');
  });
});
