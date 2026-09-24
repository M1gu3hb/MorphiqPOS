#!/usr/bin/env node
/**
 * LA PUERTA DEL DEFECTO QUE MÁS VECES HA APARECIDO EN ESTA FASE.
 *
 *   node scripts/verificar-entradas-de-comando.mjs
 *
 * Una pantalla publica en la ruta de un comando un objeto que ese comando NO
 * acepta. El servidor contesta 400 `ENTRADA_INVALIDA`, la pantalla enseña un
 * mensaje genérico, y el botón «funciona» en todas las puertas: la ruta existe,
 * el tipo compila, la respuesta es JSON. Sólo falla cuando alguien lo toca.
 *
 * ── Los cinco casos reales que la obligan a existir ───────────────────────
 * Los cinco los encontró el rastreador TOCANDO la aplicación, uno por uno:
 *
 *   · `abarrotes/Servicios` mandaba `proveedor` donde `comision.registrar` pide
 *     `proveedorServicio`: una tiendita no podía cobrar una recarga.
 *   · `estetica-salon/Productos` mandaba `{destino, factorApertura, unidadCabina}`
 *     a `catalogo.actualizar_producto`, que no acepta ninguno de los tres y exige
 *     ocho que la pantalla no manda.
 *   · `cafeteria/Productos` mandaba `disponible`, que NO EXISTE en el esquema:
 *     zod lo tira en silencio y la perilla de «hoy no hay» no guardaba nada.
 *   · `cafeteria/Inventario` mandaba `cantidad` como número y `motivo` como frase.
 *   · `restaurante/Inventario` mandaba `delta` donde el esquema pide `cantidad`.
 *
 * Cinco veces la misma forma. Si se repite cinco veces, se comprueba.
 *
 * ── Qué compara, y las dos clases de fallo ────────────────────────────────
 * Por cada `invocarComando('<ruta>', { … })` de `apps/web/src`, busca el comando
 * que sirve esa ruta, lee su esquema `entrada` y compara las CLAVES:
 *
 *   1 · FALTA UN CAMPO OBLIGATORIO → 400 seguro, en cada toque.
 *   2 · SOBRA UN CAMPO → zod lo tira en silencio (`z.object` no es `strict`), así
 *       que la pantalla cree que guardó algo que nunca viajó. Es el defecto más
 *       difícil de ver a mano, porque no hay error en ninguna parte.
 *
 * ── Lo que NO comprueba, dicho en vez de supuesto ─────────────────────────
 * · Los tipos de cada valor: eso es del esquema y de la prueba del comando.
 * · Un objeto con `...spread`: no se pueden leer sus claves. Se cuenta y se dice.
 * · Las rutas que no son de un comando —`/api/datos/escribir`, las consultas— y
 *   las que un comando recibe con un parámetro en el camino, que se resta del
 *   cuerpo porque lo inyecta `manejadorDeComandoConParametro`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sinFalsosDelimitadores } from './lib/sin-prosa.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = join(RAIZ, 'packages', 'app', 'src');
const RUTAS = join(RAIZ, 'apps', 'web', 'app', 'api');
const PANTALLAS = join(RAIZ, 'apps', 'web', 'src');

/** Las rutas que NO son un comando y tienen su propia puerta. */
const FUERA = new Set(['/api/datos/escribir', '/api/datos/consultar', '/api/reportes/exportar']);

function archivos(dir, filtro) {
  const salida = [];
  const pila = [dir];
  while (pila.length > 0) {
    const actual = pila.pop();
    for (const e of readdirSync(actual)) {
      const ruta = join(actual, e);
      if (statSync(ruta).isDirectory()) pila.push(ruta);
      else if (filtro(e)) salida.push(ruta);
    }
  }
  return salida;
}

/** El bloque equilibrado que empieza en `desde` (con `{` o `(`). */
function bloque(texto, desde, abre = '{', cierra = '}') {
  let prof = 0;
  for (let i = desde; i < texto.length; i += 1) {
    if (texto[i] === abre) prof += 1;
    else if (texto[i] === cierra) {
      prof -= 1;
      if (prof === 0) return texto.slice(desde, i + 1);
    }
  }
  return texto.slice(desde);
}

