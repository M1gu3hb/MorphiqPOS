#!/usr/bin/env node
/**
 * LA PUERTA DEL ACOPLE (Fase 2.3).
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
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { leerMigraciones } from '../packages/data/src/migraciones/lectura.ts';
import {
  cadenaDeVerificacion,
  consultarViva,
} from '../packages/data/src/verificacion/consulta-directa.ts';
import { DICCIONARIOS } from '../packages/domain/src/vocabulario/diccionarios.ts';
import { problemasDeSeguridad } from '../packages/data/src/verificacion/rls.ts';
import { sinFalsosDelimitadores } from './lib/sin-prosa.mjs';
import { MODELOS, pantallasEsperadas, rutasEsperadas } from './verificar-cobertura.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PROYECTO_MORPHIQPOS = 'wyqmzhliurwyxuyxznpb';
const ENTORNO_VERCEL = join(RAIZ, 'docs', 'fase-2', 'VERCEL-ENTORNO.md');

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

/**
 * Los comandos con `escribe: true` que ninguna ruta importa.
 *
 * Se descubren recorriendo el árbol, no de una lista: una lista sólo contiene
 * lo que alguien recordó registrar, y un comando nuevo que se olvide de
 * registrarse pasaría la puerta sin estar conectado — que es exactamente el
 * fallo que esto existe para cazar.
 */
