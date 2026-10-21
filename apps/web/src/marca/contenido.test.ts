import { describe, expect, it } from 'vitest';

import {
  ESTILO_DE_LA_PALABRA,
  ESTILO_DE_LA_VARIANTE,
  contenidoDeLaMarca,
  type VarianteDeMarca,
} from './contenido';
import { RUTA_DEL_LOGO_OFICIAL } from './logo';

/**
 * La marca de la plataforma. El componente (`MarcaMorphiq.tsx`) sólo pinta lo que decide
 * `contenido.ts`, y es ahí donde se prueba: las pruebas de `apps/web` no transforman JSX.
 */

const VARIANTES: readonly VarianteDeMarca[] = ['acceso', 'ticket', 'documento', 'portal'];

describe('contenidoDeLaMarca · el logo oficial que entregó Miguel (21-10)', () => {
  it('el repositorio trae el logo oficial en un solo punto', () => {
    expect(RUTA_DEL_LOGO_OFICIAL).toBe('/marca/morphiq-logo.png');
    expect(contenidoDeLaMarca(null)).toEqual({
      tipo: 'logo',
      src: '/marca/morphiq-logo.png',
      alt: 'Morphiq',
    });
  });
});

describe('contenidoDeLaMarca · sin archivo de logo', () => {
  it('pinta la palabra «Morphiq»', () => {
    expect(contenidoDeLaMarca(null, null)).toEqual({ tipo: 'texto', texto: 'Morphiq' });
    expect(contenidoDeLaMarca(undefined, null)).toEqual({ tipo: 'texto', texto: 'Morphiq' });
    expect(contenidoDeLaMarca('', null)).toEqual({ tipo: 'texto', texto: 'Morphiq' });
  });

  it('cambia la marca anterior de la plataforma por la de hoy', () => {
    expect(contenidoDeLaMarca('MH Astral Systems', null)).toEqual({
      tipo: 'texto',
      texto: 'Morphiq',
    });
  });

  it('respeta la marca que el negocio escribió a propósito', () => {
    expect(contenidoDeLaMarca('Agencia Aurora', null)).toEqual({
      tipo: 'texto',
      texto: 'Agencia Aurora',
    });
  });
});

describe('contenidoDeLaMarca · cuando ya haya logo oficial', () => {
  const LOGO = '/marca/morphiq-logo.svg';

  it('pinta el archivo en lugar de la palabra, sin tocar ninguna pantalla', () => {
    expect(contenidoDeLaMarca(null, LOGO)).toEqual({ tipo: 'logo', src: LOGO, alt: 'Morphiq' });
    expect(contenidoDeLaMarca('MH Astral Systems', LOGO)).toEqual({
      tipo: 'logo',
      src: LOGO,
      alt: 'Morphiq',
    });
  });

  it('no le pone el logo de Morphiq encima a un negocio que firmó con su propia marca', () => {
    expect(contenidoDeLaMarca('Agencia Aurora', LOGO)).toEqual({
      tipo: 'texto',
      texto: 'Agencia Aurora',
    });
  });
});

describe('las variantes', () => {
  it('hay una por cada sitio donde se pinta la marca', () => {
    expect(Object.keys(ESTILO_DE_LA_VARIANTE).sort()).toEqual([...VARIANTES].sort());
  });

  it('el acceso lleva su color; en un ticket o un PDF la marca hereda el del documento', () => {
    expect(ESTILO_DE_LA_VARIANTE.acceso).toContain('text-primario-texto');
    for (const variante of ['ticket', 'documento'] as const) {
      // Sólo el tamaño (`text-xs`): un color propio sería lo único de la hoja que no obedece
      // a su fondo —un ticket imprime en negro—.
      expect(ESTILO_DE_LA_VARIANTE[variante]).not.toMatch(/\btext-(?!xs\b)/);
    }
  });

  it('no escriben ningún color ni tamaño literal: sólo tokens del sistema', () => {
    const todas = [...Object.values(ESTILO_DE_LA_VARIANTE), ESTILO_DE_LA_PALABRA].join(' ');
    expect(todas).not.toMatch(/#[0-9a-f]{3,8}\b|\[\d+px\]|\b(?:bg|text)-(?:white|black)\b/i);
    // Ningún espacio literal grande: van como `(--espacio-N)`, que obedece a la densidad.
    expect(todas).not.toMatch(/\b(?:p|px|py|m|mx|my|mt|mb|gap)-(?:3|4|5|6|8|10|12)\b/);
  });
});
