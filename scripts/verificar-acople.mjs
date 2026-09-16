#!/usr/bin/env node
/**
 * LA PUERTA DEL ACOPLE (Fase 3).
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * `verify:cobertura` cuenta lo que hay ESCRITO en el repositorio: 113 funciones,
 * 105 rutas, 61 pantallas, 70 migraciones. Salió en 0 con la base viva sin una
 * sola tabla de la Fase 2 y el punto de venta comportándose igual que antes.
 * Es decir: se puede tener la cobertura completa y el acople al cero por ciento.
 *
 * Esta puerta mide lo otro — que lo escrito esté CONECTADO:
 *
 *   1 · El ledger `_migraciones` coincide con el disco, por número Y por hash.
 *   2 · RLS activa y forzada, cero SELECT para anon/authenticated, cero EXECUTE
 *       público. Lo mismo que `verify:rls`, aquí dentro, porque una tanda de 70
 *       migraciones es justo lo que puede dejar una tabla nueva sin cerrar.
 *   3 · Las rutas declaradas EXISTEN y RESPONDEN.
 *   4 · Las plantillas resuelven su lista de módulos, y los cinco giros
 *       documentados caen en una plantilla real.
 *   5 · El vocabulario por giro (F-017) tiene CONSUMIDORES. Tenía dominio,
 *       repositorio, comandos y pruebas, y cero lectores: sin esto, «mesa» no
 *       se convierte en «estación» en ninguna pantalla y la mitad de lo que
 *       hace que una plantilla se sienta propia no existe.
 *   6 · La aplicación desplegada responde y sirve la aplicación.
 *
 * ── Los tres avisos sobre el criterio de las rutas ─────────────────────────
 * Mal puesto, este bloque hace la puerta inalcanzable:
 *   · Un **401 o un 403 es CORRECTO**: la ruta existe y está guardada. Lo que
 *     no se admite es 404 (no existe) ni 500 (revienta).
 *   · Las rutas **dinámicas** —`[token]`, `[id]`— devuelven 404 legítimamente
 *     con un parámetro inventado. Se comprueban por existencia del módulo.
 *   · La lista de rutas esperadas NO se escribe aquí: se importa de
 *     `verificar-cobertura.mjs`. Dos listas de 105 rutas es la forma segura de
 *     que una se quede atrás.
 *
 * Se ejecuta con: pnpm verify:acople
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerMigraciones } from '../packages/data/src/migraciones/lectura.ts';
import {
  cadenaDeVerificacion,
  consultarViva,
} from '../packages/data/src/verificacion/consulta-directa.ts';
import { problemasDeSeguridad } from '../packages/data/src/verificacion/rls.ts';
import { MODELOS, rutasEsperadas } from './verificar-cobertura.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PROYECTO_MORPHIQPOS = 'wyqmzhliurwyxuyxznpb';
const ENTORNO_VERCEL = join(RAIZ, 'docs', 'fase-2', 'VERCEL-ENTORNO.md');

/** Los cinco giros documentados. Cada uno tiene que caer en una plantilla real. */
const GIROS_DOCUMENTADOS = ['restaurante', 'cafeteria', 'tienda', 'ferreteria', 'farmacia'];

const fallos = [];
const notas = [];

function exigir(condicion, mensaje) {
  if (!condicion) fallos.push(mensaje);
  return condicion;
}

function entorno(clave) {
  const delProceso = process.env[clave];
  if (delProceso !== undefined && delProceso !== '') return delProceso;
  for (const nombre of ['.env.local', '.env']) {
    const ruta = join(RAIZ, nombre);
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const limpia = linea.trim();
      if (limpia.length === 0 || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte === -1 || limpia.slice(0, corte).trim() !== clave) continue;
      const valor = limpia
        .slice(corte + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (valor !== '') return valor;
    }
  }
  return undefined;
}

