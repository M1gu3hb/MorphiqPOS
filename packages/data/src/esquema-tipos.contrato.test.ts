import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * LOS TIPOS DE KYSELY DICEN LAS COLUMNAS QUE LA BASE TIENE (2.4, destapado por C.4).
 *
 * `sesiones_caja` tenía desde la migración 100 `efectivo_esperado_centavos` y
 * `diferencia_centavos`, y `esquema.ts` no las declaraba: con los tipos sin ellas, el
 * código no las podía escribir sin un `sql` a mano, y nadie las escribió. El corte nunca
 * guardó su diferencia, y el encargo de la 2.4 llegó a pedir una migración para crear
 * columnas que ya existían.
 *
 * Esto compara `esquema.ts` contra `scripts/esquema-esperado.json` —el esquema que
 * `verify:esquema` compara con la base viva—: toda columna de toda tabla tiene que estar
 * en su interfaz.
 */
const RAIZ = new URL('../../../', import.meta.url);
const esquema = JSON.parse(
  readFileSync(fileURLToPath(new URL('scripts/esquema-esperado.json', RAIZ)), 'utf8'),
) as { columnas: { esquema: string; tabla: string; columna: string }[] };
const fuente = readFileSync(fileURLToPath(new URL('./esquema.ts', import.meta.url)), 'utf8');

/** `tabla` → el nombre de su interfaz, leído de `export interface Esquema { … }`. */
function interfaces(): Map<string, string> {
  const cuerpo = /export interface Esquema \{([\s\S]*?)\n\}/.exec(fuente)?.[1] ?? '';
  const mapa = new Map<string, string>();
  for (const linea of cuerpo.split('\n')) {
    const par = /^\s+([a-z_]+): ([A-Za-z]+);/.exec(linea);
    if (par?.[1] !== undefined && par[2] !== undefined) mapa.set(par[1], par[2]);
  }
  return mapa;
}

/** Los campos de una interfaz. */
function camposDe(nombre: string): Set<string> {
  const inicio = fuente.indexOf(`export interface ${nombre} {`);
  if (inicio === -1) return new Set();
  const fin = fuente.indexOf('\n}', inicio);
  const cuerpo = fuente.slice(inicio, fin);
  return new Set([...cuerpo.matchAll(/^\s+([a-z_][a-z0-9_]*)\??:/gm)].map((m) => m[1] ?? ''));
}

describe('esquema.ts contra el esquema de la base', () => {
  const porTabla = new Map<string, string[]>();
  for (const c of esquema.columnas.filter((c) => c.esquema === 'public')) {
    porTabla.set(c.tabla, [...(porTabla.get(c.tabla) ?? []), c.columna]);
  }
  const mapa = interfaces();

  it('cada tabla del esquema tiene su interfaz', () => {
    const sinInterfaz = [...porTabla.keys()].filter((t) => !mapa.has(t)).sort();
    expect(sinInterfaz).toEqual([]);
  });

  it('cada columna de cada tabla está en su interfaz', () => {
    const faltan: string[] = [];
    for (const [tabla, columnas] of porTabla) {
      const nombre = mapa.get(tabla);
      if (nombre === undefined) continue;
      const campos = camposDe(nombre);
      for (const columna of columnas) if (!campos.has(columna)) faltan.push(`${tabla}.${columna}`);
    }
    expect(faltan.sort()).toEqual([]);
  });
});
