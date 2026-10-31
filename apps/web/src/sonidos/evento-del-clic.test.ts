import { describe, expect, it } from 'vitest';

import { eventoDelClic, type NodoTocado } from './evento-del-clic';

/** DP-11.3 · QUÉ SUENA AL TOCAR: el oyente único de la pestaña. */

function nodo(etiqueta: string, atributos: Record<string, string> = {}): NodoTocado {
  return { etiqueta, atributo: (nombre) => atributos[nombre] ?? null };
}

describe('eventoDelClic', () => {
  it('un botón cualquiera, el toque de siempre; lo que no es control, nada', () => {
    expect(eventoDelClic([nodo('span'), nodo('button'), nodo('div')])).toBe('toque');
    expect(eventoDelClic([nodo('div', { role: 'button' })])).toBe('toque');
    expect(eventoDelClic([nodo('p'), nodo('div'), nodo('main')])).toBeNull();
    expect(eventoDelClic([])).toBeNull();
  });

  it('deshabilitado no suena, aunque esté marcado', () => {
    expect(eventoDelClic([nodo('button', { disabled: '' })])).toBeNull();
    expect(eventoDelClic([nodo('button', { 'aria-disabled': 'true' })])).toBeNull();
    expect(eventoDelClic([nodo('button', { disabled: '', 'data-sonido': 'cobro' })])).toBeNull();
  });

  it('la marca manda, también desde un padre; «ninguno» lo calla', () => {
    expect(eventoDelClic([nodo('button', { 'data-sonido': 'agregar' })])).toBe('agregar');
    expect(
      eventoDelClic([nodo('span'), nodo('button'), nodo('div', { 'data-sonido': 'tecla' })]),
    ).toBe('tecla');
    expect(eventoDelClic([nodo('button', { 'data-sonido': 'ninguno' })])).toBeNull();
    expect(eventoDelClic([nodo('button', { 'data-sonido': 'no-existe' })])).toBeNull();
  });

  it('el hueco entre las teclas de un teclado marcado no suena: sólo lo que se puede tocar', () => {
    expect(eventoDelClic([nodo('div'), nodo('div', { 'data-sonido': 'tecla' })])).toBeNull();
    expect(eventoDelClic([nodo('div', { 'data-sonido': 'tecla' })])).toBeNull();
  });

  it('un interruptor suena a como queda', () => {
    expect(eventoDelClic([nodo('button', { role: 'switch', 'aria-checked': 'false' })])).toBe(
      'encender',
    );
    expect(eventoDelClic([nodo('button', { role: 'switch', 'aria-checked': 'true' })])).toBe(
      'apagar',
    );
  });

  it('una pestaña o un enlace del menú es cambiar de sección; otro enlace, un toque', () => {
    expect(eventoDelClic([nodo('button', { role: 'tab' })])).toBe('seccion');
    expect(eventoDelClic([nodo('span'), nodo('a', { href: '/caja' }), nodo('nav')])).toBe(
      'seccion',
    );
    expect(eventoDelClic([nodo('a', { href: '/caja' }), nodo('main')])).toBe('toque');
    expect(eventoDelClic([nodo('a'), nodo('nav')])).toBeNull();
  });
});
