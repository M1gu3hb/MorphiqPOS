import { describe, expect, it } from 'vitest';

import { ESTADOS_DE_UNA_VENTA_COBRADA, esVentaCobrada } from './ventas-del-registro.ts';

/** Los trece estados de `ordenes_estado_check` (102), tal como los sirve el puente. */
const ESTADOS_DEL_PUENTE = [
  'abierta', // `borrador` en la base: el puente lo traduce
  'enviada', // `confirmada`
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
  'parcialmente_pagada',
  'pagada',
  'parcialmente_reembolsada',
  'reembolsada',
  'cancelada',
  'dividida',
  'absorbida',
  'suspendida',
];

describe('qué cuentas son una venta en el registro', () => {
  it('una cuenta pagada es una venta', () => {
    expect(esVentaCobrada({ estado: 'pagada', total: 883 })).toBe(true);
  });

  it('una cuenta que cobró y luego devolvió algo sigue siendo una venta', () => {
    expect(esVentaCobrada({ estado: 'parcialmente_reembolsada' })).toBe(true);
    expect(esVentaCobrada({ estado: 'reembolsada' })).toBe(true);
  });

  it('la cuenta cancelada de la mesa 6 NO cobró nada: no es una venta', () => {
    expect(esVentaCobrada({ estado: 'cancelada', total: 384 })).toBe(false);
  });

  it('la madre de una división NO cobró: cobraron sus dos hijas', () => {
    expect(esVentaCobrada({ estado: 'dividida', total: 1437 })).toBe(false);
  });

  it('ninguna cuenta que sigue abierta, pedida, apartada o absorbida es una venta', () => {
    for (const estado of ESTADOS_DEL_PUENTE) {
      if (ESTADOS_DE_UNA_VENTA_COBRADA.includes(estado)) continue;
      expect(esVentaCobrada({ estado }), `«${estado}» no cobró`).toBe(false);
    }
  });

  it('de los trece estados, sólo tres son ventas cobradas', () => {
    expect(ESTADOS_DEL_PUENTE.filter((estado) => esVentaCobrada({ estado }))).toEqual([
      'pagada',
      'parcialmente_reembolsada',
      'reembolsada',
    ]);
  });

  it('sin estado legible no se cuenta: ni un hueco ni un objeto se leen como «pagada»', () => {
    expect(esVentaCobrada({})).toBe(false);
    expect(esVentaCobrada({ estado: null })).toBe(false);
    expect(esVentaCobrada({ estado: '' })).toBe(false);
    expect(esVentaCobrada({ estado: { valor: 'pagada' } })).toBe(false);
    expect(esVentaCobrada({ estado: 'PAGADA' })).toBe(false);
  });

  it('el día completo: de once cuentas, nueve son ventas y suman lo que se vendió', () => {
    // Las cuentas del sábado tal como las leyó Registros: las nueve cobradas, la cancelada de la
    // mesa 6 y la madre de la mesa 9.
    const cuentas = [
      { estado: 'pagada', total: 883 },
      { estado: 'pagada', total: 724 },
      { estado: 'pagada', total: 170 },
      { estado: 'pagada', total: 614.4 },
      { estado: 'pagada', total: 768 },
      { estado: 'cancelada', total: 384 },
      { estado: 'dividida', total: 1437 },
      { estado: 'pagada', total: 883 },
      { estado: 'pagada', total: 554 },
      { estado: 'pagada', total: 1048 },
      { estado: 'pagada', total: 55 },
    ];
    const ventas = cuentas.filter(esVentaCobrada);
    expect(cuentas).toHaveLength(11);
    expect(ventas).toHaveLength(9);
    const centavos = ventas.reduce((suma, v) => suma + Math.round(v.total * 100), 0);
    expect(centavos).toBe(569_940);
  });
});
