import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * EL PARÁMETRO DE UNA RUTA SALE DE SU SEGMENTO, no del nombre del campo.
 *
 * ── El defecto que estos dos contratos impiden ─────────────────────────────
 * `manejadorDeComandoConParametro(comando, 'citaId')` leía el parámetro de la
 * ruta con el nombre del CAMPO DEL COMANDO —`parametros['citaId']`— y las
 * carpetas se llaman `[id]`. El valor era siempre `undefined`, el comando recibía
 * el campo vacío y zod contestaba «Hay datos incompletos o mal escritos».
 *
 * **Las veintiuna rutas con parámetro del sistema estaban así** menos una, que
 * por casualidad nombra su carpeta igual que el campo. Iniciar una cita,
 * cancelarla, reprogramarla, cerrar su servicio, editar un cliente, convertir una
 * cotización, agendar desde la lista de espera: todas contestaban lo mismo, y
 * ninguna prueba lo veía porque ninguna pasaba por una ruta con parámetro.
 *
 * ── Por qué son DOS y no uno ──────────────────────────────────────────────
 * El primero mira el manejador: que lea el SEGMENTO. El segundo mira las RUTAS:
 * que el segmento que cada una declara sea el que el manejador va a leer. Con
 * sólo el primero, una carpeta nueva llamada `[citaId]` volvería a romperse en
 * silencio; con sólo el segundo, cambiar el manejador para que vuelva a leer el
 * campo pasaría inadvertido.
 */

const RAIZ =
  process.cwd().endsWith('apps\\web') || process.cwd().endsWith('apps/web')
    ? join(process.cwd(), '..', '..')
    : process.cwd();
const MANEJADOR = join(RAIZ, 'apps', 'web', 'src', 'servidor', 'ruta.ts');
const API = join(RAIZ, 'apps', 'web', 'app', 'api');

/** El cuerpo de una función, sin sus comentarios: un contrato no afirma sobre prosa. */
function cuerpoDe(fuente: string, firma: string): string {
  const desde = fuente.indexOf(firma);
  expect(desde, `no se encontró «${firma}»`).toBeGreaterThan(-1);
  const resto = fuente.slice(desde);
  const hasta = resto.indexOf('\nfunction ');
  return (hasta === -1 ? resto : resto.slice(0, hasta))
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/^\s*\/\/.*$/gm, ' ');
}

/** Los `route.ts` que usan el manejador con parámetro, con su ruta relativa. */
function rutasConParametro(carpeta: string, relativa = ''): readonly [string, string][] {
  const encontradas: [string, string][] = [];
  for (const entrada of readdirSync(carpeta)) {
    const completa = join(carpeta, entrada);
    if (statSync(completa).isDirectory()) {
      encontradas.push(...rutasConParametro(completa, `${relativa}/${entrada}`));
      continue;
    }
    if (entrada !== 'route.ts') continue;
    const fuente = readFileSync(completa, 'utf8');
    if (!fuente.includes('manejadorDeComandoConParametro(')) continue;
    encontradas.push([relativa, fuente]);
  }
  return encontradas;
}

describe('las rutas con parámetro', () => {
  it('EL MANEJADOR LEE EL SEGMENTO DE LA RUTA, no el nombre del campo', () => {
    const cuerpo = cuerpoDe(
      readFileSync(MANEJADOR, 'utf8'),
      'export function manejadorDeComandoConParametro',
    );
    // `parametros[segmento]` y no `parametros[campo]`: el campo es del comando.
    expect(
      /parametros\[\s*segmento\s*\]/.test(cuerpo),
      'El manejador volvió a leer el parámetro por el nombre del campo del comando. Las carpetas ' +
        'se llaman `[id]`, así que eso deja el campo en `undefined` y TODA ruta con parámetro ' +
        'contesta «Hay datos incompletos o mal escritos».',
    ).toBe(true);
  });

  it('CADA RUTA declara el segmento que su carpeta tiene', () => {
    const rutas = rutasConParametro(API);
    // Si esto sale vacío, el contrato no está mirando nada: pasaría siempre.
    expect(rutas.length, 'no se encontró ninguna ruta con parámetro').toBeGreaterThan(10);

    const malas: string[] = [];
    for (const [ruta, fuente] of rutas) {
      // El segmento dinámico de la carpeta: `/api/citas/[id]/iniciar` → `id`.
      const segmentos = [...ruta.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1] ?? '');
      const llamada =
        /manejadorDeComandoConParametro\(\s*[^,]+,\s*'([^']+)'\s*(?:,\s*'([^']+)')?/.exec(
          fuente.replaceAll(/\/\*[\s\S]*?\*\//g, ' '),
        );
      if (llamada === null) {
        malas.push(`${ruta}: no se pudo leer la llamada`);
        continue;
      }
      const campo = llamada[1] ?? '';
      const declarado = llamada[2] ?? 'id';
      if (segmentos.length !== 1) {
        malas.push(`${ruta}: tiene ${String(segmentos.length)} segmentos dinámicos`);
        continue;
      }
      // O la carpeta se llama como el segmento declarado, o como el campo —que es
      // el respaldo del manejador—. Cualquier otra cosa llega como `undefined`.
      if (segmentos[0] !== declarado && segmentos[0] !== campo) {
        malas.push(`${ruta}: la carpeta es [${segmentos[0] ?? ''}] y se lee «${declarado}»`);
      }
    }

    expect(
      malas,
      'Hay rutas cuyo parámetro no va a llegar nunca: el manejador lee un nombre que la carpeta ' +
        'no tiene, así que el comando recibe el campo vacío y contesta «Hay datos incompletos o ' +
        'mal escritos». Renombra la carpeta o pasa el segmento como tercer argumento.',
    ).toEqual([]);
  });
});
