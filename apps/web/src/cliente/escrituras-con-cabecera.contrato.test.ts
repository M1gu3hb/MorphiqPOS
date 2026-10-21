import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TODA ESCRITURA DEL NAVEGADOR LLEVA LA CABECERA PROPIA.
 *
 * ── El defecto que este contrato impide ────────────────────────────────────
 * El servidor rechaza con 403 «Petición de escritura rechazada» cualquier POST sin
 * `x-morphiqpos-request: 1` (`peticionDeEscrituraValida`): es la defensa contra el
 * CSRF por formulario. `invocarComando` la pone, y es el sitio único que decide las
 * cabeceras de una escritura; pero una pantalla puede saltárselo con su propio
 * `fetch`. Lo hizo el selector de Apariencia desde la 2.35: el estilo cambiaba al
 * instante en la pantalla, «Guardar para el negocio» contestaba 403, y nadie lo vio
 * porque el cambio en vivo parecía el guardado (restaurante, 20-10-2026).
 *
 * ── Qué mira ───────────────────────────────────────────────────────────────
 * Cada `fetch(…)` de lo que corre en el navegador —`apps/web/src` sin `servidor/`,
 * `apps/web/heredado` y las páginas de `apps/web/app` fuera de `api/`— cuyo método
 * sea POST, PUT, PATCH o DELETE. La cabecera tiene que estar en la llamada, o en la
 * variable de cabeceras que la llamada usa, declarada antes en el mismo archivo.
 * Una lectura no la necesita: la guarda es de escrituras.
 */

const WEB = process.cwd().endsWith('web') ? process.cwd() : join(process.cwd(), 'apps', 'web');

const ESCRITURA = /method:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/;
const CABECERA = /x-morphiqpos-request|CABECERA_PETICION_PROPIA|CABECERA_PROPIA/;
const CABECERAS_EN_VARIABLE = /headers:\s*([A-Za-z_$][\w$]*)\s*[,}\n]/;

function archivosDelNavegador(): readonly string[] {
  const encontrados: string[] = [];
  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta)) {
      const completa = join(carpeta, entrada);
      const enWeb = relative(WEB, completa).split('\\').join('/');
      if (entrada === 'node_modules' || enWeb === 'src/servidor' || enWeb === 'app/api') continue;
      if (statSync(completa).isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (/\.(jsx?|tsx?)$/.test(entrada) && !entrada.includes('.test.')) encontrados.push(completa);
    }
  };
  for (const carpeta of ['src', 'heredado', 'app']) recorrer(join(WEB, carpeta));
  return encontrados;
}

/** El texto de cada `fetch(…)`, hasta su paréntesis de cierre; las comillas no cuentan. */
function llamadasAFetch(
  fuente: string,
): readonly { readonly texto: string; readonly en: number }[] {
  const salida: { texto: string; en: number }[] = [];
  for (const m of fuente.matchAll(/\bfetch\(/g)) {
    const en = m.index;
    let i = en + m[0].length;
    let nivel = 1;
    while (i < fuente.length && nivel > 0) {
      const c = fuente[i];
      if (c === "'" || c === '"') {
        i += 1;
        while (i < fuente.length && fuente[i] !== c) i += fuente[i] === '\\' ? 2 : 1;
      } else if (c === '(') nivel += 1;
      else if (c === ')') nivel -= 1;
      i += 1;
    }
    salida.push({ texto: fuente.slice(en, i), en });
  }
  return salida;
}

/** Las escrituras de un archivo que van sin la cabecera, y cuántas escrituras tiene. */
function escriturasSinCabecera(fuente: string): {
  readonly escrituras: number;
  readonly sinCabecera: readonly string[];
} {
  let escrituras = 0;
  const sinCabecera: string[] = [];
  for (const { texto, en } of llamadasAFetch(fuente)) {
    if (!ESCRITURA.test(texto)) continue;
    escrituras += 1;
    if (CABECERA.test(texto)) continue;
    const variable = CABECERAS_EN_VARIABLE.exec(texto)?.[1];
    const conCabecera =
      variable !== undefined &&
      [`const ${variable}`, `let ${variable}`].some((d) => {
        const desde = fuente.lastIndexOf(d, en);
        return desde >= 0 && CABECERA.test(fuente.slice(desde, en));
      });
    if (!conCabecera) sinCabecera.push(texto.split('\n')[0]?.trim() ?? texto);
  }
  return { escrituras, sinCabecera };
}

describe('las escrituras del navegador', () => {
  it('todas llevan `x-morphiqpos-request`, o el servidor las rechaza con 403', () => {
    const faltan: string[] = [];
    let total = 0;
    for (const archivo of archivosDelNavegador()) {
      const { escrituras, sinCabecera } = escriturasSinCabecera(readFileSync(archivo, 'utf8'));
      total += escrituras;
      for (const llamada of sinCabecera) faltan.push(`${relative(WEB, archivo)}: ${llamada}`);
    }
    expect(faltan).toEqual([]);
    // No es un contrato vacío: `invocarComando` y la subida de imágenes del cliente, la
    // presentación del dueño, el apartado de la cafetería y las dos del puente heredado.
    expect(total).toBeGreaterThanOrEqual(6);
  });

  it('acusa el `fetch` que tenía Apariencia y deja pasar la cabecera en una variable', () => {
    const comoEstaba = `await fetch('/api/configuracion/apariencia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ estilo }),
      });`;
    expect(escriturasSinCabecera(comoEstaba).sinCabecera).toHaveLength(1);

    const enVariable = `const cabeceras = { 'content-type': 'application/json', [CABECERA_PROPIA]: '1' };
      const r = await fetch(ruta, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify(cuerpo),
      });`;
    expect(escriturasSinCabecera(enVariable)).toEqual({ escrituras: 1, sinCabecera: [] });

    const lectura = `await fetch('/api/inventario/resumen', { cache: 'no-store' });`;
    expect(escriturasSinCabecera(lectura)).toEqual({ escrituras: 0, sinCabecera: [] });
  });
});