function comandosDeEscrituraSinRuta() {
  const comandos = new Map();
  const pila = [join(RAIZ, 'packages', 'app', 'src')];
  while (pila.length > 0) {
    const actual = pila.pop();
    for (const entrada of readdirSyncSeguro(actual)) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name !== 'node_modules' && entrada.name !== 'pruebas') pila.push(ruta);
        continue;
      }
      if (!entrada.name.endsWith('.ts') || entrada.name.includes('.test.')) continue;
      const contenido = readFileSync(ruta, 'utf8');
      // El bloque de CADA comando, acotado al siguiente `export const`.
      //
      // Escrito como un solo regex perezoso hasta `escribe: true`, un comando de
      // LECTURA quedaba marcado como escritor porque el `escribe: true` que
      // encontraba era el del comando de abajo. La puerta denunciaba
      // `inventario.piezas_abiertas` y `inventario.proximas_a_caducar` —las dos
      // consultas— como escrituras huérfanas.
      for (const bloque of contenido.split(/^export const /m).slice(1)) {
        const nombre = /^(\w+) = definirComando</.exec(bloque)?.[1];
        if (nombre === undefined) continue;
        if (!/^\s*escribe: true,/m.test(bloque)) continue;
        comandos.set(nombre, ruta);
      }
    }
  }

  // Lo que las rutas importan. Basta con el nombre: si una ruta lo importa y no
  // lo usa, `eslint` ya lo caza como import sin usar.
  const importados = new Set();
  const pilaRutas = [join(RAIZ, 'apps', 'web', 'app')];
  while (pilaRutas.length > 0) {
    const actual = pilaRutas.pop();
    for (const entrada of readdirSyncSeguro(actual)) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        pilaRutas.push(ruta);
        continue;
      }
      if (entrada.name !== 'route.ts') continue;
      // La clase se escribe entera en vez de usar la secuencia de palabra: al
      // generar este archivo esa secuencia se colo como el CARACTER de control
      // backspace y el regex dejo de encontrar nada. La puerta denunciaba 172
      // comandos huerfanos que si tenian ruta, que es la peor forma de fallar:
      // ruidosa y falsa.
      for (const m of readFileSync(ruta, 'utf8').matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
        importados.add(m[0]);
      }
    }
  }

  return [...comandos.keys()].filter((nombre) => !importados.has(nombre)).sort();
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

  // ── Ningún comando de ESCRITURA puede quedar huérfano ────────────────
  //
  // Contar archivos de ruta no basta. Un `route.ts` que existe y ha perdido el
  // comando que servía sigue contando como presente, y eso pasó en esta misma
  // fase: al añadir el `GET` del vocabulario se sobrescribió el archivo entero y
  // se llevó por delante el `POST` de `fijarTermino`. La cobertura siguió en 0
  // porque el archivo estaba. Lo que no estaba era la mitad que escribía.
  //
  // Lo que esta puerta mide es ACOPLE, y un comando que escribe en la base y al
  // que no llega ninguna ruta es la definición de lo contrario: construido y
  // desconectado.
  //
  // NO se comprueba el verbo declarado en el papel contra el exportado: la
  // convención del proyecto es que TODAS las rutas de comando son POST
  // (`manejadorDeComando`), y los `GET`/`PATCH` de los `05-DATOS-Y-BACKEND.md`
  // son la forma REST con la que se diseñaron, no la que se implementó.
  const huerfanos = comandosDeEscrituraSinRuta();
  exigir(
    huerfanos.length === 0,
    `RUTAS: ${huerfanos.length} comando(s) que ESCRIBEN y a los que no llega ninguna ruta: ` +
      huerfanos.slice(0, 8).join(', '),
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
        headers: { 'content-type': 'application/json', ...MURO.cabeceras },
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
  let ambito;
  let navegacion;
  try {
    plantillas = await import('../packages/contracts/src/comandos/plantillas.ts');
    // Los giros se leen de donde se declaran. Aquí había una lista tecleada a mano
    // —cinco giros— y la 164 añadió el sexto: una segunda lista es cómo una se
    // queda atrás, y es la misma razón por la que las 105 rutas se importan de
    // `verificar-cobertura.mjs` en vez de escribirse aquí.
    ambito = await import('../packages/contracts/src/comandos/ambito.ts');
    // El menú y el mapa de giros viven aquí: es lo que el servidor sabe de la
    // navegación, y lo que el navegador tiene que limitarse a pintar.
    navegacion = await import('../packages/contracts/src/comandos/navegacion.ts');
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

  // ── Cada giro cae en una plantilla DECLARADA, no en el `default` ──────
  //
  // Aquí había una tautología: se preguntaba si `plantillaDe(giro)` devolvía
  // una plantilla real, y `plantillaDe` termina en `default: return 'tienda'`.
  // La respuesta era que sí para CUALQUIER giro, incluido uno inventado, así
  // que la comprobación pasaba siempre y no medía nada. Por eso no vio que dos
  // de los seis giros no tenían plantilla propia.
  //
  // Lo que se comprueba ahora es que exista un mapa EXPLÍCITO giro → plantilla,
  // que sus claves sean exactamente `GIROS` en las dos direcciones, y que un
  // giro inventado NO esté en él. El `default` sigue existiendo —un dato roto
  // tiene que caer en la plantilla más restrictiva y no reventar— pero deja de
  // ser lo que esta puerta aprueba.
  const { PLANTILLA_POR_GIRO } = navegacion;
  if (PLANTILLA_POR_GIRO === undefined) {
    fallos.push(
      'PLANTILLAS: no hay mapa explícito giro → plantilla. Se espera ' +
        '`PLANTILLA_POR_GIRO` en packages/contracts/src/comandos/navegacion.ts, ' +
        'porque el `default` de plantillaDe() aprueba cualquier giro y no prueba nada.',
    );
  } else {
    const declarados = Object.keys(PLANTILLA_POR_GIRO).sort();
    const esperados = [...ambito.GIROS].sort();
    exigir(
      declarados.join(',') === esperados.join(','),
      `PLANTILLAS: PLANTILLA_POR_GIRO declara [${declarados.join(', ')}] y GIROS dice ` +
        `[${esperados.join(', ')}]`,
    );
    for (const giro of ambito.GIROS) {
      const declarada = PLANTILLA_POR_GIRO[giro];
      exigir(
        PLANTILLAS.includes(declarada),
        `PLANTILLAS: el giro "${giro}" está declarado en "${declarada}", que no es una plantilla`,
      );
      /**
       * Lo que SÍ mide algo: que un paquete GUARDADO gane sobre el giro.
       *
       * ── Por qué se quitó lo que había aquí ─────────────────────────────
       * Había `plantillaDe(giro, undefined) === declarada`, y eso es el mapa
       * comparándose consigo mismo: sin valor guardado, `plantillaDe` devuelve
       * literalmente `PLANTILLA_POR_GIRO[giro] ?? 'tienda'`. Pasaba siempre, para
       * cualquier mapa, incluido uno mal escrito. Una aserción circular no es una
       * aserción: es una línea que da confianza gratis.
       *
       * Estas tres sí pueden fallar, y cada una protege una decisión escrita:
       *  · un paquete guardado y válido MANDA sobre el giro —es lo que hace que
       *    Modo presentación pueda enseñar las cinco plantillas en un negocio—;
       *  · un valor corrupto cae en la MÁS RESTRICTIVA y no en la más permisiva,
       *    que es la regla de D-01 y el defecto que tenía `getCurrentPackage`;
       *  · `restaurante_pro` sólo abre sala en un giro de alimentos: en una
       *    ferretería se degrada en vez de regalarle mesero y cocina.
       *
       * El `default: 'tienda'` de `plantillaDe()` NO se toca: un dato roto tiene
       * que caer en la plantilla más restrictiva en vez de reventar.
       */
      for (const otra of PLANTILLAS) {
        exigir(
          plantillaDe(giro, otra) === otra,
          `PLANTILLAS: con el paquete "${otra}" guardado, el giro "${giro}" resuelve a ` +
            `"${plantillaDe(giro, otra)}". Un paquete guardado y válido manda sobre el giro.`,
        );
      }
      exigir(
        plantillaDe(giro, 'paquete_que_no_existe') === 'tienda',
        `PLANTILLAS: un paquete corrupto en el giro "${giro}" resuelve a ` +
          `"${plantillaDe(giro, 'paquete_que_no_existe')}" en vez de a la plantilla más ` +
          'restrictiva. Un dato roto no puede abrir módulos que nadie contrató.',
      );
      const esDeAlimentos = ['restaurante', 'cafeteria'].includes(giro);
      exigir(
        plantillaDe(giro, 'restaurante_pro') === (esDeAlimentos ? 'restaurante' : 'tienda'),
        `PLANTILLAS: "restaurante_pro" en el giro "${giro}" resuelve a ` +
          `"${plantillaDe(giro, 'restaurante_pro')}". Sólo un giro de alimentos puede tener sala; ` +
          'en los demás es un dato corrupto y se degrada.',
      );
    }
    exigir(
      PLANTILLA_POR_GIRO['giro_que_no_existe'] === undefined,
      'PLANTILLAS: el mapa giro → plantilla acepta un giro inventado. Si responde a ' +
        'todo, no declara nada.',
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
        `los ${ambito.GIROS.length} giros de GIROS caen en una`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 5 · Las pantallas de los modelos cuelgan de un menú
// ───────────────────────────────────────────────────────────────────────────

/**
 * Que una pantalla RESPONDA no significa que alguien pueda llegar a ella.
 *
 * ── Qué se le escapó a esta puerta ─────────────────────────────────────────
 * Las pantallas de los cinco modelos estaban construidas, etiquetadas,
 * contadas por `verify:cobertura` y respondiendo por HTTP — y NINGUNA colgaba
 * de un menú. Para abrir cualquiera de ellas había que teclear la URL.
 * `NAV_ITEMS` seguía siendo la lista fija de doce entradas heredadas, y ni una
 * llevaba a una pantalla de modelo.
 *
 * Contar archivos y pedir un 200 no mide acople: mide existencia. Esto mide lo
 * otro — que desde la plantilla de un negocio se pueda LLEGAR.
 *
 * ── Por qué el menú se lee del servidor y no de `permissions.js` ───────────
 * Porque el navegador no puede ser la fuente de la verdad de lo que un negocio
 * tiene contratado: eso ya costó un defecto en esta misma fase, cuando
 * `getCurrentPackage` daba el menú completo a una tienda. El menú se declara en
 * `packages/contracts/src/comandos/navegacion.ts`, junto a los módulos, y el
 * frontend heredado lo pinta.
 */
async function comprobarNavegacion() {
  let navegacion;
  let plantillas;
  try {
    navegacion = await import('../packages/contracts/src/comandos/navegacion.ts');
    plantillas = await import('../packages/contracts/src/comandos/plantillas.ts');
  } catch (error) {
    fallos.push(
      'NAVEGACION: no hay menú por plantilla. Se espera ' +
        'packages/contracts/src/comandos/navegacion.ts con `navegacionDePlantilla` e ' +
        `\`INICIO_POR_PLANTILLA\` · ${error.message}`,
    );
    return;
  }

  const { navegacionDePlantilla, INICIO_POR_PLANTILLA } = navegacion;
  const { PLANTILLAS, modulosActivos } = plantillas;

  if (typeof navegacionDePlantilla !== 'function') {
    fallos.push('NAVEGACION: `navegacionDePlantilla` no es una función.');
    return;
  }

  // Todas las rutas que alguna plantilla ofrece en su menú.
  const ofrecidas = new Set();
  for (const plantilla of PLANTILLAS) {
    const entradas = navegacionDePlantilla(plantilla);
    exigir(
      Array.isArray(entradas) && entradas.length > 0,
      `NAVEGACION: la plantilla "${plantilla}" no ofrece ninguna entrada de menú`,
    );
    const modulos = modulosActivos(plantilla);
    for (const entrada of entradas ?? []) {
      ofrecidas.add(entrada.ruta);
      // Un menú que ofrece lo que la plantilla no incluye es una promesa que el
      // POST rechaza — el defecto de `getCurrentPackage`, otra vez.
      exigir(
        entrada.modulo === undefined || modulos.has(entrada.modulo),
        `NAVEGACION: "${plantilla}" ofrece ${entrada.ruta} por el módulo ` +
          `"${entrada.modulo}", que esa plantilla no incluye`,
      );
    }

    const inicio = INICIO_POR_PLANTILLA?.[plantilla];
    exigir(
      inicio !== undefined,
      `NAVEGACION: la plantilla "${plantilla}" no declara pantalla de inicio`,
    );
    if (inicio !== undefined) {
      exigir(
        (entradas ?? []).some((e) => e.ruta === inicio),
        `NAVEGACION: la pantalla de inicio de "${plantilla}" es ${inicio} y no está en su menú`,
      );
    }
  }

  // Y cada una de las pantallas de los modelos tiene que estar en el menú de
  // ALGUNA plantilla. No hace falta que esté en las cinco —el mapa de mesas no
  // es de una ferretería— pero sí que exista un negocio desde el que se llegue.
  //
  // Salvo las que NO pueden estar: la entrada con PIN se ve antes de que haya
  // menú, y las dos del QR las abre el cliente desde su teléfono. Ésas se
  // DECLARAN, con su motivo, en EXCEPCIONES-COBERTURA.md — y si la fila no
  // está, esta puerta las cuenta como inalcanzables, que es lo correcto: lo que
  // no puede pasar es que una pantalla se caiga del menú en silencio.
  const sinMenu = new Set();
  const archivoExcepciones = join(RAIZ, 'docs', 'fase-2', 'EXCEPCIONES-COBERTURA.md');
  if (existsSync(archivoExcepciones)) {
    const texto = readFileSync(archivoExcepciones, 'utf8');
    for (const m of texto.matchAll(/PANTALLA-SIN-MENU\s+([a-z-]+)\/([a-z0-9-]+)/g)) {
      sinMenu.add(`/${m[1]}/${m[2]}`);
    }
  }

  // Y las dos listas tienen que decir lo MISMO. La guarda de `app/(modelos)/`
  // salta exactamente estas rutas (`RUTAS_DE_MODELO_SIN_SESION`), y son las que
  // no están en ningún menú porque nadie con sesión las abre. Si se separan, hay
  // dos salidas malas: una pantalla privada que se abre sin sesión, o la
  // pantalla de teclear el PIN mandando al login a quien la está mirando.
  const sinSesion = new Set(navegacion.RUTAS_DE_MODELO_SIN_SESION ?? []);
  const soloEnElDoc = [...sinMenu].filter((r) => !sinSesion.has(r));
  const soloEnElCodigo = [...sinSesion].filter((r) => !sinMenu.has(r));
  exigir(
    soloEnElDoc.length === 0 && soloEnElCodigo.length === 0,
    'NAVEGACION: las pantallas declaradas sin menú y las que la guarda abre sin ' +
      'sesión no son las mismas.' +
      (soloEnElDoc.length > 0
        ? `
    Declaradas PANTALLA-SIN-MENU y con guarda: ${soloEnElDoc.join(', ')} ` +
          '— nadie con sesión puede llegar a ellas y sin sesión tampoco: son inalcanzables.'
        : '') +
      (soloEnElCodigo.length > 0
        ? `
    Abiertas SIN SESIÓN y no declaradas: ${soloEnElCodigo.join(', ')} ` +
          '— una pantalla de negocio que cualquiera abre desde la calle.'
        : ''),
  );

  const inalcanzables = [];
  for (const modelo of MODELOS) {
    for (const slug of pantallasEsperadas(modelo)) {
      const ruta = `/${modelo.clave}/${slug}`;
      if (!ofrecidas.has(ruta) && !sinMenu.has(ruta)) inalcanzables.push(ruta);
    }
  }
  exigir(
    inalcanzables.length === 0,
    `NAVEGACION: ${inalcanzables.length} pantalla(s) de modelo no cuelgan de ningún menú · ` +
      `${inalcanzables.slice(0, 6).join(' · ')}`,
  );

  /**
   * Y LAS PANTALLAS HEREDADAS, que hasta hoy no las miraba nadie.
   *
   * ── Por qué hacen falta aquí ──────────────────────────────────────────
   * Las de `app/(interno)/` son las que llevan meses cobrando: la caja, la
   * cocina, el mesero, el punto de venta, los registros. El menú las ofrece en su
   * propio grupo, y **ya se cayeron una vez** — cuando la navegación pasó a ser
   * por plantilla, un módulo mal escrito las dejó fuera del menú sin que ninguna
   * puerta lo notara, porque esta comprobación sólo miraba las de los modelos.
   *
   * La misma regla que para las de modelo: o cuelgan de algún menú, o están
   * DECLARADAS con su motivo en `EXCEPCIONES-COBERTURA.md`. Lo que no puede pasar
   * es que se caigan en silencio.
   */
  const CARPETA_HEREDADAS = join(RAIZ, 'apps', 'web', 'app', '(interno)');
  const heredadasSinMenu = new Set();
  if (existsSync(archivoExcepciones)) {
    const texto = readFileSync(archivoExcepciones, 'utf8');
    for (const m of texto.matchAll(/PANTALLA-HEREDADA-SIN-MENU\s+([a-z0-9-]+)/g)) {
      heredadasSinMenu.add(`/${m[1]}`);
    }
  }

  // `readdirSyncSeguro` devuelve `Dirent`, no cadenas: se toma el nombre.
  const heredadas = readdirSyncSeguro(CARPETA_HEREDADAS)
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => existsSync(join(CARPETA_HEREDADAS, nombre, 'page.tsx')));
  const heredadasHuerfanas = heredadas
    .map((slug) => `/${slug}`)
    .filter((ruta) => !ofrecidas.has(ruta) && !heredadasSinMenu.has(ruta));

  exigir(
    heredadasHuerfanas.length === 0,
    `NAVEGACION: ${heredadasHuerfanas.length} pantalla(s) HEREDADAS no cuelgan de ningún menú ` +
      `ni están declaradas · ${heredadasHuerfanas.join(' · ')}. ` +
      'Son las que llevan meses cobrando: o están en el menú de alguna plantilla, o se declaran ' +
      'con PANTALLA-HEREDADA-SIN-MENU y su motivo en docs/fase-2/EXCEPCIONES-COBERTURA.md.',
  );

  // Y una declaración que ya no corresponde a ninguna pantalla es basura que
  // sobrevive a un renombrado: se cae igual que una pantalla huérfana.
  const declaradasQueNoExisten = [...heredadasSinMenu].filter(
    (ruta) => !heredadas.includes(ruta.slice(1)),
  );
  exigir(
    declaradasQueNoExisten.length === 0,
    `NAVEGACION: hay PANTALLA-HEREDADA-SIN-MENU para ${declaradasQueNoExisten.join(', ')} y esa ` +
      'pantalla no existe. Una excepción que no describe nada hace creer que la lista está al día.',
  );

  if (!fallos.some((f) => f.startsWith('NAVEGACION'))) {
    const totalPantallas = MODELOS.reduce((n, m) => n + pantallasEsperadas(m).size, 0);
    notas.push(
      `navegacion    ${ofrecidas.size} rutas en los menús · ` +
        `${totalPantallas - sinMenu.size} de ${totalPantallas} pantallas de modelo alcanzables · ` +
        `${sinMenu.size} declaradas sin menú · ` +
        `${heredadas.length - heredadasSinMenu.size} de ${heredadas.length} heredadas en el menú`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 6 · El vocabulario por giro tiene consumidores
// ───────────────────────────────────────────────────────────────────────────

/**
 * F-017 estaba construido entero y no lo leía nadie.
 *
 * Esta comprobación no mira que el módulo exista —eso ya lo hace
 * `verify:cobertura`— sino que algo lo CONSUMA: una ruta que lo sirva y el
 * envoltorio de las pantallas de modelo que lo inyecte. Es la diferencia entre
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

  // ── Las cuatro piezas, una por una ─────────────────────────────────
  // Contar «algún archivo menciona vocabulario» no vale: el propio módulo
  // cuenta como mención y la puerta se aprueba a sí misma. Se exige cada pieza
  // del camino por separado, porque con que falte una el sustantivo no llega a
  // la pantalla y F-017 vuelve a ser código que no lee nadie.
  const piezas = [
    {
      ruta: join(RAIZ, 'apps', 'web', 'app', 'api', 'configuracion', 'vocabulario', 'route.ts'),
      patron: /terminos/i,
      falta:
        'no hay ruta que SIRVA el vocabulario. El repositorio y los dos comandos de ' +
        'escritura existían; la mitad de lectura no.',
    },
    {
      ruta: join(RAIZ, 'apps', 'web', 'app', '(modelos)', 'layout.tsx'),
      patron: /ProveedorDeVocabulario/,
      falta:
        'el envoltorio de las pantallas de modelo no lo inyecta. Sin eso «mesa» ' +
        'no se vuelve «estación» en ninguna.',
    },
    {
      ruta: join(RAIZ, 'apps', 'web', 'app', '(interno)', 'layout.tsx'),
      patron: /ProveedorDeVocabulario/,
      falta:
        'el envoltorio del punto de venta HEREDADO no lo inyecta, y ése es el que ' +
        'los cuatro negocios abren todos los días.',
    },
    {
      ruta: join(RAIZ, 'apps', 'web', 'heredado', 'components', 'common', 'Sidebar.jsx'),
      patron: /etiquetaDeNavegacion|useVocabulario/,
      falta:
        'el menú sigue con las etiquetas escritas a mano. Es el primer sitio donde ' +
        'una ferretería tiene que leer «Materiales» y no «Productos».',
    },
  ];

  for (const pieza of piezas) {
    exigir(
      existsSync(pieza.ruta) && pieza.patron.test(readFileSync(pieza.ruta, 'utf8')),
      `VOCABULARIO: ${pieza.falta}`,
    );
  }

  // Y las PANTALLAS. Hasta el 17-09-2026 esta comprobación pedía «al menos dos», y
  // con dos pasaba: 3 de 65 componentes lo leían y las otras 62 tenían el
  // sustantivo del giro tecleado a mano. Después contaba cuántos archivos lo
  // mencionan, que tampoco medía nada —contaba el propio módulo—. Lo que se exige
  // es lo de abajo: ninguna pantalla escribe a mano una palabra que el diccionario
  // de su giro ya sabe decir, y CADA UNA de las 62 lo consume o está declarada.
  const deOtroGiro = pantallasQueHablanDeOtroGiro();
  exigir(
    deOtroGiro.length === 0,
    `VOCABULARIO: ${deOtroGiro.length} pantalla(s) usan la palabra de OTRO giro para algo que su ` +
      'propio diccionario nombra distinto. Es lo que hace que el sistema se sienta prestado: un ' +
      'restaurante que rotula «Productos» donde dice «Platillos»:\n    ' +
      deOtroGiro.slice(0, 12).join('\n    ') +
      (deOtroGiro.length > 12 ? `\n    …y ${deOtroGiro.length - 12} más` : ''),
  );

  const conLiteral = pantallasConSustantivoTecleado();
  exigir(
    conLiteral.length === 0,
    `VOCABULARIO: ${conLiteral.length} pantalla(s) escriben a mano una palabra que el ` +
      'diccionario de su giro ya dice. El día que la dueña llame «cabina» a su estación, ' +
      'esas líneas seguirán diciendo «mesa»:\n    ' +
      conLiteral.slice(0, 12).join('\n    ') +
      (conLiteral.length > 12 ? `\n    …y ${conLiteral.length - 12} más` : ''),
  );

  /**
   * Y AHORA CONTRA LAS 62, que es lo que el número de arriba no medía.
   *
   * «55 pantallas lo consumen» sonaba bien y no significaba nada: contaba
   * CUALQUIER archivo de `apps/web/src` que mencionara el vocabulario —los tres
   * `Tablero.tsx`, dos diálogos, el propio módulo— y entre ellos se colaban trece
   * pantallas de modelo que no lo consumían, con la agenda del salón entre ellas.
   *
   * Lo que se exige ahora es una por una, sobre la MISMA lista que usan las otras
   * puertas —el §4.3 del `04-INTERFAZ.md` de cada modelo— y contra el componente
   * que lleva su etiqueta `PANTALLA · modelo · slug`. Una pantalla que de verdad no
   * tiene ni un sustantivo del diccionario se declara, con su motivo, en
   * `EXCEPCIONES-COBERTURA.md`; las demás lo consumen.
   */
  const declaradas = new Set();
  const archivoExcepciones = join(RAIZ, 'docs', 'fase-2', 'EXCEPCIONES-COBERTURA.md');
  if (existsSync(archivoExcepciones)) {
    const texto = readFileSync(archivoExcepciones, 'utf8');
    for (const m of texto.matchAll(/PANTALLA-SIN-VOCABULARIO\s+([a-z-]+)\/([a-z0-9-]+)/g)) {
      declaradas.add(`${m[1]}/${m[2]}`);
    }
  }

  const componentes = componentesDePantalla();
  const sinVocabulario = [];
  let conVocabulario = 0;
  for (const modelo of MODELOS) {
    for (const slug of pantallasEsperadas(modelo)) {
      const clave = `${modelo.clave}/${slug}`;
      if (declaradas.has(clave)) continue;
      const componente = componentes.get(clave);
      if (componente === undefined) {
        // Sin componente etiquetado no hay nada que mirar, y de eso ya se queja
        // `verify:cobertura` con su propio mensaje.
        continue;
      }
      if (/useVocabulario|useTermino/.test(readFileSync(componente, 'utf8'))) conVocabulario += 1;
      else sinVocabulario.push(clave);
    }
  }

  exigir(
    sinVocabulario.length === 0,
    `VOCABULARIO: ${sinVocabulario.length} pantalla(s) de modelo NO consumen el diccionario ` +
      'y no están declaradas:\n    ' +
      sinVocabulario.join('\n    ') +
      '\n  O leen su sustantivo del diccionario, o se declaran en ' +
      'EXCEPCIONES-COBERTURA.md con `PANTALLA-SIN-VOCABULARIO <modelo>/<slug>` y el motivo ' +
      '—que sólo puede ser «esta pantalla no nombra ninguna entidad del diccionario»—.',
  );

  const sobran = [...declaradas].filter((clave) => {
    const componente = componentes.get(clave);
    return (
      componente !== undefined && /useVocabulario|useTermino/.test(readFileSync(componente, 'utf8'))
    );
  });
  exigir(
    sobran.length === 0,
    `VOCABULARIO: ${sobran.join(', ')} está(n) declarada(s) como sin vocabulario y SÍ lo ` +
      'consume(n). Borra la fila: una lista de excepciones que incluye lo que ya funciona deja ' +
      'de leerse.',
  );

  if (!fallos.some((f) => f.startsWith('VOCABULARIO'))) {
    notas.push(
      `vocabulario   ruta + los dos envoltorios + el menú heredado · ` +
        `${conVocabulario} de ${conVocabulario + declaradas.size} pantalla(s) de modelo lo ` +
        `consumen · ${declaradas.size} declarada(s) sin sustantivos · ` +
        `0 tecleados a mano · 0 rótulos con la palabra de otro giro`,
    );
  }
}

/**
 * El componente de cada pantalla, por su etiqueta `PANTALLA · modelo · slug`.
 *
 * La misma etiqueta que lee `verify:cobertura` para saber si una pantalla está
 * construida. Leerla aquí otra vez —en vez de importar su índice— es una lectura
 * de cuarenta archivos que no depende del orden en que corran las dos puertas.
 */
function componentesDePantalla() {
  const raiz = join(RAIZ, 'apps', 'web', 'src');
  const encontrados = new Map();
  const pila = [raiz];
  while (pila.length > 0) {
    const actual = pila.pop();
    for (const entrada of readdirSyncSeguro(actual)) {
      const ruta = join(actual, entrada.name);
      if (entrada.isDirectory()) {
        pila.push(ruta);
        continue;
      }
      if (!entrada.name.endsWith('.tsx')) continue;
      const cabecera = readFileSync(ruta, 'utf8').slice(0, 4000);
      for (const m of cabecera.matchAll(/PANTALLA\s*·\s*([a-z-]+)\s*·\s*([a-z0-9-]+)/g)) {
        encontrados.set(`${m[1]}/${m[2]}`, ruta);
      }
    }
  }
  return encontrados;
}

/**
 * Las carpetas de pantalla de los cinco modelos, con el GIRO cuyo diccionario
 * les toca. La plantilla dice qué módulos tiene el negocio; el giro dice cómo
 * habla, y son ejes distintos (ver la cabecera de `vocabulario/tipos.ts`).
 */
const GIRO_DE_LA_CARPETA = {
  restaurante: 'restaurante',
  cafeteria: 'cafeteria',
  abarrotes: 'tienda',
  ferreteria: 'ferreteria',
  'estetica-salon': 'estetica',
};

/**
 * Frases donde la palabra NO es la entidad del diccionario.
 *
 * «Punto de venta» es el nombre del producto, «cuenta el cajón» es el verbo
 * contar, «precio de venta» es un término de contabilidad y la «nota» de
 * `ferreteria/Entradas` es la del PROVEEDOR, no la del cliente. Traducirlas
 * sería peor que no traducir nada.
 */
const NO_ES_LA_ENTIDAD = [
  'punto de venta',
  'precio de venta',
  /**
   * «UNIDAD DE VENTA» es la palabra de la FERRETERÍA, y está en su propia ficha.
   *
   * `modelos/02-retail/ferreteria/00-FICHA-Y-EJES.md` la lleva como eje: «Pieza,
   * metro, kilo y pieza-por-kilo, con corte físico del material». Es el mismo
   * compuesto que las dos líneas de arriba —el sustantivo es «unidad», no la nota que
   * se cobra— y el toggle que la rotula elige entre metro, pieza y caja, no entre
   * documentos.
   *
   * La puerta la vio por primera vez el 21-09-2026, y no porque el rótulo sea nuevo
   * —lleva ahí desde `bdb3c69`—: un `accept="image/*"` de la misma pantalla abría un
   * comentario fantasma que dejaba 170 líneas de ese archivo sin leer. Arreglado en
   * `textosVisibles`; esta línea es lo que quedó debajo.
   */
  'unidad de venta',
  'corte de caja',
  'punto de partida',
  'cuenta el',
  'cuenta lo que',
  'cuenta los',
  'cuenta las',
  'cuenta dos',
  'se cuentan',
  // El VERBO, que es lo que dice el encabezado del conteo por zonas: «aquí se
  // cuenta una zona del almacén». El sustantivo `cuenta` de otro giro no tiene
  // nada que ver.
  'se cuenta',
  'cuenta con',
  'primera nota',
  'nota del',
  'notas del',
  'nota interna',
  'foto de la nota',
  'mesa de trabajo',
  'barra lateral',
];

/**
 * Y estas palabras, en estas pantallas, tampoco.
 *
 * Cada fila lleva su razón, y todas son la misma clase de cosa: una palabra que el
 * diccionario de algún giro usa para una entidad, empleada aquí en su sentido
 * común. Traducirlas sería peor que dejarlas —«¿A qué cita?» donde se pregunta a
 * qué CUENTA DE BANCO va la propina— y por eso se declaran en vez de vetar la
 * comprobación entera. La lista sólo puede encogerse.
 */
const NO_ES_LA_ENTIDAD_AQUI = {
  // La nota del PROVEEDOR: el documento con el que llega la mercancía, no la
  // nota de mostrador que se cobra.
  'ferreteria/Entradas.tsx': ['nota', 'notas'],
  'abarrotes/Entradas.tsx': ['nota', 'notas'],
  // El negocio de recargas y pagos de luz, agua y teléfono —«pago de servicio»—
  // y la CUENTA DE COMISIONISTA con la que el dueño se da de alta. Ni una ni otra
  // son la partida de una venta.
  'abarrotes/Servicios.tsx': ['servicio', 'servicios', 'cuenta'],
  // Cuentas POR COBRAR: la cartera del fiado. No es la nota de una venta.
  'ferreteria/Cuentas.tsx': ['cuenta', 'cuentas'],
  // «A cuenta» es FIAR: el método de pago que sube el saldo del cliente —su
  // etiqueta en la lista de métodos de esa misma pantalla—, no la nota que se cobra.
  'ferreteria/Caja.tsx': ['cuenta'],
  // La cuenta de BANCO a la que va la propina o la comisión.
  'estetica-salon/Cobrar.tsx': ['cuenta'],
  // «Ventas» en un arqueo es el DINERO del día, la línea de un corte. La cuenta
  // de una mesa se llama cuenta en todo el resto de la pantalla.
  'restaurante/CierreDiario.tsx': ['ventas'],
};

/**
 * LO QUE EL USUARIO LEE en un archivo de pantalla, con su línea.
 *
 * ── Por qué no se puede mirar línea a línea ───────────────────────────────
 * Porque el texto de JSX se parte donde cabe. Esto miraba cada línea por separado
 * buscando `>texto<`, y con el atributo largo en una línea y el texto en la
 * siguiente —que es como lo deja Prettier— el texto no tenía ningún `>` delante y
 * NO SE MIRABA. Así pasó «No hay platillos que se llamen así» en `MesaActiva`: una
 * palabra del diccionario tecleada a mano, en la pantalla donde un mesero pasa el
 * turno, y la puerta decía «0 sustantivos tecleados».
 *
 * Ahora el archivo se lee entero: se le quita la prosa —bloques `/* *\/`, `{/* *\/}`
 * y líneas de `//`— y se buscan los tramos entre `>` y `<` sin llaves en medio, que
 * es lo que el navegador pinta como texto. Se descartan los que huelen a código
 * —`;`, `=>`, `()`— y los que no llevan ni una letra.
 */
function textosVisibles(fuente) {
  // Los saltos de línea se CONSERVAN al quitar la prosa: el número de línea del
  // mensaje es lo que hace que alguien pueda ir a arreglarlo, y colapsar un
  // comentario de ocho líneas en un espacio lo desplazaba todo lo que viene detrás.
  const enBlanco = (trozo) => trozo.replaceAll(/[^\n]/g, ' ');

  /**
   * `accept="image/*"` NO ABRE UN COMENTARIO, y durante meses sí lo abrió.
   *
   * El `/` + `*` de ese tipo MIME entraba como apertura de bloque, el buscador corría
   * hasta el cierre siguiente —que estaba 170 líneas más abajo— y esta función
   * devolvía en blanco todo lo que había en medio. En `ferreteria/FichaDePieza.tsx`
   * eso escondía el cuerpo entero de la ficha, incluido un `aria-label` con la
   * palabra de otro giro, y la puerta informaba «0 rótulos con la palabra de otro
   * giro» sobre un archivo que **no había leído**.
   *
   * Es el fallo de esta familia que más caro sale: la puerta no se quejó, dio verde,
   * y el verde afirmaba una propiedad de un texto que nunca miró. Y no era el único
   * sitio: el mismo patrón estaba en once, y en seis leyendo archivos con cámara.
   * El ayudante vive aparte porque la regla es una sola.
   */
  const sinProsa = sinFalsosDelimitadores(fuente)
    .replaceAll(/\{\/\*[\s\S]*?\*\/\}/g, enBlanco)
    .replaceAll(/\/\*[\s\S]*?\*\//g, enBlanco)
    /**
     * SANGRÍA HORIZONTAL, no cualquier espacio, y por eso la línea iba corrida.
     *
     * La clase `\s` incluye el salto de línea. Con ella, el ancla de principio de
     * línea prendía en una línea EN BLANCO, la sangría se comía el salto siguiente y
     * la marca de comentario casaba en la línea de ABAJO: se borraban las dos juntas,
     * la cuenta perdía una línea, y el mensaje mandaba a alguien una línea antes de
     * donde está la cosa —«:535» para un `aria-label` que vive en la 536—.
     *
     * `[^\S\n]` es espacio y tabulador, y nada más.
     */
    .replaceAll(/^[^\S\n]*\/\/.*$/gm, '')
    .replaceAll(/^[^\S\n]*\*.*$/gm, '');

  const encontrados = [];
  const anotar = (indice, texto, largoMaximo) => {
    const limpio = texto.replaceAll(/\s+/g, ' ').trim();
    if (limpio === '' || !/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(limpio)) return;
    if (limpio.length > largoMaximo) return;
    // Código, no texto: un `;`, una flecha, una llamada o una anotación de tipo no
    // son nada que se lea. Sin esto, la firma de una función que cae entre dos `>`
    // —`, venta: number, propina: number`— entraba como si fuera una frase.
    if (/[;]|=>|\w\(|:\s*(number|string|boolean|Date|bigint)\b/.test(limpio)) return;
    encontrados.push({ linea: sinProsa.slice(0, indice).split('\n').length, texto: limpio });
  };

  // 1 · LA SUPERFICIE DEL VOCABULARIO: encabezados, botones, rótulos, celdas de
  //     cabecera y enlaces. Es lo que la cabecera de `titulo` llama «el 60 % de lo
  //     que se ve en las pantallas», y donde el sustantivo del giro MANDA.
  const DE_ROTULO = /<(?:h1|h2|h3|h4|button|legend|label|dt|th|summary|a)\b[^>]*>([^<>{}]+)</g;
  for (const m of sinProsa.matchAll(DE_ROTULO)) anotar(m.index, m[1], 120);

  // 2 · Y los atributos que se leen: el nombre accesible es rótulo igual que el
  //     texto, y a menudo es el ÚNICO que hay.
  for (const m of sinProsa.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"]*)"/g)) {
    anotar(m.index, m[1], 120);
  }

  /**
   * 3 · Y el texto CORTO de un párrafo o un `span`, que es un estado vacío o un pie
   *     —«No hay platillos que se llamen así»— y por tanto rótulo también.
   *
   * ── Por qué CORTO y no todo ───────────────────────────────────────────
   * Porque estas pantallas explican lo que hacen en párrafos de tres o cuatro
   * líneas —«el vacío ENSEÑA»— y ahí la palabra no siempre es la entidad: «material
   * de cabina», «ventas + propinas» y «se cuenta por denominación» son frases del
   * oficio, no el nombre de una cosa del sistema. Traducirlas una por una hace la
   * copia peor y la puerta más tonta. El corte son 80 caracteres: un estado vacío
   * cabe, una explicación no.
   */
  const DE_FRASE_CORTA = /<(?:p|span|li|figcaption|caption)\b[^>]*>([^<>{}]+)</g;
  for (const m of sinProsa.matchAll(DE_FRASE_CORTA)) anotar(m.index, m[1], 80);

  return encontrados;
}

/**
 * LAS PANTALLAS QUE HABLAN DE OTRO GIRO (la tercera puerta del bloque 4).
 *
 * ── Por qué la de abajo no basta ──────────────────────────────────────────
 * `pantallasConSustantivoTecleado` caza la palabra que el diccionario de ESE giro
 * sí dice —«mesa» tecleada en una pantalla de restaurante— y por construcción no
 * puede cazar la contraria, que es la que de verdad se ve prestada: la pantalla de
 * un restaurante que rotula «Productos» donde su giro dice «Platillos», o la de una
 * ferretería que dice «La venta» donde su giro dice «la nota».
 *
 * Eran ocho sitios en tres pantallas —el catálogo del restaurante seis veces, la
 * mesa activa dos y el mostrador de la ferretería dos— y ninguna puerta los veía:
 * la palabra no está en el diccionario de su giro, así que para la comprobación de
 * abajo no existía.
 *
 * ── Lo que NO es la entidad, y por qué se declara ─────────────────────────
 * «Cuenta el cajón» es un verbo, «Cuenta del salón» es una cuenta de banco,
 * «ventas + propinas» es dinero y «Servicios» en una tiendita es el negocio de
 * recargas y pagos. Las cuatro son palabras del diccionario de otro giro usadas en
 * su sentido común, y traducirlas sería peor que dejarlas. Van declaradas, con su
 * razón, y la lista sólo puede encogerse.
 */
function pantallasQueHablanDeOtroGiro() {
  const raiz = join(RAIZ, 'apps', 'web', 'src');
  const encontradas = [];
  const letra = 'A-Za-z0-9áéíóúñÁÉÍÓÚÑ';

  for (const [carpeta, giro] of Object.entries(GIRO_DE_LA_CARPETA)) {
    const dir = join(raiz, carpeta);
    if (!existsSync(dir)) continue;
    const propio = DICCIONARIOS[giro] ?? {};

    // Las palabras que OTRO giro usa para una entidad cuyo término aquí es otro.
    const ajenas = new Map();
    for (const [otroGiro, dicc] of Object.entries(DICCIONARIOS)) {
      if (otroGiro === giro) continue;
      for (const [entidad, termino] of Object.entries(dicc)) {
        const suyo = propio[entidad];
        // La entidad APAGADA en este giro no se compara: un salón no tiene
        // preparación, así que «barra» ahí no es el término de nada.
        if (suyo === undefined) continue;
        for (const forma of [termino.singular, termino.plural]) {
          if (forma === suyo.singular || forma === suyo.plural) continue;
          if (!ajenas.has(forma.toLowerCase())) {
            ajenas.set(
              forma.toLowerCase(),
              `${otroGiro} llama así a «${entidad}»; aquí es «${suyo.singular}»`,
            );
          }
        }
      }
    }
    if (ajenas.size === 0) continue;
    const alternativa = [...ajenas.keys()]
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const buscador = new RegExp(`(?<![${letra}-])(${alternativa})(?![${letra}-])`, 'i');

    for (const entrada of readdirSyncSeguro(dir)) {
      if (!entrada.isFile() || !entrada.name.endsWith('.tsx')) continue;
      const clave = `${carpeta}/${entrada.name}`;
      const vetadasAqui = NO_ES_LA_ENTIDAD_AQUI[clave] ?? [];
      for (const { linea, texto } of textosVisibles(
        readFileSync(join(dir, entrada.name), 'utf8'),
      )) {
        const bajo = texto.toLowerCase();
        if (NO_ES_LA_ENTIDAD.some((v) => bajo.includes(v))) continue;
        const halla = buscador.exec(texto);
        if (halla === null) continue;
        if (vetadasAqui.includes(halla[1].toLowerCase())) continue;
        encontradas.push(
          `${clave}:${linea}  «${halla[1]}»  ${texto.slice(0, 50)}  · ${ajenas.get(halla[1].toLowerCase()) ?? ''}`,
        );
      }
    }
  }
  return encontradas;
}

/**
 * Las pantallas que tienen un sustantivo del diccionario tecleado a mano en
 * algo que el usuario LEE: texto de JSX, o un `aria-label` / `placeholder` /
 * `title` / `alt`.
 *
 * No mira identificadores, tipos, campos de la base, nombres de entidad del
 * puente ni comentarios: ahí la palabra es el nombre de una cosa del sistema y
 * traducirla lo rompería sin mover nada en la pantalla.
 */
function pantallasConSustantivoTecleado() {
  const raiz = join(RAIZ, 'apps', 'web', 'src');
  const encontradas = [];
  const letra = 'A-Za-z0-9áéíóúñÁÉÍÓÚÑ';

  for (const [carpeta, giro] of Object.entries(GIRO_DE_LA_CARPETA)) {
    const dir = join(raiz, carpeta);
    if (!existsSync(dir)) continue;
    const diccionario = DICCIONARIOS[giro] ?? {};
    const palabras = [];
    for (const termino of Object.values(diccionario)) {
      palabras.push(termino.plural, termino.singular);
    }
    if (palabras.length === 0) continue;
    const alternativa = palabras.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const buscador = new RegExp(`(?<![${letra}-])(${alternativa})(?![${letra}-])`, 'i');

    for (const entrada of readdirSyncSeguro(dir)) {
      if (!entrada.isFile() || !entrada.name.endsWith('.tsx')) continue;
      const clave = `${carpeta}/${entrada.name}`;
      const vetadasAqui = NO_ES_LA_ENTIDAD_AQUI[clave] ?? [];
      // El mismo extractor que la puerta de arriba: el texto de JSX se parte
      // donde cabe, y mirarlo línea a línea dejaba fuera el que empieza sin `>`
      // delante —que es la mitad, con el atributo largo en la línea anterior—.
      for (const { linea, texto } of textosVisibles(
        readFileSync(join(dir, entrada.name), 'utf8'),
      )) {
        const bajo = texto.toLowerCase();
        if (NO_ES_LA_ENTIDAD.some((v) => bajo.includes(v))) continue;
        const halla = buscador.exec(texto);
        if (halla === null) continue;
        if (vetadasAqui.includes(halla[1].toLowerCase())) continue;
        encontradas.push(`${clave}:${linea}  «${halla[1]}»  ${texto.slice(0, 60)}`);
      }
    }
  }
  return encontradas;
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

/**
 * La credencial que abre el muro de Vercel, si la hay.
 *
 * ── Por qué la puerta necesita esto ────────────────────────────────────────
 * El preview está detrás de la Protección de Despliegue, y desde fuera **un 401
 * del muro se ve igual que un 401 de la aplicación**. Sin credencial, esta
 * puerta sólo puede hablar con el servidor local — y entonces dice que el
 * acople está probado contra algo que no es lo que Vercel sirve.
 *
 * Hay dos formas de pasar, y se aceptan las dos porque no siempre están las dos
 * disponibles:
 *
 *   · `MORPHIQPOS_BYPASS_VERCEL` — el secreto del *Protection Bypass for
 *     Automation*. Es la vía buena: no caduca y no abre el preview al mundo.
 *     Se genera en el panel del proyecto, que es lo único que no se puede hacer
 *     desde aquí.
 *   · `MORPHIQPOS_COOKIE_VERCEL` — la cookie `_vercel_jwt` de un enlace
 *     compartido. Caduca en 23 horas y sirve para verificar hoy sin tocar la
 *     configuración de protección del proyecto, que es un cambio persistente de
 *     seguridad sobre un despliegue con datos de cuatro negocios.
 *
 * El VALOR no entra nunca al repositorio: viaja por el entorno y aquí sólo se
 * lee. Lo que sí se dice en la salida es CUÁL de las dos se usó, porque «probado
 * contra el despliegue» significa cosas distintas según cómo se entró.
 */
function credencialDelMuro() {
  const secreto = entorno('MORPHIQPOS_BYPASS_VERCEL');
  if (secreto !== undefined) {
    return {
      como: 'con el bypass de automatización',
      cabeceras: {
        'x-vercel-protection-bypass': secreto,
        'x-vercel-set-bypass-cookie': 'true',
      },
    };
  }

  const galleta = entorno('MORPHIQPOS_COOKIE_VERCEL');
  if (galleta !== undefined) {
    return { como: 'con la cookie de un enlace compartido', cabeceras: { cookie: galleta } };
  }

  return { como: 'sin credencial', cabeceras: {} };
}

const MURO = credencialDelMuro();

/**
 * ¿ESTA URL ES DE ESTA MÁQUINA? Lo dice el HOST, no la variable que la trajo.
 *
 * ── El rótulo que mentía ────────────────────────────────────────────────
 * Esto decidía «LOCAL» o «despliegue» por CUÁL VARIABLE se había puesto: con
 * `MORPHIQPOS_URL_DESPLIEGUE` era un despliegue y con `APP_URL` era local. Así que una
 * corrida con `APP_URL=https://morphiqpos-kappa.vercel.app` —que es exactamente cómo se
 * corrió la vuelta 2.3— imprimía «contra el servidor LOCAL (https://…vercel.app)»:
 * el rótulo y la URL de la misma línea se contradecían.
 *
 * Y no era sólo el rótulo. Por esa rama tampoco se comprobaba el MURO, que es lo único
 * que distingue «el despliegue contestó» de «la Protección de Despliegue contestó por
 * él». Una puerta que dice contra qué midió tiene que saberlo de verdad.
 */
function esDeEstaMaquina(base) {
  try {
    const anfitrion = new URL(base).hostname.toLowerCase();
    return anfitrion === 'localhost' || anfitrion === '127.0.0.1' || anfitrion === '::1';
  } catch {
    return false;
  }
}

/** ¿Esto lo contestó el muro de Vercel y no la aplicación? */
function huelloDelMuro(respuesta) {
  if (respuesta.status === 401) return 'un 401 del muro';
  const aDonde = respuesta.headers.get('location') ?? '';
  if (aDonde.includes('vercel.com/sso-api')) return 'un 302 a vercel.com/sso-api';
  return null;
}

async function comprobarDespliegue() {
  const despliegue = entorno('MORPHIQPOS_URL_DESPLIEGUE');
  const local = entorno('APP_URL');

  const base = despliegue ?? local;
  if (base === undefined) {
    fallos.push('DESPLIEGUE: ni MORPHIQPOS_URL_DESPLIEGUE ni APP_URL están definidas.');
    return undefined;
  }

  const enEstaMaquina = esDeEstaMaquina(base);

  if (enEstaMaquina) {
    // La salida escrita en §8.1: sin token de Vercel, la comprobación se hace
    // contra el servidor local, se DICE, y no bloquea el 0. Sin esta salida el
    // encargo sería imposible de cerrar y a la vez estaría prohibido detenerse.
    if (!existsSync(ENTORNO_VERCEL)) {
      fallos.push(
        'DESPLIEGUE: no hay URL de despliegue y tampoco docs/fase-2/VERCEL-ENTORNO.md ' +
          'que declare por qué. Una de las dos cosas tiene que existir.',
      );
    }
  }

  let respuesta;
  try {
    respuesta = await fetch(base, { redirect: 'manual', headers: MURO.cabeceras });
  } catch (error) {
    fallos.push(`DESPLIEGUE: ${base} no respondió · ${error.message}`);
    return undefined;
  }

  const ok = respuesta.status === 200 || (respuesta.status >= 300 && respuesta.status < 400);
  exigir(ok, `DESPLIEGUE: ${base} devolvió ${respuesta.status}`);

  // EL MURO, en cualquier URL que no sea de esta máquina. Da igual qué variable la
  // trajo: si lo que contesta es la Protección de Despliegue, todo lo que esta puerta
  // mida después es del muro y no de la aplicación, y decir «rutas vivas» sería falso.
  const muro = enEstaMaquina ? null : huelloDelMuro(respuesta);
  if (muro !== null) {
    fallos.push(
      `DESPLIEGUE: ${base} contestó ${muro}, que es la Protección de Despliegue de Vercel y ` +
        'no la aplicación. Lo que se mida a partir de aquí es del muro. Pasa una credencial ' +
        '—MORPHIQPOS_BYPASS_VERCEL o MORPHIQPOS_COOKIE_VERCEL— o apunta a una URL sin muro; ' +
        'ver docs/fase-2/VERCEL-ENTORNO.md §2.',
    );
  }

  if (ok) {
    notas.push(
      enEstaMaquina
        ? `despliegue    contra el servidor de ESTA MÁQUINA (${base}) → ${respuesta.status} · ver docs/fase-2/VERCEL-ENTORNO.md`
        : `despliegue    REMOTO ${base} → ${respuesta.status} · ${MURO.como} · ` +
            (muro === null ? 'sin muro por delante' : `DETRÁS DEL MURO (${muro})`),
    );
  }
  return base;
}

// ───────────────────────────────────────────────────────────────────────────
// 8 · QUE LAS PRUEBAS DE NAVEGADOR COBREN UNA VENTA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Las cinco suites de modelo, y lo que tiene que haber DENTRO de cada una.
 *
 * ── Por qué esta comprobación existe ──────────────────────────────────────
 * Porque una suite que abre las once pantallas de una tienda y comprueba que el
 * menú dice «Productos» **pasa con el cobro roto**, y lo pasó: la pantalla de
 * cobro del mostrador publicaba en una ruta que no existía, y la suite daba el
 * modelo por bueno porque la pantalla respondía 200 y enseñaba uno de sus tres
 * estados. Lo que demuestra que un POS funciona es que entre dinero y que cuadre.
 *
 * Se afirma sobre el USO y no sobre una palabra suelta: cada suite tiene que
 * llamar a `exigirVentaCobrada`, que es el ayudante que compara el total de la
 * pantalla con la venta que quedó en el servidor, al centavo y con folio. Buscar
 * «cobrar» o «total» daría verde con un comentario.
 */
const SUITES_DE_MODELO = [
  'abarrotes.spec.ts',
  'cafeteria.spec.ts',
  'restaurante.spec.ts',
  'estetica-salon.spec.ts',
  'ferreteria.spec.ts',
];

/**
 * Las que NO cobran todavía, con su motivo y su sonda.
 *
 * Un hueco declarado es honesto; un hueco en silencio, no. Y no basta con
 * declararlo: la suite tiene que llevar una SONDA que falle el día que el
 * impedimento desaparezca, para que nadie deje el hueco documentado para siempre.
 */
const SIN_COBRO_TODAVIA = {
  // VACÍA desde el 19-09-2026, y que siga así. La última era `ferreteria`, por
  // tres cosas que ya están hechas: `MaterialMostrador` y `NotaDeCaja` en el
  // puente (migraciones 168-170), `ferreteria.crear_nota_mostrador` para la nota
  // y el cuerpo correcto en el cobro. Las cinco suites cobran.
};

/**
 * UNA AFIRMACIÓN DE CONTENIDO POR PANTALLA (la segunda puerta del bloque 3).
 *
 * ── Por qué esta puerta existe ────────────────────────────────────────────
 * El criterio de la suite era «ni 404 ni 500», y con ése **una pantalla que abre en
 * 200 y pinta su estado de error se ve igual que una que funciona**. No es una
 * hipótesis: por ese hueco pasaron cuatro pantallas cuya entidad del puente NO
 * EXISTÍA —la ficha de pieza, las existencias de material, la cartera por obra y las
 * opciones de la bebida—, nueve que se quedaban en su esqueleto porque `page.tsx`
 * las montaba con un id vacío, y cuatro que filtraban por un campo que el puente
 * rechaza y salían VACÍAS. Las diecisiete estaban «probadas».
 *
 * Así que ahora cada pantalla de cada modelo tiene que abrirse en su suite CON UNA
 * MARCA: un texto que sólo se pinta cuando la pantalla llegó a montar lo suyo. No es
 * el dato —una zona sin productos es legítima— es el título, la etiqueta de su
 * región, o la frase de su estado vacío, que también es contenido de esa pantalla y
 * de ninguna otra.
 *
 * ── Qué se afirma, y por qué así ──────────────────────────────────────────
 * Las pantallas salen de `pantallasEsperadas`, que las lee del §4.3 del
 * `04-INTERFAZ.md` de cada modelo: la misma lista con la que se mide si cuelgan de
 * un menú. Así la puerta no se puede aprobar quitando una pantalla de una tabla de
 * la prueba.
 *
 * Y la marca tiene que ser una EXPRESIÓN REGULAR o el `aria-label` de una región.
 * Una cadena suelta no: `toBeVisible` sobre `getByText('')` encaja con cualquier
 * cosa, y entonces la puerta diría que la pantalla enseña lo suyo sin mirar nada.
 */
function comprobarMarcasDeContenido() {
  const carpeta = join(RAIZ, 'pruebas', 'e2e');
  const sinAbrir = [];
  const sinMarca = [];
  let conMarca = 0;

  for (const modelo of MODELOS) {
    const ruta = join(carpeta, `${modelo.clave}.spec.ts`);
    if (!existsSync(ruta)) {
      fallos.push(`MARCAS: falta la suite ${modelo.clave}.spec.ts`);
      continue;
    }
    // Sin comentarios: una tabla dentro de un comentario no abre nada. Es el
    // mismo recorte que el del cobro, y por la misma razón.
    const codigo = sinFalsosDelimitadores(readFileSync(ruta, 'utf8'))
      .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
      .replaceAll(/^\s*\/\/.*$/gm, ' ');

    for (const slug of pantallasEsperadas(modelo)) {
      // Las dos formas válidas: la fila de la tabla de pantallas —`['slug', marca]`—
      // y la llamada suelta de un recorrido —`abrirPantalla(page, '/modelo/slug', marca)`.
      const enTabla = new RegExp(`\\[\\s*'${slug}'\\s*,([^\\]]*)\\]`).exec(codigo);
      const suelta = new RegExp(
        `abrirPantalla\\(\\s*page\\s*,\\s*['\`]/${modelo.clave}/${slug}['\`]\\s*,([^)]*)\\)`,
      ).exec(codigo);
      const marca = (enTabla?.[1] ?? suelta?.[1] ?? '').trim();

      if (enTabla === null && suelta === null) {
        sinAbrir.push(`${modelo.clave}/${slug}`);
        continue;
      }
      // Una expresión regular, o `{ etiqueta: '…' }` para las tres pantallas cuyo
      // título vive en el `aria-label` de su región y no en un encabezado.
      const esRegex = /^\/.+\/[a-z]*$/.test(marca);
      const esEtiqueta = /etiqueta\s*:\s*['`][^'`]+['`]/.test(marca);
      if (!esRegex && !esEtiqueta) {
        sinMarca.push(`${modelo.clave}/${slug} → «${marca.slice(0, 40)}»`);
        continue;
      }
      conMarca += 1;
    }
  }

  exigir(
    sinAbrir.length === 0,
    `MARCAS: ${sinAbrir.length} pantalla(s) de modelo NO se abren en su suite · ` +
      `${sinAbrir.slice(0, 8).join(' · ')}` +
      (sinAbrir.length > 8 ? ` …y ${sinAbrir.length - 8} más` : '') +
      '\n    Una pantalla que ninguna prueba abre no está probada, aunque exista.',
  );

  exigir(
    sinMarca.length === 0,
    `MARCAS: ${sinMarca.length} pantalla(s) se abren SIN afirmar contenido · ` +
      `${sinMarca.slice(0, 8).join(' · ')}\n    ` +
      'La marca tiene que ser una expresión regular o el `aria-label` de su región: abrir en 200 ' +
      'y pintar el estado de error se ve igual que funcionar.',
  );

  if (!fallos.some((f) => f.startsWith('MARCAS'))) {
    notas.push(
      `marcas e2e    ${conMarca} pantalla(s) de modelo se abren con una afirmación de CONTENIDO`,
    );
  }
}

function comprobarQueLasPruebasCobran() {
  const carpeta = join(RAIZ, 'pruebas', 'e2e');
  for (const archivo of SUITES_DE_MODELO) {
    const ruta = join(carpeta, archivo);
    if (!existsSync(ruta)) {
      fallos.push(`COBRO-E2E: falta la suite ${archivo}`);
      continue;
    }
    // Sin comentarios: una llamada dentro de un comentario no cobra nada.
    const codigo = sinFalsosDelimitadores(readFileSync(ruta, 'utf8'))
      .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
      .replaceAll(/^\s*\/\/.*$/gm, ' ');

    const cobra = /exigirVentaCobrada\s*\(/.test(codigo);
    const excepcion = SIN_COBRO_TODAVIA[archivo];

    if (excepcion === undefined) {
      exigir(
        cobra,
        `COBRO-E2E: ${archivo} no comprueba NINGÚN total cobrado. Tiene que llamar a ` +
          '`exigirVentaCobrada`, que compara el total de la pantalla con la venta que quedó en el ' +
          'servidor. Abrir pantallas no demuestra que el POS cobre.',
      );
      continue;
    }

    // Declarada: entonces NO puede cobrar (si ya cobra, la excepción sobra) y
    // tiene que llevar su sonda.
    exigir(
      !cobra,
      `COBRO-E2E: ${archivo} está declarada en SIN_COBRO_TODAVIA y SÍ cobra. Quita la ` +
        'excepción: una lista de huecos que incluye lo que ya funciona deja de leerse.',
    );
    exigir(
      codigo.includes(excepcion.sonda),
      `COBRO-E2E: ${archivo} no cobra y tampoco lleva su sonda (${excepcion.sonda}). El hueco ` +
        `declarado es: ${excepcion.motivo}. La sonda es lo que hace que alguien vuelva el día ` +
        'que el impedimento se arregle.',
    );
  }

  /**
   * Y LA LISTA DE HUECOS TIENE QUE QUEDAR VACÍA (la tercera puerta del bloque 3).
   *
   * Lo de arriba exige que cada suite cobre O declare su hueco con una sonda, y eso
   * dejaba una salida: declarar el hueco. Con las cinco cobrando, la salida ya no
   * hace falta, y una puerta que se puede abrir por dentro no es una puerta. Es la
   * misma regla que la de las rutas inexistentes: la lista sólo puede encogerse, y
   * está vacía.
   *
   * Añadir una fila aquí ya no es «documentar un hueco»: es dejar en rojo la puerta,
   * que es exactamente lo que tiene que pasar el día que un modelo deje de cobrar.
   */
  const declarados = Object.keys(SIN_COBRO_TODAVIA);
  exigir(
    declarados.length === 0,
    `COBRO-E2E: ${declarados.length} suite(s) siguen declaradas SIN COBRAR · ` +
      `${declarados.join(', ')}. Las cinco demos cobran desde el 19-09-2026: la lista tiene que ` +
      'quedar VACÍA. Un modelo que no cobra no está acoplado, aunque abra sus pantallas.',
  );

  if (!fallos.some((f) => f.startsWith('COBRO-E2E'))) {
    const cobran = SUITES_DE_MODELO.length - Object.keys(SIN_COBRO_TODAVIA).length;
    notas.push(
      `cobro e2e     ${cobran} de ${SUITES_DE_MODELO.length} suites comprueban un TOTAL COBRADO ` +
        `contra el servidor · ${Object.keys(SIN_COBRO_TODAVIA).length} declarada(s) con sonda`,
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 9 · QUE EL CI ESTÉ VERDE EN GITHUB
// ───────────────────────────────────────────────────────────────────────────

/**
 * Los checks del PR, leídos por la API de GitHub.
 *
 * ── Por qué esto es una puerta y no una pestaña del navegador ──────────────
 * Porque un reporte anterior declaró el acople terminado sin mencionar el CI una
 * sola vez, con tres de los cuatro checks en rojo y el merge bloqueado. «Que corra
 * en mi máquina» no es que esté verde: el CI clona en limpio, y esa diferencia fue
 * exactamente la que escondió cuatro defectos —un contrato que exigía archivos que
 * el propio contrato prohíbe versionar, dos vulnerabilidades altas, un `export`
 * que sólo el build ve, y una prueba que leía un archivo que no se versiona—.
 *
 * Se lee el ÚLTIMO COMMIT DE ESTA RAMA, no «algún run verde»: lo que importa es si
 * lo que hay escrito ahora pasa. Sin credenciales no se inventa un veredicto: se
 * dice que no se pudo leer y se falla, porque un «no lo sé» que pasa por verde es
 * lo que produjo el reporte anterior.
 */
async function comprobarCiEnGitHub() {
  const sha = ejecutarGit(['rev-parse', 'HEAD']);
  const rama = ejecutarGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (sha === null) {
    fallos.push('CI: no se pudo leer el commit actual con git.');
    return;
  }

  const respuesta = ejecutarGh([
    'api',
    `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=50`,
  ]);
  if (respuesta === null) {
    fallos.push(
      'CI: no se pudo preguntar a GitHub por los checks de ' +
        `${sha.slice(0, 7)} (${rama ?? 'sin rama'}). Hace falta \`gh\` autenticado: ` +
        '`gh auth login`. No se da por verde lo que no se pudo leer.',
    );
    return;
  }

  let datos;
  try {
    datos = JSON.parse(respuesta);
  } catch {
    fallos.push('CI: GitHub contestó algo que no es JSON.');
    return;
  }

  const corridas = Array.isArray(datos.check_runs) ? datos.check_runs : [];
  if (corridas.length === 0) {
    fallos.push(
      `CI: GitHub no tiene NINGÚN check para ${sha.slice(0, 7)}. O no se ha empujado, o el ` +
        'workflow no se disparó: en los dos casos, nadie ha comprobado este código en limpio.',
    );
    return;
  }

  /**
   * UNA CORRIDA POR NOMBRE, LA ÚLTIMA. Lo demás son fantasmas.
   *
   * ── Por qué ───────────────────────────────────────────────
   * El workflow tiene `concurrency` con cancelación: cuando el mismo commit se
   * vuelve a disparar —reabrir un PR, un segundo empujón— GitHub **cancela** las
   * corridas anteriores y deja las nuevas. Contando todas, esta puerta veía cuatro
   * `cancelled` junto a cuatro `success` y declaraba ROJO un commit cuyos checks
   * están verdes: un falso rojo, que enseña a ignorar la puerta.
   *
   * Lo que hace una persona al leer los checks es mirar el ÚLTIMO de cada nombre. Eso
   * es lo que se compara aquí. Un `cancelled` que NO fue superado por otro del mismo
   * nombre sigue contando en rojo, que es lo correcto: nadie comprobó nada.
   */
  const cuando = (c) => Date.parse(c.completed_at ?? c.started_at ?? '') || 0;
  const ultimaPorNombre = new Map();
  for (const corrida of corridas) {
    const previa = ultimaPorNombre.get(corrida.name);
    if (previa === undefined || cuando(corrida) >= cuando(previa)) {
      ultimaPorNombre.set(corrida.name, corrida);
    }
  }
  const ultimas = [...ultimaPorNombre.values()];

  const pendientes = ultimas.filter((c) => c.status !== 'completed');
  const rojos = ultimas.filter((c) => c.status === 'completed' && c.conclusion !== 'success');

  exigir(
    pendientes.length === 0,
    `CI: ${pendientes.length} check(s) todavía corriendo en ${sha.slice(0, 7)} · ` +
      `${pendientes.map((c) => c.name).join(', ')}. Verde es verde cuando termina.`,
  );
  exigir(
    rojos.length === 0,
    `CI: ${rojos.length} check(s) en ROJO en ${sha.slice(0, 7)} · ` +
      `${rojos.map((c) => `${c.name} (${c.conclusion})`).join(', ')}. ` +
      'Míralos con `gh run view --log-failed`.',
  );

  if (!fallos.some((f) => f.startsWith('CI'))) {
    notas.push(
      `ci            ${ultimas.length} check(s) VERDES en ${sha.slice(0, 7)} · ` +
        ultimas.map((c) => c.name).join(' · ') +
        (corridas.length > ultimas.length
          ? ` (${corridas.length - ultimas.length} corrida(s) anterior(es) del mismo commit, superadas)`
          : ''),
    );
  }
}

function ejecutarGit(argumentos) {
  const salida = spawnSync('git', argumentos, { cwd: RAIZ, encoding: 'utf8' });
  if (salida.status !== 0) return null;
  return (salida.stdout ?? '').trim();
}

function ejecutarGh(argumentos) {
  /**
   * `gh` y `gh.exe`, en ese orden, y SIN shell.
   *
   * En Windows el binario es `gh.exe` —no un `.cmd`, que es lo que uno supone— y
   * `spawnSync('gh')` sin shell no lo resuelve. Con `shell: true` sí, pero
   * entonces Node avisa (DEP0190) de que los argumentos van concatenados sin
   * escapar, y aquí uno de ellos lleva un `{owner}/{repo}` con llaves. Se prueban
   * los dos nombres y se deja el shell fuera.
   */
  for (const binario of ['gh', 'gh.exe']) {
    const salida = spawnSync(binario, argumentos, { cwd: RAIZ, encoding: 'utf8' });
    if (salida.error !== undefined) continue;
    if (salida.status !== 0) return null;
    return salida.stdout ?? '';
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// 10 · QUE EXISTA LA RUTA QUE LA PANTALLA LLAMA
// ───────────────────────────────────────────────────────────────────────────

/**
 * Las rutas que el frontend publica y que NO existen, declaradas una por una.
 *
 * ── Por qué esta comprobación tenía que existir ───────────────────────────
 * `comprobarRutas` va en un sentido: coge la lista de rutas DECLARADAS en los
 * documentos y comprueba que respondan. Nadie miraba el sentido contrario —qué
 * rutas LLAMAN las pantallas— y por ahí se colaron diecinueve botones que
 * publican en direcciones que no existen. El síntoma es siempre el mismo y no
 * dice nada: Next devuelve su página de error, que no es `{ok, datos}`, el
 * cliente lo traduce a «El servidor respondió algo inesperado» y la pantalla se
 * queda como estaba.
 *
 * Tres de ellas costaron una tarde de esta sesión: `/api/venta/cobrar-mostrador`
 * —una tienda no podía cobrar—, `/api/cafeteria/contar-bote` —una cafetería no
 * podía cerrar el turno— y `/api/ferreteria/cortar` —una ferretería no podía
 * cortar material—. Las dos primeras están arregladas; el resto está aquí, con
 * lo que le falta a cada una.
 *
 * ── Cómo se usa esta lista ────────────────────────────────────────────────
 * La puerta falla si aparece una llamada NUEVA que no esté declarada, y también
 * si una declarada ya existe —entonces la fila sobra y se borra—. Así la lista
 * sólo puede encogerse.
 */
const RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN = {};

/**
 * LO QUE UNA PANTALLA LLAMA, incluidas las rutas que ARMA con una plantilla.
 *
 * ── Los dos agujeros que esta puerta tenía, y que la hacían mentir ────────
 * Decía «119 rutas · 0 inexistentes» y era falso por dos cosas suyas:
 *
 *   A · El extractor sólo reconocía cadenas que son una ruta ENTERA. Una ruta
 *       armada con plantilla —`` `/api/cotizaciones/${verbo}` ``— no encajaba en
 *       el patrón, así que para la puerta no existía. Tres botones de la
 *       cotización publican ahí y los tres dan 404 desde el primer día.
 *   B · Un segmento dinámico valía para CUALQUIER llamada de esa carpeta: si
 *       existe `clientes/[id]/route.ts`, entonces `/api/clientes/empezar-historial`
 *       «existía». No existe: Next la resuelve a `[id]` con
 *       `clienteId = "empezar-historial"`, y eso es un 400 o un 500, no un botón
 *       que funciona.
 *
 * ── Cómo se resuelve ahora ────────────────────────────────────────────────
 * Cada llamada se guarda como SEGMENTOS, y se anota cuáles vienen de una
 * interpolación. Después se recorre el árbol de `app/api/` paso a paso:
 *
 *   · un segmento LITERAL tiene que existir como carpeta. Si no está, la ruta no
 *     existe — aunque la carpeta padre tenga un `[id]`, porque `[id]` sirve
 *     identificadores, no verbos;
 *   · un segmento INTERPOLADO vale contra un `[x]`, que es exactamente para lo
 *     que está;
 *   · y cuando los valores posibles de la interpolación SE PUEDEN LEER del
 *     código —un `const`, una unión de tipos, o los argumentos con los que se
 *     llama a la función que la recibe— se comprueba cada valor por separado.
 *     Así `/api/cotizaciones/${verbo}` se comprueba como `/mandar` y
 *     `/seguimiento`, que es lo que de verdad se pide.
 *
 * Lo que NO se puede resolver se dice: una plantilla cuyo valor no se lee y cuya
 * carpeta no tiene segmento dinámico se reporta, en vez de aprobarse en silencio.
 */

/** Hasta cuántas combinaciones se expanden. Más que esto es una plantilla mal leída. */
const COMBINACIONES_MAXIMAS = 24;

/** El identificador solo: `verbo`. Cualquier expresión más rica no se intenta leer. */
const SOLO_UN_NOMBRE = /^[A-Za-z_$][\w$]*$/;

/** Los literales de cadena de un trozo de código. */
function literalesDe(trozo) {
  const valores = [];
  for (const m of trozo.matchAll(/'([^'\\\n]{1,60})'|"([^"\\\n]{1,60})"/g)) {
    const valor = m[1] ?? m[2] ?? '';
    if (/^[a-z0-9][a-z0-9-]*$/i.test(valor)) valores.push(valor);
  }
  return valores;
}

/**
 * La función que envuelve a una posición, con su lista de parámetros.
 *
 * Se busca hacia atrás la declaración más cercana. No es un analizador
 * sintáctico y no pretende serlo: si no encuentra una forma que reconozca,
 * devuelve `null` y la interpolación se trata como no resuelta, que es el lado
 * seguro.
 */
function funcionQueEnvuelve(texto, posicion) {
  const antes = texto.slice(0, posicion);
  const formas = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::[^=]*)?=>/g,
  ];
  let mejor = null;
  for (const forma of formas) {
    for (const m of antes.matchAll(forma)) {
      if (mejor === null || m.index > mejor.indice) {
        mejor = { indice: m.index, nombre: m[1], parametros: m[2] };
      }
    }
  }
  return mejor;
}

/** El índice del parámetro que se llama así, o -1. */
function indiceDelParametro(parametros, nombre) {
  const partes = parametros.split(',');
  for (let i = 0; i < partes.length; i += 1) {
    const limpio = (partes[i] ?? '').trim();
    if (new RegExp(`^${nombre}\\b`).test(limpio)) return i;
  }
  return -1;
}

/** El argumento n-ésimo de cada llamada a esa función, cuando es un literal. */
function argumentosEnLasLlamadas(texto, nombre, indice) {
  const valores = [];
  for (const m of texto.matchAll(new RegExp(`\\b${nombre}\\s*\\(([^)]{0,200})`, 'g'))) {
    const crudos = (m[1] ?? '').split(',');
    const trozo = crudos[indice];
    if (trozo === undefined) continue;
    valores.push(...literalesDe(trozo));
  }
  return valores;
}

/**
 * Los valores posibles de una interpolación, o `null` si no se pueden leer.
 *
 * Tres formas, y en este orden: la asignación con `const`, la unión de tipos, y
 * los argumentos con los que se llama a la función que recibe ese parámetro. La
 * tercera es la que resuelve el caso real —`escribir('mandar', …)`— y ninguna de
 * las dos primeras lo habría visto.
 */
function valoresPosibles(expresion, texto, posicion) {
  const nombre = expresion.trim();
  if (!SOLO_UN_NOMBRE.test(nombre)) return null;

  const valores = new Set();

  for (const m of texto.matchAll(
    new RegExp(`\\b(?:const|let)\\s+${nombre}\\s*=([^;\\n]{1,200})`, 'g'),
  )) {
    for (const valor of literalesDe(m[1] ?? '')) valores.add(valor);
  }
  for (const m of texto.matchAll(
    new RegExp(`\\b${nombre}\\s*:\\s*((?:'[^']+'\\s*\\|\\s*)+'[^']+')`, 'g'),
  )) {
    for (const valor of literalesDe(m[1] ?? '')) valores.add(valor);
  }
  if (valores.size === 0) {
    const envoltorio = funcionQueEnvuelve(texto, posicion);
    if (envoltorio !== null) {
      const indice = indiceDelParametro(envoltorio.parametros, nombre);
      if (indice >= 0) {
        for (const valor of argumentosEnLasLlamadas(texto, envoltorio.nombre, indice)) {
          valores.add(valor);
        }
      }
    }
  }

  return valores.size === 0 ? null : [...valores];
}

/**
 * Las llamadas de un archivo: literales y plantillas, ya expandidas.
 *
 * Cada una sale con sus SEGMENTOS y con el conjunto de posiciones que vienen de
 * una interpolación sin resolver. Esa distinción es la que arregla el agujero B.
 */
function llamadasDelTexto(texto) {
  const llamadas = [];

  for (const m of texto.matchAll(/['"](\/api\/[a-zA-Z0-9/_-]+)['"]/g)) {
    const url = m[1] ?? '';
    llamadas.push({ url, partes: url.replace('/api/', '').split('/'), dinamicos: new Set() });
  }

  for (const m of texto.matchAll(/`(\/api\/[^`]*)`/g)) {
    const plantilla = m[1] ?? '';
    if (!plantilla.includes('${')) {
      llamadas.push({
        url: plantilla,
        partes: plantilla.replace('/api/', '').split('/'),
        dinamicos: new Set(),
      });
      continue;
    }
    // La query no es parte del camino: `/api/x?y=${z}` es la ruta `/api/x`.
    const sinQuery = (plantilla.split('?')[0] ?? '').replace('/api/', '');
    const segmentos = sinQuery
      .split('/')
      .filter((s, i, todos) => s !== '' || i === todos.length - 1);

    let variantes = [{ partes: [], dinamicos: new Set() }];
    for (const segmento of segmentos) {
      const interpolacion = /^\$\{([^}]*)\}$/.exec(segmento);
      if (interpolacion === null && !segmento.includes('${')) {
        for (const variante of variantes) variante.partes.push(segmento);
        continue;
      }
      const expresion = interpolacion === null ? '' : (interpolacion[1] ?? '');
      const valores = interpolacion === null ? null : valoresPosibles(expresion, texto, m.index);
      if (valores === null) {
        for (const variante of variantes) {
          variante.dinamicos.add(variante.partes.length);
          variante.partes.push('*');
        }
        continue;
      }
      const nuevas = [];
      for (const variante of variantes) {
        for (const valor of valores) {
          nuevas.push({
            partes: [...variante.partes, valor],
            dinamicos: new Set(variante.dinamicos),
          });
        }
      }
      variantes = nuevas.slice(0, COMBINACIONES_MAXIMAS);
    }

    for (const variante of variantes) {
      if (variante.partes.length === 0) continue;
      llamadas.push({
        url: `/api/${variante.partes.join('/')}`,
        partes: variante.partes,
        dinamicos: variante.dinamicos,
      });
    }
  }

  return llamadas;
}

function comprobarQueLasRutasQueSeLlamanExisten() {
  const carpetas = [join(RAIZ, 'apps', 'web', 'src'), join(RAIZ, 'apps', 'web', 'heredado')];
  const llamadas = new Map();

  const recorrer = (carpeta) => {
    for (const entrada of readdirSyncSeguro(carpeta)) {
      const ruta = join(carpeta, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(ruta);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx)$/.test(entrada.name) || entrada.name.includes('.test.')) continue;
      // SIN COMENTARIOS: una ruta nombrada en un comentario no la llama nadie, y
      // contarla hacía que esta puerta pidiera declarar la ruta que el comentario
      // de al lado explica que ya no se usa.
      const texto = sinFalsosDelimitadores(readFileSync(ruta, 'utf8'))
        .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
        .replaceAll(/^\s*\/\/.*$/gm, ' ');
      for (const llamada of llamadasDelTexto(texto)) {
        if (llamadas.has(llamada.url)) continue;
        llamadas.set(llamada.url, {
          ...llamada,
          donde: ruta.replace(RAIZ, '').replaceAll(sep, '/'),
        });
      }
    }
  };
  for (const carpeta of carpetas) recorrer(carpeta);

  /**
   * SEGMENTO A SEGMENTO, y un `[x]` sólo vale donde la llamada pone un valor.
   *
   * Aquí estaba el agujero B: bastaba con que la carpeta padre tuviera CUALQUIER
   * `[algo]/route.ts` para dar la ruta por existente, y con eso
   * `/api/clientes/empezar-historial` «existía» porque existe `clientes/[id]`. No
   * existe: Next la resuelve a `[id]` con `clienteId = "empezar-historial"`, que es
   * un uuid inventado. Un segmento dinámico sirve IDENTIFICADORES —lo que la
   * llamada interpola— y no verbos escritos a mano.
   */
  const existe = (partes, dinamicos) => {
    let carpeta = join(RAIZ, 'apps', 'web', 'app', 'api');
    for (const [i, parte] of partes.entries()) {
      const exacta = join(carpeta, parte);
      if (parte !== '*' && existsSync(exacta)) {
        carpeta = exacta;
        continue;
      }
      // Sólo lo interpolado puede caer en un segmento dinámico.
      if (!dinamicos.has(i)) return false;
      const dinamica = readdirSyncSeguro(carpeta).find(
        (e) => e.isDirectory() && e.name.startsWith('['),
      );
      if (dinamica === undefined) return false;
      carpeta = join(carpeta, dinamica.name);
    }
    return existsSync(join(carpeta, 'route.ts'));
  };

  const nuevas = [];
  for (const [url, llamada] of llamadas) {
    if (existe(llamada.partes, llamada.dinamicos)) continue;
    if (RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN[url] !== undefined) continue;
    nuevas.push(`${url} (${llamada.donde})`);
  }
  exigir(
    nuevas.length === 0,
    `RUTAS-LLAMADAS: ${nuevas.length} pantalla(s) publican en una ruta que NO existe y no está ` +
      `declarada · ${nuevas.join(' · ')}. El botón devuelve la página de error de Next, el ` +
      'cliente la traduce a «El servidor respondió algo inesperado» y no se hace nada. O se crea ' +
      'la ruta, o se declara en RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN con lo que le falta.',
  );

  /**
   * LA PUERTA DE LA FASE 2.3 · la lista tiene que estar VACÍA.
   *
   * Las dos comprobaciones de arriba dejaban la lista encoger, y con eso se pasó de
   * diecinueve a cero. Lo que faltaba es la que impide que vuelva a crecer: una
   * ruta que una pantalla publica y que no existe es un botón que no hace nada, y
   * declararla en una lista no es haberla hecho. Desde aquí, un botón nuevo llega
   * con su ruta o no llega.
   */
  const declaradas = Object.keys(RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN);
  exigir(
    declaradas.length === 0,
    `RUTAS-LLAMADAS: ${declaradas.length} ruta(s) siguen declaradas como inexistentes · ` +
      `${declaradas.join(', ')}. La lista tiene que quedar VACÍA: un botón que publica en una ` +
      'dirección que no existe no hace nada, y declararlo no es haberlo hecho.',
  );

  const yaExisten = Object.keys(RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN).filter((url) => {
    const llamada = llamadas.get(url);
    return llamada !== undefined && existe(llamada.partes, llamada.dinamicos);
  });
  exigir(
    yaExisten.length === 0,
    `RUTAS-LLAMADAS: ${yaExisten.join(', ')} ya existe(n) y sigue(n) declarada(s) como ` +
      'pendiente(s). Borra la fila: una lista de huecos que incluye lo que ya funciona deja de ' +
      'leerse.',
  );

  if (!fallos.some((f) => f.startsWith('RUTAS-LLAMADAS'))) {
    const cuantas = Object.keys(RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN).length;
    notas.push(
      `rutas llamadas ${llamadas.size} rutas distintas se llaman desde las pantallas · ` +
        `${cuantas} declarada(s) como todavía inexistente(s)`,
    );
  }
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
await comprobarNavegacion();
comprobarVocabulario();
comprobarMarcasDeContenido();
comprobarQueLasPruebasCobran();
comprobarQueLasRutasQueSeLlamanExisten();
await comprobarCiEnGitHub();

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
console.log('  plantillas resueltas, pantallas alcanzables desde el menú, vocabulario');
console.log('  consumido, aplicación respondiendo, pruebas que COBRAN y CI verde.');
process.exit(0);
