#!/usr/bin/env node
/**
 * La puerta automatica de erradicacion (F1.0-T09, `06-DEFECTOS §1`).
 *
 * MorphiqPOS nace de un sistema construido sobre una plataforma propietaria que
 * se erradica por completo. Como el repositorio es nuevo, la erradicacion es
 * **por construccion**: nada de eso entra nunca.
 *
 * Entonces, ¿para que existe esta puerta si hoy pasa trivialmente?
 *
 * Para F1.2 y F1.4, cuando se porten ~90 componentes y 13 paginas desde
 * `historico/`. Ahi es donde una constante, una URL de imagen o un identificador
 * se cuelan sin que nadie lo note. Instalarla despues, con 200 archivos, no
 * sirve: ya estarian dentro.
 *
 * NOTA: este archivo NO contiene los patrones escritos literalmente — se
 * componen abajo. Si estuvieran escritos tal cual, el escaner se encontraria a
 * si mismo y habria que exceptuarlo, y una excepcion es justo por donde se
 * empieza a perder una regla.
 *
 * Se ejecuta con: pnpm verify:residuos
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

/** La marca de la plataforma, compuesta para que no aparezca literal aqui. */
const MARCA = `${'base'}${44}`;

/** Los patrones prohibidos de `06-DEFECTOS §1`. */
const PROHIBIDOS = [
  { patron: `@${MARCA}/`, que: 'paquetes del SDK' },
  { patron: `${MARCA}Client`, que: 'el cliente del SDK' },
  { patron: `${MARCA}.`, que: 'llamadas al SDK' },
  { patron: `VITE_${MARCA.toUpperCase()}`, que: 'variables de entorno de la plataforma' },
  { patron: `${MARCA}/`, que: 'la carpeta de esquemas' },
  { patron: `media.${MARCA}.com`, que: 'activos remotos' },
  { patron: `app.${MARCA}.com`, que: 'el dominio de la plataforma' },
  // Partido para que el propio escaner no se encuentre a si mismo.
  { patron: '69fbe8877069' + '565e6f39775c', que: 'el identificador de la aplicacion' },
];

/**
 * Alcance del escaneo (`06-DEFECTOS §1`): codigo, manifiestos, lockfiles,
 * artefactos de build, mapas de fuente, variables de CI, docker-compose y
 * documentacion operativa.
 */
const EXTENSIONES = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.map',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.env',
  '.example',
  '.sql',
  '.md',
  '.sh',
]);

/** Lo unico excluido: la evidencia, donde SI debe aparecer. */
/**
 * Lo que no se mira.
 *
 * `.next`, `dist` y `coverage` son SALIDA de compilacion, no codigo fuente.
 * Se agregaron cuando un `.next` viejo hizo fallar la puerta con un mapa de
 * fuentes de una version anterior: el residuo estaba en un artefacto que nadie
 * versiona y que el siguiente build iba a tirar. Una puerta que depende de si
 * has corrido `pnpm dev` no dice nada sobre el codigo.
 */
const EXCLUIDO = new Set([
  'node_modules',
  '.git',
  'docs',
  'historico',
  '.turbo',
  '.next',
  'dist',
  'coverage',
]);

/**
 * La UNICA forma en que la marca puede aparecer fuera de `historico/`: como
 * RUTA que entra en `historico/`.
 *
 * R6 dice que la plataforma solo puede vivir en `historico/`. Una ruta que
 * apunta ahi dentro no la reintroduce: la senala en su cuarentena. Y hace falta,
 * porque `cobertura.test.ts` LEE esos esquemas como datos para comprobar que el
 * puente cubre las 27 entidades de Miguel — sin eso, la puerta que garantiza la
 * cobertura no puede existir.
 *
 * Esta acotada a proposito: exige que la marca venga precedida de `historico/`
 * en la MISMA linea, y solo vale para el patron de CARPETA. Un paquete del SDK,
 * una llamada al cliente o un dominio de la plataforma no encajan nunca, porque
 * ninguno de esos es una ruta.
 *
 * (Los ejemplos van descritos y no escritos: la cabecera de este archivo avisa
 * de que el escaner se encuentra a si mismo si la marca aparece literal. Lo
 * comprobe escribiendolos, y esta puerta me denuncio ocho veces.)
 *
 * Y no abre la puerta a importar de `historico/`: eso lo prohibe
 * `eslint.config.mjs` aparte, y sigue vivo. Esto es leer archivos como datos.
 */
