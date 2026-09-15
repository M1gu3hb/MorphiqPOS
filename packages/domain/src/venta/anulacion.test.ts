import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { elConsumoSePerdio, partirLineaParaAnular, type LineaAnulable } from './anulacion.ts';

/**
 * F-324 · Anular parte de una línea sin perder ni inventar un centavo.
 *
 * Lo que estas pruebas vigilan es UNA cosa: **las dos porciones suman lo que
 * sumaba la línea.** Una anulación que pierda un centavo cada vez descuadra el
 * corte todas las noches por poquito, y eso nadie lo investiga.
 */

function linea(cantidad: string, subtotal: bigint, descuento = 0n): LineaAnulable {
  return {
    cantidad,
    subtotalCentavos: subtotal,
    descuentoCentavos: descuento,
    totalCentavos: subtotal - descuento,
  };
}

function codigo(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-324 · las dos porciones suman la línea', () => {
  it('sin cantidad, se anula entera y no queda nada que cobrar', () => {
    const r = partirLineaParaAnular(linea('3.0000', 30_000n));
    expect(r.restante).toBeNull();
    expect(r.anulada.cantidad).toBe('3.0000');
    expect(r.anulada.totalCentavos).toBe(30_000n);
  });

  it('una de tres hamburguesas', () => {
    const r = partirLineaParaAnular(linea('3.0000', 30_000n), '1.0000');
    expect(r.anulada.cantidad).toBe('1.0000');
    expect(r.anulada.totalCentavos).toBe(10_000n);
    expect(r.restante?.cantidad).toBe('2.0000');
    expect(r.restante?.totalCentavos).toBe(20_000n);
  });

  it('EL IMPORTE QUE NO CAE EXACTO no pierde ni inventa centavos', () => {
    // $437 de vino en 3 copas, se anula 1.
    const r = partirLineaParaAnular(linea('3.0000', 43_700n), '1.0000');
    expect(r.anulada.subtotalCentavos + (r.restante?.subtotalCentavos ?? 0n)).toBe(43_700n);
    expect(r.anulada.totalCentavos + (r.restante?.totalCentavos ?? 0n)).toBe(43_700n);
  });

  it('una línea de PESO, que es donde el punto flotante mata', () => {
    // 0.350 kg de arrachera a $1 234.56; se anulan 0.120 kg.
    const r = partirLineaParaAnular(linea('0.3500', 43_210n), '0.1200');
    expect(r.anulada.cantidad).toBe('0.1200');
    expect(r.restante?.cantidad).toBe('0.2300');
    expect(r.anulada.subtotalCentavos + (r.restante?.subtotalCentavos ?? 0n)).toBe(43_210n);
  });

  it('cuadra para cientos de importes y de cortes, no sólo para el ejemplo', () => {
    for (let importe = 1; importe <= 500; importe += 1) {
      for (const [cantidad, corte] of [
        ['3.0000', '1.0000'],
        ['4.0000', '3.0000'],
        ['7.0000', '2.0000'],
        ['1.0000', '0.5000'],
        ['0.3500', '0.1200'],
      ] as const) {
        const r = partirLineaParaAnular(linea(cantidad, BigInt(importe), 1n), corte);
        const sub = r.anulada.subtotalCentavos + (r.restante?.subtotalCentavos ?? 0n);
        const desc = r.anulada.descuentoCentavos + (r.restante?.descuentoCentavos ?? 0n);
        expect(sub, `${importe} en ${cantidad}/${corte}`).toBe(BigInt(importe));
        expect(desc, `descuento de ${importe} en ${cantidad}/${corte}`).toBe(1n);
      }
    }
  });

  it('las cantidades también suman: nada de 2.9999 de tres', () => {
    const r = partirLineaParaAnular(linea('3.0000', 30_000n), '1.3300');
    expect(r.anulada.cantidad).toBe('1.3300');
    expect(r.restante?.cantidad).toBe('1.6700');
  });
});

describe('F-324 · lo que rechaza', () => {
  it('anular más de lo que hay — la línea fantasma', () => {
    expect(codigo(() => partirLineaParaAnular(linea('2.0000', 20_000n), '3.0000'))).toBe(
      'CANTIDAD_INVALIDA',
    );
  });

  it('anular cero', () => {
    expect(codigo(() => partirLineaParaAnular(linea('2.0000', 20_000n), '0'))).toBe(
      'CANTIDAD_INVALIDA',
    );
  });

  it('anular en negativo — el camino corto para INFLAR una cuenta', () => {
    expect(codigo(() => partirLineaParaAnular(linea('2.0000', 20_000n), '-1.0000'))).toBe(
      'CANTIDAD_INVALIDA',
    );
  });

  it('una línea sin cantidad', () => {
    expect(codigo(() => partirLineaParaAnular(linea('0', 0n)))).toBe('CANTIDAD_INVALIDA');
  });
});

describe('F-324 · si el insumo vuelve al almacén', () => {
  it('lo que cocina no tomó todavía, vuelve', () => {
    expect(elConsumoSePerdio('pendiente')).toBe(false);
  });

  it('LO QUE YA SE PREPARÓ NO VUELVE A LA OLLA, aunque nadie lo pague', () => {
    for (const estado of ['en_preparacion', 'listo', 'entregado']) {
      expect(elConsumoSePerdio(estado), estado).toBe(true);
    }
  });
});
