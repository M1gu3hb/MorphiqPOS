#!/usr/bin/env node
/**
 * TOKENIZA EL RITMO DE LAS 69 PANTALLAS.
 *
 * Hermano de `tokenizar-primitivas.mjs` y con el mismo motivo: la adopcion de un
 * sistema se hace con un codemod, no a mano archivo por archivo — y el codemod se
 * queda en el repositorio como evidencia de que fue sistematica.
 *
 * ── Que convierte, y por que solo eso ─────────────────────────────────────
 * El ESPACIO y la DURACION, que son las dos que puentean una perilla:
 *
 *   · `gap-4`, `p-6`, `space-y-8` → `gap-(--espacio-4)` y sus hermanos. Con el
 *     espacio fijo, cambiar la densidad a `compacta` no junta NADA y la perilla
 *     queda de adorno. En `normal` el valor es EXACTAMENTE el mismo —0.25rem x 4 x
 *     1— asi que la conversion no mueve un pixel; lo que gana es que en `guantes`
 *     y en `compacta` la pantalla respira como toca.
 *   · `duration-150` → `duration-(--duracion-rapida|normal|lenta)`. Con una
 *     literal, el estilo TERMINAL —que las pone a cero a proposito, porque una
 *     animacion entre dos teclas estorba a quien teclea mas rapido de lo que mira—
 *     sigue animando.
 *
 * Lo que NO convierte, y no es pereza:
 *
 *   · Los pasos 0, 1 y 2. Son ajustes opticos de un icono o un borde y no dependen
 *     de la densidad: un `gap-1` entre un glifo y su numero tiene que seguir siendo
 *     1 px aunque la caja se ponga en modo guantes.
 *   · Los pasos 14, 20 y 24. No existen en la escala —el contrato llega hasta 16— y
 *     convertirlos seria inventar un token. Se quedan como deuda CONTADA por
 *     `verify:primitivas`, que es donde se ve.
 *   · `apps/web/heredado/`. Es el diseno de Miguel y lo cubre `verify:aspecto`.
 *
 * Los NEGATIVOS si se convierten, y no por simetria: un `-mx-4` existe para CANCELAR
 * el `p-4` de su padre —es como un pie sangra hasta el borde de su tarjeta—. Si el
 * relleno escala con la densidad y el margen negativo no, en `guantes` el padre abre
 * 1.4 veces mas y el pie deja de llegar al borde. Los dos o ninguno.
 *
 *   node scripts/tokenizar-pantallas.mjs [--verificar]
 *
 * Con `--verificar` no escribe: solo dice cuantos literales quedarian convertidos.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PANTALLAS = join(RAIZ, 'apps', 'web', 'src');

/** Los pasos que SI existen en la escala del contrato. */
const PASOS = ['3', '4', '5', '6', '8', '10', '12', '16'];

const PREFIJOS = [
  'p',
  'px',
  'py',
  'pt',
  'pb',
  'pl',
  'pr',
  'm',
  'mx',
  'my',
  'mt',
  'mb',
  'ml',
  'mr',
  'gap',
  'gap-x',
  'gap-y',
  'space-x',
  'space-y',
];

/**
 * Las tres duraciones, por cercania.
 *
 * No es una tabla de equivalencias exactas: es una decision. Lo que dura menos de
 * 150 ms es una respuesta —un hover, un foco— y va en `rapida`; hasta 250 es una
 * transicion de estado y va en `normal`; por encima es una entrada o una salida y va
 * en `lenta`. Tres pasos, no veinte.
 */
const DURACIONES = new Map([
  ['duration-0', 'duration-(--duracion-rapida)'],
  ['duration-75', 'duration-(--duracion-rapida)'],
  ['duration-100', 'duration-(--duracion-rapida)'],
  ['duration-150', 'duration-(--duracion-rapida)'],
  ['duration-200', 'duration-(--duracion-normal)'],
  ['duration-250', 'duration-(--duracion-normal)'],
  ['duration-300', 'duration-(--duracion-lenta)'],
  ['duration-500', 'duration-(--duracion-lenta)'],
  ['duration-700', 'duration-(--duracion-lenta)'],
  ['duration-1000', 'duration-(--duracion-lenta)'],
]);

/**
 * El espacio, respetando la variante y el signo.
 *
 * `(^|[\s"'\`:[])` deja pasar `md:p-4` y `sm:gap-6`, que llevan su variante delante.
 * El `-?` opcional recoge los negativos —`-mx-4` pasa a `-mx-(--espacio-4)`—, que es
 * lo que mantiene a un pie sangrando hasta el borde cuando el relleno de su padre
 * crece con la densidad.
 */
const ESPACIO = new RegExp(
  `(^|[\\s"'\`:\\[])(-?)(${PREFIJOS.join('|')})-(${PASOS.join('|')})\\b`,
  'g',
);

const DURACION = /(^|[\s"'`:[])duration-(\d+)\b/g;

function archivos(dir, encontrados = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      // El frontend portado del restaurante tiene su propio parche y su exencion.
      if (entrada.name === 'mh') continue;
      archivos(ruta, encontrados);
      continue;
    }
    if (entrada.name.endsWith('.tsx') && !entrada.name.includes('.test.')) encontrados.push(ruta);
  }
  return encontrados;
}

function tokenizar(texto) {
  let cuantos = 0;
  let salida = texto.replace(ESPACIO, (todo, antes, signo, prefijo, paso) => {
    cuantos += 1;
    return `${antes}${signo}${prefijo}-(--espacio-${paso})`;
  });
  salida = salida.replace(DURACION, (todo, antes, valor) => {
    const destino = DURACIONES.get(`duration-${valor}`);
    if (destino === undefined) return todo;
    cuantos += 1;
    return `${antes}${destino}`;
  });
  return { salida, cuantos };
}

const soloVerificar = process.argv.includes('--verificar');
const pendientes = [];
let total = 0;

for (const ruta of archivos(PANTALLAS)) {
  const texto = readFileSync(ruta, 'utf8');
  const { salida, cuantos } = tokenizar(texto);
  if (cuantos === 0) continue;
  total += cuantos;
  pendientes.push(`${relative(RAIZ, ruta)} · ${String(cuantos)}`);
  if (!soloVerificar) writeFileSync(ruta, salida, 'utf8');
}

if (pendientes.length === 0) {
  console.log('✓ Las pantallas ya tienen su ritmo en tokens.');
  process.exit(0);
}

if (soloVerificar) {
  console.error(
    `✗ ${String(total)} literal(es) de ritmo sin tokenizar en ${String(pendientes.length)} pantalla(s):`,
  );
  for (const p of pendientes.slice(0, 20)) console.error(`  · ${p}`);
  console.error('\nCorre `node scripts/tokenizar-pantallas.mjs`.');
  process.exit(1);
}

console.log(
  `✓ ${String(total)} literal(es) convertidos en ${String(pendientes.length)} pantalla(s).`,
);
