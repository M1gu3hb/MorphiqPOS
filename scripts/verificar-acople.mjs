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
 * Las 61 pantallas de los cinco modelos estaban construidas, etiquetadas,
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

  // Y cada una de las 61 pantallas de los modelos tiene que estar en el menú de
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
        'el envoltorio de las 61 pantallas no lo inyecta. Sin eso «mesa» no se ' +
        'vuelve «estación» en ninguna de las 61.',
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

  // Y las PANTALLAS. Hasta el 17-09-2026 esta comprobación pedía «al menos
  // dos», y con dos pasaba: 3 de 65 componentes lo leían y las otras 62 tenían
  // el sustantivo del giro tecleado a mano. Un número mínimo no mide nada — lo
  // que hay que exigir es que NINGUNA pantalla escriba a mano una palabra que
  // el diccionario de su giro ya sabe decir.
  const pantallas = consumidores
    .map((ruta) => ruta.split(sep).join('/'))
    .filter((ruta) => /\/src\/.+\.tsx$/.test(ruta));

  const conLiteral = pantallasConSustantivoTecleado();
  exigir(
    conLiteral.length === 0,
    `VOCABULARIO: ${conLiteral.length} pantalla(s) escriben a mano una palabra que el ` +
      'diccionario de su giro ya dice. El día que la dueña llame «cabina» a su estación, ' +
      'esas líneas seguirán diciendo «mesa»:\n    ' +
      conLiteral.slice(0, 12).join('\n    ') +
      (conLiteral.length > 12 ? `\n    …y ${conLiteral.length - 12} más` : ''),
  );

  if (!fallos.some((f) => f.startsWith('VOCABULARIO'))) {
    notas.push(
      `vocabulario   ruta + los dos envoltorios + el menú heredado · ` +
        `${pantallas.length} pantalla(s) lo consumen · 0 sustantivos tecleados a mano`,
    );
  }
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
  'corte de caja',
  'punto de partida',
  'cuenta el',
  'cuenta lo que',
  'cuenta los',
  'cuenta las',
  'cuenta dos',
  'se cuentan',
  'cuenta con',
  'primera nota',
  'nota del',
  'notas del',
  'nota interna',
  'foto de la nota',
  'mesa de trabajo',
  'barra lateral',
];

