import { describe, expect, it } from 'vitest';

import {
  IMAN,
  LADO_LARGO_MAXIMO,
  LADO_CORTO_MAXIMO,
  atraer,
  grupoDe,
  medidasDeMesa,
  revisarUnion,
  seTocan,
  type MesaEnPlano,
} from './union.ts';

const mesa = (id: string, x: number, y: number, ancho = 80, alto = 80): MesaEnPlano => ({
  id,
  x,
  y,
  ancho,
  alto,
});

describe('las medidas de una mesa en el plano', () => {
  it('son las del mapa del mesero, por forma y tamaño', () => {
    expect(medidasDeMesa('redonda', 'mediana')).toEqual({ ancho: 80, alto: 80 });
    expect(medidasDeMesa('rectangular', 'mediana')).toEqual({ ancho: 120, alto: 70 });
    expect(medidasDeMesa('cuadrada', 'chica')).toEqual({ ancho: 60, alto: 60 });
  });

  it('sin forma o tamaño conocidos, la mediana redonda (como el mapa)', () => {
    expect(medidasDeMesa(null, undefined)).toEqual({ ancho: 80, alto: 80 });
    expect(medidasDeMesa('triangular', 'enorme')).toEqual({ ancho: 80, alto: 80 });
  });
});

describe('cuándo dos mesas se tocan', () => {
  it('pegadas por un lado, o a unos pocos puntos, se tocan', () => {
    expect(seTocan(mesa('a', 0, 0), mesa('b', 80, 0))).toBe(true);
    expect(seTocan(mesa('a', 0, 0), mesa('b', 86, 10))).toBe(true);
  });

  it('separadas por un pasillo, no', () => {
    expect(seTocan(mesa('a', 0, 0), mesa('b', 120, 0))).toBe(false);
    expect(seTocan(mesa('a', 0, 0), mesa('b', 0, 100))).toBe(false);
  });
});

describe('el imán', () => {
  it('una mesa soltada cerca de otra se pega a su lado, sin encimarse', () => {
    const fija = mesa('fija', 200, 200);
    const pegada = atraer(mesa('movida', 300, 205), [fija]);
    expect(pegada).toMatchObject({ x: 280, y: 205 });
    expect(seTocan(pegada, fija)).toBe(true);
  });

  it('también desde arriba, y encimada se separa al lado más cercano', () => {
    const fija = mesa('fija', 200, 200);
    expect(atraer(mesa('movida', 210, 100), [fija])).toMatchObject({ x: 210, y: 120 });
    expect(atraer(mesa('movida', 250, 210), [fija])).toMatchObject({ x: 280, y: 210 });
  });

  it(`lejos (más de ${String(IMAN)} puntos) no atrae`, () => {
    const lejos = mesa('movida', 200 + 80 + IMAN + 10, 200);
    expect(atraer(lejos, [mesa('fija', 200, 200)])).toEqual(lejos);
  });

  it('se pega a la MÁS cercana', () => {
    const cerca = mesa('cerca', 0, 0);
    const otra = mesa('otra', 300, 0);
    expect(atraer(mesa('movida', 95, 0), [otra, cerca])).toMatchObject({ x: 80, y: 0 });
  });
});

describe('el grupo y si se puede unir', () => {
  const fila = [mesa('1', 0, 0), mesa('2', 80, 0), mesa('3', 160, 0), mesa('4', 400, 0)];

  it('el grupo de una mesa son las que la tocan, y las que tocan a ésas', () => {
    expect(grupoDe('1', fila).sort()).toEqual(['1', '2', '3']);
    expect(grupoDe('4', fila)).toEqual(['4']);
  });

  it('dos o más mesas pegadas entre sí se pueden unir', () => {
    expect(revisarUnion(fila.slice(0, 3))).toBeNull();
  });

  it('una sola no es una unión', () => {
    expect(revisarUnion([mesa('1', 0, 0)])).toMatch(/dos o más/);
  });

  it('si una queda suelta (no toca al grupo), no se une', () => {
    expect(revisarUnion([fila[0]!, fila[1]!, fila[3]!])).toMatch(/pegadas/);
  });

  it(`sin tope de cuántas, pero el grupo cabe en ${String(LADO_LARGO_MAXIMO)} × ${String(LADO_CORTO_MAXIMO)}: medio salón, no`, () => {
    const cinco = Array.from({ length: 5 }, (_, i) => mesa(String(i), i * 120, 0, 120, 70));
    expect(revisarUnion(cinco)).toBeNull();
    const seis = Array.from({ length: 6 }, (_, i) => mesa(String(i), i * 120, 0, 120, 70));
    expect(revisarUnion(seis)).toMatch(/demasiado/);
    const bloque = [0, 1, 2].flatMap((c) =>
      [0, 1].map((f) => mesa(`${String(c)}${String(f)}`, c * 80, f * 80)),
    );
    expect(revisarUnion(bloque)).toBeNull();
    const torre = Array.from({ length: 9 }, (_, f) => mesa(String(f), 0, f * 80));
    expect(revisarUnion(torre)).toMatch(/demasiado/);
  });
});
