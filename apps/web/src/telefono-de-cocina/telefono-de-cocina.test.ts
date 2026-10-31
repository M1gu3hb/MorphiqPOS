import { describe, expect, it } from 'vitest';

import { accionDeLaTecla, accionesPosibles, porAnunciar, TECLAS } from './telefono-de-cocina.ts';

/**
 * DP-9.4 · EL TELÉFONO DE COCINA SIN PANTALLA.
 *
 * Cada botón de la botonera física cae en UNA acción y ninguna tecla en dos; «Preparar» sólo vale
 * para una comanda nueva; y la voz anuncia cada comanda una vez, nunca lo que ya estaba al entrar.
 */

describe('la botonera', () => {
  it('teclado numérico: 1 repite, 2 prepara, 3 deja lista', () => {
    expect(accionDeLaTecla('1')).toBe('repetir');
    expect(accionDeLaTecla('2')).toBe('preparar');
    expect(accionDeLaTecla('3')).toBe('listo');
  });

  it('pasador de diapositivas y botón único: flechas, páginas, Enter y Espacio', () => {
    expect(accionDeLaTecla('PageUp')).toBe('repetir');
    expect(accionDeLaTecla('ArrowLeft')).toBe('repetir');
    expect(accionDeLaTecla('PageDown')).toBe('listo');
    expect(accionDeLaTecla('ArrowRight')).toBe('listo');
    expect(accionDeLaTecla('Enter')).toBe('listo');
    expect(accionDeLaTecla(' ')).toBe('listo');
  });

  it('una tecla que no es de la botonera no hace nada', () => {
    expect(accionDeLaTecla('Tab')).toBeNull();
    expect(accionDeLaTecla('Escape')).toBeNull();
    expect(accionDeLaTecla('9')).toBeNull();
  });

  it('ninguna tecla cae en dos acciones', () => {
    const todas = Object.values(TECLAS).flat();
    expect(new Set(todas).size).toBe(todas.length);
  });
});

describe('qué se puede hacer con la comanda en pantalla', () => {
  it('nueva: repetir, preparar y listo; preparando: repetir y listo; sin comanda: nada', () => {
    expect([...accionesPosibles('nuevo')].sort()).toEqual(['listo', 'preparar', 'repetir']);
    expect([...accionesPosibles('en_preparacion')].sort()).toEqual(['listo', 'repetir']);
    expect(accionesPosibles(null).size).toBe(0);
  });
});

describe('qué se anuncia en voz', () => {
  it('en la primera lectura, nada; después, cada comanda nueva una vez', () => {
    expect(porAnunciar('a', null)).toBeNull();
    expect(porAnunciar('a', new Set(['a']))).toBeNull();
    expect(porAnunciar('b', new Set(['a']))).toBe('b');
    expect(porAnunciar(null, new Set(['a']))).toBeNull();
  });
});