/** El código sin comentarios: una clave citada en un comentario no es una clave. */
function sinComentarios(texto) {
  return sinFalsosDelimitadores(texto)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * `ruta HTTP → { comando, esquema, inyectado }`.
 *
 * Se lee de los `route.ts`: qué comando importan y si el identificador viaja en
 * el camino, que es lo que hace `manejadorDeComandoConParametro`.
 */
function rutasDeComando() {
  const porRuta = new Map();
  const conRuta = new Set();
  for (const archivo of archivos(RUTAS, (e) => e === 'route.ts')) {
    const texto = readFileSync(archivo, 'utf8');
    const url =
      '/' +
      relative(RAIZ, archivo)
        .replace(/\\/g, '/')
        .replace('apps/web/app/', '')
        .replace('/route.ts', '');
    /**
     * EL COMANDO SALE DEL MANEJADOR, no de los imports.
     *
     * Hay rutas que NO son un comando envuelto: `venta/cobrar-mostrador` tiene su
     * propio `POST` con su propio esquema y llama a dos comandos por dentro.
     * Tomando el comando de los `import` —como hacía la primera versión de esta
     * puerta— esa ruta se comparaba contra `entradaCrearOrden` y salían cuatro
     * campos «que sobran» que la ruta sí acepta. Una ruta con validación propia
     * NO se compara aquí: la valida ella.
     */
    conRuta.add(url);
    // Una ruta que valida por su cuenta —su propio `z.object` y su `safeParse`— no
    // se compara aquí: el contrato es suyo, no del comando que llame por dentro.
    // `venta/cobrar-mostrador` es de ésas, y llama a DOS comandos.
    if (/safeParse|z\.object\(/.test(texto)) continue;
    const envuelto =
      /export const POST = (?:manejadorDeComando|manejadorDeComandoConParametro|manejadorDeComandoPublico)\(\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(
        texto,
      )?.[1] ?? /return\s+ejecutarComandoHttp\(\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(texto)?.[1];
    if (envuelto === undefined) continue;
    const inyectado = /manejadorDeComandoConParametro\([^,]+,\s*'([A-Za-z0-9_]+)'/.exec(texto)?.[1];
    porRuta.set(url, {
      comando: envuelto,
      inyectado: inyectado ?? null,
      ruta: relative(RAIZ, archivo).replace(/\\/g, '/'),
    });
  }
  return { porRuta, conRuta };
}

/**
 * `variable del comando → { esquema, archivo }`.
 *
 * El ARCHIVO importa: dos módulos distintos declaran un `entradaAbrirMesa` —el del
 * restaurante y el del portal QR— y resolver el esquema sólo por su nombre hacía
 * que uno tapara al otro. La primera versión de esta puerta acusó a
 * `restaurante/MesaActiva` de no mandar dos campos que SÍ son opcionales en su
 * esquema, porque estaba leyendo el del portal. Un falso positivo de una puerta
 * cuesta lo mismo que un defecto: una tarde de buscar lo que no está roto.
 */
function esquemaPorComando() {
  const porComando = new Map();
  for (const archivo of archivos(APP, (e) => e.endsWith('.ts') && !e.includes('.test.'))) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(/export const (\w+) = definirComando(?:Publico)?</g)) {
      const desde = texto.slice(m.index);
      const entrada = /entrada: (\w+)/.exec(desde)?.[1];
      if (entrada !== undefined) porComando.set(m[1], { esquema: entrada, archivo });
    }
  }
  return porComando;
}

/**
 * `nombre del esquema → { obligatorios, opcionales }`.
 *
 * Un campo es OPCIONAL si su cadena lleva `.optional()`, `.default(`, `.nullish()`
 * o `.catch(`. `.nullable()` NO lo hace opcional: `null` hay que mandarlo.
 */
function camposPorEsquema() {
  const porEsquema = new Map();
  for (const archivo of archivos(APP, (e) => e.endsWith('.ts') && !e.includes('.test.'))) {
    const texto = readFileSync(archivo, 'utf8');
    for (const m of texto.matchAll(/(?:export )?const (entrada\w+) = z\s*\n?\s*\.?object\(\{/g)) {
      const inicio = texto.indexOf('{', m.index + m[0].length - 2);
      const cuerpo = sinComentarios(bloque(texto, inicio));
      const obligatorios = new Set();
      const opcionales = new Set();
      const clave = `${archivo}#${m[1]}`;
      // Cada campo de primer nivel: `nombre: z…` hasta la coma de su mismo nivel.
      let prof = 0;
      let actual = '';
      for (const caracter of cuerpo.slice(1, -1)) {
        if ('{(['.includes(caracter)) prof += 1;
        if ('})]'.includes(caracter)) prof -= 1;
        if (caracter === ',' && prof === 0) {
          registrar(actual, obligatorios, opcionales);
          actual = '';
          continue;
        }
        actual += caracter;
      }
      registrar(actual, obligatorios, opcionales);
      porEsquema.set(clave, { obligatorios, opcionales });
    }
  }
  return porEsquema;
}

function registrar(trozo, obligatorios, opcionales) {
  // `nombre: z…` y también el ATAJO `personas,`, que es un esquema con el nombre
  // del campo. Sin el atajo, la puerta acusaba a `abrir-mesa` de mandar un campo
  // que sobra —`personas`— cuando es exactamente el que el esquema declara.
  const nombre = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)/.exec(trozo.trimEnd())?.[1];
  if (nombre === undefined) return;
  const esOpcional =
    /\.optional\(/.test(trozo) ||
    /\.default\(/.test(trozo) ||
    /\.nullish\(/.test(trozo) ||
    /\.catch\(/.test(trozo);
  if (esOpcional) opcionales.add(nombre);
  else obligatorios.add(nombre);
}

/**
 * El esquema de un comando, buscado donde de verdad está: su archivo primero, los
 * módulos que ese archivo importa después, y el resto sólo si no hay ambigüedad.
 *
 * Si dos módulos declaran ese nombre y ninguno es el suyo, NO se adivina: se
 * cuenta como ilegible y se dice en el resumen.
 */
function resolverEsquema(porEsquema, nombre, archivoDelComando) {
  const propio = porEsquema.get(`${archivoDelComando}#${nombre}`);
  if (propio !== undefined) return propio;

  const texto = readFileSync(archivoDelComando, 'utf8');
  for (const m of texto.matchAll(/from '(\.[^']+)'/g)) {
    const relativo = (m[1] ?? '').replace(/\.ts$/, '');
    const vecino = join(dirname(archivoDelComando), `${relativo}.ts`);
    const suyo = porEsquema.get(`${vecino}#${nombre}`);
    if (suyo !== undefined) return suyo;
  }

  const candidatos = [...porEsquema.entries()].filter(([clave]) => clave.endsWith(`#${nombre}`));
  return candidatos.length === 1 ? candidatos[0]?.[1] : undefined;
}

/** Las constantes `const RUTA_X = '/api/…'` de un archivo de pantalla. */
function constantesDeRuta(texto) {
  const mapa = new Map();
  for (const m of texto.matchAll(/const ([A-Z_][A-Z0-9_]*)\s*=\s*'(\/api\/[^']+)'/g)) {
    mapa.set(m[1], m[2]);
  }
  return mapa;
}

const { porRuta, conRuta } = rutasDeComando();
const porComando = esquemaPorComando();
const porEsquema = camposPorEsquema();

const fallos = [];
let comprobadas = 0;
let conSpread = 0;
let sinEsquema = 0;
let fueraDeAlcance = 0;

for (const archivo of archivos(PANTALLAS, (e) => /\.tsx?$/.test(e) && !e.includes('.test.'))) {
  const crudo = readFileSync(archivo, 'utf8');
  if (!crudo.includes('invocarComando')) continue;
  const texto = sinComentarios(crudo);
  const constantes = constantesDeRuta(texto);

  for (const m of texto.matchAll(/invocarComando(?:<[^>]*>)?\(\s*([^,]+?),\s*\{/g)) {
    const referencia = (m[1] ?? '').trim();
    let ruta = null;
    const literal = /^'(\/api\/[^']+)'$/.exec(referencia);
    if (literal !== null) ruta = literal[1] ?? null;
    else if (constantes.has(referencia)) ruta = constantes.get(referencia) ?? null;
    if (ruta === null) {
      // Una ruta armada con una función —`rutaDeAbrir(id)`— no se lee aquí.
      fueraDeAlcance += 1;
      continue;
    }
    if (FUERA.has(ruta)) {
      fueraDeAlcance += 1;
      continue;
    }

    const destino = porRuta.get(ruta);
    if (destino === undefined) {
      // La ruta EXISTE y valida por su cuenta —`/api/auth/entrar` tiene su propio
      // esquema—: no hay nada que comparar aquí. Que NO exista es otra cosa, y es
      // un 404 en la cara de quien toca el botón.
      fueraDeAlcance += 1;
      if (!conRuta.has(ruta)) {
        fallos.push(
          `${relative(RAIZ, archivo).replace(/\\/g, '/')} · publica en «${ruta}», que NO EXISTE`,
        );
      }
      continue;
    }
    const delComando = porComando.get(destino.comando);
    const nombreEsquema = delComando?.esquema;
    const campos =
      delComando === undefined
        ? undefined
        : resolverEsquema(porEsquema, delComando.esquema, delComando.archivo);
    if (campos === undefined) {
      sinEsquema += 1;
      continue;
    }

    // El cuerpo que la pantalla manda: sus claves de primer nivel.
    const inicio = texto.indexOf('{', m.index + m[0].length - 1);
    const cuerpo = bloque(texto, inicio);
    if (/\.\.\./.test(cuerpo)) {
      conSpread += 1;
      continue;
    }
    const enviadas = new Set();
    let prof = 0;
    let actual = '';
    for (const caracter of cuerpo.slice(1, -1)) {
      if ('{(['.includes(caracter)) prof += 1;
      if ('})]'.includes(caracter)) prof -= 1;
      if (caracter === ',' && prof === 0) {
        const clave = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:,]?/.exec(actual)?.[1];
        if (clave !== undefined) enviadas.add(clave);
        actual = '';
        continue;
      }
      actual += caracter;
    }
    const ultima = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[:,]?/.exec(actual)?.[1];
    if (ultima !== undefined) enviadas.add(ultima);

    comprobadas += 1;
    const donde = `${relative(RAIZ, archivo).replace(/\\/g, '/')} → ${ruta}`;

    const faltan = [...campos.obligatorios].filter(
      (campo) => !enviadas.has(campo) && campo !== destino.inyectado,
    );
    if (faltan.length > 0) {
      fallos.push(
        `${donde} · FALTA(N) ${faltan.map((c) => `\`${c}\``).join(', ')} ` +
          `— obligatorio(s) en ${nombreEsquema}: cada toque contesta 400`,
      );
    }

    const sobran = [...enviadas].filter(
      (campo) => !campos.obligatorios.has(campo) && !campos.opcionales.has(campo),
    );
    if (sobran.length > 0) {
      fallos.push(
        `${donde} · SOBRA(N) ${sobran.map((c) => `\`${c}\``).join(', ')} ` +
          `— no está(n) en ${nombreEsquema}: zod los tira EN SILENCIO`,
      );
    }
  }
}

const resumen =
  `${String(comprobadas)} llamada(s) comprobadas · ${String(conSpread)} con spread · ` +
  `${String(sinEsquema)} sin esquema legible · ${String(fueraDeAlcance)} fuera de alcance`;

if (fallos.length > 0) {
  console.error(
    `ENTRADAS-DE-COMANDO: ${String(fallos.length)} llamada(s) que el comando NO acepta\n`,
  );
  for (const fallo of [...new Set(fallos)].sort()) console.error(`  · ${fallo}`);
  console.error(
    '\nUna pantalla que publica lo que el comando no acepta es un botón que falla SIEMPRE —400— o,\n' +
      'peor, uno que parece guardar y no guarda: `z.object` tira las claves que no conoce sin decir\n' +
      'nada. Corrige la pantalla, o el esquema si lo que falta es el campo.',
  );
  console.error(`\nentradas de comando · ${resumen}`);
  process.exit(1);
}

console.log(`OK · entradas de comando · ${resumen}`);
