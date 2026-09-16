import { describe, expect, it } from 'vitest';

import { buscar, cercanas, normalizar, type MaterialDeMostrador } from './buscar-material';

/**
 * F-152 y F-059 · Encontrar la pieza y decir dónde está.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que las cuatro formas de teclear la misma medida encuentren la misma pieza, y
 * que el orden ponga arriba lo que SÍ HAY. Las dos cosas fallan en silencio: el
 * buscador devuelve algo, el mostradorista no lo reconoce, y vuelve a su
 * memoria — que es el problema entero de este modelo—.
 */

function material(cambios: Partial<MaterialDeMostrador> = {}): MaterialDeMostrador {
  return {
    id: 'm1',
    nombre: 'Tornillo tirafondo',
    medida: '1/4" x 2"',
    acabado: 'galvanizado',
    marca: null,
    precioCentavos: 250,
    existencia: 100,
    unidad: 'pieza',
    ubicacion: 'A-14',
    linea: 'Tornillería',
    ...cambios,
  };
}

describe('F-059 · la medida, tecleada de cuatro formas', () => {
  it('las cuatro dan EL MISMO texto normalizado', () => {
    expect(normalizar('1/4 x 2')).toBe('1/4x2');
    expect(normalizar('1/4x2')).toBe('1/4x2');
    expect(normalizar('1/4 × 2')).toBe('1/4x2');
    expect(normalizar('1/4" x 2"')).toBe('1/4x2');
  });

  it('el asterisco también es una multiplicación', () => {
    // En el teclado numérico de una terminal el × más a mano es el `*`.
    expect(normalizar('3 * 8')).toBe('3x8');
  });

  it('quita los acentos y baja a minúsculas', () => {
    expect(normalizar('Cuñas Galvanizadas')).toBe('cunas galvanizadas');
  });

  it('colapsa los espacios de más', () => {
    expect(normalizar('  varilla   del  3  ')).toBe('varilla del 3');
  });
});

describe('F-059 · la búsqueda progresiva', () => {
  const catalogo = [
    material({ id: 'a', medida: '1/4" x 2"', existencia: 3 }),
    material({ id: 'b', medida: '1/4" x 3"', existencia: 2340 }),
    // Sin acabado a propósito: es lo que hace que la búsqueda por «galvanizado»
    // de más abajo pruebe algo en vez de devolver el catálogo entero.
    material({
      id: 'c',
      nombre: 'Taquete',
      medida: '1/4"',
      acabado: null,
      linea: 'Fijación',
      existencia: 500,
    }),
  ];

  it('cada palabra ESTRECHA: las dos tienen que estar', () => {
    const hallados = buscar(catalogo, ['tornillo', '1/4x3']);

    expect(hallados.map((m) => m.id)).toEqual(['b']);
  });

  it('sin palabras no devuelve el catálogo entero', () => {
    // Devolverlo llenaría la pantalla de 6,000 renglones en el primer tecleo,
    // y el buscador dejaría de responder justo cuando se empieza a usar.
    expect(buscar(catalogo, [])).toEqual([]);
  });

  it('LA MEDIDA MANDA sobre la existencia', () => {
    // El de 3 piezas que coincide en medida va arriba del de 2,340 que no.
    const hallados = buscar(catalogo, ['tornillo', '1/4x2']);

    expect(hallados[0]?.id).toBe('a');
  });

  it('a igualdad de medida, arriba lo que SÍ HAY', () => {
    const hallados = buscar(catalogo, ['1/4']);

    // Ninguno gana por medida exacta, así que ordena la existencia: 2340, 500, 3.
    expect(hallados.map((m) => m.id)).toEqual(['b', 'c', 'a']);
  });

  it('encuentra por acabado y por línea, no sólo por nombre', () => {
    expect(buscar(catalogo, ['galvanizado']).map((m) => m.id)).toEqual(['b', 'a']);
    expect(buscar(catalogo, ['fijacion']).map((m) => m.id)).toEqual(['c']);
  });

  it('la búsqueda NO muta el arreglo que recibe', () => {
    const original = [...catalogo];
    buscar(catalogo, ['1/4']);

    expect(catalogo).toEqual(original);
  });
});

describe('F-060 · lo que le puede servir cuando no hay ninguna exacta', () => {
  it('aproxima por familia y deja arriba lo que más hay', () => {
    const cercano = cercanas(
      [
        material({ id: 'a', existencia: 3 }),
        material({ id: 'b', existencia: 900 }),
        material({ id: 'c', nombre: 'Taquete', linea: 'Fijación' }),
      ],
      ['tornillo'],
    );

    expect(cercano.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('nunca ofrece más de cinco', () => {
    // Una lista larga de «quizá esto» es una lista que no se lee con el cliente
    // enfrente, y devuelve al mostradorista a su memoria.
    const muchos = Array.from({ length: 12 }, (_, i) => material({ id: `m${i}`, existencia: i }));

    expect(cercanas(muchos, ['tornillo'])).toHaveLength(5);
  });

  it('sin coincidencia de familia no inventa nada', () => {
    expect(cercanas([material()], ['cemento'])).toEqual([]);
  });
});
