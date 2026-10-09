#!/usr/bin/env node
/**
 * UNA BASE DESECHABLE EN ESTA MÁQUINA, con las cinco demos (bloque D de la 2.4).
 *
 *   node --conditions=react-server scripts/base-desechable.mjs subir
 *   node --conditions=react-server scripts/base-desechable.mjs entorno   # las variables del servidor
 *   node --conditions=react-server scripts/base-desechable.mjs bajar     # la apaga y la BORRA
 *
 * ── Por qué existe ───────────────────────────────────────────────────────────
 * La 2.4 separa lo que se prueba según lo que toca: lo que ESCRIBE un día de ventas
 * corre sobre las cinco demos; lo DESTRUCTIVO por naturaleza —dar de baja a alguien,
 * cambiar un PIN o el IVA, lo «permitido» de la matriz de permisos— corre contra una
 * base desechable, nunca contra la viva. En CI esa base es el Postgres de servicio de
 * cada trabajo. En una laptop sin Docker, `BASE-DE-PRUEBAS.md` proponía una rama de
 * Supabase, que cuesta dinero por hora y vive en el mismo proyecto que los negocios
 * reales. Esto es lo mismo sin ninguna de las dos cosas: un clúster de PostgreSQL
 * propio, en un directorio temporal, en un puerto que no es el de nadie, levantado con
 * los binarios que ya estén instalados (`initdb`, `pg_ctl`). Nadie más se conecta, y
 * `bajar` lo borra entero.
 *
 * ── Lo que NO hace, a propósito ──────────────────────────────────────────────
 * No lee la `DATABASE_URL` del `.env`, y QUITA `MORPHIQPOS_SUPABASE_PROJECT_REF` del
 * entorno antes de migrar: con ese valor puesto, `migrate` va al proyecto vinculado
 * —producción— por el CLI de Supabase (B.5 de la 2.4). Las migraciones corren dentro
 * de este proceso, con la URL local y nada más.
 *
 * Los secretos del servidor (`SESSION_SECRET`, `PIN_PEPPER`) son de usar y tirar, como
 * en el rastreo de CI: la pimienta con la que se siembran los PIN tiene que ser la del
 * servidor que los compara, y por eso `entorno` imprime las mismas.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PUERTO = Number(process.env['MORPHIQPOS_BASE_DESECHABLE_PUERTO'] ?? '5435');
const DIRECTORIO =
  process.env['MORPHIQPOS_BASE_DESECHABLE_DIR'] ?? join(tmpdir(), 'morphiqpos-base-desechable');
const USUARIO = 'morphiqpos';
const BASE = 'morphiqpos_desechable';
const URL_DESECHABLE = `postgres://${USUARIO}@localhost:${String(PUERTO)}/${BASE}`;

/** El entorno del servidor y de la siembra. Público a propósito: no abre nada vivo. */
export const ENTORNO_DESECHABLE = {
  DATABASE_URL: URL_DESECHABLE,
  ORGANIZACION:
    'demo-acople-tienda,demo-acople-cafeteria,demo-acople-restaurante,demo-acople-ferreteria,demo-acople-estetica',
  APP_URL: 'http://localhost:3200',
  SESSION_SECRET: 'base_desechable_local_firma_de_sesion_2026',
  PIN_PEPPER: 'base_desechable_local_pimienta_de_pin_2026',
  MORPHIQPOS_SUPABASE_PROJECT_REF: '',
  NODE_ENV: 'production',
  TZ: 'America/Mexico_City',
};

/** Dónde están `initdb` y `pg_ctl`: la variable, la instalación de Windows o el PATH. */
function binarios() {
  const declarado = process.env['MORPHIQPOS_PG_BIN'];
  if (declarado !== undefined && declarado !== '') return declarado;
  if (process.platform === 'win32') {
    const raiz = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(raiz)) {
      const versiones = readdirSync(raiz)
        .filter((v) => existsSync(join(raiz, v, 'bin', 'initdb.exe')))
        .sort((a, b) => Number(b) - Number(a));
      if (versiones[0] !== undefined) return join(raiz, versiones[0], 'bin');
    }
  }
  return '';
}

function correr(ejecutable, argumentos, opciones = {}) {
  const bin = binarios();
  const ruta = bin === '' ? ejecutable : join(bin, ejecutable);
  const resultado = spawnSync(ruta, argumentos, { encoding: 'utf8', ...opciones });
  if (resultado.error !== undefined) {
    throw new Error(
      `No se pudo ejecutar «${ruta}»: ${resultado.error.message}. ` +
        'Instala PostgreSQL o di dónde están sus binarios con MORPHIQPOS_PG_BIN.',
    );
  }
  return resultado;
}

function exigir(resultado, que) {
  if (resultado.status !== 0) {
    throw new Error(`${que} falló:\n${resultado.stderr || resultado.stdout}`);
  }
}

