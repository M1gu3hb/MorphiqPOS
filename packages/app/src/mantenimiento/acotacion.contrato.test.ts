import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TABLAS_DEL_CATALOGO, TABLAS_POR_SECCION } from './purgas.ts';

/**
 * TODA tabla que una purga toca tiene que saber acotarse a UNA organización.
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * `orden_linea_modificadores` estaba en la sección `ventas` como una más, y no
 * tiene `organizacion_id`: cuelga de `orden_lineas`. La consulta salía con
 * «column "organizacion_id" does not exist» y tumbaba la transacción entera, de
 * modo que LAS CINCO purgas fallaban —`purgar_ventas`, `reiniciar_pruebas` y
 * `reiniciar_todo` incluidas—.
 *
 * No lo vio nada: los quince casos de `mantenimiento.test.ts` corren sobre una
 * base falsa que no valida columnas, y la verificación en vivo sólo había
 * ejercitado los RECHAZOS —sin confirmación, rol equivocado, límite de
 * peticiones—, nunca una purga que llegara a ejecutarse. Apareció al vaciar el
 * histórico de verdad, antes de entregar.
 *
 * ── Cómo está escrito ──────────────────────────────────────────────────────
 * Lee el ESQUEMA de `packages/data/src/esquema.ts` —la misma fuente que usa
 * Kysely— y comprueba, tabla por tabla, que o bien declara `organizacion_id`, o
 * bien está en la lista de las que se acotan por su padre. Una tabla nueva en
 * una sección sin ninguna de las dos cosas rompe esta prueba, que es lo que no
 * pasó la primera vez.
 *
 * Lo que NO puede ver: que el `where` por el padre sea el CORRECTO. Que
 * `orden_linea_modificadores` se acote por `orden_lineas` y no por otra cosa
 * sigue siendo una decisión humana; esto sólo garantiza que alguien la tomó.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESQUEMA = join(AQUI, '../../../data/src/esquema.ts');
const PURGAS = join(AQUI, 'purgas.ts');

/** `nombre_de_tabla` → nombre de la interfaz de Kysely, y sus columnas. */
function columnasPorTabla(): ReadonlyMap<string, readonly string[]> {
  const fuente = readFileSync(ESQUEMA, 'utf8');

  // El mapa `nombre en la base` → `interfaz`, que vive en el `interface Esquema`.
  const bloque = /export interface Esquema \{([\s\S]*?)\n\}/.exec(fuente)?.[1] ?? '';
  const interfazDe = new Map<string, string>();
  for (const m of bloque.matchAll(/^\s*(\w+):\s*(\w+);/gm)) {
    if (m[1] !== undefined && m[2] !== undefined) interfazDe.set(m[1], m[2]);
  }

  const salida = new Map<string, readonly string[]>();
  for (const [tabla, interfaz] of interfazDe) {
    const cuerpo = new RegExp(`export interface ${interfaz} \\{([\\s\\S]*?)\\n\\}`).exec(
      fuente,
    )?.[1];
    if (cuerpo === undefined) continue;
    salida.set(tabla, [...cuerpo.matchAll(/^\s*(\w+)[?]?:/gm)].map((m) => m[1] ?? ''));
  }
  return salida;
}

const COLUMNAS = columnasPorTabla();
/** Las tablas que la purga declara acotadas por su padre, leídas del código. */
const POR_PADRE = new Set(
  [
    ...(/const SIN_ORGANIZACION_PROPIA[\s\S]*?\n\};/.exec(readFileSync(PURGAS, 'utf8'))?.[0] ?? '')
      .matchAll(/^\s{2}(\w+):/gm),
  ].map((m) => m[1] ?? ''),
);

/**
 * TODAS las tablas que una purga toca, no sólo las de las secciones.
 *
 * La primera versión de este contrato miraba únicamente `TABLAS_POR_SECCION` y
 * dejaba fuera `TABLAS_DEL_CATALOGO`, que es lo que borra `reiniciar_todo`. Ahí
 * dentro estaba `modificador_opciones`, que tampoco tiene `organizacion_id`, así
 * que el contrato pasaba en verde con el mismo defecto que decía vigilar — una
 * tabla más allá de donde miraba.
 */
const TODAS = [
  ...new Set([...Object.values(TABLAS_POR_SECCION).flat(), ...TABLAS_DEL_CATALOGO]),
].sort();

describe('las purgas saben acotar TODAS sus tablas a una organización', () => {
  it('el esquema se pudo leer: si no, el contrato pasaría vacío', () => {
    expect(COLUMNAS.size).toBeGreaterThan(20);
    expect(COLUMNAS.get('ordenes')).toContain('organizacion_id');
    expect(TODAS.length).toBeGreaterThanOrEqual(13);
    // Y que las dos listas estén de verdad dentro: si una desapareciera del
    // `import`, el contrato seguiría en verde vigilando la mitad.
    expect(TODAS).toContain('ordenes');
    expect(TODAS).toContain('modificador_opciones');
  });

  it('la lista de acotadas por su padre no está vacía, y se leyó del código', () => {
    // Si el patrón dejara de encajar, todo lo de abajo pasaría por «tiene
    // organizacion_id o está declarada», y una tabla sin ninguna de las dos
    // colaría igual que la primera vez.
    expect(POR_PADRE.has('orden_linea_modificadores')).toBe(true);
    expect(POR_PADRE.has('modificador_opciones')).toBe(true);
  });

  for (const tabla of TODAS) {
    it(`${tabla} · o lleva organizacion_id, o está declarada`, () => {
      const columnas = COLUMNAS.get(tabla);
      expect(columnas, `«${tabla}» no existe en el esquema`).toBeDefined();

      const propia = (columnas ?? []).includes('organizacion_id');
      expect(
        propia || POR_PADRE.has(tabla),
        `«${tabla}» no tiene «organizacion_id» y tampoco está en ` +
          'SIN_ORGANIZACION_PROPIA. La purga saldrá con «column "organizacion_id" ' +
          'does not exist» y tumbará la transacción entera: las cinco purgas ' +
          'fallan, no sólo la de esta sección.',
      ).toBe(true);
    });
  }

  it('nadie está declarado por padre teniendo organizacion_id propia', () => {
    // El error inverso: una excepción que sobra oculta el camino directo y
    // añade un `in (select …)` que Postgres tiene que resolver por nada.
    for (const tabla of POR_PADRE) {
      expect(
        (COLUMNAS.get(tabla) ?? []).includes('organizacion_id'),
        `«${tabla}» SÍ tiene organizacion_id: sobra su excepción.`,
      ).toBe(false);
    }
  });
});
