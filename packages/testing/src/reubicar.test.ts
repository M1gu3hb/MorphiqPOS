import { describe, expect, it } from 'vitest';

import { reubicar } from './reubicar.ts';

/** Las firmas reales del diálogo «Opciones» de un platillo, abreviadas. */
const AGREGAR = 'button|||||Agregar grupo';
const GUARDAR = 'button|||||Guardar opciones';
const CANCELAR = 'button|||||Cancelar';
const CERRAR = 'button|||||Close';
const GRUPO = 'input||text||Nombre del grupo (Ej: Término de carne)|';
const OPCION = 'input||text||Ej: Tres cuartos|';
const ICONO = 'button||button|||';

describe('reubicar · dónde quedó cada pieza de la capa', () => {
  it('sin cambios, cada pieza sigue en su sitio', () => {
    const capa = [AGREGAR, GUARDAR, CANCELAR, CERRAR];
    expect([...reubicar(capa, capa)]).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('«Agregar grupo» mete tres piezas: Guardar, Cancelar y la X se corren tres lugares', () => {
    const antes = [AGREGAR, GUARDAR, CANCELAR, CERRAR];
    const ahora = [AGREGAR, GRUPO, OPCION, ICONO, GUARDAR, CANCELAR, CERRAR];
    const posiciones = reubicar(antes, ahora);
    expect(posiciones.get(1)).toBe(4);
    expect(posiciones.get(2)).toBe(5);
    expect(posiciones.get(3)).toBe(6);
  });

  it('lo que el toque quitó ya no está, y lo de después se encuentra', () => {
    const antes = [OPCION, ICONO, GUARDAR, CERRAR];
    const ahora = [GUARDAR, CERRAR];
    const posiciones = reubicar(antes, ahora);
    expect(posiciones.has(0)).toBe(false);
    expect(posiciones.has(1)).toBe(false);
    expect(posiciones.get(2)).toBe(0);
    expect(posiciones.get(3)).toBe(1);
  });

  it('nunca manda una pieza a otra distinta, ni dos piezas al mismo sitio', () => {
    const antes = [AGREGAR, GRUPO, GUARDAR, CANCELAR, CERRAR];
    const ahora = [CERRAR, OPCION, GUARDAR, AGREGAR, CANCELAR];
    const posiciones = reubicar(antes, ahora);
    for (const [vieja, nueva] of posiciones) expect(ahora[nueva]).toBe(antes[vieja]);
    expect(new Set(posiciones.values()).size).toBe(posiciones.size);
    // Y conserva el orden: lo que estaba antes sigue antes.
    const nuevas = [...posiciones.entries()].sort(([a], [b]) => a - b).map(([, n]) => n);
    expect(nuevas).toEqual([...nuevas].sort((a, b) => a - b));
  });

  it('una capa vacía no encuentra nada', () => {
    expect(reubicar([GUARDAR], []).size).toBe(0);
    expect(reubicar([], [GUARDAR]).size).toBe(0);
  });
});
