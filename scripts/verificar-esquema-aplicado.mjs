#!/usr/bin/env node
/**
 * Contrato: lo que hay APLICADO en la base es lo que dicen los archivos .sql.
 *
 * Existe porque este error ya ocurrió. Al aplicar `003` a mano, la tabla
 * `ordenes` quedó con `impuesto_centavos` en vez de `impuestos_centavos`, con
 * dos columnas inventadas (`propina_centavos`, `pagado_centavos`) y sin cinco
 * que el archivo sí declara (`empleado_atiende_id`, `empleado_cobra_id`,
 * `costo_total_centavos`, `margen_bp`, `cancelada_por`).
 *
 * Nada lo habría detectado: el ledger `_migraciones` guarda el hash del
 * ARCHIVO, así que afirmaba que la migración correcta estaba aplicada mientras
 * la base tenía otra cosa. Un ledger que miente es peor que no tener ledger.
 *
 * Este script no confía en el ledger. Compara nombre por nombre.
 *
 *   node scripts/verificar-esquema-aplicado.mjs --esperado
 *       Imprime, en JSON, las columnas que los .sql declaran.
 *
 *   node scripts/verificar-esquema-aplicado.mjs --comparar <real.json>
 *       Contrasta ese JSON —lo que information_schema devolvió— contra los
 *       archivos, y sale con código 1 si difieren.
 *
 * El paso intermedio (consultar la base) queda fuera a propósito: así el
 * contrato sirve igual por MCP, por psql o por el ejecutor propio, que es la
 * misma portabilidad que promete A-27.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SQL = join(AQUI, '..', 'packages', 'data', 'src', 'migraciones', 'sql');

/** Palabras con las que empieza una restricción, nunca una columna. */
const NO_ES_COLUMNA = new Set([
  'constraint',
  'check',
  'primary',
  'foreign',
  'unique',
  'exclude',
  'like',
]);

/**
 * Quita comentarios de línea. Sin esto, un `-- create table ejemplo (` dentro
 * de la explicación de una migración se leería como declaración real: el
 * contrato encontraría su propio comentario, que es el error clásico.
 */
function sinComentarios(sql) {
  return sql
    .split('\n')
    .map((linea) => {
      const i = linea.indexOf('--');
      return i === -1 ? linea : linea.slice(0, i);
    })
    .join('\n');
}

/** Recorta el cuerpo de un `create table` contando paréntesis, no buscando el primer `)`. */
function cuerpoDeTabla(sql, desde) {
  let nivel = 0;
  for (let i = desde; i < sql.length; i += 1) {
    if (sql[i] === '(') nivel += 1;
    else if (sql[i] === ')') {
      nivel -= 1;
      if (nivel === 0) return sql.slice(desde + 1, i);
    }
  }
  throw new Error('Paréntesis sin cerrar en un create table.');
}

/** Parte por comas de primer nivel: una coma dentro de `check (a in (1,2))` no separa. */
function partirEnColumnas(cuerpo) {
  const partes = [];
  let nivel = 0;
  let actual = '';
  for (const c of cuerpo) {
    if (c === '(') nivel += 1;
    if (c === ')') nivel -= 1;
    if (c === ',' && nivel === 0) {
      partes.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  partes.push(actual);
  return partes;
}

export function columnasDeclaradas(carpeta = SQL) {
  const tablas = {};
  const archivos = readdirSync(carpeta)
    .filter((n) => n.endsWith('.sql'))
    .sort();

  for (const archivo of archivos) {
    const sql = sinComentarios(readFileSync(join(carpeta, archivo), 'utf8'));

    // create table
    const crear = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s*\(/gi;
    let m;
    while ((m = crear.exec(sql)) !== null) {
      const tabla = m[1].toLowerCase();
      const cuerpo = cuerpoDeTabla(sql, crear.lastIndex - 1);
      const columnas = [];
      for (const parte of partirEnColumnas(cuerpo)) {
        const primera = parte.trim().split(/\s+/)[0]?.toLowerCase();
        if (!primera || NO_ES_COLUMNA.has(primera)) continue;
        columnas.push(primera);
      }
      tablas[tabla] = columnas;
    }

    // alter table ... add column — 004 agrega `organizacion_id` así.
    const agregar =
      /alter\s+table\s+([a-z_][a-z0-9_]*)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi;
    while ((m = agregar.exec(sql)) !== null) {
      const tabla = m[1].toLowerCase();
      if (tablas[tabla] && !tablas[tabla].includes(m[2].toLowerCase())) {
        tablas[tabla].push(m[2].toLowerCase());
      }
    }
  }

  return tablas;
}

function comparar(esperado, real) {
  const problemas = [];
  const tablasEsperadas = Object.keys(esperado).sort();
  const tablasReales = Object.keys(real).sort();

  for (const t of tablasEsperadas) {
    if (!(t in real)) {
      problemas.push(`tabla FALTANTE en la base: ${t}`);
      continue;
    }
    const faltan = esperado[t].filter((c) => !real[t].includes(c));
    const sobran = real[t].filter((c) => !esperado[t].includes(c));
    for (const c of faltan) problemas.push(`${t}: columna declarada y NO aplicada → ${c}`);
    for (const c of sobran) problemas.push(`${t}: columna aplicada y NO declarada → ${c}`);
  }

  for (const t of tablasReales) {
    if (!(t in esperado)) problemas.push(`tabla aplicada y NO declarada: ${t}`);
  }

  return problemas;
}

const modo = process.argv[2];

if (modo === '--esperado') {
  process.stdout.write(JSON.stringify(columnasDeclaradas(), null, 2));
} else if (modo === '--comparar') {
  const ruta = process.argv[3];
  if (!ruta) {
    console.error('Falta la ruta del JSON con el esquema real.');
    process.exit(2);
  }
  const real = JSON.parse(readFileSync(ruta, 'utf8'));
  // El ledger no es parte del esquema declarado: lo crea el ejecutor.
  delete real._migraciones;

  const problemas = comparar(columnasDeclaradas(), real);
  if (problemas.length === 0) {
    const n = Object.keys(columnasDeclaradas()).length;
    console.log(`✓ La base coincide con los .sql en las ${n} tablas declaradas.`);
  } else {
    console.error(`✗ ${problemas.length} discrepancia(s) entre los .sql y la base:\n`);
    for (const p of problemas) console.error(`    ${p}`);
    process.exit(1);
  }
} else {
  console.error('Uso: verificar-esquema-aplicado.mjs --esperado | --comparar <real.json>');
  process.exit(2);
}
