/**
 * LA MUDANZA DE UN NEGOCIO A SU PROPIA BASE (Fase B, DP-10.5): lo que comparten el exportador,
 * el importador y la verificación.
 *
 * Las filas de un negocio son las de toda tabla con `organizacion_id`, su fila de
 * `organizaciones`, y las de las tablas HIJAS que no tienen la columna pero cuelgan de una que
 * sí por llave foránea (`identidades` → `personas`, `credenciales_pin` → `identidades`…). Esas
 * se descubren del CATÁLOGO, no de una lista a mano: una migración que añade una hija la añade a
 * la mudanza sin que nadie se acuerde. Una tabla sin camino al negocio (los catálogos globales
 * como `motivos_merma`) no se muda: la trae cada base de sus migraciones.
 *
 * El conteo y el md5 de cada tabla se calculan IGUAL en el origen y en el destino: las mismas
 * columnas (las del origen), el texto de cada fila con ajustes de sesión fijos (zona UTC, fechas
 * ISO) y ordenado con la intercalación «C», que no depende del sistema operativo.
 */

/** Ni el registro de migraciones (cada base trae el suyo) ni los contadores del límite de tasa. */
export const NO_SE_MUDAN = new Set(['_migraciones', 'limite_tasa']);

/** Ajustes que hacen que el texto de una fila sea el mismo en cualquier servidor. */
export async function fijarTexto(cliente) {
  await cliente.query(
    "set local timezone = 'UTC'; set local datestyle = 'ISO, YMD'; " +
      "set local intervalstyle = 'postgres'; set local extra_float_digits = 1; " +
      "set local bytea_output = 'hex'",
  );
}

/** Las tablas del esquema `public` con sus columnas, su llave primaria y sus llaves foráneas. */
export async function leerCatalogo(cliente) {
  const { rows: columnas } = await cliente.query(`
    select c.relname::text as tabla, a.attname::text as columna, a.attnum as orden,
           a.attgenerated <> '' as generada
    from pg_class c
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    order by c.relname, a.attnum`);
  const { rows: primarias } = await cliente.query(`
    select c.relname as tabla, array_agg(a.attname::text order by array_position(k.conkey, a.attnum)) as columnas
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
    where k.contype = 'p' and c.relnamespace = 'public'::regnamespace
    group by c.relname`);
  const { rows: foraneas } = await cliente.query(`
    select k.conname::text as nombre, hija.relname::text as tabla, madre.relname::text as madre,
           k.convalidated as validada,
           array(select a.attname::text from unnest(k.conkey) with ordinality u(n, i)
                 join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.n order by u.i) as columnas,
           array(select a.attname::text from unnest(k.confkey) with ordinality u(n, i)
                 join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.n order by u.i) as referidas
    from pg_constraint k
    join pg_class hija on hija.oid = k.conrelid
    join pg_class madre on madre.oid = k.confrelid
    where k.contype = 'f' and hija.relnamespace = 'public'::regnamespace
      and madre.relnamespace = 'public'::regnamespace`);
  const tablas = new Map();
  for (const fila of columnas) {
    const tabla = tablas.get(fila.tabla) ?? {
      columnas: [],
      generadas: [],
      primaria: [],
      madres: [],
    };
    tabla.columnas.push(fila.columna);
    if (fila.generada) tabla.generadas.push(fila.columna);
    tablas.set(fila.tabla, tabla);
  }
  for (const fila of primarias) {
    const tabla = tablas.get(fila.tabla);
    if (tabla !== undefined) tabla.primaria = fila.columnas;
  }
  for (const fila of foraneas) tablas.get(fila.tabla)?.madres.push(fila);
  return { tablas, foraneas };
}

/** Un identificador de SQL entre comillas: los nombres salen del catálogo, no de quien llama. */
export function ident(nombre) {
  return `"${String(nombre).replaceAll('"', '""')}"`;
}

/**
 * El filtro de cada tabla del negocio, como predicado SQL sobre el alias `t` con `$1` = el id
 * del negocio. Las hijas se alcanzan por sus llaves foráneas (cualquiera que lleve al negocio).
 * Devuelve `{ incluidas: Map<tabla, predicado>, excluidas: string[] }`.
 */
