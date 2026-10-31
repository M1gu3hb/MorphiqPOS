import { describe, expect, it } from 'vitest';

import {
  SEPARADOR_DE_CATEGORIAS,
  categoriasDeLaPagina,
  platillosDeLaPagina,
  resumenDeLaPagina,
} from './paginas-del-menu';

/**
 * EL MENÚ PERSONALIZADO QUE TAMBIÉN PIDE (DP-5, portal QR).
 *
 * Una página del menú subido (`MenuQRSeccion`) es una imagen con su título. Sin una columna nueva
 * —la base compartida no admite DDL—, la página se liga a las categorías que NOMBRA su título,
 * separadas por «·»: «Pa’ empezar · Las sopas» lleva debajo los platillos de esas dos, con su botón
 * de pedir, como el menú de siempre. Un título que no nombra ninguna sigue siendo sólo imagen.
 */
const CATEGORIAS = [
  { id: 'c-empezar', nombre: 'Pa’ empezar' },
  { id: 'c-sopas', nombre: 'Las sopas' },
  { id: 'c-anis', nombre: 'Anís y licores' },
  { id: 'c-pulques', nombre: 'Pulques' },
];
const PRODUCTOS = [
  { id: 'p-consome', nombre: 'Consomé de carnero', categoria_id: 'c-sopas' },
  { id: 'p-tamales', nombre: 'Tamales de frijol', categoria_id: 'c-empezar' },
  { id: 'p-arroz', nombre: 'Arroz', categoria_id: 'c-sopas' },
  { id: 'p-pulque', nombre: 'Pulque básico · litro', categoria_id: 'c-pulques' },
  { id: 'p-sin', nombre: 'Huérfano', categoria_id: null },
];

describe('categoriasDeLaPagina', () => {
  it('un título con «·» nombra varias categorías, en su orden', () => {
    expect(SEPARADOR_DE_CATEGORIAS).toBe('·');
    expect(categoriasDeLaPagina('Pa’ empezar · Las sopas', CATEGORIAS).map((c) => c.id)).toEqual([
      'c-empezar',
      'c-sopas',
    ]);
  });

  it('no distingue mayúsculas, acentos ni el apóstrofo tipográfico del recto', () => {
    expect(categoriasDeLaPagina("pa' EMPEZAR", CATEGORIAS).map((c) => c.id)).toEqual(['c-empezar']);
    expect(categoriasDeLaPagina('anis y licores', CATEGORIAS).map((c) => c.id)).toEqual(['c-anis']);
  });

  it('«y» no separa: «Anís y licores» es UNA categoría', () => {
    expect(categoriasDeLaPagina('Anís y licores', CATEGORIAS)).toHaveLength(1);
  });

  it('un título que no nombra ninguna es sólo imagen', () => {
    expect(categoriasDeLaPagina('Nuestra historia', CATEGORIAS)).toEqual([]);
    expect(categoriasDeLaPagina('', CATEGORIAS)).toEqual([]);
    expect(categoriasDeLaPagina(null, CATEGORIAS)).toEqual([]);
  });
});

describe('platillosDeLaPagina', () => {
  it('los platillos de sus categorías, en el orden de las categorías del título', () => {
    const pagina = { nombre: 'Las sopas · Pa’ empezar' };
    expect(platillosDeLaPagina(pagina, CATEGORIAS, PRODUCTOS).map((p) => p.id)).toEqual([
      'p-consome',
      'p-arroz',
      'p-tamales',
    ]);
  });

  it('una página de sólo imagen no lleva platillos', () => {
    expect(platillosDeLaPagina({ nombre: 'Portada' }, CATEGORIAS, PRODUCTOS)).toEqual([]);
  });
});

describe('resumenDeLaPagina (lo que ve el dueño en la pestaña Menú QR)', () => {
  it('dice qué categorías pide y cuántos platillos', () => {
    expect(resumenDeLaPagina({ nombre: 'Pa’ empezar · Las sopas' }, CATEGORIAS, PRODUCTOS)).toBe(
      'Se pide: Pa’ empezar, Las sopas · 3 platillos',
    );
  });

  it('una sola categoría con un platillo, en singular', () => {
    expect(resumenDeLaPagina({ nombre: 'Pulques' }, CATEGORIAS, PRODUCTOS)).toBe(
      'Se pide: Pulques · 1 platillo',
    );
  });

  it('sin categoría, lo dice y explica cómo ligarla', () => {
    expect(resumenDeLaPagina({ nombre: 'Portada' }, CATEGORIAS, PRODUCTOS)).toBe(
      'Sólo imagen: para pedir desde esta página, ponle de título el nombre de una categoría (varias, separadas por «·»).',
    );
  });
});
