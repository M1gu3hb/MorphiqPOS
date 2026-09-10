#!/usr/bin/env node
/**
 * LA PUERTA QUE FALTABA: el aspecto de las pantallas de Miguel no cambia.
 *
 *   node scripts/verificar-aspecto.mjs [<referencia-git>]   (por omisión HEAD)
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * `apps/web/heredado/` es el frontend de Miguel, copiado literal. La regla del
 * encargo es que cuando abra la URL vea EL SUYO: ni una clase de CSS, ni un
 * texto, ni un icono, ni un orden de elementos distintos.
 *
 * Las dos puertas del repositorio son CIEGAS a esa carpeta, y hay que decirlo
 * en voz alta porque cinco agentes las presentaron como prueba de su trabajo:
 *
 *   · `tsconfig.base.json:45` fija `checkJs: false`, así que `tsc` no analiza
 *     NI UN `.jsx` de heredado. Sale en verde sin haber mirado nada.
 *   · `vitest.config.ts` sólo incluye `.test.ts` bajo `packages` y bajo el `src`
 *     de cada `apps`. Ninguna de las 824 pruebas toca `heredado/`, ni podría:
 *     el alias `@` de vitest apunta a `apps/web/src` y el de la app a
 *     `heredado/`, así que ni una prueba hipotética sabría importarlas.
 *
 * Una tanda entera de cambios pasó las dos puertas en verde habiendo borrado
 * tarjetas enteras de la interfaz. Esto es lo que lo caza.
 *
 * ── Qué compara ────────────────────────────────────────────────────────────
 * Extrae de cada archivo, antes y después, los «testigos de aspecto»:
 *
 *   · las clases de CSS de cada `className`, incluidas las de dentro de `cn()`,
 *     de las plantillas y de los ternarios;
 *   · el TEXTO visible de los nodos JSX;
 *   · el texto de los avisos: `toast.*`, `confirm`, `alert`, y los `title`,
 *     `placeholder`, `label` y `aria-label`;
 *   · los iconos importados.
 *
 * Y compara los MULTICONJUNTOS. Reordenar una clase dentro del mismo atributo
 * no es un cambio de aspecto; quitarla sí. Cambiar «Cobrar» por «Cobrar ahora»
 * también.
 *
 * ── Lo que NO puede ver, y hay que decirlo ─────────────────────────────────
 * Un texto construido con variables (`Mesa ${n}`) sólo se compara por su parte
 * literal. Un cambio de ORDEN de dos bloques JSX enteros no lo detecta: los
 * testigos son los mismos. Y un `style` en línea tampoco. Es un cerco ancho,
 * no una demostración: lo que caza, lo caza de verdad; lo que no, sigue
 * pidiendo abrir el navegador.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CARPETA = 'apps/web/heredado';
const PERMITIDOS = 'scripts/aspecto-permitido.json';

/**
 * Contra QUÉ se compara, y por qué no contra `HEAD`.
 *
 * La primera versión de esta puerta usaba `HEAD` por omisión, y eso la dejaba
 * INERTE justo donde tiene que trabajar: en un árbol comprometido no hay nada
 * que comparar, así que `pnpm verify:aspecto` imprimía «Sin cambios» y salía 0
 * sin haber mirado un solo archivo. Una puerta que sale verde sin mirar es peor
 * que ninguna, porque además tranquiliza.
 *
 * La referencia correcta es el commit donde el código de Miguel se copió al
 * repositorio: es la única que responde a la pregunta que importa —«¿ve Miguel
 * SU sistema?»— y no a «¿cambió algo desde ayer?». Vive en el JSON, junto a las
 * excepciones, para que mover la línea base sea tan visible como añadir una.
 */
function baseDeclarada() {
  try {
    const base = JSON.parse(readFileSync(PERMITIDOS, 'utf8')).base;
    if (typeof base === 'string' && base.trim() !== '') return base.trim();
  } catch {
    /* sin archivo: se cae a HEAD, y el aviso de abajo lo dice */
  }
  process.stderr.write(
    `${PERMITIDOS} no declara «base». Comparando contra HEAD, que en un árbol ` +
      'comprometido no compara NADA. Declara el commit donde se copió heredado/.' +
      String.fromCharCode(10),
  );
  return 'HEAD';
}

const REFERENCIA = process.argv[2] ?? baseDeclarada();

/**
 * Las excepciones, cada una con su motivo escrito.
 *
 * Una puerta sin salida de emergencia se queda roja para siempre y deja de
 * mirarse, que es la forma en que muere una puerta. Pero la salida exige decir
 * POR QUÉ: sin `porque`, el archivo se rechaza y la puerta falla.
 */
function permitidos() {
  let crudo;
  try {
    crudo = readFileSync(PERMITIDOS, 'utf8');
  } catch {
    return new Map();
  }
  const datos = JSON.parse(crudo);
  const mapa = new Map();
  for (const entrada of datos.permitidos ?? []) {
    if (typeof entrada.porque !== 'string' || entrada.porque.trim().length < 20) {
      process.stderr.write(
        `${PERMITIDOS}: la excepción de «${entrada.archivo}» no dice por qué. ` +
          'Una excepción sin motivo es un permiso en blanco.\n',
      );
      process.exit(2);
    }
    const cuenta = new Map();
    for (const t of entrada.testigos ?? []) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
    mapa.set(entrada.archivo, cuenta);
  }
  return mapa;
}

