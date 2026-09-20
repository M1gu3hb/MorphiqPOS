import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * EL MOTIVO DE UN MOVIMIENTO DE STOCK ES UNA CLAVE, NO UNA FRASE.
 *
 * ── El defecto que este contrato impide ────────────────────────────────────
 * La 062 hizo que `movimientos_stock.motivo` apuntara a `motivos_merma.clave`, y
 * nadie revisó quién escribía esa columna: **siete comandos seguían metiendo
 * frases** —«Diferencia de conteo físico», «redondeo en especie», «reposición al
 * cliente · Taladro», «apertura para cabina de Tinte 7.1», el motivo que teclea el
 * operador en un ajuste o en un traspaso, y el tipo de un consumo de servicio—.
 * Ninguna es una clave, así que Postgres rechazaba el movimiento con `23503` y la
 * transacción entera se abortaba: el conteo no cerraba, la garantía no se reponía,
 * la cabina no se abría.
 *
 * Y ninguna prueba lo veía, porque la base falsa no tiene foráneas.
 *
 * ── Qué mira, y por qué así ───────────────────────────────────────────────
 * Recorta el `values({…})` de cada `insertInto('movimientos_stock')` y mira su
 * `motivo`. Tres formas son válidas y ninguna más:
 *
 * 1. `null` — lo correcto cuando no hubo merma: un traspaso, una apertura de
 *    cabina, un consumo de servicio. Su explicación va en `nota`.
 * 2. un LITERAL que esté sembrado en `motivos_merma` por alguna migración.
 * 3. una VARIABLE, y entonces el archivo tiene que comprobarla —`motivos_merma`
 *    aparece en él— antes de escribirla.
 *
 * La lista de claves NO se teclea aquí: se lee de las migraciones, que son la
 * fuente. Un contrato con su propia copia de la lista aprueba un motivo que la
 * base no tiene el día que alguien borra la fila.
 */

const RAIZ =
  process.cwd().endsWith('packages\\app') || process.cwd().endsWith('packages/app')
    ? join(process.cwd(), '..', '..')
    : process.cwd();
const FUENTES = join(RAIZ, 'packages', 'app', 'src');
const MIGRACIONES = join(RAIZ, 'packages', 'data', 'src', 'migraciones', 'sql');

/** Las claves que alguna migración siembra. La fuente, no una copia. */
function clavesSembradas(): ReadonlySet<string> {
  const claves = new Set<string>();
  for (const archivo of readdirSync(MIGRACIONES)) {
    if (!archivo.endsWith('.sql')) continue;
    const sql = readFileSync(join(MIGRACIONES, archivo), 'utf8');
    // `insert into motivos_merma (…) values ('clave', …), ('otra', …)` y también
    // los `insert … select` con su lista de valores entre paréntesis.
    for (const bloque of sql.matchAll(/insert\s+into\s+motivos_merma[\s\S]*?;/gi)) {
      for (const fila of bloque[0].matchAll(/\(\s*'([a-z_]+)'/gi)) {
        claves.add(fila[1] ?? '');
      }
    }
  }
  return claves;
}

/** Cada `insertInto('movimientos_stock')` con el archivo y su `motivo`. */
function escriturasDeMovimiento(): readonly { archivo: string; motivo: string }[] {
  const encontradas: { archivo: string; motivo: string }[] = [];

  const recorrer = (carpeta: string): void => {
    for (const entrada of readdirSync(carpeta)) {
      const completa = join(carpeta, entrada);
      if (statSync(completa).isDirectory()) {
        recorrer(completa);
        continue;
      }
      if (!entrada.endsWith('.ts') || entrada.includes('.test.')) continue;
      const fuente = readFileSync(completa, 'utf8');
      let desde = fuente.indexOf(`insertInto('movimientos_stock')`);
      while (desde !== -1) {
        // El recorte va del `insertInto` al `.execute`/`.returning` siguiente, que
        // es donde acaba ESA inserción. Sin el recorte, un archivo con dos
        // inserciones mezclaría el motivo de una con el de la otra.
        const resto = fuente.slice(desde);
        const fin = Math.min(
          ...[resto.indexOf('.execute('), resto.indexOf('.returning(')]
            .filter((i) => i !== -1)
            .concat([resto.length]),
        );
        const trozo = resto
          .slice(0, fin)
          .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
          .replaceAll(/^\s*\/\/.*$/gm, ' ');
        const motivo = /\bmotivo:\s*([^,\n]+)/.exec(trozo);
        encontradas.push({
          archivo: completa.slice(FUENTES.length + 1).replaceAll('\\', '/'),
          // Sin `motivo` en el `values`, la columna queda en NULL, que es válido.
          motivo: (motivo?.[1] ?? 'null').trim(),
        });
        desde = fuente.indexOf(`insertInto('movimientos_stock')`, desde + 1);
      }
    }
  };
  recorrer(FUENTES);
  return encontradas;
}

describe('el motivo de un movimiento de stock', () => {
  const claves = clavesSembradas();

  it('las migraciones siembran los motivos que el código usa', () => {
    // Si esto sale vacío, el resto del contrato aprobaría cualquier literal.
    expect(claves.size, 'no se encontró ninguna clave sembrada en las migraciones').toBeGreaterThan(
      5,
    );
    expect(claves.has('ajuste_conteo')).toBe(true);
    expect(claves.has('corte')).toBe(true);
  });

  it('NINGÚN COMANDO escribe una frase donde la base pide una clave', () => {
    const escrituras = escriturasDeMovimiento();
    // Si el recorte deja de encontrar las inserciones, el contrato pasaría vacío.
    expect(escrituras.length, 'no se encontró ninguna escritura de movimiento').toBeGreaterThan(8);

    const malas: string[] = [];
    for (const { archivo, motivo } of escrituras) {
      if (motivo === 'null') continue;

      const literal = /^'([^']*)'$/.exec(motivo);
      if (literal !== null) {
        if (!claves.has(literal[1] ?? '')) {
          malas.push(`${archivo}: «${literal[1] ?? ''}» no es una clave de motivos_merma`);
        }
        continue;
      }

      // Una variable: el archivo tiene que comprobarla contra la tabla.
      const fuente = readFileSync(join(FUENTES, archivo), 'utf8');
      if (!fuente.includes('motivos_merma') && !fuente.includes('exigirMotivoDeMerma')) {
        malas.push(`${archivo}: escribe «${motivo}» sin comprobarlo contra motivos_merma`);
      }
    }

    expect(
      malas,
      'Hay movimientos de stock que escriben un motivo que la foránea a `motivos_merma` va a ' +
        'rechazar con 23503, y eso aborta la transacción entera: el conteo no cierra, la merma no ' +
        'se declara, la cabina no se abre. El motivo es una CLAVE; la explicación en palabras va ' +
        'en `nota`.',
    ).toEqual([]);
  });
});
