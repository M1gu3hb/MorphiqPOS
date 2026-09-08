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
import { dirname, join, relative, sep } from 'node:path';
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
const EXCLUIDO = new Set(['node_modules', '.git', 'historico', '.turbo']);

/**
 * Documentos donde la plataforma erradicada SI puede nombrarse.
 *
 * R6 lo dice literal: sólo puede aparecer «en evidencia histórica y en documentos
 * de auditoría que expliquen la retirada». Estos son exactamente esos: el análisis
 * de las dos fuentes, la estrategia de fusión y el mapa de defectos. Un análisis de
 * la retirada que no puede nombrar lo que se retiró no sirve de nada.
 *
 * Este contrato se escribió cuando la documentación vivía en OTRO repositorio, así
 * que nunca la vio. Al unirse los dos repos (A-46) empezó a marcar como residuo la
 * prosa que la propia regla permite.
 *
 * Se excluye por PREFIJO DE RUTA, no por nombre de carpeta: excluir el nombre
 * «fase-1» apagaría el escáner en cualquier carpeta que se llamara así, en
 * cualquier punto del árbol. El código no se exceptúa nunca — ni una línea.
 */
const DOCUMENTACION_DE_AUDITORIA = ['docs/fase-1/', 'docs/auditorias/', 'docs/reports/'];

function esDocumentacionDeAuditoria(ruta) {
  const normalizada = ruta.split(sep).join('/');
  return DOCUMENTACION_DE_AUDITORIA.some((prefijo) => normalizada.includes(prefijo));
}

const hallazgos = [];

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

    // Sólo la documentación de auditoría puede nombrarla (R6). Nada de código.
    if (esDocumentacionDeAuditoria(ruta) && extension === '.md') continue;

    const contenido = readFileSync(ruta, 'utf8');
    for (const prohibido of PROHIBIDOS) {
      if (!contenido.includes(prohibido.patron)) continue;

      const lineas = contenido.split(/\r?\n/);
      const primera = lineas.findIndex((linea) => linea.includes(prohibido.patron));
      hallazgos.push({
        archivo: relative(RAIZ, ruta),
        linea: primera + 1,
        que: prohibido.que,
        patron: prohibido.patron,
      });
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
