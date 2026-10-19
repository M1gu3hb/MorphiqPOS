#!/usr/bin/env node
/**
 * EL ORDEN EN QUE EL RESETEO BORRA UNA DEMOSTRACIÓN, calculado del esquema (bloque B.2).
 *
 * ── Por qué se calcula y no se escribe a mano ──────────────────────────────
 * `limpiar()` era una lista de `delete from` escrita a mano, y se quedaba atrás cada vez
 * que una migración añadía una tabla: el 24-09-2026 **dejaba 70 tablas con
 * `organizacion_id` sin tocar** —cotizaciones, anticipos, lealtad, pedidos anticipados,
 * tomas de inventario, traspasos…—. Un reseteo que deja la mitad del día anterior no
 * devuelve la demo «como nueva», y el día completo de la siguiente corrida concilia
 * contra un saldo que no empieza en cero.
 *
 * Aquí el orden sale de `scripts/esquema-esperado.json` —el esquema que `verify:esquema`
 * compara contra la base viva—: TODA tabla del esquema se borra, salvo las que
 * `CONSERVADAS` nombra con su razón. Y se borra hijo antes que padre, así que una llave
 * foránea `restrict` nueva no puede volver a abortar el reseteo (ya pasó dos veces:
 * `remisiones → ordenes` y `comisiones_causadas → cita_servicios`).
 *
 * ── Uso ────────────────────────────────────────────────────────────────────
 *   node scripts/generar-limpieza-de-demo.mjs              reescribe el bloque generado
 *   node scripts/generar-limpieza-de-demo.mjs --verificar  sale en 1 si está desfasado
 *
 * La prueba `packages/app/src/demostracion/tablas-del-reseteo.test.ts` comprueba lo
 * mismo por su cuenta —cobertura y orden— sin llamar a este guion.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ARCHIVO = 'packages/app/src/demostracion/tablas-del-reseteo.ts';
const ESQUEMA = 'scripts/esquema-esperado.json';
const INICIO = '// <generado por scripts/generar-limpieza-de-demo.mjs>';
const FIN = '// </generado>';

const { CONSERVADAS, CICLOS } = await import(`../${ARCHIVO}`);

/** Las llaves foráneas del esquema, con sus columnas y su acción al borrar. */
export function llavesForaneas(esquema) {
  return esquema.restricciones
    .filter((r) => r.esquema === 'public' && r.tipo === 'foreign_key')
    .map((r) => {
      const m = /^FOREIGN KEY \(([^)]+)\) REFERENCES ([a-z_]+)\(([^)]+)\)(.*)$/.exec(r.definicion);
      if (m === null) throw new Error(`No entiendo la llave ${r.clave}: ${r.definicion}`);
      const accion = /ON DELETE (CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION)/.exec(m[4]);
      return {
        clave: r.clave,
        hijo: r.tabla,
        columnas: m[1].split(',').map((c) => c.trim()),
        padre: m[2],
        referidas: m[3].split(',').map((c) => c.trim()),
        accion: accion?.[1] ?? 'NO ACTION',
      };
    });
}

export function tablasDelEsquema(esquema) {
  const tablas = new Map();
  for (const c of esquema.columnas) {
    if (c.esquema !== 'public') continue;
    if (!tablas.has(c.tabla)) tablas.set(c.tabla, new Set());
    tablas.get(c.tabla).add(c.columna);
  }
  return tablas;
}

/**
 * El orden: hijo antes que padre, para TODA llave entre dos tablas que se borran,
 * salvo las que `CICLOS` rompe poniendo la columna en nulo antes de empezar.
 */
