#!/usr/bin/env node
/**
 * Comprobacion EN VIVO de las cabeceras de seguridad (F1.0-T11).
 *
 * Las pruebas unitarias comprueban la politica; esto comprueba que Next
 * realmente la envia. Hacen falta las dos: una cadena correcta que nadie manda
 * no protege a nadie, y una respuesta sin cabecera no dice que directiva falta.
 *
 * Es el "smoke test" que pide el gate morphiq-prs §08.
 *
 * Uso:  node scripts/verificar-cabeceras.mjs [url]
 *       Por omision arranca el servidor de produccion en un puerto libre.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const WEB = join(RAIZ, 'apps', 'web');
const PUERTO = 3199;

/** Cabeceras exigidas y como se comprueba cada una. */
const EXIGIDAS = [
  {
    nombre: 'content-security-policy',
    valida: (v) => v.includes("frame-ancestors 'none'") && !/script-src[^;]*'unsafe-inline'/.test(v),
    porque: "CSP con nonce y sin 'unsafe-inline' en script-src (SEC-XSS)",
  },
  {
    nombre: 'x-content-type-options',
    valida: (v) => v.toLowerCase() === 'nosniff',
    porque: 'El navegador no adivina el tipo de un archivo (SEC-UPLOAD)',
  },
  {
    nombre: 'referrer-policy',
    valida: (v) => v.includes('strict-origin'),
    porque: 'Una URL de MorphiqPOS lleva ids de organizacion y de orden',
  },
  {
    nombre: 'permissions-policy',
    valida: (v) => v.includes('camera=()') && v.includes('geolocation=()'),
    porque: 'Un POS no necesita camara ni ubicacion por omision',
  },
  {
    nombre: 'x-frame-options',
    valida: (v) => v.toUpperCase() === 'DENY',
    porque: 'Defensa para navegadores que no entienden frame-ancestors',
  },
];

/** Cabeceras que NO deben aparecer. */
const PROHIBIDAS = [{ nombre: 'x-powered-by', porque: 'No se anuncia la version del framework' }];

async function esperarServidor(url, intentos = 60) {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const respuesta = await fetch(url, { redirect: 'manual' });
      if (respuesta.status > 0) return respuesta;
    } catch {
      // Todavia no levanta. Se reintenta; si nunca levanta, se avisa abajo.
    }
    await new Promise((listo) => setTimeout(listo, 500));
  }
  return null;
}

const urlExterna = process.argv[2];
let servidor = null;
let url = urlExterna;

if (!urlExterna) {
  // Se invoca el CLI de Next con node directamente, no el shim pnpm.cmd:
  // Node 20+ se niega a lanzar un .cmd sin shell, y usar shell concatena los
  // argumentos sin escaparlos (DEP0190). Asi no hace falta ninguno de los dos.
  const CLI_NEXT = join(WEB, 'node_modules', 'next', 'dist', 'bin', 'next');

  if (!existsSync(CLI_NEXT)) {
    console.error('✗ No se encontro el CLI de Next. Corre pnpm install primero.');
    process.exit(1);
  }

  if (!existsSync(join(WEB, '.next'))) {
    console.log('  compilando apps/web...');
    const build = spawnSync(process.execPath, [CLI_NEXT, 'build'], { cwd: WEB, stdio: 'inherit' });
    if (build.status !== 0) {
      console.error('✗ El build fallo; no se pueden comprobar las cabeceras.');
      process.exit(1);
    }
  }

  url = `http://localhost:${PUERTO}/estilos`;
  servidor = spawn(process.execPath, [CLI_NEXT, 'start', '-p', String(PUERTO)], {
    cwd: WEB,
    stdio: 'ignore',
  });
}

const respuesta = await esperarServidor(url);

function terminar(codigo) {
  if (servidor && !servidor.killed) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(servidor.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      servidor.kill('SIGTERM');
    }
  }
  process.exit(codigo);
}

if (!respuesta) {
  console.error(`✗ El servidor no respondio en ${url} tras 30 s.`);
  terminar(1);
}

const fallos = [];

for (const exigida of EXIGIDAS) {
  const valor = respuesta.headers.get(exigida.nombre);
  if (valor === null) {
    fallos.push(`Falta la cabecera "${exigida.nombre}". ${exigida.porque}`);
    continue;
  }
  if (!exigida.valida(valor)) {
    fallos.push(`"${exigida.nombre}" no cumple: ${exigida.porque}\n      valor: ${valor}`);
  }
}

for (const prohibida of PROHIBIDAS) {
  if (respuesta.headers.get(prohibida.nombre) !== null) {
    fallos.push(`La cabecera "${prohibida.nombre}" no deberia existir. ${prohibida.porque}`);
  }
}

// La politica puede estar perfecta y la aplicacion no funcionar: si Next no
// firma sus <script> con el nonce, el navegador los bloquea todos y la pagina
// se sirve pero no hidrata. Se ve bien en una captura y no responde a un clic.
const html = await respuesta.clone().text();
const scriptsDeNext = [...html.matchAll(/<script[^>]*src="\/_next\/[^"]*"[^>]*>/g)];

if (scriptsDeNext.length === 0) {
  fallos.push('La pagina no incluye ningun script de Next: no se puede comprobar el nonce.');
} else {
  const sinNonce = scriptsDeNext.filter((etiqueta) => !etiqueta[0].includes('nonce='));
  if (sinNonce.length > 0) {
    fallos.push(
      `${sinNonce.length} de ${scriptsDeNext.length} scripts de Next salen SIN nonce. ` +
        'La CSP los bloqueara y la pagina no hidratara: se vera bien y no respondera ' +
        'a un solo clic. Comprueba que el middleware pone la CSP tambien en las ' +
        'cabeceras de la peticion.',
    );
  }
}

// El nonce debe cambiar entre peticiones, o no sirve de nada.
const segunda = await fetch(url, { redirect: 'manual' });
const nonce = (texto) => /'nonce-([^']+)'/.exec(texto ?? '')?.[1];
const primero = nonce(respuesta.headers.get('content-security-policy'));
const siguiente = nonce(segunda.headers.get('content-security-policy'));

if (!primero || !siguiente) {
  fallos.push('La CSP no lleva nonce.');
} else if (primero === siguiente) {
  fallos.push('El nonce se repite entre peticiones: un nonce fijo equivale a no tener nonce.');
}

if (fallos.length > 0) {
  console.error('\n✗ Cabeceras de seguridad incompletas:\n');
  for (const fallo of fallos) console.error(`  · ${fallo}`);
  terminar(1);
}

console.log(`✓ Cabeceras de seguridad: ${EXIGIDAS.length} presentes y correctas, nonce por peticion.`);
terminar(0);