async function conCliente(base, fn) {
  // `pg` es dependencia de la capa de datos, no de la raíz: se resuelve desde allí.
  const { Client } = createRequire(new URL('../packages/data/package.json', import.meta.url))('pg');
  const cliente = new Client({
    connectionString: `postgres://${USUARIO}@localhost:${String(PUERTO)}/${base}`,
  });
  await cliente.connect();
  try {
    return await fn(cliente);
  } finally {
    await cliente.end();
  }
}

async function crearBaseYRol() {
  await conCliente('postgres', async (c) => {
    const hay = await c.query('select 1 from pg_database where datname = $1', [BASE]);
    if (hay.rowCount === 0) await c.query(`create database ${BASE}`);
  });
  await conCliente(BASE, async (c) => {
    // El rol de la aplicación, sin contraseña: nadie entra con él, sólo recibe los
    // `grant` de las migraciones. La misma forma que en CI.
    const hay = await c.query("select 1 from pg_roles where rolname = 'morphiqpos_app'");
    if (hay.rowCount === 0) await c.query('create role morphiqpos_app with login bypassrls');
  });
}

async function migrar() {
  for (const [clave, valor] of Object.entries(ENTORNO_DESECHABLE)) process.env[clave] = valor;
  delete process.env['MORPHIQPOS_SUPABASE_PROJECT_REF'];
  const ejecutor = await import('../packages/data/src/migraciones/ejecutor.ts');
  const cliente = await import('../packages/data/src/cliente.ts');
  try {
    const resultado = await ejecutor.migrar({ ensayo: false });
    console.log(
      `  migraciones: ${String(resultado.aplicadas.length)} aplicadas, ${String(resultado.yaEstaban)} ya estaban`,
    );
  } finally {
    await cliente.cerrarDb();
  }
}

async function demosQueFaltan() {
  const { DEMOS } = await import('../packages/contracts/src/negocios/index.ts');
  const existentes = await conCliente(BASE, async (c) =>
    (await c.query('select slug from organizaciones')).rows.map((f) => f.slug),
  );
  return DEMOS.filter((d) => !existentes.includes(d.slug));
}

function nodo(script, argumentos) {
  const resultado = spawnSync(
    process.execPath,
    ['--conditions=react-server', script, ...argumentos],
    { encoding: 'utf8', env: { ...process.env, ...ENTORNO_DESECHABLE } },
  );
  exigir(resultado, `${script} ${argumentos.join(' ')}`);
  return resultado.stdout;
}

async function darDeAltaLasDemos() {
  for (const demo of await demosQueFaltan()) {
    const giro = demo.slug.replace(/^demo-acople-/, '');
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
    nodo('packages/app/bin/bootstrap.mjs', [
      '--org',
      demo.slug,
      '--persona',
      'Demo',
      '--pin',
      '1234',
    ]);
    console.log(`  alta: ${demo.slug}`);
  }
  nodo('scripts/sembrar-demos.mjs', []);
  console.log('  las cinco demos, sembradas');
}

async function subir() {
  if (!existsSync(join(DIRECTORIO, 'PG_VERSION'))) {
    exigir(
      correr('initdb', [
        '-D',
        DIRECTORIO,
        '-U',
        USUARIO,
        '-A',
        'trust',
        '-E',
        'UTF8',
        '--no-locale',
      ]),
      'initdb',
    );
  }
  const estado = correr('pg_ctl', ['-D', DIRECTORIO, 'status']);
  if (estado.status !== 0) {
    exigir(
      correr('pg_ctl', [
        '-D',
        DIRECTORIO,
        '-o',
        `-p ${String(PUERTO)} -c listen_addresses=localhost`,
        '-l',
        join(DIRECTORIO, 'registro.log'),
        '-w',
        'start',
      ]),
      'pg_ctl start',
    );
  }
  await crearBaseYRol();
  await migrar();
  await darDeAltaLasDemos();
  console.log(`✓ Base desechable en ${URL_DESECHABLE} (directorio ${DIRECTORIO})`);
}

function bajar() {
  if (existsSync(join(DIRECTORIO, 'PG_VERSION'))) {
    correr('pg_ctl', ['-D', DIRECTORIO, '-m', 'fast', 'stop']);
  }
  rmSync(DIRECTORIO, { recursive: true, force: true });
  console.log(`✓ Base desechable apagada y borrada (${DIRECTORIO}).`);
}

const orden = process.argv[2];
if (orden === 'subir') await subir();
else if (orden === 'bajar') bajar();
else if (orden === 'entorno') {
  for (const [clave, valor] of Object.entries(ENTORNO_DESECHABLE)) console.log(`${clave}=${valor}`);
} else {
  console.error(
    'Uso: node --conditions=react-server scripts/base-desechable.mjs subir|entorno|bajar',
  );
  process.exitCode = 1;
}
