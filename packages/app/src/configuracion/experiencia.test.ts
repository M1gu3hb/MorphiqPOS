import { describe, expect, it } from 'vitest';

import { EXPERIENCIA, EXPERIENCIA_POR_OMISION, experienciaDe } from './experiencia.ts';

/**
 * DP-11 · LA EXPERIENCIA DEL NEGOCIO: lo que no es color ni perilla pero cambia cómo se siente el
 * sistema: la mascota Morfi (DP-11.1) y pedir el PIN al despertar del modo espera (DP-11.2). Vive en
 * `configuracion.valores.experiencia`.
 */

describe('experienciaDe', () => {
  it('sin nada guardado, Morfi está encendido', () => {
    expect(experienciaDe(undefined)).toEqual({ mascota: true, pin_al_despertar: false });
    expect(experienciaDe({})).toEqual({ mascota: true, pin_al_despertar: false });
    expect(EXPERIENCIA_POR_OMISION.mascota).toBe(true);
  });

  it('lo que el negocio guardó manda', () => {
    expect(experienciaDe({ experiencia: { mascota: false } })).toMatchObject({ mascota: false });
    expect(experienciaDe({ experiencia: { mascota: true } })).toMatchObject({ mascota: true });
    expect(experienciaDe({ experiencia: { pin_al_despertar: true } })).toEqual({
      mascota: true,
      pin_al_despertar: true,
    });
  });

  it('un valor que no es sí o no se lee como el de omisión, sin lanzar', () => {
    expect(experienciaDe({ experiencia: { mascota: 'no', pin_al_despertar: 'sí' } })).toEqual({
      mascota: true,
      pin_al_despertar: false,
    });
    expect(experienciaDe({ experiencia: 'apagada' })).toMatchObject({ mascota: true });
    expect(experienciaDe(['raro'])).toMatchObject({ mascota: true });
  });
});

describe('EXPERIENCIA (lo que se acepta al guardar)', () => {
  it('acepta los interruptores de la mascota y del PIN al despertar, y nada', () => {
    expect(EXPERIENCIA.safeParse({ mascota: false }).success).toBe(true);
    expect(EXPERIENCIA.safeParse({ mascota: true, pin_al_despertar: true }).success).toBe(true);
    expect(EXPERIENCIA.safeParse({}).success).toBe(true);
  });

  it('rechaza un campo que no existe y un valor que no es sí o no', () => {
    expect(EXPERIENCIA.safeParse({ mascota: false, otra: 1 }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ mascota: 'no' }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ pin_al_despertar: 1 }).success).toBe(false);
    expect(EXPERIENCIA.safeParse('apagada').success).toBe(false);
  });
});
