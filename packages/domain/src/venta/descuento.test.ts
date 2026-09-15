import { describe, expect, it } from 'vitest';

import { evaluarDescuento, puedeAutorizar, type TopeDePuesto } from './descuento.ts';

/**
 * F-205 · El tope de descuento.
 *
 * Lo que se prueba es por qué hacen falta LOS DOS topes. Con sólo el de pesos,
 * un café de $45 se regala entero; con sólo el porcentual, el 10 % de una
 * charola de cincuenta son doscientos pesos que nadie autorizó.
 */

const CAJERO: TopeDePuesto = { topeCentavos: 5000n, topeBp: 1000 };

describe('F-205 · el tope en pesos', () => {
  it('deja pasar lo que cabe', () => {
    // $40 de descuento sobre $500: cabe en los $50 y en el 10 %… no, es el 8 %.
    expect(
      evaluarDescuento({ baseCentavos: 50_000n, descuentoCentavos: 4000n, tope: CAJERO }),
    ).toEqual({ veredicto: 'libre' });
  });

  it('pide autorización cuando el IMPORTE se pasa, y lo dice por su nombre', () => {
    const v = evaluarDescuento({
      baseCentavos: 200_000n,
      descuentoCentavos: 10_000n,
      tope: CAJERO,
    });

    expect(v.veredicto).toBe('requiere_autorizacion');
    // «Tu tope son $50 y esto son $100» se entiende con gente esperando.
    // «Tu tope es el 10 %» obliga a hacer una regla de tres en el mostrador.
    if (v.veredicto === 'requiere_autorizacion') expect(v.porque).toBe('importe');
  });
});

describe('F-205 · el tope porcentual, que es el que tapa el otro extremo', () => {
  it('impide regalar un café entero aunque quepa en el tope de pesos', () => {
    // $45 de descuento sobre una venta de $45: cabe en los $50 del cajero.
    const v = evaluarDescuento({
      baseCentavos: 4500n,
      descuentoCentavos: 4500n,
      tope: CAJERO,
    });

    expect(v.veredicto).toBe('requiere_autorizacion');
    if (v.veredicto === 'requiere_autorizacion') expect(v.porque).toBe('porcentaje');
  });

  it('el borde exacto del porcentaje SÍ cabe: el tope es «hasta», no «menos de»', () => {
    // 10 % exacto de $300 son $30, y el cajero tiene 1000 bp.
    expect(
      evaluarDescuento({ baseCentavos: 30_000n, descuentoCentavos: 3000n, tope: CAJERO }),
    ).toEqual({ veredicto: 'libre' });
  });

  it('un centavo por encima del borde ya no cabe', () => {
    expect(
      evaluarDescuento({ baseCentavos: 30_000n, descuentoCentavos: 3001n, tope: CAJERO }).veredicto,
    ).toBe('requiere_autorizacion');
  });

  it('no pierde precisión en el porcentaje: se calcula con enteros', () => {
    // 20 % exacto de una venta de $333.33. Con coma flotante esto sale
    // 20.000000000000004 y se rechazaría un descuento que sí cabe.
    const tope: TopeDePuesto = { topeCentavos: 100_000n, topeBp: 2000 };
    expect(evaluarDescuento({ baseCentavos: 33_333n, descuentoCentavos: 6666n, tope })).toEqual({
      veredicto: 'libre',
    });
  });
});

describe('F-205 · lo que no es un descuento', () => {
  it('rechaza un descuento de cero', () => {
    expect(() =>
      evaluarDescuento({ baseCentavos: 10_000n, descuentoCentavos: 0n, tope: CAJERO }),
    ).toThrow();
  });

  it('rechaza un descuento mayor que la venta', () => {
    expect(() =>
      evaluarDescuento({ baseCentavos: 10_000n, descuentoCentavos: 20_000n, tope: CAJERO }),
    ).toThrow();
  });

  it('rechaza descontar sobre una venta sin importe', () => {
    expect(() =>
      evaluarDescuento({ baseCentavos: 0n, descuentoCentavos: 100n, tope: CAJERO }),
    ).toThrow();
  });
});

describe('F-205 · quién puede autorizar', () => {
  const GERENTE: TopeDePuesto = { topeCentavos: 200_000n, topeBp: 3000 };

  it('puede quien cubre el descuento ENTERO con su propio tope', () => {
    expect(puedeAutorizar(10_000n, 200_000n, GERENTE)).toBe(true);
  });

  it('NO puede quien sólo tiene «más tope» pero no suficiente', () => {
    // Un gerente con tope de $2 000 autorizando uno de $5 000 no es una
    // autorización: es la misma falta de tope, con una firma encima.
    expect(puedeAutorizar(500_000n, 2_000_000n, GERENTE)).toBe(false);
  });

  it('tampoco puede si se pasa del porcentaje, aunque el importe quepa', () => {
    // $1 500 de descuento sobre una venta de $2 000 son el 75 %.
    expect(puedeAutorizar(150_000n, 200_000n, GERENTE)).toBe(false);
  });

  it('nadie autoriza sobre una venta sin importe', () => {
    expect(puedeAutorizar(100n, 0n, GERENTE)).toBe(false);
  });
});
