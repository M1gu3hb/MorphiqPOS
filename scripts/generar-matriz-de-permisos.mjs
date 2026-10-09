#!/usr/bin/env node
/**
 * LA MATRIZ DE PERMISOS, generada del registro de comandos (D.3 de la 2.4).
 *
 *   node --conditions=react-server scripts/generar-matriz-de-permisos.mjs             # la escribe
 *   node --conditions=react-server scripts/generar-matriz-de-permisos.mjs --verificar # ¿está al día?
 *
 * ── Por qué generada y no escrita a mano ─────────────────────────────────────
 * Una matriz a mano es una segunda lista de roles que se queda atrás el día que alguien
 * cambia un comando: la prueba seguiría verde comprobando permisos que ya no son los del
 * código. Aquí la matriz SALE del código: cada `route.ts` que sirve UN comando por la
 * tubería estándar —`manejadorDeComando(x)` o `manejadorDeComandoConParametro(x, …)`—
 * nombra su comando, y el comando declara sus `roles` y `paquetes` (`definirComando`).
 * `pruebas/e2e/matriz-de-permisos.spec.ts` la recorre contra el servidor: con cada rol de
 * cada demo, un cuerpo vacío tiene que dar 403 `SIN_PERMISO` donde el rol no está, y NUNCA
 * `SIN_PERMISO` donde sí está (le contesta zod: el cuerpo vacío no escribe nada).
 *
 * Las rutas que NO pasan por esa tubería —públicas, de sesión, las que validan su cuerpo
 * antes del comando o encadenan varios— quedan fuera con su razón en `excluidas`: un 400
 * de su propio parseo llegaría antes que el permiso y la prueba no diría nada de él.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as prettier from 'prettier';

const RAIZ_API = join('apps', 'web', 'app', 'api');
const SALIDA = join('pruebas', 'e2e', 'matriz-de-permisos.json');

/**
 * `@morphiqpos/app/<x>` → su archivo, por el mapa `exports` del paquete. La raíz no
 * depende del paquete (sólo `apps/web`), así que se resuelve como lo resolvería él.
 */
const EXPORTS = JSON.parse(readFileSync(join('packages', 'app', 'package.json'), 'utf8')).exports;
function archivoDelModulo(especificador) {
  const subruta =
    especificador === '@morphiqpos/app' ? '.' : `.${especificador.slice('@morphiqpos/app'.length)}`;
  const destino = EXPORTS[subruta];
  if (typeof destino !== 'string') throw new Error(`@morphiqpos/app no exporta «${subruta}».`);
  return pathToFileURL(join('packages', 'app', destino)).href;
}

function rutas(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return rutas(ruta);
    return nombre === 'route.ts' ? [ruta] : [];
  });
}

/** `apps/web/app/api/caja/abrir/route.ts` → `/api/caja/abrir`. */
function caminoDe(archivo) {
  const relativo = relative(join('apps', 'web', 'app'), archivo).split(sep);
  relativo.pop();
  return `/${relativo.join('/')}`;
}

/** De qué módulo de `@morphiqpos/app` viene cada nombre importado. */
function importados(texto) {
  const mapa = new Map();
  for (const m of texto.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*'(@morphiqpos\/app(?:\/[\w-]+)?)'/g,
  )) {
    for (const parte of m[1].split(',')) {
      const nombre = parte
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      const original = parte
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (nombre) mapa.set(nombre, { modulo: m[2], original: original ?? nombre });
    }
  }
  return mapa;
}

async function generar() {
  const incluidas = [];
  const excluidas = [];
  const modulos = new Map();

  for (const archivo of rutas(RAIZ_API).sort()) {
    const texto = readFileSync(archivo, 'utf8');
    const camino = caminoDe(archivo);
    const directo =
      /export\s+const\s+POST\s*=\s*manejadorDeComando(?:ConParametro)?\(\s*(\w+)/.exec(texto);
    if (directo === null) {
      excluidas.push({
        ruta: camino,
        razon: /manejadorDeComando|ejecutarComandoHttp/.test(texto)
          ? 'no sirve UN comando por la tubería estándar: valida o encadena antes del comando'
          : 'no es una ruta de comando (pública, de sesión o de consulta)',
      });
      continue;
    }
    if (camino.includes('[')) {
      excluidas.push({ ruta: camino, razon: 'lleva un segmento dinámico en la dirección' });
      continue;
    }
    const origen = importados(texto).get(directo[1]);
    if (origen === undefined) {
      excluidas.push({
        ruta: camino,
        razon: `el comando «${directo[1]}» no viene de @morphiqpos/app`,
      });
      continue;
    }
    if (!modulos.has(origen.modulo)) {
      modulos.set(origen.modulo, await import(archivoDelModulo(origen.modulo)));
    }
    const comando = modulos.get(origen.modulo)[origen.original];
    if (comando === undefined || !Array.isArray(comando.roles)) {
      excluidas.push({ ruta: camino, razon: `«${origen.original}» no es un comando con roles` });
      continue;
    }
    incluidas.push({
      ruta: camino,
      comando: comando.nombre,
      escribe: comando.escribe === true,
      roles: [...comando.roles].sort(),
      paquetes: [...comando.paquetes].sort(),
    });
  }
  return { incluidas, excluidas };
}

const matriz = await generar();
// Con el formato del repositorio: `format:check` revisa también este archivo, y un JSON
// con otro formato que el de Prettier haría pelear a las dos puertas.
const texto = await prettier.format(JSON.stringify(matriz), {
  ...((await prettier.resolveConfig(SALIDA)) ?? {}),
  filepath: SALIDA,
});

if (process.argv.includes('--verificar')) {
  let actual = '';
  try {
    actual = readFileSync(SALIDA, 'utf8');
  } catch {
    // Sin archivo: no está al día.
  }
  if (actual !== texto) {
    console.error(
      `✗ ${SALIDA} no está al día con los comandos. Regénéralo:\n` +
        '  node --conditions=react-server scripts/generar-matriz-de-permisos.mjs',
    );
    process.exit(1);
  }
  console.log(
    `✓ La matriz de permisos está al día: ${String(matriz.incluidas.length)} rutas de comando, ` +
      `${String(matriz.excluidas.length)} fuera con su razón.`,
  );
} else {
  writeFileSync(SALIDA, texto);
  console.log(
    `✓ ${SALIDA}: ${String(matriz.incluidas.length)} rutas de comando, ` +
      `${String(matriz.excluidas.length)} fuera con su razón.`,
  );
}
process.exit(0);
