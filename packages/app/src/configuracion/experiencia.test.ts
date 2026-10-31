import { describe, expect, it } from 'vitest';

import { EXPERIENCIA, EXPERIENCIA_POR_OMISION, experienciaDe } from './experiencia.ts';

/**
 * DP-11 · LA EXPERIENCIA DEL NEGOCIO: lo que no es color ni perilla pero cambia cómo se siente el
 * sistema: la mascota Morfi (DP-11.1), pedir el PIN al despertar del modo espera (DP-11.2) y los
 * sonidos del negocio (DP-11.3: el del teclado y si el portal suena). Vive en
 * `configuracion.valores.experiencia`.
 */

const OMISION = {
  mascota: true,
  pin_al_despertar: false,
  sonidos_en_el_portal: false,
  tecla: 'nib',
} as const;

describe('experienciaDe', () => {
  it('sin nada guardado: Morfi encendido, sin PIN, el portal callado y el teclado en Nib', () => {
    expect(experienciaDe(undefined)).toEqual(OMISION);
    expect(experienciaDe({})).toEqual(OMISION);
    expect(EXPERIENCIA_POR_OMISION).toEqual(OMISION);
  });

  it('lo que el negocio guardó manda', () => {
    expect(experienciaDe({ experiencia: { mascota: false } })).toMatchObject({ mascota: false });
    expect(experienciaDe({ experiencia: { mascota: true } })).toMatchObject({ mascota: true });
    expect(experienciaDe({ experiencia: { pin_al_despertar: true } })).toEqual({
      ...OMISION,
      pin_al_despertar: true,
    });
    expect(experienciaDe({ experiencia: { sonidos_en_el_portal: true, tecla: 'thock' } })).toEqual({
      ...OMISION,
      sonidos_en_el_portal: true,
      tecla: 'thock',
    });
  });

  it('un valor que no se entiende se lee como el de omisión, sin lanzar', () => {
    expect(
      experienciaDe({
        experiencia: {
          mascota: 'no',
          pin_al_despertar: 'sí',
          sonidos_en_el_portal: 1,
          tecla: 'block',
        },
      }),
    ).toEqual(OMISION);
    expect(experienciaDe({ experiencia: 'apagada' })).toMatchObject({ mascota: true });
    expect(experienciaDe(['raro'])).toMatchObject({ mascota: true });
  });
});

describe('EXPERIENCIA (lo que se acepta al guardar)', () => {
  it('acepta sus llaves, solas o juntas, y nada', () => {
    expect(EXPERIENCIA.safeParse({ mascota: false }).success).toBe(true);
    expect(EXPERIENCIA.safeParse({ mascota: true, pin_al_despertar: true }).success).toBe(true);
    expect(EXPERIENCIA.safeParse({ sonidos_en_el_portal: true }).success).toBe(true);
    for (const tecla of ['nib', 'keycap', 'thock', 'clasp'])
      expect(EXPERIENCIA.safeParse({ tecla }).success, tecla).toBe(true);
    expect(EXPERIENCIA.safeParse({}).success).toBe(true);
  });

  it('rechaza un campo que no existe, un sí o no que no lo es y un sonido que no está', () => {
    expect(EXPERIENCIA.safeParse({ mascota: false, otra: 1 }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ mascota: 'no' }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ pin_al_despertar: 1 }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ sonidos_en_el_portal: 'sí' }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ tecla: 'block' }).success).toBe(false);
    expect(EXPERIENCIA.safeParse('apagada').success).toBe(false);
  });
});
