import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COLUMNAS_CON_ARCHIVO } from './en-uso.ts';

/**
 * Antes de borrar un archivo se pregunta a TODAS las columnas que guardan su URL. Si una
 * migración añade otra (`*_url` de texto) y nadie la suma aquí, esto se pone en rojo:
 * borrar una imagen en uso dejaría una foto rota en esa tabla.
 */
describe('las columnas que guardan un archivo', () => {
  it('son exactamente las `*_url` de texto del esquema con organizacion_id', () => {
    const esquema = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../../scripts/esquema-esperado.json', import.meta.url)),
        'utf8',
      ),
    ) as { columnas: { tabla: string; columna: string; tipo: string; esquema: string }[] };
    const conOrganizacion = new Set(
      esquema.columnas.filter((c) => c.columna === 'organizacion_id').map((c) => c.tabla),
    );
    const delEsquema = esquema.columnas
      .filter(
        (c) =>
          c.esquema === 'public' &&
          c.tipo === 'text' &&
          c.columna.endsWith('_url') &&
          conOrganizacion.has(c.tabla),
      )
      .map((c) => `${c.tabla}.${c.columna}`)
      .sort();
    expect(COLUMNAS_CON_ARCHIVO.map((c) => `${c.tabla}.${c.columna}`).sort()).toEqual(delEsquema);
  });
});