/** Y estas palabras, en estas pantallas, tampoco. */
const NO_ES_LA_ENTIDAD_AQUI = {
  'ferreteria/Entradas.tsx': ['nota', 'notas'],
};

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
      const lineas = readFileSync(join(dir, entrada.name), 'utf8').split('\n');
      let enComentario = false;

      lineas.forEach((linea, indice) => {
        const recortada = linea.trim();
        if (enComentario) {
          if (recortada.includes('*/')) enComentario = false;
          return;
        }
        if (recortada.startsWith('/*') || recortada.startsWith('{/*')) {
          if (!recortada.includes('*/')) enComentario = true;
          return;
        }
        if (recortada.startsWith('//') || recortada.startsWith('*')) return;

        // Los dos sitios visibles: el texto entre `>` y `<`, y los props que se
        // leen. Un `{…}` dentro del texto es una expresión, no texto.
        const visibles = [];
        for (const m of linea.matchAll(/>([^<>{}]*[A-Za-zÁÉÍÓÚÑ][^<>{}]*)</g)) {
          visibles.push(m[1]);
        }
        for (const m of linea.matchAll(/\b(?:aria-label|placeholder|title|alt)="([^"]*)"/g)) {
          visibles.push(m[1]);
        }
        for (const trozo of visibles) {
          const bajo = trozo.toLowerCase();
          if (NO_ES_LA_ENTIDAD.some((v) => bajo.includes(v))) continue;
          const halla = buscador.exec(trozo);
          if (halla === null) continue;
          if (vetadasAqui.includes(halla[1].toLowerCase())) continue;
          encontradas.push(`${clave}:${indice + 1}  «${halla[1]}»  ${trozo.trim().slice(0, 60)}`);
        }
      });
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
    respuesta = await fetch(base, { redirect: 'manual', headers: MURO.cabeceras });
  } catch (error) {
    fallos.push(`DESPLIEGUE: ${base} no respondió · ${error.message}`);
    return undefined;
  }

  const ok = respuesta.status === 200 || (respuesta.status >= 300 && respuesta.status < 400);
  exigir(ok, `DESPLIEGUE: ${base} devolvió ${respuesta.status}`);
  if (ok && despliegue !== undefined) {
    notas.push(`despliegue    ${base} → ${respuesta.status} · ${MURO.como}`);
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

function comprobarQueLasPruebasCobran() {
  const carpeta = join(RAIZ, 'pruebas', 'e2e');
  for (const archivo of SUITES_DE_MODELO) {
    const ruta = join(carpeta, archivo);
    if (!existsSync(ruta)) {
      fallos.push(`COBRO-E2E: falta la suite ${archivo}`);
      continue;
    }
    // Sin comentarios: una llamada dentro de un comentario no cobra nada.
    const codigo = readFileSync(ruta, 'utf8')
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

  const pendientes = corridas.filter((c) => c.status !== 'completed');
  const rojos = corridas.filter((c) => c.status === 'completed' && c.conclusion !== 'success');

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
      `ci            ${corridas.length} check(s) VERDES en ${sha.slice(0, 7)} · ` +
        corridas.map((c) => c.name).join(' · '),
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
const RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN = {
  '/api/entradas/alta-material': 'alta de material al recibir una compra; no hay comando todavía',
  '/api/entradas/recibir': 'recepción de compra en ferretería; no hay comando todavía',
  '/api/ferreteria/agregar-partida': 'agregar una pieza desde su ficha; no hay comando todavía',
  '/api/reportes/exportar': 'exportar los registros a CSV; falta el comando',
  '/api/restaurante/imprimir-precuenta':
    'imprimir la precuenta. El cambio de estado que importa lo hace `solicitar-cuenta`, que sí ' +
    'existe: esto es la impresión',
  '/api/venta/devolver': 'la devolución desde el cierre de turno; falta el comando',
};

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
      const texto = readFileSync(ruta, 'utf8')
        .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
        .replaceAll(/^\s*\/\/.*$/gm, ' ');
      for (const m of texto.matchAll(/['"`](\/api\/[a-zA-Z0-9/_-]+)['"`]/g)) {
        if (!llamadas.has(m[1])) llamadas.set(m[1], ruta.replace(RAIZ, '').replaceAll(sep, '/'));
      }
    }
  };
  for (const carpeta of carpetas) recorrer(carpeta);

  const existe = (url) => {
    const partes = url.replace('/api/', '').split('/');
    const directa = join(RAIZ, 'apps', 'web', 'app', 'api', ...partes, 'route.ts');
    if (existsSync(directa)) return true;
    // Una ruta con parámetro: `/api/citas/<id>/cancelar` la sirve `[id]`.
    const padre = join(RAIZ, 'apps', 'web', 'app', 'api', ...partes.slice(0, -1));
    return readdirSyncSeguro(padre).some(
      (e) =>
        e.isDirectory() && e.name.startsWith('[') && existsSync(join(padre, e.name, 'route.ts')),
    );
  };

  const nuevas = [];
  for (const [url, donde] of llamadas) {
    if (existe(url)) continue;
    if (RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN[url] !== undefined) continue;
    nuevas.push(`${url} (${donde})`);
  }
  exigir(
    nuevas.length === 0,
    `RUTAS-LLAMADAS: ${nuevas.length} pantalla(s) publican en una ruta que NO existe y no está ` +
      `declarada · ${nuevas.join(' · ')}. El botón devuelve la página de error de Next, el ` +
      'cliente la traduce a «El servidor respondió algo inesperado» y no se hace nada. O se crea ' +
      'la ruta, o se declara en RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN con lo que le falta.',
  );

  const yaExisten = Object.keys(RUTAS_QUE_EL_FRONTEND_LLAMA_Y_NO_EXISTEN).filter((url) =>
    existe(url),
  );
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