export function calcularOrden(esquema, conservadas, ciclos) {
  const tablas = tablasDelEsquema(esquema);
  const fks = llavesForaneas(esquema);
  const rotas = new Set(ciclos.map((c) => `${c.tabla}.${c.columna}`));
  const borradas = [...tablas.keys()].filter((t) => !(t in conservadas)).sort();
  const seBorra = new Set(borradas);

  // Aristas hijo → padre (el hijo va ANTES).
  const antesDe = new Map(borradas.map((t) => [t, new Set()]));
  for (const f of fks) {
    if (!seBorra.has(f.hijo) || !seBorra.has(f.padre) || f.hijo === f.padre) continue;
    // Con una sola columna de la llave en nulo, la llave no se comprueba (MATCH SIMPLE):
    // basta con que se rompa una de las suyas.
    if (f.columnas.some((c) => rotas.has(`${f.hijo}.${c}`))) continue;
    antesDe.get(f.padre).add(f.hijo);
  }

  // Kahn, con desempate alfabético para que el resultado sea estable.
  const orden = [];
  const pendientes = new Map(borradas.map((t) => [t, new Set(antesDe.get(t))]));
  while (pendientes.size > 0) {
    const listas = [...pendientes]
      .filter(([, hijos]) => [...hijos].every((h) => !pendientes.has(h)))
      .map(([t]) => t)
      .sort();
    if (listas.length === 0) {
      throw new Error(
        `Hay un ciclo de llaves entre: ${[...pendientes.keys()].join(', ')}.\n` +
          'Declara en CICLOS la columna que se pone en nulo antes de borrar.',
      );
    }
    for (const t of listas) {
      orden.push(t);
      pendientes.delete(t);
    }
  }

  // Cómo se filtra cada una: por su `organizacion_id`, o por la llave a su padre.
  //
  // La llave tiene que ser NO NULA: una columna que admite nulo deja fuera las filas
  // que la tienen vacía, y esas filas bloquean después el borrado del padre. Entre las
  // no nulas se prefiere la que va a una tabla que también se borra —su dueño—, y
  // después la de borrado en cascada.
  const noNula = new Set(
    esquema.columnas
      .filter((c) => c.esquema === 'public' && c.noNula)
      .map((c) => `${c.tabla}.${c.columna}`),
  );
  const peso = (f) => (seBorra.has(f.padre) ? 0 : 2) + (f.accion === 'CASCADE' ? 0 : 1);
  return orden.map((tabla) => {
    if (tablas.get(tabla).has('organizacion_id')) return { tabla, via: null };
    const candidatas = fks
      .filter(
        (f) =>
          f.hijo === tabla &&
          f.columnas.length === 1 &&
          f.padre !== tabla &&
          noNula.has(`${tabla}.${f.columnas[0]}`) &&
          tablas.get(f.padre)?.has('organizacion_id'),
      )
      .sort((a, b) => peso(a) - peso(b) || a.columnas[0].localeCompare(b.columnas[0]));
    const alPadre = candidatas[0];
    if (alPadre === undefined) {
      throw new Error(
        `«${tabla}» no tiene organizacion_id ni una llave NO NULA a un padre que la tenga.`,
      );
    }
    // La columna del padre es la que la llave REFERENCIA, no `id` por costumbre:
    // `servicios` cuelga de `productos` y su llave es `producto_id`.
    return {
      tabla,
      via: { columna: alPadre.columnas[0], padre: alPadre.padre, referida: alPadre.referidas[0] },
    };
  });
}

function bloque(orden) {
  const filas = orden.map(({ tabla, via }) =>
    via === null
      ? `  { tabla: '${tabla}', via: null },`
      : `  { tabla: '${tabla}', via: { columna: '${via.columna}', padre: '${via.padre}', referida: '${via.referida}' } },`,
  );
  return [
    INICIO,
    'export const ORDEN_DE_LIMPIEZA: readonly PasoDeLimpieza[] = [',
    ...filas,
    '];',
    FIN,
  ].join('\n');
}

const esquema = JSON.parse(readFileSync(ESQUEMA, 'utf8'));
const orden = calcularOrden(esquema, CONSERVADAS, CICLOS);
const actual = readFileSync(ARCHIVO, 'utf8').replace(/\r\n/g, '\n');
const i = actual.indexOf(INICIO);
const j = actual.indexOf(FIN);
if (i === -1 || j === -1) throw new Error(`${ARCHIVO} no tiene las marcas del bloque generado.`);
// Pasa por Prettier con la configuración del repositorio: así lo que se escribe es lo
// mismo que dejaría `pnpm format`, y `--verificar` no discute con el formateador.
const prettier = await import('prettier');
const opciones = (await prettier.resolveConfig(ARCHIVO)) ?? {};
const nuevo = await prettier.format(
  `${actual.slice(0, i)}${bloque(orden)}${actual.slice(j + FIN.length)}`,
  { ...opciones, filepath: ARCHIVO },
);

if (process.argv.includes('--verificar')) {
  if (nuevo !== actual) {
    console.error(
      `✗ El orden de limpieza de las demos está desfasado del esquema.\n  Corre \`node scripts/generar-limpieza-de-demo.mjs\` y revisa el diff.`,
    );
    process.exit(1);
  }
  console.log(`✓ El reseteo borra ${String(orden.length)} tablas, en orden de llaves.`);
} else {
  writeFileSync(ARCHIVO, nuevo);
  console.log(`✓ ${ARCHIVO}: ${String(orden.length)} tablas en orden.`);
}
