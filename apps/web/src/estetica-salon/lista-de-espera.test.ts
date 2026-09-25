import { describe, expect, it } from 'vitest';

import {
  enlaceDeAviso,
  mensajeDeAviso,
  ventanaEnPalabras,
  type EsperaViva,
} from './lista-de-espera.ts';

const LUPE: EsperaViva = {
  esperaId: 'e1',
  clienteId: 'c1',
  clienteNombre: 'Lupe',
  telefono: '228 111 2233',
  servicioNombre: 'Tinte completo',
  profesionalNombre: 'Karla',
  desde: '2026-09-26T15:00:00.000Z',
  hasta: '2026-09-28T23:00:00.000Z',
  flexibleDeDia: true,
  estado: 'esperando',
};

describe('la lista de espera en palabras', () => {
  it('la ventana se dice con sus dos días; sin ventana, «cuando se pueda»', () => {
    expect(ventanaEnPalabras(LUPE)).toMatch(/26 .*sep.* – .*28 .*sep/);
    expect(ventanaEnPalabras({ desde: null, hasta: null })).toBe('cuando se pueda');
  });

  it('el aviso lo redacta el sistema y lo manda quien atiende', () => {
    expect(mensajeDeAviso(LUPE)).toBe(
      'Hola Lupe, se liberó un lugar para tu tinte completo con Karla. ¿Te lo apartamos?',
    );
    expect(enlaceDeAviso(LUPE)).toBe(
      `https://wa.me/522281112233?text=${encodeURIComponent(mensajeDeAviso(LUPE))}`,
    );
  });

  it('sin un teléfono que sirva no hay enlace', () => {
    expect(enlaceDeAviso({ ...LUPE, telefono: null })).toBeNull();
    expect(enlaceDeAviso({ ...LUPE, telefono: '12345' })).toBeNull();
  });
});
