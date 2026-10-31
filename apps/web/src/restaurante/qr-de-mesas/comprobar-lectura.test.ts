import { describe, expect, it } from 'vitest';

import { veredicto } from './comprobar-lectura';

const MESA = 'https://pos.ejemplo.mx/qr/la-mesa-7';

describe('el veredicto de la lectura', () => {
  it('legible sólo si en todas las pruebas dijo la dirección de la mesa', () => {
    expect(
      veredicto(
        [
          { prueba: 'tal cual', dijo: MESA },
          { prueba: 'pequeño', dijo: MESA },
        ],
        MESA,
      ),
    ).toEqual({ legible: true, fallidas: [] });
  });

  it('no leerse, o leer OTRA dirección, son fallas; se dice en qué prueba', () => {
    expect(
      veredicto(
        [
          { prueba: 'tal cual', dijo: MESA },
          { prueba: 'pequeño', dijo: null },
          { prueba: 'girado 3°', dijo: 'https://pos.ejemplo.mx/qr/otra-mesa' },
        ],
        MESA,
      ),
    ).toEqual({ legible: false, fallidas: ['pequeño', 'girado 3°'] });
  });

  it('sin ninguna lectura no hay nada que diga que se lee', () => {
    expect(veredicto([], MESA).legible).toBe(false);
  });
});
