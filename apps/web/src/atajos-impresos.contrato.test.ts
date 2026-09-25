import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * C.5 de la etapa 2.4 · UNA TECLA IMPRESA ES UNA PROMESA.
 *
 * «COBRAR · F12», «Tarjeta F9», «Remisión a cuenta · F11»: seis teclas iban impresas
 * en botones sin que el teclado las escuchara. Un atajo que se anuncia y no responde
 * es un botón muerto, y el cajero que lo prueba una vez no vuelve a confiar en
 * ninguno.
 *
 * Qué se mira, por archivo de `apps/web/src`:
 *   · IMPRESA: una tecla F en lo que se pinta —`· F12` en un texto, `<Tecla>F12`, o
 *     `tecla: 'F9'` en la lista que se pinta junto a su botón—.
 *   · ESCUCHADA: el mismo archivo compara `key` con ESA tecla (`key === 'F12'`,
 *     `key !== 'F12'`), o la tiene en un mapa de atajos (`F12: 'cobrar'`), o —para
 *     `tecla: '…'`— busca la tecla de la lista con `evento.key`.
 * Un «(F11)» dentro de una explicación habla de la tecla de OTRA pantalla y no cuenta.
 */

const RAIZ = dirname(fileURLToPath(import.meta.url));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return nombre.endsWith('.tsx') && !nombre.includes('.test.') ? [ruta] : [];
  });
}

/** El código sin comentarios: una tecla nombrada en un comentario no se pinta. */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function teclasImpresas(codigo: string): readonly string[] {
  const limpio = sinComentarios(codigo);
  const impresas = new Set<string>();
  for (const patron of [
    /·\s*(F1[0-2]|F[1-9])\b/g,
    /<Tecla>\s*(F1[0-2]|F[1-9])\s*<\/Tecla>/g,
    /tecla:\s*'(F1[0-2]|F[1-9])'/g,
  ]) {
    for (const hallazgo of limpio.matchAll(patron)) impresas.add(hallazgo[1] ?? '');
  }
  return [...impresas].filter((t) => t !== '').toSorted();
}

export function teclaEscuchada(codigo: string, tecla: string): boolean {
  const limpio = sinComentarios(codigo);
  const comparada = new RegExp(`key\\s*[!=]==\\s*'${tecla}'`).test(limpio);
  const enMapa = new RegExp(`\\b${tecla}\\s*:\\s*'[a-z]`).test(limpio);
  const deLaLista =
    new RegExp(`tecla:\\s*'${tecla}'`).test(limpio) &&
    /\.tecla\s*===\s*evento\.key|evento\.key\s*===\s*\w+\.tecla/.test(limpio);
  return comparada || enMapa || deLaLista;
}

describe('las teclas F impresas se escuchan', () => {
  it('el detector ve lo impreso y no lo comentado', () => {
    expect(teclasImpresas("<span>{'COBRAR · F12'}</span>")).toEqual(['F12']);
    expect(teclasImpresas('// COBRAR · F12\nconst x = 1;')).toEqual([]);
    expect(teclaEscuchada("if (evento.key === 'F12') {}", 'F12')).toBe(true);
    expect(teclaEscuchada("if (evento.key === 'F2') {}", 'F12')).toBe(false);
  });

  it('CADA tecla impresa en apps/web/src tiene quien la escuche en su archivo', () => {
    const muertas: string[] = [];
    for (const ruta of archivos(RAIZ)) {
      const codigo = readFileSync(ruta, 'utf8');
      for (const tecla of teclasImpresas(codigo)) {
        if (!teclaEscuchada(codigo, tecla)) muertas.push(`${relative(RAIZ, ruta)} · ${tecla}`);
      }
    }
    expect(muertas, 'Teclas impresas que el teclado no escucha: botones muertos.').toEqual([]);
  });
});
