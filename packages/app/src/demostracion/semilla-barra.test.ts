import { describe, expect, it } from 'vitest';

import { semillaParaPaquete } from './datos.ts';

/**
 * C.14 de la etapa 2.4 · La demo de cafetería tenía TODAS sus recetas con área
 * `ninguno` y ninguna estación: su barra no recibía una sola comanda, ni de las ventas
 * del mostrador ni de los apartados del menú público. Lo destapó el e2e del apartado.
 */
describe('la semilla de la cafetería', () => {
  it('CADA RECETA va a la barra: sin área no nace ninguna comanda', () => {
    const sinBarra = semillaParaPaquete('cafeteria')
      .recetas.filter((r) => r.area === undefined || r.area === 'ninguno')
      .map((r) => r.nombre);
    expect(sinBarra).toEqual([]);
  });
});