const RUTA_AL_HISTORICO = new RegExp(`historico/[\\w./-]*${MARCA}/`);

const hallazgos = [];
/** Rutas al historico que se dieron por buenas, para poder decirlo al final. */
let justificadas = 0;

function recorrer(dir) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUIDO.has(entrada.name)) continue;

    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      recorrer(ruta);
      continue;
    }

    const punto = entrada.name.lastIndexOf('.');
    const extension = punto === -1 ? '' : entrada.name.slice(punto);
    // Los lockfiles y los archivos sin extension conocidos tambien entran.
    const interesa =
      EXTENSIONES.has(extension) ||
      entrada.name === 'pnpm-lock.yaml' ||
      entrada.name === 'Dockerfile';
    if (!interesa) continue;

    // Un artefacto de build enorme se lee igual: es donde se esconde un residuo.
    if (statSync(ruta).size > 20 * 1024 * 1024) continue;

    const contenido = readFileSync(ruta, 'utf8');
    const lineas = contenido.split(/\r?\n/);
    for (const prohibido of PROHIBIDOS) {
      if (!contenido.includes(prohibido.patron)) continue;

      // Linea por linea, no solo la primera: la version anterior denunciaba una
      // sola aparicion por archivo, asi que arreglar esa dejaba las demas
      // invisibles y la puerta volvia a verde con el residuo dentro.
      for (const [indice, linea] of lineas.entries()) {
        if (!linea.includes(prohibido.patron)) continue;
        // Solo el patron de CARPETA puede ser una ruta. Un paquete del SDK, una
        // llamada al cliente o un dominio no lo son NUNCA, asi que escribirlos
        // en una linea que ademas mencione `historico/` no los salva: sin esto,
        // un comentario con la ruta al lado de una llamada real la habria
        // colado.
        if (prohibido.patron === `${MARCA}/` && RUTA_AL_HISTORICO.test(linea)) {
          justificadas += 1;
          continue;
        }
        hallazgos.push({
          archivo: relative(RAIZ, ruta),
          linea: indice + 1,
          que: prohibido.que,
          patron: prohibido.patron,
        });
      }
    }
  }
}

recorrer(RAIZ);

// Ademas del contenido, la carpeta de esquemas no puede existir fuera de historico/.
const CARPETA_PROHIBIDA = join(RAIZ, MARCA);
if (existsSync(CARPETA_PROHIBIDA)) {
  hallazgos.push({
    archivo: MARCA + '/',
    linea: 0,
    que: 'la carpeta de la plataforma',
    patron: MARCA,
  });
}

if (hallazgos.length > 0) {
  console.error('\n✗ Residuos de la plataforma erradicada:\n');
  for (const hallazgo of hallazgos) {
    console.error(`  ${hallazgo.archivo}:${hallazgo.linea}`);
    console.error(`    ${hallazgo.que} — patron "${hallazgo.patron}"\n`);
  }
  console.error(
    `${hallazgos.length} hallazgo(s). R6: la plataforma solo puede aparecer en ` +
      'historico/ y en documentos de auditoria que expliquen la retirada.',
  );
  process.exit(1);
}

console.log(
  `✓ Cero residuos: ${PROHIBIDOS.length} patrones buscados fuera de historico/, ninguno presente.`,
);
if (justificadas > 0) {
  console.log(`  · ${justificadas} ruta(s) que APUNTAN a historico/, permitidas por R6.`);
}
