import { describe, expect, it } from 'vitest';

import { evaluarCanje, pasivoDeLealtad, sellosDeLaVenta } from './lealtad.ts';

/**
 * F-930, F-934 y F-936 · La aritmética de los sellos.
 *
 * Las tres reglas que la tarjeta de cartón no podía tener: un sello por BEBIDA
 * y no por ticket, el canje no da sellos, y la bolsa de grano tampoco.
 */

describe('F-930 · cuántos sellos deja una venta', () => {
  it('cuenta por UNIDAD, no por ticket', () => {
    // Quien pide tres cafés para su oficina se lleva tres sellos. La tarjeta de
    // cartón sólo podía darle uno porque sólo había una tarjeta.
    expect(
      sellosDeLaVenta([{ productoId: 'p1', cantidad: 3, sellosOtorga: 1, esCanje: false }]),
    ).toBe(3);
  });

  it('la bolsa de grano NO da sellos, y no es un olvido', () => {
    expect(
      sellosDeLaVenta([
        { productoId: 'latte', cantidad: 1, sellosOtorga: 1, esCanje: false },
        { productoId: 'bolsa', cantidad: 2, sellosOtorga: 0, esCanje: false },
      ]),
    ).toBe(1);
  });

  it('el CANJE no da sellos: el sexto café no compra el doceavo', () => {
    // Si los diera, cada premio acercaría el siguiente y el programa se pagaría
    // a sí mismo: con cinco por premio, el costo real bajaría un 20 % sin que
    // nadie lo viera hasta el cierre del año.
    expect(
      sellosDeLaVenta([
        { productoId: 'latte', cantidad: 1, sellosOtorga: 1, esCanje: false },
        { productoId: 'latte', cantidad: 1, sellosOtorga: 1, esCanje: true },
      ]),
    ).toBe(1);
  });

  it('una venta sin nada que dé sellos da cero, no falla', () => {
    expect(
      sellosDeLaVenta([{ productoId: 'bolsa', cantidad: 5, sellosOtorga: 0, esCanje: false }]),
    ).toBe(0);
  });

  it('rechaza media bebida: un sello no se parte', () => {
    expect(() =>
      sellosDeLaVenta([{ productoId: 'p1', cantidad: 1.5, sellosOtorga: 1, esCanje: false }]),
    ).toThrow();
  });

  it('rechaza un producto que otorgue sellos negativos', () => {
    expect(() =>
      sellosDeLaVenta([{ productoId: 'p1', cantidad: 1, sellosOtorga: -1, esCanje: false }]),
    ).toThrow();
  });
});

describe('F-934 · el canje', () => {
  it('alcanza justo en el borde', () => {
    expect(evaluarCanje({ saldo: 5, sellosPorPremio: 5 })).toEqual({
      puede: true,
      sellosQueCuesta: 5,
      saldoDespues: 0,
    });
  });

  it('cuando no alcanza, dice CUÁNTOS faltan', () => {
    // «Le faltan dos» es una frase que el barista puede decir en voz alta. «No
    // alcanza» obliga a la clienta a preguntar y al barista a contar.
    expect(evaluarCanje({ saldo: 3, sellosPorPremio: 5 })).toEqual({ puede: false, faltan: 2 });
  });

  it('el saldo NUNCA queda negativo', () => {
    const v = evaluarCanje({ saldo: 0, sellosPorPremio: 5 });
    expect(v.puede).toBe(false);
  });

  it('rechaza canjear sin saber cuánto cuesta un premio', () => {
    expect(() => evaluarCanje({ saldo: 99, sellosPorPremio: 0 })).toThrow();
  });
});

describe('F-936 · el pasivo', () => {
  it('cuenta sólo los premios COMPLETOS', () => {
    // Trece sellos con cinco por premio son dos premios exigibles y tres sellos
    // a mitad de camino. Contar la fracción daría una deuda que nadie puede
    // reclamar hoy.
    expect(
      pasivoDeLealtad({ sellosVivos: 13, sellosPorPremio: 5, costoPremioCentavos: 1800n }),
    ).toBe(3600n);
  });

  it('valúa al COSTO, no al precio', () => {
    // Un premio no es una venta perdida: es un café que se regala, y lo que sale
    // del negocio es lo que ese café cuesta hacer. Al precio, el pasivo se
    // inflaría entre dos y cuatro veces — y un pasivo inflado se deja de mirar.
    expect(
      pasivoDeLealtad({ sellosVivos: 5, sellosPorPremio: 5, costoPremioCentavos: 1800n }),
    ).toBe(1800n);
  });

  it('sin sellos vivos no hay deuda', () => {
    expect(
      pasivoDeLealtad({ sellosVivos: 0, sellosPorPremio: 5, costoPremioCentavos: 1800n }),
    ).toBe(0n);
  });

  it('cuatro sellos con cinco por premio son cero pesos de deuda exigible', () => {
    expect(
      pasivoDeLealtad({ sellosVivos: 4, sellosPorPremio: 5, costoPremioCentavos: 1800n }),
    ).toBe(0n);
  });

  it('rechaza valuar sin saber cuánto cuesta un premio', () => {
    expect(() =>
      pasivoDeLealtad({ sellosVivos: 10, sellosPorPremio: 0, costoPremioCentavos: 1800n }),
    ).toThrow();
  });

  it('rechaza sellos vivos negativos: eso es un ledger roto', () => {
    expect(() =>
      pasivoDeLealtad({ sellosVivos: -1, sellosPorPremio: 5, costoPremioCentavos: 1800n }),
    ).toThrow();
  });
});
