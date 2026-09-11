import { describe, expect, it } from 'vitest';

import { esErrorDominio } from '@morphiqpos/contracts';

import { repartirPagos } from './pagos.ts';

/**
 * Pruebas del reparto de pagos.
 *
 * Es la única aritmética del cobro que no necesita base de datos, y es donde se
 * decide si el dinero cuadra. Por eso está aquí y por eso el arnés de mutación
 * la ataca (`verify:venta`).
 */

function codigoDe(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`;
  }
  return 'NO_LANZO';
}

describe('repartirPagos', () => {
  it('acepta un pago exacto en efectivo sin cambio', () => {
    const pagos = repartirPagos([{ metodo: 'efectivo', montoCentavos: 15000 }], 15000n);

    expect(pagos).toHaveLength(1);
    expect(pagos[0]?.montoCentavos).toBe(15000n);
    expect(pagos[0]?.cambioCentavos).toBe(0n);
  });

  it('calcula el cambio a partir de lo recibido', () => {
    const pagos = repartirPagos(
      [{ metodo: 'efectivo', montoCentavos: 15000, recibidoCentavos: 20000 }],
      15000n,
    );

    expect(pagos[0]?.recibidoCentavos).toBe(20000n);
    expect(pagos[0]?.cambioCentavos).toBe(5000n);
  });

  it('reparte un pago mixto en varias filas, cada una con su método', () => {
    const pagos = repartirPagos(
      [
        { metodo: 'tarjeta', montoCentavos: 10000, referencia: '4242' },
        { metodo: 'efectivo', montoCentavos: 5000, recibidoCentavos: 5000 },
      ],
      15000n,
    );

    expect(pagos.map((p) => p.metodo)).toEqual(['tarjeta', 'efectivo']);
    expect(pagos[0]?.referencia).toBe('4242');
    // P1-11: el arqueo pide billetes sólo por la parte en efectivo.
    expect(pagos.reduce((s, p) => (p.metodo === 'efectivo' ? s + p.montoCentavos : s), 0n)).toBe(
      5000n,
    );
  });

  it('rechaza si falta dinero', () => {
    expect(
      codigoDe(() => repartirPagos([{ metodo: 'efectivo', montoCentavos: 14999 }], 15000n)),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('rechaza si el pago excede el total', () => {
    // Un centavo de más se quedaría en la caja sin registrar y el arqueo
    // saldría sobrado sin que nadie sepa de qué venta salió.
    expect(
      codigoDe(() => repartirPagos([{ metodo: 'tarjeta', montoCentavos: 15001 }], 15000n)),
    ).toBe('PAGO_NO_CUADRA');
  });

  it('rechaza una lista de pagos vacía', () => {
    expect(codigoDe(() => repartirPagos([], 15000n))).toBe('PAGO_NO_CUADRA');
  });

  it('rechaza un renglón de importe cero o negativo', () => {
    expect(codigoDe(() => repartirPagos([{ metodo: 'efectivo', montoCentavos: 0 }], 0n))).toBe(
      'PAGO_NO_CUADRA',
    );
  });

  it('rechaza efectivo recibido menor que su importe', () => {
    expect(
      codigoDe(() =>
        repartirPagos(
          [{ metodo: 'efectivo', montoCentavos: 15000, recibidoCentavos: 10000 }],
          15000n,
        ),
      ),
    ).toBe('EFECTIVO_INSUFICIENTE');
  });

  it('no devuelve cambio en tarjeta ni transferencia', () => {
    const pagos = repartirPagos(
      [
        { metodo: 'tarjeta', montoCentavos: 5000, recibidoCentavos: 9999 },
        { metodo: 'transferencia', montoCentavos: 5000, recibidoCentavos: 9999 },
      ],
      10000n,
    );

    for (const pago of pagos) {
      expect(pago.cambioCentavos).toBe(0n);
      expect(pago.recibidoCentavos).toBeNull();
    }
  });

  it('no pierde precisión con importes por encima del entero seguro de JS', () => {
    // Number.MAX_SAFE_INTEGER es 9_007_199_254_740_991. Con `number` esto
    // redondearía; con bigint cuadra exacto.
    const total = 9_007_199_254_740_993n;
    const pagos = repartirPagos(
      [
        { metodo: 'tarjeta', montoCentavos: 4_503_599_627_370_496 },
        { metodo: 'tarjeta', montoCentavos: 4_503_599_627_370_497 },
      ],
      total,
    );

    expect(pagos.reduce((s, p) => s + p.montoCentavos, 0n)).toBe(total);
  });
});
