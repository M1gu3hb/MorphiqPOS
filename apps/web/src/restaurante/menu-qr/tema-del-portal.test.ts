import { describe, expect, it } from 'vitest';

import { atributosDelTema, temaDelPortal } from './tema-del-portal.ts';

/**
 * DP-9.7 · EL ASPECTO DEL PORTAL. Lo que llega sin forma vuelve al de siempre, y al portal sólo
 * se le ponen los atributos que cambian algo.
 */
describe('el aspecto del portal', () => {
  it('sin tema, o con basura: el de siempre', () => {
    expect(temaDelPortal(undefined)).toEqual({
      estilo: null,
      tipografia: 'sistema',
      fondo: 'marca',
    });
    expect(temaDelPortal({ tipografia: 'gotica', fondo: 'neon' })).toEqual({
      estilo: null,
      tipografia: 'sistema',
      fondo: 'marca',
    });
  });

  it('sólo los atributos que cambian algo', () => {
    expect(atributosDelTema(temaDelPortal(null))).toEqual({});
    expect(atributosDelTema({ estilo: 'papel', tipografia: 'clasica', fondo: 'liso' })).toEqual({
      'data-estilo': 'papel',
      'data-tipografia': 'clasica',
    });
  });
});
