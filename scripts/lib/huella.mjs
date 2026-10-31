/**
 * LA HUELLA DE LOS NEGOCIOS de una base (PAR-1, generalizada de `huella-ajena.mjs` de POS Don
 * Poncho, DP-11.0): que una migración o un despliegue no toque las filas de nadie. Sólo lee.
 *
 * Por cada tabla (no vista) de `public` con `organizacion_id`, y por cada negocio: cuántas filas
 * tiene y el md5 de sus filas en texto, ordenadas. La segunda toma usa las COLUMNAS de la
 * primera: una migración que agrega columnas no cambia la huella; una que cambia valores, sí.
 * Las tablas que sólo existen en la segunda toma tienen que estar vacías.
 *
 * El único cambio que se espera al aplicar la 187 (unir mesas desde el mapa) es su RELLENO: las
 * mesas absorbidas por una unión abierta reciben `unida_a_mesa_id` = su principal, y su
 * `updated_at` (el disparador `tocar_updated_at`). Esas mesas se apartan de la huella de `mesas`
 * y se comprueban una por una: el resto de sus columnas igual, y marcadas con SU principal.
 *
 * La salida no lleva datos de nadie: conteos, hashes e ids.
 */
import { fijarTexto, ident } from './mudanza.mjs';

/** Las columnas de una mesa absorbida que el relleno de la 187 sí cambia. */
const DEL_RELLENO = new Set(['unida_a_mesa_id', 'updated_at']);

async function columnasActuales(cliente, tabla) {
  const { rows } = await cliente.query(
    `select column_name::text as c from information_schema.columns
      where table_schema = 'public' and table_name = $1 order by ordinal_position`,
    [tabla],
  );
  return rows.map((f) => f.c);
}

async function tablasDelNegocio(cliente) {
  const { rows } = await cliente.query(
    // Sólo tablas: una VISTA como `fila_barra` calcula minutos con `now()` y su md5 cambia
    // con el reloj sin que nadie escriba.
    `select c.table_name::text as tabla from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'organizacion_id'
        and t.table_type = 'BASE TABLE'
      order by c.table_name`,
  );
  return rows.map((f) => f.tabla);
}

/** Las mesas absorbidas por una unión ABIERTA, con su principal (la 071 ya tiene las tablas). */
async function absorbidas(cliente, ids) {
  const { rows } = await cliente.query(
    `select mm.mesa_id::text as mesa, u.mesa_principal_id::text as principal,
            u.organizacion_id::text as org
       from union_mesa_miembros mm join uniones_mesa u on u.id = mm.union_id
      where u.cerrada_en is null and u.organizacion_id = any($1::uuid[])
      order by mm.mesa_id`,
    [ids],
  );
  return rows;
}

/**
 * Toma la huella dentro de una transacción `read only` con la instantánea fija.
 * `columnasDe`: las columnas por tabla de una toma anterior (para comparar con ella).
 */
export async function tomarHuella(cliente, { solo = [], excluir = [], columnasDe = null } = {}) {
  await cliente.query('begin transaction isolation level repeatable read read only');
  try {
    await fijarTexto(cliente);
    const { rows: todas } = await cliente.query(
      'select id::text as id, slug from organizaciones order by slug',
    );
    const organizaciones = todas.filter(
      (o) => (solo.length === 0 || solo.includes(o.slug)) && !excluir.includes(o.slug),
    );
    const ids = organizaciones.map((o) => o.id);
    const apartadas = await absorbidas(cliente, ids);
    const idsApartados = apartadas.map((a) => a.mesa);
    const tablas = {};
    for (const tabla of await tablasDelNegocio(cliente)) {
      const actuales = await columnasActuales(cliente, tabla);
      const columnas = columnasDe?.[tabla]?.filter((c) => actuales.includes(c)) ?? actuales;
      const fila = columnas.map((c) => `t.${ident(c)}`).join(', ');
      const sinApartadas = tabla === 'mesas' ? 'and not (t.id = any($2::uuid[]))' : '';
      const { rows } = await cliente.query(
        `select x.org, count(*)::int as n,
                md5(coalesce(string_agg(x.fila, E'\\n' order by x.fila collate "C"), '')) as h
           from (select t.organizacion_id::text as org, (row(${fila}))::text as fila
                   from ${ident(tabla)} t
                  where t.organizacion_id = any($1::uuid[]) ${sinApartadas}) x
          group by x.org`,
        tabla === 'mesas' ? [ids, idsApartados] : [ids],
      );
      tablas[tabla] = {
        columnas,
        nueva: columnasDe !== null && columnasDe[tabla] === undefined,
        porNegocio: Object.fromEntries(rows.map((f) => [f.org, { n: f.n, md5: f.h }])),
      };
    }
    const mesas = tablas['mesas']?.columnas ?? [];
    const delApartado = mesas.filter((c) => !DEL_RELLENO.has(c));
    const actualesDeMesas = await columnasActuales(cliente, 'mesas');
    const conUnida = actualesDeMesas.includes('unida_a_mesa_id');
    const unidas = [];
    for (const a of apartadas) {
      const { rows } = await cliente.query(
        `select md5((row(${delApartado.map((c) => `t.${ident(c)}`).join(', ')}))::text) as h
                ${conUnida ? ', t.unida_a_mesa_id::text as unida' : ''}
           from mesas t where t.id = $1`,
        [a.mesa],
      );
      unidas.push({ ...a, md5: rows[0]?.h ?? null, unida: rows[0]?.unida ?? null });
    }
    const { rows: marcadas } = conUnida
      ? await cliente.query(
          `select id::text as mesa from mesas
            where unida_a_mesa_id is not null and organizacion_id = any($1::uuid[])`,
          [ids],
        )
      : { rows: [] };
    return {
      tomada: new Date().toISOString(),
      organizaciones,
      tablas,
      absorbidas: unidas,
      marcadas: marcadas.map((f) => f.mesa).sort(),
    };
  } finally {
    await cliente.query('rollback');
  }
}