// ───────────────────────────────────────────────────────────────────────────
// 1 · El ledger contra el disco, por número y por hash
// ───────────────────────────────────────────────────────────────────────────

async function comprobarMigraciones() {
  const enDisco = leerMigraciones();

  if (cadenaDeVerificacion() === undefined) {
    fallos.push(
      'MIGRACIONES: no hay conexión de verificación (DATABASE_URL o ' +
        'MORPHIQPOS_DB_VERIFICACION). Sin ella esta puerta no puede mirar la base.',
    );
    return;
  }

  let registradas;
  try {
    const respuesta = await consultarViva(
      'select version, nombre, hash from public._migraciones order by version',
      { proyectoEsperado: PROYECTO_MORPHIQPOS },
    );
    registradas = respuesta.rows;
  } catch (error) {
    fallos.push(`MIGRACIONES: no se pudo leer el ledger · ${error.message}`);
    return;
  }

  const porVersion = new Map(registradas.map((fila) => [Number(fila.version), fila]));
  const faltan = enDisco.filter((m) => !porVersion.has(m.version));
  const sobran = registradas.filter(
    (fila) => !enDisco.some((m) => m.version === Number(fila.version)),
  );
  const distintas = enDisco.filter((m) => {
    const fila = porVersion.get(m.version);
    return fila !== undefined && fila.hash !== m.hash;
  });

  exigir(
    faltan.length === 0,
    `MIGRACIONES: ${faltan.length} escritas y SIN APLICAR · de la ${faltan[0]?.archivo ?? '?'} ` +
      `a la ${faltan.at(-1)?.archivo ?? '?'}`,
  );
  exigir(
    sobran.length === 0,
    `MIGRACIONES: ${sobran.length} aplicadas que no están en el repositorio: ` +
      sobran.map((f) => f.version).join(', '),
  );
  exigir(
    distintas.length === 0,
    `MIGRACIONES: ${distintas.length} con el hash cambiado después de aplicarse: ` +
      distintas.map((m) => m.archivo).join(', '),
  );

  if (faltan.length === 0 && sobran.length === 0 && distintas.length === 0) {
    notas.push(`migraciones   ${enDisco.length} en disco = ${registradas.length} en el ledger`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 2 · RLS, grants y los índices únicos
// ───────────────────────────────────────────────────────────────────────────

const CONSULTA_SEGURIDAD = String.raw`
with relaciones as (
  select
    format('%I.%I', n.nspname, c.relname) as clave,
    case c.relkind
      when 'r' then 'tabla'
      when 'p' then 'tabla_particionada'
      when 'v' then 'vista'
      when 'm' then 'vista_materializada'
    end as tipo,
    case when c.relkind in ('r', 'p') then c.relrowsecurity else null end as "rlsActiva",
    case when c.relkind in ('r', 'p') then c.relforcerowsecurity else null end as "rlsForzada",
    has_table_privilege('anon', format('%I.%I', n.nspname, c.relname), 'SELECT') as "selectAnon",
    has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'SELECT')
      as "selectAuthenticated"
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
), indices as (
  select i.relname as nombre, x.indisunique as unico, x.indisvalid as valido
  from pg_catalog.pg_index x
  join pg_catalog.pg_class i on i.oid = x.indexrelid
  join pg_catalog.pg_class t on t.oid = x.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
), funciones as (
  select
    format('%I.%I(%s)', n.nspname, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid)) as clave,
    has_function_privilege('anon', p.oid, 'EXECUTE') as "executeAnon",
    has_function_privilege('authenticated', p.oid, 'EXECUTE') as "executeAuthenticated"
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select json_build_object(
  'relaciones', coalesce((select json_agg(row_to_json(r) order by r.clave) from relaciones r), '[]'::json),
  'indices',    coalesce((select json_agg(row_to_json(i) order by i.nombre) from indices i), '[]'::json),
  'funciones',  coalesce((select json_agg(row_to_json(f) order by f.clave) from funciones f), '[]'::json)
) as estado;
`;

async function comprobarSeguridad() {
  if (cadenaDeVerificacion() === undefined) return;
  let estado;
  try {
    const respuesta = await consultarViva(CONSULTA_SEGURIDAD, {
      proyectoEsperado: PROYECTO_MORPHIQPOS,
    });
    estado = respuesta.rows?.[0]?.estado;
  } catch (error) {
    fallos.push(`SEGURIDAD: no se pudo leer el estado · ${error.message}`);
    return;
  }

  const problemas = problemasDeSeguridad(estado);
  for (const problema of problemas.slice(0, 12)) fallos.push(`SEGURIDAD: ${problema}`);
  if (problemas.length > 12) {
    fallos.push(`SEGURIDAD: y ${problemas.length - 12} problema(s) más`);
  }
  if (problemas.length === 0) {
    notas.push(
      `seguridad     RLS y grants cerrados en ${estado.relaciones.length} relaciones y ` +
        `${estado.funciones.length} funciones`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 3 · Las rutas declaradas existen y responden
// ───────────────────────────────────────────────────────────────────────────

/** Una ruta es dinámica si algún segmento va entre corchetes. */
function esDinamica(rutaDeArchivo) {
  return /\[[^\]]+\]/.test(rutaDeArchivo);
}

/** `apps/web/app/api/venta/cobrar/route.ts` → `/api/venta/cobrar` */
function urlDe(rutaDeArchivo) {
  return rutaDeArchivo.replace(/^apps\/web\/app/, '').replace(/\/route\.ts$/, '');
}

async function comprobarRutas(base) {
  const declaradas = new Set();
  for (const modelo of MODELOS) for (const ruta of rutasEsperadas(modelo)) declaradas.add(ruta);

  const excepcionadas = new Set();
  const archivoExcepciones = join(RAIZ, 'docs', 'fase-2', 'EXCEPCIONES-COBERTURA.md');
  if (existsSync(archivoExcepciones)) {
    const texto = readFileSync(archivoExcepciones, 'utf8');
    for (const m of texto.matchAll(/RUTA\s+(apps\/web\/app\/api\/\S+?route\.ts)/g)) {
      excepcionadas.add(m[1]);
    }
  }

  const sinArchivo = [];
  for (const ruta of declaradas) {
    if (excepcionadas.has(ruta)) continue;
    if (!existsSync(join(RAIZ, ruta))) sinArchivo.push(ruta);
  }
  exigir(
    sinArchivo.length === 0,
    `RUTAS: ${sinArchivo.length} declaradas sin archivo en disco: ${sinArchivo.slice(0, 5).join(', ')}`,
  );

  if (base === undefined) {
    fallos.push('RUTAS: no hay servidor al que preguntar (ni despliegue ni APP_URL).');
    return;
  }

  const estaticas = [...declaradas].filter((r) => !esDinamica(r) && !excepcionadas.has(r));
  const rotas = [];
  for (const ruta of estaticas) {
    const url = `${base}${urlDe(ruta)}`;
    let estado;
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        redirect: 'manual',
      });
      estado = respuesta.status;
    } catch (error) {
      rotas.push(`${urlDe(ruta)} → no respondió (${error.message})`);
      continue;
    }
    // 401/403 es CORRECTO: la ruta existe y está guardada. 404 es que no existe;
    // 5xx es que revienta. Cualquier otra cosa (200, 400, 422) significa que el
    // manejador corrió, que es lo que esta puerta quiere saber.
    if (estado === 404 || estado >= 500) rotas.push(`${urlDe(ruta)} → ${estado}`);
  }

  exigir(
    rotas.length === 0,
    `RUTAS: ${rotas.length} de ${estaticas.length} no responden · ${rotas.slice(0, 6).join(' · ')}`,
  );
  if (rotas.length === 0) {
    notas.push(
      `rutas         ${declaradas.size} declaradas · ${estaticas.length} probadas por HTTP · ` +
        `${declaradas.size - estaticas.length} dinámicas o exceptuadas, comprobadas en disco`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 4 · Las plantillas resuelven su lista de módulos
// ───────────────────────────────────────────────────────────────────────────

async function comprobarPlantillas() {
  let plantillas;
  try {
    plantillas = await import('../packages/contracts/src/comandos/plantillas.ts');
  } catch (error) {
    fallos.push(`PLANTILLAS: no se pudo cargar el módulo · ${error.message}`);
    return;
  }

  const { PLANTILLAS, modulosActivos, plantillaDe } = plantillas;
  for (const plantilla of PLANTILLAS) {
    const modulos = modulosActivos(plantilla);
    exigir(
      modulos instanceof Set && modulos.size > 0,
      `PLANTILLAS: "${plantilla}" no resuelve ningún módulo`,
    );
  }

  for (const giro of GIROS_DOCUMENTADOS) {
    const plantilla = plantillaDe(giro, undefined);
    exigir(
      PLANTILLAS.includes(plantilla),
      `PLANTILLAS: el giro "${giro}" no cae en ninguna plantilla real (dio "${plantilla}")`,
    );
  }

  // El check de la base y el contrato del código tienen que decir lo MISMO. Si
  // divergen, la pantalla ofrece un valor que Postgres rechaza — que es
  // exactamente lo que pasaba antes de esta fase.
  if (cadenaDeVerificacion() !== undefined) {
    try {
      const respuesta = await consultarViva(
        `select pg_catalog.pg_get_constraintdef(oid) as definicion
           from pg_catalog.pg_constraint
          where conname = 'organizaciones_paquete_check'`,
        { proyectoEsperado: PROYECTO_MORPHIQPOS },
      );
      const definicion = String(respuesta.rows?.[0]?.definicion ?? '');
      const admitidos = [...definicion.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
      const esperados = [...PLANTILLAS].sort();
      exigir(
        admitidos.join(',') === esperados.join(','),
        `PLANTILLAS: el check de la base admite [${admitidos.join(', ')}] y el código ` +
          `declara [${esperados.join(', ')}]`,
      );
    } catch (error) {
      fallos.push(`PLANTILLAS: no se pudo leer el check de la base · ${error.message}`);
    }
  }

  if (!fallos.some((f) => f.startsWith('PLANTILLAS'))) {
    notas.push(
      `plantillas    ${PLANTILLAS.length} resuelven módulos · ` +
        `los ${GIROS_DOCUMENTADOS.length} giros documentados caen en una`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 5 · El vocabulario por giro tiene consumidores
// ───────────────────────────────────────────────────────────────────────────

/**
 * F-017 estaba construido entero y no lo leía nadie.
 *
 * Esta comprobación no mira que el módulo exista —eso ya lo hace
 * `verify:cobertura`— sino que algo lo CONSUMA: una ruta que lo sirva y el
 * envoltorio de las 61 pantallas que lo inyecte. Es la diferencia entre
 * escrito y acoplado, que es lo único que mide esta puerta.
 */
function comprobarVocabulario() {
  const consumidores = [];
  const carpetas = [join(RAIZ, 'apps', 'web', 'app'), join(RAIZ, 'apps', 'web', 'src')];
  const pila = carpetas.filter((c) => existsSync(c));
  const vistos = [];

  while (pila.length > 0) {
    const actual = pila.pop();
    for (const entrada of readdirSyncSeguro(actual)) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== 'node_modules') pila.push(ruta);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entrada.name)) continue;
      const contenido = readFileSync(ruta, 'utf8');
      if (/vocabulario/i.test(contenido)) {
        vistos.push(ruta);
        if (
          /\bvocabularioDelNegocio\b|@morphiqpos\/domain\/vocabulario|\/vocabulario/.test(contenido)
        ) {
          consumidores.push(ruta);
        }
      }
    }
  }

  exigir(
    consumidores.length > 0,
    'VOCABULARIO: F-017 sigue sin consumidores en apps/web. Tiene dominio, ' +
      'repositorio, comandos y pruebas, y ninguna ruta ni pantalla lo lee.',
  );

  const envoltorio = join(RAIZ, 'apps', 'web', 'app', '(modelos)', 'layout.tsx');
  exigir(
    existsSync(envoltorio) && /vocabulario/i.test(readFileSync(envoltorio, 'utf8')),
    'VOCABULARIO: el envoltorio de las 61 pantallas —apps/web/app/(modelos)/layout.tsx— ' +
      'no inyecta el vocabulario. Sin eso «mesa» no se vuelve «estación» en ninguna.',
  );

  if (consumidores.length > 0) {
    notas.push(`vocabulario   ${consumidores.length} consumidor(es) en apps/web`);
  }
}

function readdirSyncSeguro(carpeta) {
  try {
    return readdirSync(carpeta, { withFileTypes: true });
  } catch {
    return [];
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 6 · La aplicación desplegada responde
// ───────────────────────────────────────────────────────────────────────────

async function comprobarDespliegue() {
  const despliegue = entorno('MORPHIQPOS_URL_DESPLIEGUE');
  const local = entorno('APP_URL');

  const base = despliegue ?? local;
  if (base === undefined) {
    fallos.push('DESPLIEGUE: ni MORPHIQPOS_URL_DESPLIEGUE ni APP_URL están definidas.');
    return undefined;
  }

  if (despliegue === undefined) {
    // La salida escrita en §8.1: sin token de Vercel, la comprobación se hace
    // contra el servidor local, se DICE, y no bloquea el 0. Sin esta salida el
    // encargo sería imposible de cerrar y a la vez estaría prohibido detenerse.
    if (existsSync(ENTORNO_VERCEL)) {
      notas.push(
        `despliegue    contra el servidor LOCAL (${base}) · ver docs/fase-2/VERCEL-ENTORNO.md`,
      );
    } else {
      fallos.push(
        'DESPLIEGUE: no hay URL de despliegue y tampoco docs/fase-2/VERCEL-ENTORNO.md ' +
          'que declare por qué. Una de las dos cosas tiene que existir.',
      );
    }
  }

  let respuesta;
  try {
    respuesta = await fetch(base, { redirect: 'manual' });
  } catch (error) {
    fallos.push(`DESPLIEGUE: ${base} no respondió · ${error.message}`);
    return undefined;
  }

  const ok = respuesta.status === 200 || (respuesta.status >= 300 && respuesta.status < 400);
  exigir(ok, `DESPLIEGUE: ${base} devolvió ${respuesta.status}`);
  if (ok && despliegue !== undefined) notas.push(`despliegue    ${base} → ${respuesta.status}`);
  return base;
}

// ───────────────────────────────────────────────────────────────────────────

console.log('');
console.log('ACOPLE DE LA FASE 2 · lo escrito contra lo conectado');
console.log('');

await comprobarMigraciones();
await comprobarSeguridad();
const base = await comprobarDespliegue();
await comprobarRutas(base);
await comprobarPlantillas();
comprobarVocabulario();

for (const nota of notas) console.log(`  ${nota}`);
if (notas.length > 0) console.log('');

if (fallos.length > 0) {
  console.log(`✗ El acople NO está terminado · ${fallos.length} cosa(s) pendientes:`);
  console.log('');
  for (const fallo of fallos) console.log(`  · ${fallo}`);
  console.log('');
  process.exit(1);
}

console.log('✓ Acople completo: migraciones aplicadas, seguridad cerrada, rutas vivas,');
console.log('  plantillas resueltas, vocabulario consumido y aplicación respondiendo.');
process.exit(0);