const PERMITIDO = permitidos();

/** Los archivos cuyo BORRADO está declarado, con su motivo, en el mismo JSON. */
const BORRADOS_PERMITIDOS = new Set(
  (() => {
    try {
      return (JSON.parse(readFileSync(PERMITIDOS, 'utf8')).permitidos ?? [])
        .filter((e) => e.borrado === true)
        .map((e) => e.archivo);
    } catch {
      return [];
    }
  })(),
);

/** Descuenta los testigos permitidos de este archivo, uno a uno. */
function sinLosPermitidos(ruta, lista, signo) {
  const cuenta = PERMITIDO.get(ruta.split('\\').join('/'));
  if (cuenta === undefined) return lista;
  const restantes = [];
  for (const testigo of lista) {
    const clave = `${signo} ${testigo}`;
    const quedan = cuenta.get(clave) ?? 0;
    if (quedan > 0) cuenta.set(clave, quedan - 1);
    else restantes.push(testigo);
  }
  return restantes;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** El contenido en la referencia, o null si el archivo no existía. */
function versionAnterior(ruta) {
  try {
    return git('show', `${REFERENCIA}:${ruta}`);
  } catch {
    return null;
  }
}

/** Quita comentarios: cambiar un comentario no cambia el aspecto. */
function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/** Cada cadena literal que aparece dentro de una expresión. */
function literales(expresion) {
  return [...expresion.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? '')
    .filter((s) => s.trim() !== '');
}

/** Recorta la expresión de un `atributo={ … }`, contando llaves. */
function expresionDeAtributo(codigo, inicio) {
  let profundidad = 0;
  for (let i = inicio; i < codigo.length; i += 1) {
    if (codigo[i] === '{') profundidad += 1;
    else if (codigo[i] === '}') {
      profundidad -= 1;
      if (profundidad === 0) return codigo.slice(inicio, i + 1);
    }
  }
  return codigo.slice(inicio);
}

const ATRIBUTOS_VISIBLES = ['title', 'placeholder', 'label', 'aria-label', 'alt'];

function testigos(fuente) {
  const codigo = sinComentarios(fuente);
  const salida = [];

  // 1 · Las clases de CSS. Se parten por espacios y se cuentan una a una, así
  //     que reordenarlas dentro del mismo atributo no cuenta como cambio.
  for (const m of codigo.matchAll(/className\s*=\s*(["'])((?:(?!\1).)*)\1/g)) {
    for (const clase of (m[2] ?? '').split(/\s+/)) if (clase) salida.push(`clase:${clase}`);
  }
  for (const m of codigo.matchAll(/className\s*=\s*\{/g)) {
    const expresion = expresionDeAtributo(codigo, m.index + m[0].length - 1);
    for (const literal of literales(expresion)) {
      for (const clase of literal.split(/\s+/)) if (clase) salida.push(`clase:${clase}`);
    }
  }

  // 2 · El texto visible de los nodos JSX.
  //
  //     El `>` no puede venir de un operador: `a >= 1 && b < c` encaja con el
  //     patrón y colaba «= 1 && b» como si fuera texto de pantalla. Se exige que
  //     el carácter anterior cierre una etiqueta, y que lo capturado no huela a
  //     código.
  const CODIGO_NO_TEXTO = /(&&|\|\||=>|\?\.|;|\breturn\b|\bconst\b|\bawait\b)/;
  for (const m of codigo.matchAll(/(^|[^=<>!+\-*/&|])>([^<>{}]+)</gm)) {
    const texto = (m[2] ?? '').replace(/\s+/g, ' ').trim();
    if (texto.length <= 1 || !/\p{L}/u.test(texto)) continue;
    if (CODIGO_NO_TEXTO.test(texto)) continue;
    salida.push(`texto:${texto}`);
  }

  // 3 · Los avisos. Son texto que Miguel lee, aunque no viva en el JSX.
  for (const m of codigo.matchAll(/\b(?:toast(?:\.\w+)?|confirm|alert)\s*\(/g)) {
    const desde = m.index + m[0].length - 1;
    let profundidad = 0;
    let fin = desde;
    for (let i = desde; i < codigo.length; i += 1) {
      if (codigo[i] === '(') profundidad += 1;
      else if (codigo[i] === ')') {
        profundidad -= 1;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    for (const literal of literales(codigo.slice(desde, fin + 1))) {
      salida.push(`aviso:${literal.replace(/\s+/g, ' ').trim()}`);
    }
  }

  // 4 · Los atributos que el usuario ve o que le lee su lector de pantalla.
  for (const atributo of ATRIBUTOS_VISIBLES) {
    const patron = new RegExp(`\\b${atributo}\\s*=\\s*(["'])((?:(?!\\1).)*)\\1`, 'g');
    for (const m of codigo.matchAll(patron)) {
      const valor = (m[2] ?? '').replace(/\s+/g, ' ').trim();
      if (valor) salida.push(`${atributo}:${valor}`);
    }
  }

  // 5 · Los iconos. Cambiar el icono ES cambiar el aspecto.
  for (const m of codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g)) {
    for (const nombre of (m[1] ?? '').split(',')) {
      const limpio = nombre.trim().split(/\s+as\s+/)[0];
      if (limpio) salida.push(`icono:${limpio}`);
    }
  }

  return salida;
}

/** Qué testigos sobran y cuáles faltan, contando repeticiones. */
function diferencia(antes, despues) {
  const cuenta = new Map();
  for (const t of antes) cuenta.set(t, (cuenta.get(t) ?? 0) + 1);
  for (const t of despues) cuenta.set(t, (cuenta.get(t) ?? 0) - 1);

  const perdidos = [];
  const nuevos = [];
  for (const [testigo, n] of cuenta) {
    if (n > 0) for (let i = 0; i < n; i += 1) perdidos.push(testigo);
    else if (n < 0) for (let i = 0; i < -n; i += 1) nuevos.push(testigo);
  }
  return { perdidos, nuevos };
}

const cambiados = git('diff', '--name-only', REFERENCIA, '--', CARPETA)
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s !== '' && /\.(jsx?|tsx?)$/.test(s));

if (cambiados.length === 0) {
  process.stdout.write(`Sin cambios en ${CARPETA} respecto de ${REFERENCIA}.\n`);
  process.exit(0);
}

/**
 * Dos severidades, y la diferencia importa.
 *
 * La ESTRUCTURA —clases, texto del JSX, iconos, atributos visibles— es
 * inviolable: es lo que Miguel reconoce al abrir su sistema, y cualquier
 * diferencia hunde la entrega.
 *
 * Los AVISOS son otra cosa. El encargo pide expresamente que el error del
 * navegador ceda el sitio al mensaje del dominio —«esa mesa ya está abierta» en
 * vez de «No se pudo abrir la mesa»—, así que su texto CAMBIA a propósito y por
 * decenas. Se listan siempre, para que nadie los cambie sin verlo, pero sólo
 * tumban la puerta con `--estricto`, que es lo que se usa al revisar un cambio
 * que no debía tocarlos.
 */
const ESTRICTO = process.argv.includes('--estricto');
const esEstructura = (testigo) => !testigo.startsWith('aviso:');

let total = 0;
let avisos = 0;
const informe = [];

for (const ruta of cambiados) {
  const antes = versionAnterior(ruta);
  if (antes === null) continue; // archivo nuevo: no hay aspecto anterior que romper
  let despues;
  try {
    despues = readFileSync(ruta, 'utf8');
  } catch {
    // Un archivo borrado sólo pasa si está declarado con `borrado: true` y su
    // motivo. Que desaparezca una pantalla es el mayor cambio de aspecto que
    // hay, y no puede colarse dentro de un diff grande.
    if (BORRADOS_PERMITIDOS.has(ruta.split('\\').join('/'))) continue;
    informe.push(`\n${ruta}\n  BORRADO. Una pantalla que desaparece es el mayor cambio de aspecto.`);
    total += 1;
    continue;
  }

  const bruto = diferencia(testigos(antes), testigos(despues));
  const perdidos = sinLosPermitidos(ruta, bruto.perdidos, '-');
  const nuevos = sinLosPermitidos(ruta, bruto.nuevos, '+');
  if (perdidos.length === 0 && nuevos.length === 0) continue;

  total += perdidos.filter(esEstructura).length + nuevos.filter(esEstructura).length;
  avisos += perdidos.filter((t) => !esEstructura(t)).length + nuevos.filter((t) => !esEstructura(t)).length;
  informe.push(`\n${ruta}`);
  for (const t of perdidos.slice(0, 40)) informe.push(`  - ${t}`);
  if (perdidos.length > 40) informe.push(`  … y ${perdidos.length - 40} más que se perdieron`);
  for (const t of nuevos.slice(0, 40)) informe.push(`  + ${t}`);
  if (nuevos.length > 40) informe.push(`  … y ${nuevos.length - 40} más que se añadieron`);
}

const cabecera =
  total > 0
    ? `LA ESTRUCTURA CAMBIÓ. ${total} testigos distintos respecto de ${REFERENCIA}.\n` +
      'Miguel tiene que abrir su sistema y ver EL SUYO: ni una clase, ni un texto,\n' +
      'ni un icono. Cada «-» es algo que él veía y ya no está.'
    : `La estructura NO cambió en los ${cambiados.length} archivos tocados de ${CARPETA}.` +
      (avisos > 0 ? `\n${avisos} textos de aviso sí cambiaron; van listados abajo.` : '');

process.stdout.write(`${cabecera}\n${informe.join('\n')}\n`);

if (total > 0) process.exit(1);
// Con `--estricto` también tumban los avisos: es lo que se usa al revisar un
// cambio que no tenía por qué tocarlos.
if (ESTRICTO && avisos > 0) process.exit(1);
process.exit(0);
