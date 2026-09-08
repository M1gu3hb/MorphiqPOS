#!/usr/bin/env node
/**
 * Tokeniza las primitivas que genera la CLI de shadcn (F1.0-T07).
 *
 * Lo que shadcn produce NO cumple el contrato del sistema de diseno:
 *
 *   1. Las alturas de control son literales (`h-9`, `h-8`, `size-9`). Eso
 *      PUENTEA la perilla de densidad: cambiar a `compacta` no encogeria nada.
 *   2. Usa la variante `dark:`, y nuestra clase de modo oscuro es `oscuro`.
 *   3. El import de `cn` sale mal resuelto por la CLI.
 *   4. Trae radios y sombras sueltos que no salen de las perillas.
 *
 * Este codemod se queda en el repositorio a proposito: es la evidencia de que
 * la adopcion fue sistematica y no un retoque a mano archivo por archivo. Se
 * vuelve a correr cada vez que se agrega una primitiva nueva.
 *
 *   node scripts/tokenizar-primitivas.mjs [--verificar]
 *
 * Con `--verificar` no escribe: solo dice que archivos quedarian distintos.
 * Asi CI puede exigir que nadie meta una primitiva sin tokenizar.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PRIMITIVAS = join(RAIZ, 'packages', 'ui', 'src', 'primitivas');

/**
 * Alturas de control expresadas contra la perilla de densidad.
 *
 * `--altura-control` vale 3rem en comoda, 2.5rem en normal y 2rem en compacta.
 * Los tamanos derivados se calculan sobre ella, para que las tres densidades
 * escalen juntas en vez de quedarse fijas.
 */
const ALTURAS = new Map([
  ['h-6', 'h-[calc(var(--altura-control)*0.6)]'],
  ['h-7', 'h-[calc(var(--altura-control)*0.7)]'],
  ['h-8', 'h-[calc(var(--altura-control)*0.85)]'],
  // OJO: Tailwind 4 NO genera `h-[var(--x)]` — descarta el var() desnudo
  // dentro de corchetes. Su sintaxis para variables es `h-(--x)`. Con la forma
  // equivocada la clase queda en el HTML, no existe en el CSS, y la perilla de
  // densidad no hace nada sin que falle nada. Lo detecto la prueba E2E.
  ['h-9', 'h-(--altura-control)'],
  ['h-10', 'h-[calc(var(--altura-control)*1.15)]'],
  ['h-11', 'h-[calc(var(--altura-control)*1.25)]'],
  ['size-6', 'size-[calc(var(--altura-control)*0.6)]'],
  ['size-7', 'size-[calc(var(--altura-control)*0.7)]'],
  ['size-8', 'size-[calc(var(--altura-control)*0.85)]'],
  ['size-9', 'size-(--altura-control)'],
  ['size-10', 'size-[calc(var(--altura-control)*1.15)]'],
  ['min-h-16', 'min-h-[calc(var(--altura-control)*1.8)]'],
  ['size-12', 'size-[calc(var(--altura-control)*1.4)]'],
  ['size-14', 'size-[calc(var(--altura-control)*1.6)]'],
  ['size-16', 'size-[calc(var(--altura-control)*1.8)]'],
]);

/**
 * Transiciones.
 *
 * shadcn usa `transition-all`, que anima TODO — incluida la altura. Eso choca
 * con dos cosas: la regla de rendimiento del proyecto ("prefiere propiedades
 * amigables con el compositor; evita animar width, height, padding") y la
 * perilla de densidad, porque un control que anima su altura no cambia de golpe
 * al cambiar la densidad, sino que se arrastra.
 *
 * Se sustituye por la lista explicita de lo que si conviene animar.
 */
const TRANSICIONES = new Map([
  [
    'transition-all',
    'transition-[color,background-color,border-color,box-shadow,opacity,transform]',
  ],
]);

/**
 * Colores que shadcn deja literales aunque exista el token.
 * `text-white` sobre el color de peligro deslumbra en modo oscuro y ademas
 * ignora la marca del cliente.
 */
const COLORES = new Map([
  ['bg-destructive text-white', 'bg-destructive text-destructive-foreground'],
  ['bg-primary text-white', 'bg-primary text-primary-foreground'],
  // El velo de un dialogo: negro literal ignora el estilo activo.
  ['bg-black/50', 'bg-velo/50'],
  ['bg-black/80', 'bg-velo/80'],
  // La perilla del deslizador, que debe seguir la superficie del estilo.
  ['border-primary bg-white', 'border-primary bg-background'],
]);

/**
 * Correcciones de tipos.
 *
 * shadcn desestructura una prop opcional y la vuelve a pasar tal cual. Con
 * `exactOptionalPropertyTypes: true` —una de las cuatro banderas que exige
 * F1.0-T03— eso no compila: pasar `checked={undefined}` no es lo mismo que no
 * pasar `checked`. La bandera NO se relaja; se corrige el patron.
 *
 * Son reemplazos exactos, a proposito: si shadcn cambia el codigo, el reemplazo
 * deja de aplicar, el typecheck vuelve a fallar y alguien lo mira. Es preferible
 * a un arreglo "listo" que enmascare un cambio de la libreria.
 */