/** Las columnas por tabla de una huella, para tomar la siguiente sobre las mismas. */
export const columnasDeLaHuella = (huella) =>
  Object.fromEntries(Object.entries(huella.tablas).map(([t, d]) => [t, d.columnas]));

/**
 * Compara dos huellas. `diferencias` es lo que no se esperaba; `relleno` lo que la 187 sí
 * cambia (las mesas absorbidas, marcadas con su principal); `nuevas` las tablas vacías nuevas.
 */
export function compararHuellas(antes, despues) {
  const diferencias = [];
  const negocios = (h) => h.organizaciones.map((o) => `${o.id}:${o.slug}`).join(',');
  if (negocios(antes) !== negocios(despues)) diferencias.push('cambió la lista de negocios');
  for (const [tabla, a] of Object.entries(antes.tablas)) {
    const d = despues.tablas[tabla];
    if (d === undefined) {
      diferencias.push(`${tabla}: ya no existe`);
      continue;
    }
    for (const org of new Set([...Object.keys(a.porNegocio), ...Object.keys(d.porNegocio)])) {
      const x = a.porNegocio[org];
      const y = d.porNegocio[org];
      if (x?.n !== y?.n || x?.md5 !== y?.md5) {
        const que = x?.n === y?.n ? 'mismas filas, contenido distinto' : 'otro número de filas';
        diferencias.push(
          `${tabla} · ${org}: ${String(x?.n ?? 0)} → ${String(y?.n ?? 0)} filas (${que})`,
        );
      }
    }
  }
  const nuevas = [];
  for (const [tabla, d] of Object.entries(despues.tablas)) {
    if (antes.tablas[tabla] !== undefined) continue;
    const filas = Object.values(d.porNegocio).reduce((s, v) => s + v.n, 0);
    if (filas > 0) diferencias.push(`${tabla}: tabla nueva con ${String(filas)} filas`);
    else nuevas.push(tabla);
  }
  const antesPorMesa = new Map(antes.absorbidas.map((a) => [a.mesa, a]));
  for (const d of despues.absorbidas) {
    const a = antesPorMesa.get(d.mesa);
    if (a === undefined || a.principal !== d.principal) {
      diferencias.push(`mesa ${d.mesa}: su unión abierta no es la de antes`);
    } else if (a.md5 !== d.md5) {
      diferencias.push(`mesa absorbida ${d.mesa}: cambió algo más que su relleno`);
    }
    antesPorMesa.delete(d.mesa);
  }
  for (const a of antesPorMesa.values()) diferencias.push(`mesa ${a.mesa}: ya no está absorbida`);
  const esperadas = despues.absorbidas.filter((d) => d.unida === d.principal).map((d) => d.mesa);
  if (despues.marcadas.length > 0 || antes.marcadas.length > 0) {
    const ok =
      JSON.stringify([...esperadas].sort()) === JSON.stringify(despues.marcadas) &&
      esperadas.length === despues.absorbidas.length;
    if (!ok) diferencias.push('unida_a_mesa_id no marca exactamente a las mesas absorbidas');
  }
  return { diferencias, relleno: esperadas.length, uniones: contarUniones(despues), nuevas };
}

const contarUniones = (h) => new Set(h.absorbidas.map((a) => `${a.org}:${a.principal}`)).size;