export function planDelNegocio(catalogo) {
  const filtros = new Map();
  const conOrganizacion = (tabla) =>
    catalogo.tablas.get(tabla)?.columnas.includes('organizacion_id');

  function filtroDe(tabla, alias, camino) {
    if (tabla === 'organizaciones') return `${alias}.id = $1`;
    if (conOrganizacion(tabla)) return `${alias}.organizacion_id = $1`;
    if (camino.has(tabla) || camino.size > 4) return null;
    const siguiente = new Set(camino).add(tabla);
    const opciones = [];
    for (const llave of catalogo.tablas.get(tabla)?.madres ?? []) {
      const madre = `m${String(siguiente.size)}_${String(opciones.length)}`;
      const deLaMadre = filtroDe(llave.madre, madre, siguiente);
      if (deLaMadre === null) continue;
      const union = llave.columnas
        .map((c, i) => `${madre}.${ident(llave.referidas[i])} = ${alias}.${ident(c)}`)
        .join(' and ');
      opciones.push(
        `exists (select 1 from ${ident(llave.madre)} ${madre} where ${union} and ${deLaMadre})`,
      );
    }
    return opciones.length === 0 ? null : `(${opciones.join(' or ')})`;
  }

  const excluidas = [];
  for (const tabla of [...catalogo.tablas.keys()].sort()) {
    if (NO_SE_MUDAN.has(tabla)) {
      excluidas.push(tabla);
      continue;
    }
    const filtro = filtroDe(tabla, 't', new Set());
    if (filtro === null) excluidas.push(tabla);
    else filtros.set(tabla, filtro);
  }
  return { incluidas: filtros, excluidas };
}

/** Cuántas filas y su md5, sobre LAS COLUMNAS DADAS (las del origen). */
export async function huellaDeTabla(cliente, tabla, columnas, filtro, organizacionId) {
  const fila = columnas.map((c) => `t.${ident(c)}`).join(', ');
  const { rows } = await cliente.query(
    `select count(*)::int as filas,
            md5(coalesce(string_agg(x.fila, E'\\n' order by x.fila collate "C"), '')) as md5
     from (select (row(${fila}))::text as fila from ${ident(tabla)} t where ${filtro}) x`,
    [organizacionId],
  );
  return { filas: rows[0].filas, md5: rows[0].md5 };
}

/** El orden en que se escriben las filas: por su llave primaria, o por su texto si no tiene. */
export function ordenDe(tabla) {
  return tabla.primaria.length > 0
    ? tabla.primaria.map((c) => `t.${ident(c)}`).join(', ')
    : '(t)::text collate "C"';
}

/**
 * Las llaves foráneas que quedaron rotas en las tablas dadas. El importador escribe con
 * `session_replication_role = replica` —sin disparadores, para que ningún saldo se vuelva a
 * aplicar— y eso también apaga la comprobación de las llaves: se hace aquí, antes del `commit`.
 */
export async function llavesRotas(cliente, catalogo, tablas) {
  const rotas = [];
  for (const llave of catalogo.foraneas) {
    // Una llave `NOT VALID` no la cumple ni el origen (filas de antes de crearla): no se exige.
    if (!tablas.has(llave.tabla) || !llave.validada) continue;
    const llenas = llave.columnas.map((c) => `h.${ident(c)} is not null`).join(' and ');
    const union = llave.columnas
      .map((c, i) => `m.${ident(llave.referidas[i])} = h.${ident(c)}`)
      .join(' and ');
    const { rows } = await cliente.query(
      `select count(*)::int as n from ${ident(llave.tabla)} h
       where ${llenas} and not exists (select 1 from ${ident(llave.madre)} m where ${union})`,
    );
    if (rows[0].n > 0) rotas.push(`${llave.nombre} (${String(rows[0].n)})`);
  }
  return rotas;
}

/** Cada tabla del manifiesto, contada y con su md5 en ESTA base. Devuelve las que no cuadran. */
export async function diferenciasConElManifiesto(cliente, manifiesto) {
  const plan = planDelNegocio(await leerCatalogo(cliente));
  const distintas = [];
  for (const esperada of manifiesto.tablas) {
    const filtro = plan.incluidas.get(esperada.tabla);
    if (filtro === undefined) {
      distintas.push(`${esperada.tabla}: no está en el destino`);
      continue;
    }
    const huella = await huellaDeTabla(
      cliente,
      esperada.tabla,
      esperada.columnas,
      filtro,
      manifiesto.negocio.id,
    );
    if (huella.filas !== esperada.filas || huella.md5 !== esperada.md5) {
      distintas.push(
        `${esperada.tabla}: ${String(huella.filas)} filas (${huella.md5}) y el origen ` +
          `${String(esperada.filas)} (${esperada.md5})`,
      );
    }
  }
  return distintas;
}
