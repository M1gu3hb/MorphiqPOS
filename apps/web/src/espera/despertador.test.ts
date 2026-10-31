import { afterEach, describe, expect, it } from 'vitest';

import {
  alDespertar,
  despertarLaPantalla,
  estaBloqueada,
  mantenerDespierta,
  vaciarDespertador,
} from './despertador';

/**
 * DP-11.2 · Las pantallas AVISAN al modo espera: «llegó una comanda», «pidieron la cuenta»,
 * «tengo pendientes». El modo espera no las conoce.
 */
afterEach(() => {
  vaciarDespertador();
});

describe('el despertador', () => {
  it('cada aviso llega a quien escucha, con su motivo, y deja de llegar al soltarlo', () => {
    const motivos: string[] = [];
    const soltar = alDespertar((motivo) => motivos.push(motivo));
    despertarLaPantalla('comanda');
    despertarLaPantalla('pago');
    soltar();
    despertarLaPantalla('cuenta');
    expect(motivos).toEqual(['comanda', 'pago']);
  });

  it('mientras alguien la mantenga despierta, está bloqueada; cada quien con su clave', () => {
    expect(estaBloqueada()).toBe(false);
    mantenerDespierta('cocina', true);
    mantenerDespierta('otra', true);
    mantenerDespierta('cocina', false);
    expect(estaBloqueada()).toBe(true);
    mantenerDespierta('otra', false);
    expect(estaBloqueada()).toBe(false);
  });
});
