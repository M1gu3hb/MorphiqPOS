import { describe, expect, it } from 'vitest';

import { eventoAlAparecer, eventoAlDesaparecer, type NodoVisto } from './observador';

/** DP-11.3 · LO QUE APARECE Y DESAPARECE: diálogos y avisos que suenan sin tocar quien los abre. */

function visto(avisos: readonly (string | null)[], contieneDialogo = false): NodoVisto {
  return { avisos, contieneDialogo };
}

describe('eventoAlAparecer', () => {
  it('un diálogo o cajón que se abre', () => {
    expect(eventoAlAparecer(visto([], true))).toBe('abrir');
    expect(eventoAlAparecer(visto([]))).toBeNull();
  });

  it('los avisos: el de error y el de advertencia o información; el de éxito, no', () => {
    expect(eventoAlAparecer(visto(['error']))).toBe('error');
    expect(eventoAlAparecer(visto(['warning']))).toBe('aviso');
    expect(eventoAlAparecer(visto(['info']))).toBe('aviso');
    expect(eventoAlAparecer(visto(['success']))).toBeNull();
    expect(eventoAlAparecer(visto([null], true))).toBeNull();
  });

  it('la lista de avisos que llega con varios dentro suena por el más serio', () => {
    expect(eventoAlAparecer(visto(['success', 'error']))).toBe('error');
    expect(eventoAlAparecer(visto(['success', 'info']))).toBe('aviso');
  });
});

describe('eventoAlDesaparecer', () => {
  it('cerrar suena sólo si lo que se fue era un diálogo', () => {
    expect(eventoAlDesaparecer(visto([], true))).toBe('cerrar');
    expect(eventoAlDesaparecer(visto(['error']))).toBeNull();
  });
});
