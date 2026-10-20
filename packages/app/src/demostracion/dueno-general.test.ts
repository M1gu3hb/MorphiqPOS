import { describe, expect, it } from 'vitest';

import { configuracionRepuesta, duenoGeneralDe } from './dueno-general.ts';

const GENERAL = '9d420077-da74-44a8-aedf-68ef8aefcab7';
const DESTINOS = [
  {
    empleoId: '22a43314-f885-4134-99a1-c02c086d3eab',
    organizacionId: 'c7fc2e42-c167-4180-9938-855f8c52896b',
  },
];
const DE_LA_DEMO = {
  impuesto: { tasa: 16, incluido: true },
  apariencia: { estilo: 'noche' },
  presentacion_password_hash: 'hash-de-la-demo',
};

describe('el reseteo de la demo y el dueño general (D-42)', () => {
  it('conserva la concesión y repone todo lo demás de la demo', () => {
    const antes = {
      presentacion_dueno_empleo: GENERAL,
      presentacion_destinos: DESTINOS,
      apariencia: { estilo: 'bloque' },
      impuesto: { tasa: 8, incluido: false },
      logo_url: 'https://ejemplo.mx/logo-de-prueba.png',
    };
    expect(configuracionRepuesta(antes, DE_LA_DEMO)).toEqual({
      ...DE_LA_DEMO,
      presentacion_dueno_empleo: GENERAL,
      presentacion_destinos: DESTINOS,
    });
  });

  it('sin concesión, la configuración es la de la demo y nada más', () => {
    expect(configuracionRepuesta({ apariencia: { estilo: 'papel' } }, DE_LA_DEMO)).toEqual(
      DE_LA_DEMO,
    );
    expect(configuracionRepuesta(null, DE_LA_DEMO)).toEqual(DE_LA_DEMO);
    expect(configuracionRepuesta('basura', DE_LA_DEMO)).toEqual(DE_LA_DEMO);
  });

  it('la demo no puede pisar la concesión aunque traiga las mismas llaves', () => {
    const conLlaves = {
      ...DE_LA_DEMO,
      presentacion_dueno_empleo: 'otro',
      presentacion_destinos: [],
    };
    expect(
      configuracionRepuesta(
        { presentacion_dueno_empleo: GENERAL, presentacion_destinos: DESTINOS },
        conLlaves,
      ),
    ).toMatchObject({ presentacion_dueno_empleo: GENERAL, presentacion_destinos: DESTINOS });
  });

  it('sabe quién es el dueño general, y que sin concesión no hay', () => {
    expect(duenoGeneralDe({ presentacion_dueno_empleo: GENERAL })).toBe(GENERAL);
    expect(duenoGeneralDe({ presentacion_dueno_empleo: '' })).toBeNull();
    expect(duenoGeneralDe({ presentacion_dueno_empleo: 42 })).toBeNull();
    expect(duenoGeneralDe({})).toBeNull();
    expect(duenoGeneralDe(null)).toBeNull();
    expect(duenoGeneralDe([GENERAL])).toBeNull();
  });
});
