import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * C.16 de la etapa 2.4 · LO QUE SE IMPRIME ES PAPEL, EN CUALQUIER ESTILO.
 *
 * El heredado protege sus documentos imprimibles (ticket, pre-cuenta, corte, PDF del
 * periodo, ficha de producto) con cuatro clases —`.ticket-printable`, `.cash-cut-pdf`,
 * `.pdf-corte-caja`, `.printable-doc`— que fuerzan fondo blanco y TEXTO OSCURO en todo
 * el árbol. Cuando C.16 tradujo sus colores fijos a tokens, `bg-gray-100` pasó a
 * `bg-fondo-sutil` y `bg-white` a `bg-superficie`: en Noche o Terminal esos fondos se
 * oscurecen y el texto, forzado a oscuro, deja de leerse —en pantalla y en el papel—.
 *
 * La propiedad: cada contenedor protegido REDEFINE, con su valor de papel, todo token
 * que pintan los documentos que lo usan. Las utilidades son `@theme inline`
 * (`hsl(var(--fondo-sutil))` en el propio elemento), así que un token redefinido en el
 * contenedor gana al del estilo en todo lo que hay dentro.
 */

const RAIZ = dirname(fileURLToPath(import.meta.url));
const HEREDADO = join(RAIZ, '..', 'heredado');
const PROTEGIDAS = ['ticket-printable', 'cash-cut-pdf', 'pdf-corte-caja', 'printable-doc'];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(jsx?|tsx?)$/.test(nombre) ? [ruta] : [];
  });
}

function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** `--color-fondo-sutil: hsl(var(--fondo-sutil))` → fondo-sutil ⇒ --fondo-sutil. */
export function tokensDelTema(globals: string): ReadonlyMap<string, string> {
  const mapa = new Map<string, string>();
  for (const m of globals.matchAll(/--color-([a-z0-9-]+):\s*hsl\(var\((--[a-z0-9-]+)\)\)/g)) {
    const [, clase, variable] = m;
    if (clase !== undefined && variable !== undefined) mapa.set(clase, variable);
  }
  return mapa;
}

/** Las variables del sistema que pinta un archivo, por sus clases de color con token. */
export function variablesPintadas(
  codigo: string,
  tema: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const usadas = new Set<string>();
  const limpio = sinComentarios(codigo);
  for (const m of limpio.matchAll(
    /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[tblrxy])?|divide|ring|outline|from|via|to|fill|stroke)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g,
  )) {
    const variable = tema.get(m[1] ?? '');
    if (variable !== undefined) usadas.add(variable);
  }
  return usadas;
}

/** Las variables que cada clase protegida redefine en una regla propia. */
export function redefinidasPor(css: string, clase: string): ReadonlySet<string> {
  const declaradas = new Set<string>();
  const limpio = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const regla of limpio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectores = (regla[1] ?? '').split(',').map((s) => s.trim());
    if (!selectores.includes(`.${clase}`)) continue;
    for (const d of (regla[2] ?? '').matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      if (d[1] !== undefined) declaradas.add(d[1]);
    }
  }
  return declaradas;
}

describe('los documentos imprimibles del heredado', () => {
  const tema = tokensDelTema(readFileSync(join(RAIZ, '..', 'app', 'globals.css'), 'utf8'));
  const css = readFileSync(join(HEREDADO, 'index.css'), 'utf8');
  const documentos = archivos(HEREDADO)
    .map((ruta) => ({ ruta, codigo: readFileSync(ruta, 'utf8') }))
    .filter(({ codigo }) =>
      PROTEGIDAS.some((clase) =>
        new RegExp(`['"\`\\s]${clase}['"\`\\s]`).test(sinComentarios(codigo)),
      ),
    );

  it('se encuentran (si no, el contrato no mira nada)', () => {
    expect(tema.size).toBeGreaterThan(20);
    expect(documentos.length).toBeGreaterThanOrEqual(4);
  });

  it.each(PROTEGIDAS)('`.%s` redefine en papel todo token que pintan', (clase) => {
    const redefinidas = redefinidasPor(css, clase);
    const faltan = documentos.flatMap(({ ruta, codigo }) =>
      [...variablesPintadas(codigo, tema)]
        .filter((v) => !redefinidas.has(v))
        .map((v) => `${relative(HEREDADO, ruta)} pinta ${v}`),
    );
    expect(faltan).toEqual([]);
  });
});
