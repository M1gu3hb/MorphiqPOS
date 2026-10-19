import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CICLOS, CONSERVADAS, ORDEN_DE_LIMPIEZA } from './tablas-del-reseteo.ts';

/**
 * EL RESETEO BORRA TODO, Y EN UN ORDEN QUE LAS LLAVES ACEPTAN (bloque B.2 de la 2.4).
 *
 * Contra `scripts/esquema-esperado.json` —el esquema que `verify:esquema` compara con la
 * base viva—, y sin llamar al generador: si alguien edita la lista a mano, o una
 * migración añade una tabla y nadie regenera, esto se pone en rojo.
 *
 * Vista en ROJO: quitando `cotizaciones` de la lista (queda sin borrar) y moviendo
 * `orden_lineas` detrás de `ordenes` (el padre antes que el hijo).
 */

interface Columna {
  readonly esquema: string;
  readonly tabla: string;
  readonly columna: string;
  readonly noNula: boolean;
}
interface Restriccion {
  readonly esquema: string;
  readonly tabla: string;
  readonly tipo: string;
  readonly definicion: string;
}

const esquema = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../scripts/esquema-esperado.json', import.meta.url)),
    'utf8',
  ),
) as { columnas: Columna[]; restricciones: Restriccion[] };

const columnas = esquema.columnas.filter((c) => c.esquema === 'public');
const tablas = new Set(columnas.map((c) => c.tabla));
const tiene = (tabla: string, columna: string) =>
  columnas.some((c) => c.tabla === tabla && c.columna === columna);
const noNula = (tabla: string, columna: string) =>
  columnas.some((c) => c.tabla === tabla && c.columna === columna && c.noNula);

const llaves = esquema.restricciones
  .filter((r) => r.esquema === 'public' && r.tipo === 'foreign_key')
  .map((r) => {
    const m = /^FOREIGN KEY \(([^)]+)\) REFERENCES ([a-z_]+)\(([^)]+)\)/.exec(r.definicion);
    if (m?.[1] === undefined || m[2] === undefined || m[3] === undefined) {
      throw new Error(r.definicion);
    }
    const accion = /ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/.exec(r.definicion)?.[1];
    return {
      hijo: r.tabla,
      columnas: m[1].split(',').map((c) => c.trim()),
      padre: m[2],
      referidas: m[3].split(',').map((c) => c.trim()),
      accion: accion ?? 'NO ACTION',
    };
  });

const posicion = new Map(ORDEN_DE_LIMPIEZA.map((p, i) => [p.tabla, i]));
const rotas = new Set(CICLOS.map((c) => `${c.tabla}.${c.columna}`));

describe('el reseteo de una demo · qué borra', () => {
  it('cada tabla del esquema se borra o se conserva, nunca las dos y nunca ninguna', () => {
    const sinDecidir = [...tablas].filter((t) => !(t in CONSERVADAS) && !posicion.has(t));
    const lasDos = [...tablas].filter((t) => t in CONSERVADAS && posicion.has(t));
    expect(sinDecidir, 'tablas que el reseteo deja como las dejó la última prueba').toEqual([]);
    expect(lasDos).toEqual([]);
    expect(ORDEN_DE_LIMPIEZA.length).toBe(posicion.size);
  });

  it('no nombra tablas que ya no existen, y cada conservada dice por qué', () => {
    for (const t of [...Object.keys(CONSERVADAS), ...posicion.keys()]) {
      expect(tablas.has(t), t).toBe(true);
    }
    for (const [t, razon] of Object.entries(CONSERVADAS)) {
      expect(razon.length, `«${t}» sin una razón`).toBeGreaterThanOrEqual(40);
    }
  });

  it('se borra hijo antes que padre en TODA llave entre dos tablas que se borran', () => {
    const alReves: string[] = [];
    for (const f of llaves) {
      const h = posicion.get(f.hijo);
      const p = posicion.get(f.padre);
      if (h === undefined || p === undefined || f.hijo === f.padre) continue;
      if (f.columnas.some((c) => rotas.has(`${f.hijo}.${c}`))) continue;
      if (h > p) alReves.push(`${f.hijo}(${f.columnas.join(',')}) → ${f.padre}`);
    }
    expect(alReves).toEqual([]);
  });

  it('ninguna tabla conservada bloquea el borrado de una que se borra', () => {
    const bloquean = llaves.filter(
      (f) =>
        f.hijo in CONSERVADAS &&
        posicion.has(f.padre) &&
        (f.accion === 'RESTRICT' ||
          f.accion === 'NO ACTION' ||
          (f.accion === 'SET NULL' &&
            f.columnas.some((c) => c !== 'organizacion_id' && noNula(f.hijo, c)))),
    );
    expect(bloquean.map((f) => `${f.hijo} → ${f.padre} (${f.accion})`)).toEqual([]);
  });

  it('las que no tienen organizacion_id se filtran por una llave NO NULA a su padre', () => {
    for (const paso of ORDEN_DE_LIMPIEZA) {
      if (paso.via === null) {
        expect(tiene(paso.tabla, 'organizacion_id'), paso.tabla).toBe(true);
        continue;
      }
      expect(noNula(paso.tabla, paso.via.columna), `${paso.tabla}.${paso.via.columna}`).toBe(true);
      expect(tiene(paso.via.padre, 'organizacion_id'), paso.via.padre).toBe(true);
      expect(
        llaves.some(
          (f) =>
            f.hijo === paso.tabla &&
            f.padre === paso.via?.padre &&
            f.columnas[0] === paso.via.columna &&
            // La columna del padre es la que la llave referencia, no `id` por costumbre:
            // suponer `id` rompía el reseteo en `recursos_servicio → servicios`.
            f.referidas[0] === paso.via.referida,
        ),
        `${paso.tabla}.${paso.via.columna} → ${paso.via.padre}(${paso.via.referida})`,
      ).toBe(true);
    }
  });

  it('cada ciclo se rompe por una columna que admite nulo, de una tabla con organizacion_id', () => {
    for (const { tabla, columna } of CICLOS) {
      expect(tiene(tabla, columna), `${tabla}.${columna}`).toBe(true);
      expect(noNula(tabla, columna), `${tabla}.${columna} no admite nulo`).toBe(false);
      expect(tiene(tabla, 'organizacion_id'), tabla).toBe(true);
    }
  });

  it('`limpiar` recorre ESTA lista y rompe ESTOS ciclos, no una propia', () => {
    const fuente = readFileSync(
      fileURLToPath(new URL('./resetear.ts', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    const cuerpo = fuente.slice(fuente.indexOf('async function limpiar('));
    const fin = cuerpo.indexOf('\n}\n');
    const limpiar = cuerpo.slice(0, fin);
    expect(limpiar).toMatch(/for\s*\(\s*const\s+\{\s*tabla,\s*columna\s*\}\s+of\s+CICLOS\s*\)/);
    expect(limpiar).toMatch(/for\s*\(\s*const\s+paso\s+of\s+ORDEN_DE_LIMPIEZA\s*\)/);
    // Y ni un `delete from <tabla>` escrito a mano: la lista es la única fuente. La
    // única excepción son las terminales, que se borran TODAS MENOS UNA.
    expect(limpiar).not.toMatch(/delete from (?!terminales[\s)])[a-z_]+\s+where/);
  });
});
