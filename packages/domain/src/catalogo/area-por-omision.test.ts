import { describe, expect, it } from 'vitest';

import { areaPorOmision, type ProductoConArea } from './area-por-omision.ts';

/**
 * DP-9.1 · EL ÁREA CON LA QUE NACE UN PLATILLO.
 *
 * El área decide si el platillo genera comanda (cocina, barra o las dos). Nacía en «cocina» fija
 * desde Recetas y en «ninguno» —sin comanda— desde Platillos. Ahora sale de lo que ya hace su
 * categoría y, si la categoría es nueva, de lo que hace su estación. Si no hay de dónde
 * aprenderlo, no se inventa: alguien tiene que decidirlo.
 */

const CERVEZAS = 'cat-cervezas';
const DESTILADOS = 'cat-destilados';
const NUEVA_DE_BEBIDAS = 'cat-nueva-bebidas';
const TACOS = 'cat-tacos';

const p = (categoriaId: string | null, area: string, activo = true): ProductoConArea => ({
  categoriaId,
  area,
  activo,
});

const CATALOGO: readonly ProductoConArea[] = [
  p(CERVEZAS, 'barra'),
  p(CERVEZAS, 'barra'),
  p(DESTILADOS, 'barra'),
  p(TACOS, 'cocina'),
  p(TACOS, 'cocina'),
];

describe('el área de un platillo nuevo', () => {
  it('sale de lo que ya hace su categoría', () => {
    expect(areaPorOmision(CERVEZAS, CATALOGO, new Set([CERVEZAS, DESTILADOS]))).toBe('barra');
    expect(areaPorOmision(TACOS, CATALOGO, new Set([TACOS]))).toBe('cocina');
  });

  it('en una categoría sin platillos, de lo que hace su estación', () => {
    const deBebidas = new Set([CERVEZAS, DESTILADOS, NUEVA_DE_BEBIDAS]);
    expect(areaPorOmision(NUEVA_DE_BEBIDAS, CATALOGO, deBebidas)).toBe('barra');
  });

  it('la categoría manda sobre la estación', () => {
    // Una categoría de cocina colgada de una estación donde casi todo es barra.
    const mezcla = [...CATALOGO, p('cat-botanas', 'cocina')];
    const estacion = new Set([CERVEZAS, DESTILADOS, 'cat-botanas']);
    expect(areaPorOmision('cat-botanas', mezcla, estacion)).toBe('cocina');
  });

  it('gana el área más frecuente, no la primera que aparece', () => {
    const casiTodoBarra = [p(CERVEZAS, 'cocina'), p(CERVEZAS, 'barra'), p(CERVEZAS, 'barra')];
    expect(areaPorOmision(CERVEZAS, casiTodoBarra, new Set([CERVEZAS]))).toBe('barra');
  });

  it('no aprende de platillos sin comanda ni de los dados de baja', () => {
    const ruido = [p(CERVEZAS, 'ninguno'), p(CERVEZAS, 'ninguno'), p(CERVEZAS, 'cocina', false)];
    expect(areaPorOmision(CERVEZAS, [...ruido, p(CERVEZAS, 'barra')], new Set([CERVEZAS]))).toBe(
      'barra',
    );
    expect(areaPorOmision(CERVEZAS, ruido, new Set([CERVEZAS]))).toBeNull();
  });

  it('sin categoría, o sin nada de dónde aprender, no inventa: devuelve null', () => {
    expect(areaPorOmision(null, CATALOGO, new Set())).toBeNull();
    expect(areaPorOmision('cat-sola', CATALOGO, new Set(['cat-sola']))).toBeNull();
  });

  it('un empate se rompe siempre igual, sin depender del orden de la lista', () => {
    const empate = [p(CERVEZAS, 'barra'), p(CERVEZAS, 'cocina')];
    const resultado = areaPorOmision(CERVEZAS, empate, new Set([CERVEZAS]));
    expect(areaPorOmision(CERVEZAS, [...empate].reverse(), new Set([CERVEZAS]))).toBe(resultado);
  });
});
