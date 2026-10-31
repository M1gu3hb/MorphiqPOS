#!/usr/bin/env node
/**
 * LA DEMO LOCAL EN LA RED (PAR-1, de DP-9.9 de POS Don Poncho): una base DESECHABLE con una de las
 * demostraciones del maestro, en esta máquina, para probar desde los teléfonos y la tablet de la
 * misma red wifi.
 *
 *   node --conditions=react-server scripts/demo-local.mjs preparar --base <url> [--negocio <demo>] [--ip <ip>] [--puerto 3300]
 *   node --conditions=react-server scripts/demo-local.mjs servir   --base <url> [--negocio <demo>] [--ip <ip>] [--puerto 3300]
 *
 * `--negocio` es el slug de una de las cinco demos de `packages/contracts/src/negocios` (por
 * omisión `demo-acople-restaurante`); cualquier otro se rechaza.
 *
 * `preparar` crea la base si no existe, le aplica las migraciones de ESTA rama (así se prueba
 * lo que todavía no está en la base compartida), da de alta la demo con su dueño «Demo» y la
 * siembra con su catálogo, sus mesas y su equipo —todo por los comandos de la aplicación, como en
 * la CI—. Es idempotente: correrlo otra vez deja la demo como recién sembrada.
 *
 * `servir` compila y levanta el servidor en `0.0.0.0:<puerto>` con `APP_URL=http://<ip>:<puerto>`:
 * los QR de las mesas y las imágenes del menú apuntan a esa dirección.
 *
 * ── Lo que NO hace, a propósito ───────────────────────────────────────────────
 * · Se niega con una base que no sea de esta máquina (`localhost` o `127.0.0.1`): nunca la
 *   compartida. Tampoco lee la `DATABASE_URL` del `.env`.
 * · Sus secretos (firma de sesión, pimienta de los PIN) se inventan la primera vez y se guardan
 *   FUERA del repositorio, en la carpeta temporal del usuario: no sirven en producción, y los de
 *   producción no sirven aquí. Los PIN son los de las demos (`equipo-demo.ts`, públicos: sólo
 *   abren las demos).
 * · Nunca toca un negocio que no sea una de las cinco demos.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEMOS } from '../packages/contracts/src/negocios/index.ts';
import { DUENO_DE_DEMO } from '../packages/contracts/src/negocios/equipo-demo.ts';

const accion = process.argv[2];
const argumento = (nombre, porOmision) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : (process.argv[i + 1] ?? porOmision);
};

const base = argumento('base', '');
const negocio = argumento('negocio', 'demo-acople-restaurante');
const puerto = argumento('puerto', '3300');
const ipDeLaRed = () =>
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i?.family === 'IPv4' && !i.internal)?.address ?? '127.0.0.1';
const ip = argumento('ip', ipDeLaRed());

if (!['preparar', 'servir'].includes(accion ?? '') || base === '') {
  console.error(
    'Uso: demo-local.mjs preparar|servir --base <postgres://…@127.0.0.1:…/base> [--ip <ip>] [--puerto 3300]',
  );
  process.exit(2);
}
const destino = new URL(base);
// `?host=` o `?hostaddr=` pisan el servidor de la URL en el driver: no se admiten (PAR-1).
if (
  !['localhost', '127.0.0.1'].includes(destino.hostname) ||
  destino.searchParams.has('host') ||
  destino.searchParams.has('hostaddr')
) {
  console.error(
    `✗ La demo sólo usa una base de ESTA máquina; «${destino.hostname}${destino.search}» no lo es.`,
  );
  process.exit(1);
}

const demo = DEMOS.find((d) => d.slug === negocio);
if (demo === undefined) {
  console.error(`✗ «${negocio}» no es una de las demos: ${DEMOS.map((d) => d.slug).join(', ')}.`);
  process.exit(1);
}
const giro = demo.slug.replace(/^demo-acople-/, '');

const CARPETA = join(tmpdir(), 'morphiqpos-demo-local');
const ARCHIVO_DE_SECRETOS = join(CARPETA, 'demo.json');

/** Los secretos de la demo: se inventan una vez y se reusan (los PIN se siembran con ellos). */
function secretosDeLaDemo() {
  mkdirSync(CARPETA, { recursive: true });
  if (existsSync(ARCHIVO_DE_SECRETOS)) return JSON.parse(readFileSync(ARCHIVO_DE_SECRETOS, 'utf8'));
  const secretos = {
    SESSION_SECRET: randomBytes(32).toString('hex'),
    PIN_PEPPER: randomBytes(32).toString('hex'),
  };
  writeFileSync(ARCHIVO_DE_SECRETOS, `${JSON.stringify(secretos, null, 2)}\n`);
  return secretos;
}

