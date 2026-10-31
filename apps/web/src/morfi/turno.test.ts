import { afterEach, describe, expect, it } from 'vitest';

import {
  PRIORIDAD,
  pedirTurno,
  soltarTurno,
  suscribirAlTurno,
  tieneTurno,
  vaciarTurnos,
} from './turno';

/**
 * NUNCA DOS MORFIS A LA VEZ (reglas de `ux-pos`): si dos lugares quieren animarlo, se anima el
 * de más prioridad —el modo espera sobre la página que no existe, ésa sobre una carga— y los
 * demás se quedan en su imagen fija. Al soltarse, el siguiente vuelve a moverse.
 */

afterEach(() => {
  vaciarTurnos();
});

describe('el turno de Morfi', () => {
  it('el primero que lo pide lo tiene', () => {
    pedirTurno('a', PRIORIDAD.cargando);
    expect(tieneTurno('a')).toBe(true);
  });

  it('dos de la misma prioridad: se queda el primero', () => {
    pedirTurno('a', PRIORIDAD.cargando);
    pedirTurno('b', PRIORIDAD.cargando);
    expect(tieneTurno('a')).toBe(true);
    expect(tieneTurno('b')).toBe(false);
  });

  it('uno de más prioridad lo quita, y al soltarlo vuelve al anterior', () => {
    pedirTurno('carga', PRIORIDAD.cargando);
    pedirTurno('espera', PRIORIDAD.espera);
    expect(tieneTurno('espera')).toBe(true);
    expect(tieneTurno('carga')).toBe(false);
    soltarTurno('espera');
    expect(tieneTurno('carga')).toBe(true);
  });

  it('la página que no existe va antes que una carga y después del modo espera', () => {
    expect(PRIORIDAD.espera).toBeGreaterThan(PRIORIDAD.noEncontrada);
    expect(PRIORIDAD.noEncontrada).toBeGreaterThan(PRIORIDAD.cargando);
  });

  it('avisa a quien escucha cada vez que cambia, y deja de avisar al desuscribirse', () => {
    let avisos = 0;
    const dejar = suscribirAlTurno(() => {
      avisos += 1;
    });
    pedirTurno('a', PRIORIDAD.cargando);
    soltarTurno('a');
    dejar();
    pedirTurno('b', PRIORIDAD.cargando);
    expect(avisos).toBe(2);
  });

  it('soltar un turno que no se pidió no rompe nada', () => {
    soltarTurno('nadie');
    expect(tieneTurno('nadie')).toBe(false);
  });
});
