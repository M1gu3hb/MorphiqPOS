import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Refrescar una vista materializada desde un TRIGGER: las dos formas de romperlo.
 *
 * ── Lo que pasó ────────────────────────────────────────────────────────────
 * La migración 121 puso tres triggers sobre `productos`, `producto_atributos` y
 * `ubicaciones` que llamaban a una función con
 * `refresh materialized view concurrently busqueda_material`. Dos cosas la hacían
 * imposible, y las dos son reglas de Postgres:
 *
 * 1 · `REFRESH MATERIALIZED VIEW` exige ser DUEÑO de la vista. Sin
 *     `security definer` la función corre como el rol de la aplicación, que no lo
 *     es → **42501 permission denied**.
 * 2 · `CONCURRENTLY` no se puede ejecutar dentro de una función ni de un bloque
 *     de transacción, y un trigger es las dos cosas a la vez.
 *
 * El resultado fue que **ninguna organización podía insertar, editar ni borrar un
 * producto** desde que esa migración se aplicó. No lo vio ninguna prueba ni
 * ninguna puerta: las de unidad usan dobles y las de integración exigen Docker.
 * Se encontró sembrando el catálogo de las cinco demostraciones, tres semanas
 * después.
 *
 * ── Qué afirma este contrato ───────────────────────────────────────────────
 * Sobre el SQL, que es donde se decide: ninguna función que refresque una vista
 * materializada puede usar `concurrently`, y toda función que la refresque tiene
 * que ser `security definer`. Se recortan los COMENTARIOS antes de mirar —este
 * mismo archivo y la 167 explican el defecto usando la palabra— porque un
 * contrato que encuentra su propia explicación no prueba nada.
 */

const CARPETA = join(dirname(fileURLToPath(import.meta.url)), 'sql');

/** El SQL sin comentarios de línea ni de bloque. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Cada `create [or replace] function … $$ … $$` con su nombre y su cuerpo. */
function funciones(sql: string): readonly { nombre: string; cabecera: string; cuerpo: string }[] {
  const salida: { nombre: string; cabecera: string; cuerpo: string }[] = [];
  const patron =
    /create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_.]+)\s*\(([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\3\$/gi;
  for (const encontrada of sql.matchAll(patron)) {
    salida.push({
      nombre: encontrada[1] ?? '?',
      cabecera: encontrada[2] ?? '',
      cuerpo: encontrada[4] ?? '',
    });
  }
  return salida;
}

const ARCHIVOS = readdirSync(CARPETA)
  .filter((nombre) => nombre.endsWith('.sql'))
  .sort();

const REFRESCA = /refresh\s+materialized\s+view/i;
const CONCURRENTE = /refresh\s+materialized\s+view\s+concurrently/i;

/**
 * La ÚLTIMA definición de cada función, que es la que está en la base.
 *
 * Se recorren las migraciones en orden y se queda la última: una migración
 * aplicada no se edita —el ejecutor valida cada archivo por hash— así que la
 * 121 conserva para siempre su `concurrently`, y lo que corrige el defecto es la
 * 167 con un `create or replace`. Un contrato que mirara archivo por archivo
 * fallaría eternamente por un texto que ya no manda, y obligaría a relajarlo con
 * una excepción — que es como se acaba con una puerta que no mira nada.
 */
function definicionesFinales(): ReadonlyMap<
  string,
  { archivo: string; cabecera: string; cuerpo: string }
> {
  const ultima = new Map<string, { archivo: string; cabecera: string; cuerpo: string }>();
  for (const archivo of ARCHIVOS) {
    const sql = sinComentarios(readFileSync(join(CARPETA, archivo), 'utf8'));
    for (const funcion of funciones(sql)) {
      ultima.set(funcion.nombre, {
        archivo,
        cabecera: funcion.cabecera,
        cuerpo: funcion.cuerpo,
      });
    }
  }
  return ultima;
}

describe('el refresco de una vista materializada', () => {
  it('hay migraciones que mirar', () => {
    // Si el filtro se rompe, esta prueba pasaría en verde sin haber leído nada.
    expect(ARCHIVOS.length).toBeGreaterThan(50);
    expect(definicionesFinales().size).toBeGreaterThan(10);
  });

  it('ninguna función VIGENTE refresca en CONCURRENTLY', () => {
    const culpables: string[] = [];
    for (const [nombre, definicion] of definicionesFinales()) {
      if (CONCURRENTE.test(definicion.cuerpo)) {
        culpables.push(`${definicion.archivo} · ${nombre}()`);
      }
    }
    expect(
      culpables,
      'CONCURRENTLY no se puede ejecutar desde dentro de una función ni de un bloque de ' +
        'transacción, y un trigger es las dos cosas. La sentencia aborta siempre, así que ' +
        'cualquier escritura sobre la tabla que dispare el trigger revienta:\n    ' +
        culpables.join('\n    '),
    ).toEqual([]);
  });

  it('toda función VIGENTE que refresca una vista materializada es SECURITY DEFINER', () => {
    const culpables: string[] = [];
    for (const [nombre, definicion] of definicionesFinales()) {
      if (!REFRESCA.test(definicion.cuerpo)) continue;
      // `security definer` va en la CABECERA, entre los paréntesis del nombre y
      // el cuerpo: `returns trigger language plpgsql security definer set …`.
      if (!/security\s+definer/i.test(definicion.cabecera)) {
        culpables.push(`${definicion.archivo} · ${nombre}()`);
      }
    }
    expect(
      culpables,
      '`REFRESH MATERIALIZED VIEW` exige ser DUEÑO de la vista. Sin `security definer` la ' +
        'función corre como el rol de la aplicación, que no lo es, y la escritura muere con ' +
        '42501 permission denied:\n    ' +
        culpables.join('\n    '),
    ).toEqual([]);
  });

  it('y la 167, que es la que lo arregló, sigue en su sitio', () => {
    // Un contrato sobre TODAS las migraciones pasaría en verde el día que
    // alguien borrara la 167 y la 121 volviera a mandar: la 121 tiene el
    // `concurrently` en su texto, pero la 167 la reemplaza con `create or
    // replace`. Lo que hay que exigir es que la corrección exista.
    const nombre = ARCHIVOS.find((a) => a.startsWith('167_'));
    expect(nombre, 'falta la migración 167, que es la que hace refrescable la vista').toBeDefined();
    const sql = readFileSync(join(CARPETA, nombre ?? ''), 'utf8').toLowerCase();
    expect(sql).toContain('create or replace function refrescar_busqueda_material()');
    expect(sql).toContain('security definer');
  });
});
