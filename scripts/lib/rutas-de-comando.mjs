/**
 * LAS RUTAS DE COMANDO, sacadas del código (D.3 y D.4 de la 2.4).
 *
 * Cada `route.ts` que sirve UN comando por la tubería estándar —`manejadorDeComando(x)` o
 * `manejadorDeComandoConParametro(x, …)`— nombra su comando, y el comando declara sus
 * `roles`, sus `paquetes` y su `entrada` (`definirComando`). La matriz de permisos y la
 * prueba de aislamiento salen de aquí: una sola lectura del registro, no dos listas que
 * se desfasan.
 *
 * Las rutas que NO pasan por esa tubería —públicas, de sesión, las que validan su cuerpo
 * antes del comando o encadenan varios— vuelven en `excluidas` con su razón.
 *
 * Se corre con `node --conditions=react-server`: los comandos importan `server-only`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ_API = join('apps', 'web', 'app', 'api');

/**
 * `@morphiqpos/app/<x>` → su archivo, por el mapa `exports` del paquete. La raíz no
 * depende del paquete (sólo `apps/web`), así que se resuelve como lo resolvería él.
 */
const EXPORTS = JSON.parse(readFileSync(join('packages', 'app', 'package.json'), 'utf8')).exports;
export function archivoDelModulo(especificador) {
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

/**
 * `{ incluidas: [{ ruta, comando }], excluidas: [{ ruta, razon }] }`, en orden de ruta.
 * `comando` es el objeto que devuelve `definirComando`, con su `entrada` de zod.
 */
export async function rutasDeComando() {
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
    incluidas.push({ ruta: camino, comando });
  }
  return { incluidas, excluidas };
}
