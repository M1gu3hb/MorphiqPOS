import { describe, expect, it } from 'vitest';

import { EXPERIENCIA, EXPERIENCIA_POR_OMISION, experienciaDe } from './experiencia.ts';

/**
 * DP-11 · LA EXPERIENCIA DEL NEGOCIO: lo que no es color ni perilla pero cambia cómo se siente el
 * sistema. Hoy, la mascota Morfi (DP-11.1). Vive en `configuracion.valores.experiencia`.
 */

describe('experienciaDe', () => {
  it('sin nada guardado, Morfi está encendido', () => {
    expect(experienciaDe(undefined)).toEqual({ mascota: true });
    expect(experienciaDe({})).toEqual({ mascota: true });
    expect(EXPERIENCIA_POR_OMISION.mascota).toBe(true);
  });

  it('lo que el negocio guardó manda', () => {
    expect(experienciaDe({ experiencia: { mascota: false } })).toEqual({ mascota: false });
    expect(experienciaDe({ experiencia: { mascota: true } })).toEqual({ mascota: true });
  });

  it('un valor que no es sí o no se lee como el de omisión, sin lanzar', () => {
    expect(experienciaDe({ experiencia: { mascota: 'no' } })).toEqual({ mascota: true });
    expect(experienciaDe({ experiencia: 'apagada' })).toEqual({ mascota: true });
    expect(experienciaDe(['raro'])).toEqual({ mascota: true });
  });
});

describe('EXPERIENCIA (lo que se acepta al guardar)', () => {
  it('acepta el interruptor de la mascota, y nada', () => {
    expect(EXPERIENCIA.safeParse({ mascota: false }).success).toBe(true);
    expect(EXPERIENCIA.safeParse({}).success).toBe(true);
  });

  it('rechaza un campo que no existe y un valor que no es sí o no', () => {
    expect(EXPERIENCIA.safeParse({ mascota: false, otra: 1 }).success).toBe(false);
    expect(EXPERIENCIA.safeParse({ mascota: 'no' }).success).toBe(false);
    expect(EXPERIENCIA.safeParse('apagada').success).toBe(false);
  });
});