const secretos = secretosDeLaDemo();

/** El entorno de la demo: nada de él abre algo vivo. */
const ENTORNO = {
  DATABASE_URL: base,
  ORGANIZACION: demo.slug,
  APP_URL: `http://${ip}:${puerto}`,
  // También desde esta misma PC: sin esto, entrar por `localhost` se rechazaría como escritura de
  // otro origen.
  APP_URL_ALTERNAS: `http://localhost:${puerto}`,
  STORAGE_ENDPOINT: 'http://localhost:9000',
  STORAGE_BUCKET: 'morphiqpos',
  STORAGE_ACCESS_KEY: 'demo-local-sin-almacen',
  STORAGE_SECRET_KEY: 'demo-local-sin-almacen',
  SESSION_SECRET: secretos.SESSION_SECRET,
  PIN_PEPPER: secretos.PIN_PEPPER,
  MORPHIQPOS_SUPABASE_PROJECT_REF: '',
  NODE_ENV: 'production',
  TZ: 'America/Mexico_City',
};

function correr(comando, args, extra = {}) {
  const r = spawnSync(comando, args, {
    stdio: 'inherit',
    env: { ...process.env, ...ENTORNO, ...extra },
    shell: process.platform === 'win32' && comando === 'pnpm',
  });
  if (r.status !== 0) {
    console.error(`✗ ${comando} ${args.join(' ')} terminó con ${String(r.status)}.`);
    process.exit(r.status ?? 1);
  }
}
const nodo = (script, args) =>
  correr(process.execPath, ['--conditions=react-server', script, ...args]);

async function prepararLaBase() {
  const requerir = createRequire(join(process.cwd(), 'packages', 'data', 'package.json'));
  const { Client } = requerir('pg');
  const nombre = destino.pathname.replace(/^\//, '');
  const alServidor = new URL(base);
  alServidor.pathname = '/postgres';
  const c = new Client({ connectionString: alServidor.toString() });
  await c.connect();
  try {
    const hay = await c.query('select 1 from pg_database where datname = $1', [nombre]);
    if (hay.rowCount === 0) await c.query(`create database "${nombre.replaceAll('"', '')}"`);
  } finally {
    await c.end();
  }
  const enLaBase = new Client({ connectionString: base });
  await enLaBase.connect();
  try {
    const rol = await enLaBase.query("select 1 from pg_roles where rolname = 'morphiqpos_app'");
    if (rol.rowCount === 0) await enLaBase.query('create role morphiqpos_app with login bypassrls');
  } finally {
    await enLaBase.end();
  }
  for (const [clave, valor] of Object.entries(ENTORNO)) process.env[clave] = valor;
  const ejecutor = await import('../packages/data/src/migraciones/ejecutor.ts');
  const cliente = await import('../packages/data/src/cliente.ts');
  try {
    const r = await ejecutor.migrar({ ensayo: false });
    console.log(
      `✓ migraciones: ${String(r.aplicadas.length)} aplicadas, ${String(r.yaEstaban)} ya estaban`,
    );
  } finally {
    await cliente.cerrarDb();
  }
}

if (accion === 'preparar') {
  await prepararLaBase();
  nodo('packages/app/bin/alta-negocio.mjs', [
    '--slug',
    demo.slug,
    '--nombre',
    demo.nombre,
    '--giro',
    giro,
    '--paquete',
    giro,
  ]);
  const bootstrap = spawnSync(
    process.execPath,
    [
      '--conditions=react-server',
      'packages/app/bin/bootstrap.mjs',
      '--org',
      demo.slug,
      '--persona',
      DUENO_DE_DEMO.nombre,
    ],
    { stdio: 'inherit', env: { ...process.env, ...ENTORNO, MORPHIQPOS_PIN: DUENO_DE_DEMO.pin } },
  );
  if (bootstrap.status !== 0) console.log('  (el dueño de la demo ya existía: se conserva)');
  nodo('scripts/sembrar-demos.mjs', ['--solo', demo.slug]);
  console.log(`\n✓ Demo «${demo.nombre}» lista, con los PIN de las demos (equipo-demo.ts).`);
  console.log(
    `\n  Ahora: node --conditions=react-server scripts/demo-local.mjs servir --base <la misma> --negocio ${demo.slug} --ip ${ip}`,
  );
}

if (accion === 'servir') {
  correr('pnpm', ['turbo', 'run', 'build', '--filter=@morphiqpos/web']);
  console.log(`\n✓ Desde los teléfonos (misma wifi): http://${ip}:${puerto}/login-pos`);
  correr('pnpm', [
    '--filter',
    '@morphiqpos/web',
    'exec',
    'next',
    'start',
    '-H',
    '0.0.0.0',
    '-p',
    puerto,
  ]);
}
