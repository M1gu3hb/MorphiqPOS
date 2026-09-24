#!/usr/bin/env node
/**
 * TODO COMANDO QUE ESCRIBE DEJA RASTRO.
 *
 * `definirComando` ya lo exige, y lo exige BIEN: si un comando declara
 * `escribe: true` y termina sin llamar a `ctx.auditar`, lanza `SinRastro` —«declarar
 * sensible algo que no deja rastro convierte la auditoria en un adorno»—.
 *
 * ── Por que hace falta ADEMAS una puerta estatica ─────────────────────────
 * Porque esa comprobacion vive en el ENVOLTORIO, `comando()`, y las 248 pruebas de
 * comandos llaman a `.ejecutar(ctx, entrada)` DIRECTAMENTE. Es lo correcto para
 * probar la logica —no hace falta una base de verdad para comprobar una regla de
 * negocio— y tiene una consecuencia: las invariantes del envoltorio no las prueba
 * nadie. Un comando puede estar roto de esta forma exacta y tener sus pruebas en
 * verde, el tipo correcto y la ruta respondiendo.
 *
 * No es hipotetico. `configuracion.fijar_apariencia` se escribio asi en la etapa 5 y
 * NUNCA pudo guardar: cada vez que alguien tocaba «Guardar para el negocio», el
 * comando escribia, lanzaba `SinRastro`, la transaccion se deshacia y el selector
 * decia «No se pudo guardar la apariencia». Aparecio al llamarlo desde la siembra de
 * las demostraciones, que es la primera vez que algo distinto de una pantalla lo
 * ejecuto. Un comando que solo prueba una pantalla es un comando sin probar.
 *
 * ── LA DELEGACION tambien deja rastro, y hay DOS formas ───────────────────
 * Y las dos son legitimas, asi que la regla tiene que conocer las dos o acusa en
 * falso. La primera version de esta puerta conocia solo una y acuso a dos comandos
 * sanos de tres: la misma proporcion de falsos positivos que el rastreador de la 2.3
 * la primera vez que corrio, y por la misma razon —creer la primera senal—.
 *
 *   1 · OTRO COMANDO con el mismo `ctx`: `ferreteria/entrada.ts` llama a
 *       `recibirNota.ejecutar(ctx, …)`. Su cabecera lo dice con su razon —«el rastro
 *       guarda la PRIMERA auditoria, y la primera es la de la compra, con el id de la
 *       compra dentro»—: auditar dos veces le robaria ese renglon al asiento.
 *   2 · UNA FUNCION AYUDANTE que recibe `ctx`: `compras.registrar` delega en
 *       `escribirCompra(ctx, …)` y `comision.cargar_saldo` en
 *       `cargarSaldoDelComisionista(ctx, …)`. Las dos auditan dentro, y las dos
 *       existen porque el mismo asiento lo comparten dos comandos.
 *
 * Por eso la puerta hace DOS pasadas: primero aprende que funciones de
 * `packages/app/src` llaman a `ctx.auditar`, y despues acepta al comando que le pasa
 * `ctx` a una de ellas. Una funcion que audita es tan buen rastro como auditar.
 *
 * Se ejecuta con: pnpm verify:rastro
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const VIGILADA = join(RAIZ, 'packages', 'app', 'src');

function archivos(dir, encontrados = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      archivos(ruta, encontrados);
      continue;
    }
    // Las pruebas declaran comandos de mentira para probar el envoltorio.
    if (!entrada.name.endsWith('.ts') || entrada.name.endsWith('.test.ts')) continue;
    encontrados.push(ruta);
  }
  return encontrados;
}

/**
 * Cada `definirComando` de un archivo, con su trozo de texto.
 *
 * Se corta por la SIGUIENTE declaracion y no por llaves emparejadas a proposito:
 * contar llaves dentro de plantillas, expresiones regulares y cadenas es de donde
 * salen los falsos positivos, y aqui basta con mirar dentro del trozo correcto.
 */
function declaraciones(texto) {
  const marcas = [...texto.matchAll(/definirComando\s*[<(]/g)].map((m) => m.index);
  return marcas.map((inicio, i) => texto.slice(inicio, marcas[i + 1] ?? texto.length));
}

const rutas = archivos(VIGILADA);

/**
 * PRIMERA PASADA · que funciones dejan rastro.
 *
 * Se corta cada archivo por sus declaraciones de funcion de primer nivel y se mira si
 * el trozo llama a `ctx.auditar`. No hace falta un analizador de sintaxis: lo que se
 * busca es una llamada literal, y el corte por declaracion basta porque una funcion
 * de `packages/app/src` no se declara dentro de otra.
 */
const QUE_AUDITAN = new Set();
for (const ruta of rutas) {
  const texto = readFileSync(ruta, 'utf8');
  if (!texto.includes('ctx.auditar')) continue;

  const marcas = [
    ...texto.matchAll(/(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+(\w+)/g),
    ...texto.matchAll(/(?:^|\n)(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g),
  ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const [i, marca] of marcas.entries()) {
    const cuerpo = texto.slice(marca.index ?? 0, marcas[i + 1]?.index ?? texto.length);
    if (/\bctx\.auditar\s*\(/.test(cuerpo)) QUE_AUDITAN.add(marca[1]);
  }
}

const hallazgos = [];
let escriben = 0;
let porDelegacion = 0;

for (const ruta of rutas) {
  const texto = readFileSync(ruta, 'utf8');
  if (!texto.includes('definirComando')) continue;

  for (const trozo of declaraciones(texto)) {
    if (!/\bescribe:\s*true\b/.test(trozo)) continue;
    escriben += 1;

    if (/\bctx\.auditar\s*\(/.test(trozo)) continue;

    // Delegacion, de las dos formas: otro comando, o un ayudante que audita. En las
    // dos, lo que importa es que viaje el MISMO `ctx`: es el que lleva el rastro.
    const enOtroComando = /\.ejecutar\s*\(\s*ctx\b/.test(trozo);
    const enUnAyudante = [...trozo.matchAll(/\b(\w+)\s*\(\s*ctx\b/g)].some((llamada) =>
      QUE_AUDITAN.has(llamada[1]),
    );
    if (enOtroComando || enUnAyudante) {
      porDelegacion += 1;
      continue;
    }

    const nombre = /nombre:\s*'([^']+)'/.exec(trozo)?.[1] ?? '(sin nombre)';
    hallazgos.push({ archivo: relative(RAIZ, ruta), nombre });
  }
}

if (hallazgos.length > 0) {
  console.error('\n✗ Comandos que declaran escribir y NO dejan rastro:\n');
  for (const h of hallazgos) {
    console.error(`  ${h.nombre}`);
    console.error(`    ${h.archivo}`);
  }
  console.error(
    '\nLanzan `SinRastro` DESPUES de escribir: la transaccion se deshace y quien\n' +
      'los usa ve un error interno. Llama a `ctx.auditar({ entidadId, payload })`, o\n' +
      'delega en otro comando con el MISMO ctx y dilo en un comentario.\n',
  );
  process.exit(1);
}

console.log(
  `✓ Rastro: ${String(escriben)} comando(s) que escriben, todos con auditoría` +
    (porDelegacion > 0 ? ` (${String(porDelegacion)} por delegación).` : '.'),
);
