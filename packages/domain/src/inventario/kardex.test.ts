import { describe, expect, it } from 'vitest';

import { deEscalaCompleta, enEscalaCompleta } from './escala.ts';
import { resumirKardex, type RenglonKardex } from './kardex.ts';

/**
 * F-103 · El resumen del kardex.
 *
 * Lo que se prueba es lo que la pantalla enseña ARRIBA de la lista: entró
 * tanto, salió tanto, queda tanto y vale tanto. Es la parte que, si se calcula
 * en la pantalla, acaba calculándose distinto en las dos pantallas que lo
 * enseñan.
 */

const CUANDO = new Date('2026-09-15T10:00:00.000Z');

function renglon(cambios: Partial<RenglonKardex> = {}): RenglonKardex {
  return {
    movimientoId: 'm1',
    tipo: 'entrada',
    motivo: null,
    cantidad: '10.0000',
    saldo: '10.0000',
    importeCentavos: 5000n,
    cuando: CUANDO,
    ...cambios,
  };
}

describe('F-103 · resumirKardex', () => {
  it('un kardex vacío no es un error: es un artículo que nunca se movió', () => {
    const resumen = resumirKardex([]);

    expect(resumen.renglones).toBe(0);
    expect(resumen.saldoFinal).toBe('0.0000');
    expect(resumen.valorFinalCentavos).toBe(0n);
  });

  it('separa entradas de salidas, y enseña las salidas EN POSITIVO', () => {
    const resumen = resumirKardex([
      renglon({ movimientoId: 'm1', cantidad: '10.0000', saldo: '10.0000' }),
      renglon({ movimientoId: 'm2', cantidad: '-3.5000', saldo: '6.5000', tipo: 'salida_venta' }),
      renglon({ movimientoId: 'm3', cantidad: '-1.5000', saldo: '5.0000', tipo: 'salida_venta' }),
    ]);

    expect(resumen.entradas).toBe('10.0000');
    // «5.0000» se lee; «-5.0000» obliga a leer el signo antes que el número.
    expect(resumen.salidas).toBe('5.0000');
    expect(resumen.saldoFinal).toBe('5.0000');
  });

  it('el saldo final es el del ÚLTIMO renglón, no la suma de las cantidades', () => {
    // Esta página empieza a mitad de la historia: el primer renglón ya trae
    // saldo acumulado de antes. Sumar cantidades daría 2.0000 y sería falso.
    const resumen = resumirKardex([
      renglon({ movimientoId: 'm7', cantidad: '4.0000', saldo: '104.0000' }),
      renglon({ movimientoId: 'm8', cantidad: '-2.0000', saldo: '102.0000' }),
    ]);

    expect(resumen.saldoFinal).toBe('102.0000');
  });

  it('valúa el saldo al costo del último movimiento QUE TENGA costo', () => {
    const resumen = resumirKardex([
      // 10 unidades a $12.00 cada una.
      renglon({
        movimientoId: 'm1',
        cantidad: '10.0000',
        saldo: '10.0000',
        importeCentavos: 12_000n,
      }),
      // Un ajuste de conteo: sin costo unitario.
      renglon({
        movimientoId: 'm2',
        cantidad: '-1.0000',
        saldo: '9.0000',
        tipo: 'ajuste',
        importeCentavos: 0n,
      }),
    ]);

    // Si valuara con el último renglón, el almacén valdría cero justo el día en
    // que se acaba de contar — que es cuando alguien mira el número.
    expect(resumen.valorFinalCentavos).toBe(10_800n);
  });

  it('el costo sale igual de una salida que de una entrada', () => {
    const resumen = resumirKardex([
      renglon({ movimientoId: 'm1', cantidad: '10.0000', saldo: '10.0000', importeCentavos: 0n }),
      // Salida de 2 a $7.50: importe y cantidad los dos negativos.
      renglon({
        movimientoId: 'm2',
        cantidad: '-2.0000',
        saldo: '8.0000',
        importeCentavos: -1500n,
      }),
    ]);

    expect(resumen.valorFinalCentavos).toBe(6000n);
  });

  it('cuenta los renglones con motivo: son los que disparan una revisión', () => {
    const resumen = resumirKardex([
      renglon({ movimientoId: 'm1', motivo: null }),
      renglon({ movimientoId: 'm2', motivo: '   ', cantidad: '1.0000', saldo: '11.0000' }),
      renglon({ movimientoId: 'm3', motivo: 'robo', cantidad: '-1.0000', saldo: '10.0000' }),
    ]);

    // El motivo en blanco no cuenta: un espacio no explica nada.
    expect(resumen.conMotivo).toBe(1);
  });

  it('un saldo negativo se resume igual, porque es un dato que hay que ver', () => {
    const resumen = resumirKardex([
      renglon({
        movimientoId: 'm1',
        cantidad: '-2.0000',
        saldo: '-2.0000',
        importeCentavos: -400n,
      }),
    ]);

    // Esconder un saldo negativo es esconder la venta que se hizo sin
    // existencia. Se enseña, con su valor negativo, para que se investigue.
    expect(resumen.saldoFinal).toBe('-2.0000');
    expect(resumen.valorFinalCentavos).toBe(-400n);
  });

  it('no pierde centavos al valuar un artículo barato con mucha existencia', () => {
    // 1 200 piezas a $0.37. Dividir en dos pasos perdería los 44 centavos.
    const resumen = resumirKardex([
      renglon({
        movimientoId: 'm1',
        cantidad: '1200.0000',
        saldo: '1200.0000',
        importeCentavos: 44_400n,
      }),
    ]);

    expect(resumen.valorFinalCentavos).toBe(44_400n);
  });
});

describe('la escala con signo, que tres módulos comparten', () => {
  it('escribe siempre los cuatro decimales, porque es lo que compara Postgres', () => {
    expect(enEscalaCompleta(40_000n)).toBe('4.0000');
    expect(enEscalaCompleta(-45_000n)).toBe('-4.5000');
    expect(enEscalaCompleta(0n)).toBe('0.0000');
  });

  it('lee el negativo, que es justo lo que `cantidad()` rechaza', () => {
    expect(deEscalaCompleta('-4.5')).toBe(-45_000n);
    expect(deEscalaCompleta('4')).toBe(40_000n);
  });

  it('rechaza el quinto decimal en vez de truncarlo en silencio', () => {
    expect(() => deEscalaCompleta('1.00001')).toThrow();
  });

  it('va y vuelve sin perder nada', () => {
    for (const valor of [-123_4567n, 0n, 1n, 99_999_999_999_999n]) {
      expect(deEscalaCompleta(enEscalaCompleta(valor))).toBe(valor);
    }
  });
});
