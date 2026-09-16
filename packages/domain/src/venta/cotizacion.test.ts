import { describe, expect, it } from 'vitest';

import {
  embudo,
  saldoDeSurtido,
  sigueVigente,
  versionSiguiente,
  type LineaCotizada,
} from './cotizacion.ts';

/**
 * F-600, F-601, F-605 y F-607 · La aritmética de la cotización.
 *
 * Las tres cuentas que un error vuelve INVISIBLE: una vigencia mal calculada no
 * falla, honra un precio viejo; un pendiente mal repartido no falla, carga el
 * camión de menos; y un embudo mal contado no falla, miente sobre si el negocio
 * está ganando o perdiendo.
 */

const HOY = new Date('2026-09-15T18:00:00.000Z');

function linea(cambios: Partial<LineaCotizada> = {}): LineaCotizada {
  return { id: 'l1', cantidad: '10.0000', surtida: '0.0000', totalCentavos: 100_000n, ...cambios };
}

describe('F-600 · la vigencia', () => {
  it('el día que vence TODAVÍA se honra', () => {
    // Compararla contra el instante la mataría a las 00:00:01 de ese día, y el
    // cliente que llega a mediodía con el papel en la mano tendría razón.
    expect(sigueVigente('2026-09-15', HOY)).toBe(true);
  });

  it('el día siguiente ya no', () => {
    expect(sigueVigente('2026-09-14', HOY)).toBe(false);
  });

  it('una fecha futura sigue viva', () => {
    expect(sigueVigente('2026-10-01', HOY)).toBe(true);
  });

  it('rechaza lo que no es una fecha de día', () => {
    expect(() => sigueVigente('2026-09-15T00:00:00Z', HOY)).toThrow();
  });
});

describe('F-601 · la versión', () => {
  it('avanza de uno en uno', () => {
    expect(versionSiguiente(1)).toBe(2);
    expect(versionSiguiente(7)).toBe(8);
  });

  it('rechaza una versión que no es un entero de uno para arriba', () => {
    expect(() => versionSiguiente(0)).toThrow();
    expect(() => versionSiguiente(1.5)).toThrow();
  });
});

describe('F-605 · lo que falta por surtir', () => {
  it('sin surtir nada, falta el documento entero', () => {
    const saldo = saldoDeSurtido([linea(), linea({ id: 'l2', totalCentavos: 50_000n })]);

    expect(saldo.completa).toBe(false);
    expect(saldo.lineasPendientes).toBe(2);
    expect(saldo.pendienteCentavos).toBe(150_000n);
  });

  it('la línea completa NO cuenta como pendiente', () => {
    const saldo = saldoDeSurtido([
      linea({ surtida: '10.0000' }),
      linea({ id: 'l2', cantidad: '4.0000', surtida: '1.0000', totalCentavos: 40_000n }),
    ]);

    expect(saldo.lineasPendientes).toBe(1);
    // Tres cuartos de $400: $300.
    expect(saldo.pendienteCentavos).toBe(30_000n);
  });

  it('el reparto es a PRORRATA del total ya calculado, no del precio', () => {
    // La línea trae $900 por 10 unidades porque lleva un descuento: rehacer la
    // multiplicación aquí daría $1,000 y el camión saldría con material de más.
    const saldo = saldoDeSurtido([linea({ surtida: '4.0000', totalCentavos: 90_000n })]);

    expect(saldo.pendienteCentavos).toBe(54_000n);
  });

  it('el redondeo cae hacia abajo, y por eso nunca pasa del total', () => {
    // Un tercio de $100 son $33.33…: se queda en 33 y no en 34, para que la
    // suma de los pendientes no supere lo que el cliente aprobó.
    const saldo = saldoDeSurtido([
      linea({ cantidad: '3.0000', surtida: '2.0000', totalCentavos: 100n }),
    ]);

    expect(saldo.pendienteCentavos).toBe(33n);
  });

  it('todo surtido es una cotización completa', () => {
    const saldo = saldoDeSurtido([linea({ surtida: '10.0000' })]);

    expect(saldo.completa).toBe(true);
    expect(saldo.pendienteCentavos).toBe(0n);
  });

  it('más surtido que pedido es un error y no un saldo negativo', () => {
    expect(() => saldoDeSurtido([linea({ surtida: '11.0000' })])).toThrow();
  });

  it('rechaza una cantidad con más de cuatro decimales', () => {
    expect(() => saldoDeSurtido([linea({ cantidad: '1.00001' })])).toThrow();
  });
});

describe('F-607 · el embudo', () => {
  it('las ABIERTAS no entran en la tasa de cierre', () => {
    // Meterlas en el denominador haría que la tasa bajara cada vez que se
    // cotiza más: un mes con veinte abiertas parecería peor que uno con dos.
    const e = embudo([
      { estado: 'ganada', totalCentavos: 100_000n },
      { estado: 'perdida', totalCentavos: 50_000n },
      { estado: 'enviada', totalCentavos: 900_000n },
      { estado: 'borrador', totalCentavos: 900_000n },
    ]);

    expect(e.cotizadas).toBe(4);
    expect(e.tasaDeCierreBp).toBe(5000);
  });

  it('la VENCIDA cuenta como perdida', () => {
    // El cliente no dijo que no, pero el negocio tampoco la ganó. Esconderla
    // haría que la tasa subiera cada vez que se deja morir una sin seguimiento.
    const e = embudo([
      { estado: 'ganada', totalCentavos: 100_000n },
      { estado: 'vencida', totalCentavos: 100_000n },
    ]);

    expect(e.perdidas).toBe(1);
    expect(e.tasaDeCierreBp).toBe(5000);
    expect(e.montoPerdidoCentavos).toBe(100_000n);
  });

  it('sin cerradas, la tasa es cero y no una división por cero', () => {
    const e = embudo([{ estado: 'enviada', totalCentavos: 100_000n }]);

    expect(e.tasaDeCierreBp).toBe(0);
    expect(e.montoGanadoCentavos).toBe(0n);
  });

  it('separa el dinero ganado del perdido', () => {
    const e = embudo([
      { estado: 'ganada', totalCentavos: 240_000n },
      { estado: 'ganada', totalCentavos: 60_000n },
      { estado: 'perdida', totalCentavos: 700_000n },
    ]);

    expect(e.montoGanadoCentavos).toBe(300_000n);
    expect(e.montoPerdidoCentavos).toBe(700_000n);
    // Dos de tres: 6 666 puntos base.
    expect(e.tasaDeCierreBp).toBe(6667);
  });
});
