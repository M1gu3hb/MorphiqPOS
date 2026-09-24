import { describe, expect, it } from 'vitest';

import {
  avisoDeConteoInvalido,
  cartonesDe,
  primeraLecheInvalida,
  seCuentaPorCartones,
  TOPE_DE_CARTONES,
  type ConteoTecleado,
} from './conteo-de-leche';

/**
 * EL CONTEO DE LECHE · lo que se manda al comando.
 *
 * El campo es texto libre y la pantalla mandaba `Number(texto)` tal cual. Con una
 * letra suelta eso es `NaN`, con `12.5` no es entero y con `999` se pasa del tope:
 * el comando contesta 400 y el barista sólo ve una banda genérica. El rastreador lo
 * cazó en CI como `400 /api/cafeteria/contar-leche`.
 *
 * Estas pruebas fijan las tres cosas que el comando rechaza y la que sí acepta —el
 * campo vacío, que es un refrigerador sin cartones cerrados—.
 */

function tecleado(cerrados: string): ConteoTecleado {
  return { cerrados, cuartos: 0 };
}

describe('cartonesDe', () => {
  it('lee un entero normal', () => {
    expect(cartonesDe('3')).toBe(3);
  });

  it('trata el campo vacío como cero, y el de espacios también', () => {
    // Un refrigerador sin cartones cerrados es un conteo válido. Obligar a teclear
    // un 0 en cada leche para poder confirmar sería peor que el problema.
    expect(cartonesDe('')).toBe(0);
    expect(cartonesDe('   ')).toBe(0);
  });

  it('acepta el tope exacto y rechaza el siguiente', () => {
    expect(cartonesDe(String(TOPE_DE_CARTONES))).toBe(TOPE_DE_CARTONES);
    expect(cartonesDe(String(TOPE_DE_CARTONES + 1))).toBeNull();
  });

  it('rechaza lo que el comando rechazaría con 400', () => {
    // Las tres formas que el rastreador puede teclear en un campo de texto libre.
    expect(cartonesDe('sonda')).toBeNull();
    expect(cartonesDe('12.5')).toBeNull();
    expect(cartonesDe('-1')).toBeNull();
    expect(cartonesDe('3 cartones')).toBeNull();
    expect(cartonesDe('1e3')).toBeNull();
  });

  it('no deja pasar un número que ya no es un entero exacto', () => {
    expect(cartonesDe('9007199254740993')).toBeNull();
  });
});

describe('seCuentaPorCartones', () => {
  /**
   * ÉSTE es el 400 que el rastreador cazó tres veces, y no se necesita teclear nada
   * para provocarlo: la familia «Leche» se decide por pistas en el nombre, la pista
   * `crema` mete «Bagel integral con queso crema» —`pieza`— entre las leches, y el
   * comando lo rechaza con `CONFIGURACION_INVALIDA`. Le pasa a un barista CADA VEZ
   * que abre el conteo.
   */
  it('acepta mililitros y nada más', () => {
    expect(seCuentaPorCartones('ml')).toBe(true);
    expect(seCuentaPorCartones('pieza')).toBe(false);
    expect(seCuentaPorCartones('g')).toBe(false);
    expect(seCuentaPorCartones('kg')).toBe(false);
  });

  it('un insumo sin unidad base no se cuenta por cartones', () => {
    // El puente puede devolver `null`, y «no sé en qué se mide» no es «mililitros».
    expect(seCuentaPorCartones(null)).toBe(false);
    expect(seCuentaPorCartones(undefined)).toBe(false);
    expect(seCuentaPorCartones('')).toBe(false);
  });
});

describe('primeraLecheInvalida', () => {
  const leches = [
    { id: 'a', nombre: 'Leche entera' },
    { id: 'b', nombre: 'Leche deslactosada' },
  ];

  it('no encuentra ninguna cuando todo es contable', () => {
    expect(primeraLecheInvalida(leches, { a: tecleado('2'), b: tecleado('') })).toBeNull();
  });

  it('devuelve LA PRIMERA, porque el diálogo enfoca un campo', () => {
    const encontrada = primeraLecheInvalida(leches, {
      a: tecleado('nope'),
      b: tecleado('tampoco'),
    });
    expect(encontrada?.nombre).toBe('Leche entera');
  });

  it('mira también las leches que nadie tecleó, que valen cero', () => {
    expect(primeraLecheInvalida(leches, {})).toBeNull();
  });

  it('el aviso dice el nombre y el rango, para no adivinarlo tecleando', () => {
    const aviso = avisoDeConteoInvalido(leches[0] as { id: string; nombre: string });
    expect(aviso).toContain('Leche entera');
    expect(aviso).toContain(String(TOPE_DE_CARTONES));
  });
});