const CORRECCIONES = [
  // Menus con item de casilla: basta con no desestructurar `checked`,
  // porque `...props` ya lo lleva con el tipo exacto.
  ['  children,\n  checked,\n  ...props', '  children,\n  ...props'],
  ['      checked={checked}\n', ''],
  // El deslizador si usa `value` y `defaultValue` para calcular las perillas,
  // asi que ahi se pasan solo cuando existen.
  [
    '      defaultValue={defaultValue}\n      value={value}\n',
    '      {...(defaultValue === undefined ? {} : { defaultValue })}\n' +
      '      {...(value === undefined ? {} : { value })}\n',
  ],
];

/** Sombras sueltas de shadcn a las perillas de elevacion. */
const SOMBRAS = new Map([
  ['shadow-xs', 'shadow-1'],
  ['shadow-sm', 'shadow-1'],
  ['shadow-md', 'shadow-2'],
  ['shadow-lg', 'shadow-3'],
  ['shadow-xl', 'shadow-4'],
  ['shadow-2xl', 'shadow-4'],
]);

/** Devuelve el contenido ya tokenizado de un archivo de primitiva. */
export function tokenizar(fuente) {
  let salida = fuente;

  // 1 · El import de cn, que la CLI deja apuntando a un paquete inexistente.
  salida = salida.replaceAll(/from ["']cn["']/g, "from '../utilidades/cn'");
  salida = salida.replaceAll(/from ["']@\/utilidades\/cn["']/g, "from '../utilidades/cn'");
  salida = salida.replaceAll(/from ["']@\/primitivas\/([^"']+)["']/g, "from './$1'");

  // 2 · La variante de modo oscuro.
  salida = salida.replaceAll(/(^|[\s"'`:[])dark:/g, '$1oscuro:');

  // 3 · Correcciones de tipos, antes de tocar clases.
  for (const [antes, despues] of CORRECCIONES) {
    salida = salida.replaceAll(antes, despues);
  }

  // 4 · Colores que shadcn deja literales pese a existir el token.
  for (const [literal, token] of COLORES) {
    salida = salida.replaceAll(literal, token);
  }

  // 5 · Alturas y tamanos contra la perilla de densidad.
  //     El limite izquierdo acepta prefijos de variante (file:, hover:, md:),
  //     porque si no `file:h-7` se cuela sin tokenizar.
  for (const [literal, token] of ALTURAS) {
    salida = salida.replaceAll(
      new RegExp(`(^|[\\s"'\`:])${literal}(?=[\\s"'\`]|$)`, 'g'),
      `$1${token}`,
    );
  }

  // 6 · Sombras contra la perilla de elevacion.
  for (const [literal, token] of SOMBRAS) {
    salida = salida.replaceAll(
      new RegExp(`(^|[\\s"'\`:])${literal}(?=[\\s"'\`]|$)`, 'g'),
      `$1${token}`,
    );
  }

  // 7 · Transiciones: nunca animar propiedades que provocan reflujo.
  for (const [literal, token] of TRANSICIONES) {
    salida = salida.replaceAll(
      new RegExp(`(^|[\\s"'\`:])${literal}(?=[\\s"'\`]|$)`, 'g'),
      `$1${token}`,
    );
  }

  return salida;
}

const soloVerificar = process.argv.includes('--verificar');

let archivos = [];
try {
  archivos = readdirSync(PRIMITIVAS).filter((nombre) => nombre.endsWith('.tsx'));
} catch {
  console.error(`✗ No existe ${PRIMITIVAS}. Agrega primitivas antes de tokenizar.`);
  process.exit(1);
}

const cambiados = [];

for (const nombre of archivos) {
  const ruta = join(PRIMITIVAS, nombre);
  const original = readFileSync(ruta, 'utf8');
  const tokenizado = tokenizar(original);

  if (original === tokenizado) continue;

  cambiados.push(nombre);
  if (!soloVerificar) writeFileSync(ruta, tokenizado);
}

if (soloVerificar) {
  if (cambiados.length > 0) {
    console.error('\n✗ Hay primitivas sin tokenizar:\n');
    for (const nombre of cambiados) console.error(`  · ${nombre}`);
    console.error('\nCorre: pnpm ui:tokenizar');
    process.exit(1);
  }
  console.log(`✓ Las ${archivos.length} primitivas estan tokenizadas.`);
  process.exit(0);
}

console.log(
  cambiados.length === 0
    ? `✓ Nada que tokenizar: las ${archivos.length} primitivas ya lo estaban.`
    : `✓ Tokenizadas ${cambiados.length} de ${archivos.length}: ${cambiados.join(', ')}`,
);
