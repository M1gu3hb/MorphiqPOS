import { describe, expect, it } from 'vitest';

import {
  BOTONES_DEL_MENU,
  botonesGuardados,
  botonesPublicos,
  MAXIMO_DE_BOTONES_POR_PAGINA,
  type BotonDelMenu,
} from './botones-del-menu.ts';
import { TEMA_POR_OMISION, temaGuardado } from './tema-del-portal.ts';

/**
 * DP-9.7 · LOS BOTONES SOBRE LAS PÁGINAS DEL MENÚ QR.
 *
 * Lo que se guarda tiene forma: dentro de la página, cada tipo con lo suyo, sin ids repetidos ni
 * más de los que caben. Y lo que llega al comensal es sólo lo que se vende: un botón de un
 * platillo escondido no sale, y un grupo se queda con los visibles.
 */
const PAGINA = 'a3f1c0de-0000-4000-8000-000000000001';
const TACO = 'a3f1c0de-0000-4000-8000-0000000000a1';
const AGUA = 'a3f1c0de-0000-4000-8000-0000000000a2';
const OCULTO = 'a3f1c0de-0000-4000-8000-0000000000a3';
const BEBIDAS = 'a3f1c0de-0000-4000-8000-0000000000c1';

const platillo = (id: string, productoId: string, cambios: Partial<BotonDelMenu> = {}) =>
  ({
    id,
    tipo: 'platillo',
    x: 10,
    y: 20,
    ancho: 80,
    alto: 3,
    productoId,
    mostrarPrecio: true,
    ...cambios,
  }) as BotonDelMenu;

const valido = (botones: readonly unknown[]) =>
  BOTONES_DEL_MENU.safeParse({ [PAGINA]: botones }).success;

describe('lo que se guarda', () => {
  it('un platillo y un grupo bien formados pasan', () => {
    expect(
      valido([
        platillo('t', TACO),
        {
          id: 'g',
          tipo: 'grupo',
          x: 5,
          y: 50,
          ancho: 40,
          alto: 5,
          categoriaId: BEBIDAS,
          etiqueta: 'Bebidas',
          mostrarPrecio: false,
        },
      ]),
    ).toBe(true);
  });

  it('un botón que se sale de la página no pasa', () => {
    expect(valido([platillo('t', TACO, { x: 50, ancho: 60 })])).toBe(false);
    expect(valido([platillo('t', TACO, { y: 99, alto: 5 })])).toBe(false);
  });

  it('cada tipo con lo suyo: el platillo sin platillo, el grupo sin texto o con dos fuentes', () => {
    expect(valido([{ ...platillo('t', TACO), productoId: undefined }])).toBe(false);
    const grupo = { id: 'g', tipo: 'grupo', x: 5, y: 50, ancho: 40, alto: 5, mostrarPrecio: false };
    expect(valido([{ ...grupo, categoriaId: BEBIDAS }])).toBe(false);
    expect(
      valido([{ ...grupo, etiqueta: 'Todo', categoriaId: BEBIDAS, productoIds: [AGUA] }]),
    ).toBe(false);
  });

  it('ni ids repetidos en la página, ni más botones de los que caben', () => {
    expect(valido([platillo('t', TACO), platillo('t', AGUA)])).toBe(false);
    const muchos = Array.from({ length: MAXIMO_DE_BOTONES_POR_PAGINA + 1 }, (_, i) =>
      platillo(`b${String(i)}`, TACO),
    );
    expect(valido(muchos)).toBe(false);
  });

  it('leer lo guardado sin confiar: basura es «sin botones», no un error', () => {
    expect(botonesGuardados('basura')).toEqual({});
    expect(botonesGuardados(null)).toEqual({});
    expect(botonesGuardados({ [PAGINA]: [platillo('t', TACO)] })[PAGINA]).toHaveLength(1);
  });
});

describe('lo que ve el comensal', () => {
  const visibles = [
    { id: TACO, categoria_id: null },
    { id: AGUA, categoria_id: BEBIDAS },
  ];

  it('un botón de un platillo que ya no se ve desaparece', () => {
    const publicos = botonesPublicos([platillo('t', TACO), platillo('o', OCULTO)], visibles);
    expect(publicos.map((b) => b.id)).toEqual(['t']);
    expect(publicos[0]?.productoIds).toEqual([TACO]);
  });

  it('un grupo por categoría trae sus platillos visibles; por lista, sólo los visibles', () => {
    const grupoBase = { tipo: 'grupo', x: 5, y: 50, ancho: 40, alto: 5, mostrarPrecio: false };
    const publicos = botonesPublicos(
      [
        { ...grupoBase, id: 'c', categoriaId: BEBIDAS, etiqueta: 'Bebidas' } as BotonDelMenu,
        { ...grupoBase, id: 'l', productoIds: [AGUA, OCULTO], etiqueta: 'Lista' } as BotonDelMenu,
        { ...grupoBase, id: 'v', productoIds: [OCULTO], etiqueta: 'Nada' } as BotonDelMenu,
      ],
      visibles,
    );
    expect(publicos.map((b) => [b.id, b.productoIds])).toEqual([
      ['c', [AGUA]],
      ['l', [AGUA]],
    ]);
  });
});

describe('el tema del portal', () => {
  it('lo que no tiene forma vuelve al de siempre', () => {
    expect(temaGuardado({ estilo: 'inventado', tipografia: 'sistema', fondo: 'liso' })).toEqual(
      TEMA_POR_OMISION,
    );
    expect(temaGuardado({ estilo: 'papel', tipografia: 'clasica', fondo: 'liso' })).toEqual({
      estilo: 'papel',
      tipografia: 'clasica',
      fondo: 'liso',
    });
  });
});
