import { describe, expect, it } from 'vitest';

import {
  accionDeTecla,
  caminoPorOmision,
  caminosPosibles,
  faltaEnMixto,
  pagosParaEnviar,
  propinaQueCobraElSalon,
  propinasParaEnviar,
  repartirProporcional,
} from './cobro-de-cita';

/**
 * C.3 de la etapa 2.4 · Lo que el mostrador del salón decide y el servidor comprueba.
 *
 * Cada caso es una frase de `02-DINERO-Y-CAJA` o de `04-INTERFAZ §4.3.4` del salón.
 */

const KARLA = 'z1111111-1111-4111-8111-111111111111';
const BRENDA = 'z3333333-3333-4333-8333-333333333333';
const SALON = { profesionalId: null, porConfirmar: false } as const;

describe('repartirProporcional', () => {
  it('SUMA LA PROPINA EXACTA, en la proporción del servicio', () => {
    // $150 entre un tinte de $950 y un lavado de $180.
    const partes = repartirProporcional(15_000, [95_000, 18_000]);
    expect(partes.reduce((a, p) => a + p, 0)).toBe(15_000);
    expect(partes).toEqual([12_611, 2_389]);
  });

  it('con partes iguales, el centavo que sobra va a la primera', () => {
    expect(repartirProporcional(100, [1, 1, 1])).toEqual([34, 33, 33]);
  });
});

describe('pagosParaEnviar', () => {
  it('UN MÉTODO paga lo que queda por cobrar, no el total de la cita', () => {
    expect(pagosParaEnviar('uno', 'efectivo', [], 83_000, SALON)).toEqual([
      { metodo: 'efectivo', montoCentavos: 83_000 },
    ]);
  });

  it('EL MIXTO del documento: $500 en efectivo y $330 con tarjeta', () => {
    const pagos = pagosParaEnviar(
      'mixto',
      null,
      [
        { metodo: 'efectivo', centavos: 50_000 },
        { metodo: 'tarjeta', centavos: 33_000 },
        { metodo: 'transferencia', centavos: null },
      ],
      83_000,
      SALON,
    );
    expect(pagos).toEqual([
      { metodo: 'efectivo', montoCentavos: 50_000 },
      { metodo: 'tarjeta', montoCentavos: 33_000 },
    ]);
  });

  it('LA TRANSFERENCIA lleva a qué cuenta cayó (descuadre 1)', () => {
    expect(
      pagosParaEnviar('uno', 'transferencia', [], 83_000, {
        profesionalId: KARLA,
        porConfirmar: true,
      }),
    ).toEqual([
      { metodo: 'transferencia', montoCentavos: 83_000, aCuentaDe: KARLA, porConfirmar: true },
    ]);
  });

  it('SI EL ANTICIPO CUBRE TODO no viaja ningún pago', () => {
    expect(pagosParaEnviar('uno', 'efectivo', [], 0, SALON)).toEqual([]);
  });

  it('faltaEnMixto dice lo que falta y lo que sobra', () => {
    expect(faltaEnMixto(83_000, [{ metodo: 'efectivo', centavos: 50_000 }])).toBe(33_000);
    expect(faltaEnMixto(83_000, [{ metodo: 'efectivo', centavos: 90_000 }])).toBe(-7_000);
  });
});

describe('la propina', () => {
  it('LA DE TERMINAL sólo con tarjeta, la del CAJÓN sólo con efectivo', () => {
    expect(caminosPosibles(['efectivo'])).toEqual(['mano', 'cajon']);
    expect(caminosPosibles(['tarjeta'])).toEqual(['mano', 'terminal']);
    expect(caminosPosibles(['transferencia'])).toEqual(['mano']);
  });

  it('POR OMISIÓN: en la terminal si hay tarjeta, a la mano si no (§4.2)', () => {
    expect(caminoPorOmision(['tarjeta'])).toBe('terminal');
    expect(caminoPorOmision(['efectivo'])).toBe('mano');
  });

  it('«REPARTIR» parte la principal por servicio, y la de APOYO va aparte', () => {
    const propinas = propinasParaEnviar({
      centavos: 15_000,
      destinatario: 'repartir',
      camino: 'mano',
      equipo: [
        { profesionalId: KARLA, centavos: 95_000 },
        { profesionalId: BRENDA, centavos: 18_000 },
      ],
      apoyo: { profesionalId: BRENDA, centavos: 5_000 },
    });
    expect(propinas).toEqual([
      { profesionalId: KARLA, montoCentavos: 12_611, camino: 'mano' },
      { profesionalId: BRENDA, montoCentavos: 2_389, camino: 'mano' },
      { profesionalId: BRENDA, montoCentavos: 5_000, camino: 'mano' },
    ]);
  });

  it('PARA UNA PERSONA es toda suya, y la de cero no viaja', () => {
    expect(
      propinasParaEnviar({
        centavos: 0,
        destinatario: KARLA,
        camino: 'mano',
        equipo: [{ profesionalId: KARLA, centavos: 95_000 }],
        apoyo: null,
      }),
    ).toEqual([]);
  });

  it('LA DE LA MANO no se suma a lo que cobra el salón', () => {
    expect(
      propinaQueCobraElSalon([
        { profesionalId: KARLA, montoCentavos: 15_000, camino: 'mano' },
        { profesionalId: BRENDA, montoCentavos: 5_000, camino: 'terminal' },
      ]),
    ).toBe(5_000);
  });
});

describe('accionDeTecla', () => {
  it('los atajos del documento, y nada más', () => {
    expect(accionDeTecla('F12')).toBe('cobrar');
    expect(accionDeTecla('F2')).toBe('efectivo');
    expect(accionDeTecla('F3')).toBe('tarjeta');
    expect(accionDeTecla('F4')).toBe('transferencia');
    expect(accionDeTecla('F7')).toBe('propina');
    expect(accionDeTecla('Escape')).toBe('cancelar');
    expect(accionDeTecla('F5')).toBeNull();
  });
});
