#!/usr/bin/env node
/**
 * Verifica el contrato del entorno local (F1.0-T05).
 *
 * A-27 es la regla dura que este archivo protege: el backend completo debe poder
 * correr en la PC de un cliente, sin internet y sin cuenta de terceros. Si alguien
 * mete un servicio propietario o una imagen "latest" en el compose, aqui falla.
 *
 * Las comprobaciones en vivo (levantar y conectarse) se activan solas cuando
 * Docker este instalado. Mientras tanto quedan declaradas como pendientes, nunca
 * silenciadas.
 *
 * Se ejecuta con: pnpm verify:entorno
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parse } from 'yaml';

const RAIZ = process.cwd();
const COMPOSE = join(RAIZ, 'infra', 'docker', 'docker-compose.yml');
const EJEMPLO = join(RAIZ, '.env.example');

/** Servicios que el entorno local debe ofrecer, con lo que se exige de cada uno. */
const SERVICIOS = {
  postgres: { imagen: /^postgres:16\./, sano: true, volumen: true },
  almacenamiento: { imagen: /^minio\/minio:RELEASE\./, sano: true, volumen: true },
};

/** Registros de imagen permitidos: publicos, sin cuenta, sin lock-in (A-27, R7). */
const REGISTROS_PERMITIDOS = [/^postgres:/, /^minio\/minio:/, /^minio\/mc:/];

/** Variables que .env.example debe declarar. Sale de 04-ARQUITECTURA §8. */
const VARIABLES = [
  'DATABASE_URL',
  'STORAGE_ENDPOINT',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'SESSION_SECRET',
  'PIN_PEPPER',
  'APP_URL',
  'NODE_ENV',
];

const fallos = [];
const pendientes = [];

function comprobar(condicion, mensaje) {
  if (!condicion) fallos.push(mensaje);
}

// --- 1 · El compose existe y es YAML valido ---------------------------------
if (!existsSync(COMPOSE)) {
  console.error('✗ Falta infra/docker/docker-compose.yml');
  process.exit(1);
}

const compose = parse(readFileSync(COMPOSE, 'utf8'));
const servicios = compose.services ?? {};

// --- 2 · Estan los servicios exigidos, con imagen fijada y healthcheck ------
for (const [nombre, exigencias] of Object.entries(SERVICIOS)) {
  const servicio = servicios[nombre];
  if (!servicio) {
    fallos.push(`El compose no declara el servicio "${nombre}"`);
    continue;
  }

  const imagen = String(servicio.image ?? '');
  if (!exigencias.imagen.test(imagen)) {
    fallos.push(`"${nombre}": la imagen "${imagen}" no cumple ${exigencias.imagen}`);
  }

  if (exigencias.sano && !servicio.healthcheck) {
    fallos.push(
      `"${nombre}": sin healthcheck. Sin el, "docker compose up" devuelve exito ` +
        'antes de que el servicio acepte conexiones y las pruebas fallan al azar',
    );
  }

  if (exigencias.volumen) {
    const volumenes = servicio.volumes ?? [];
    comprobar(volumenes.length > 0, `"${nombre}": sin volumen, los datos se pierden al apagar`);
  }
}

// --- 3 · Ninguna imagen movil, ningun registro que exija cuenta -------------
// gate morphiq-prs §20: build reproducible. "latest" no es una version.
for (const [nombre, servicio] of Object.entries(servicios)) {
  const imagen = String(servicio.image ?? '');
  if (imagen.length === 0) continue;

  if (!imagen.includes(':') || /:latest$/.test(imagen) || /:\d+$/.test(imagen)) {
    fallos.push(`"${nombre}": la imagen "${imagen}" no esta fijada a una version exacta`);
  }

  if (!REGISTROS_PERMITIDOS.some((permitido) => permitido.test(imagen))) {
    fallos.push(
      `"${nombre}": la imagen "${imagen}" no esta en la lista de registros permitidos. ` +
        'A-27 exige que todo corra sin cuenta de terceros',
    );
  }
}

// --- 4 · Los volumenes con nombre existen ------------------------------------
comprobar(
  Object.keys(compose.volumes ?? {}).length >= 2,
  'El compose debe declarar volumenes con nombre para Postgres y el almacenamiento',
);

// --- 5 · .env.example completo y sin secretos reales -------------------------
if (!existsSync(EJEMPLO)) {
  fallos.push('Falta .env.example (R31: versionado y completo, sin valores reales)');
} else {
  const texto = readFileSync(EJEMPLO, 'utf8');
  const declaradas = new Set(
    texto
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0 && !linea.startsWith('#'))
      .map((linea) => linea.split('=')[0]?.trim())
      .filter((nombre) => typeof nombre === 'string' && nombre.length > 0),
  );

  for (const variable of VARIABLES) {
    comprobar(declaradas.has(variable), `.env.example no declara ${variable}`);
  }

  // Los valores de los dos secretos deben ser marcadores, no algo que parezca real.
  for (const secreto of ['SESSION_SECRET', 'PIN_PEPPER']) {
    const linea = texto.split(/\r?\n/).find((l) => l.startsWith(`${secreto}=`)) ?? '';
    const valor = linea.slice(secreto.length + 1);
    comprobar(
      valor.includes('cambia-esto'),
      `.env.example: ${secreto} debe traer un marcador obvio, no un valor que parezca real (R31)`,
    );
  }
}

// --- 6 · .env ignorado por git ------------------------------------------------
const ignorado = spawnSync('git', ['check-ignore', '-q', '.env'], { cwd: RAIZ });
comprobar(ignorado.status === 0, '.env NO esta ignorado por git (R31)');

// --- 7 · Comprobacion en vivo, si hay Docker ---------------------------------
const docker = spawnSync('docker', ['--version'], {
  encoding: 'utf8',
});

if (docker.error?.code === 'ENOENT' || docker.status !== 0) {
  pendientes.push(
    'Docker no esta instalado: la comprobacion en vivo (levantar y conectarse) ' +
      'queda PENDIENTE. F1.0-T05 no se puede firmar hasta ejecutarla',
  );
} else {
  const valido = spawnSync('docker', ['compose', '-f', COMPOSE, 'config', '--quiet'], {
    encoding: 'utf8',
  });
  if (valido.status !== 0) {
    fallos.push(`docker compose config rechaza el archivo:\n${valido.stderr}`);
  }

  const motor = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (motor.status !== 0) {
    pendientes.push('Docker instalado pero el motor no responde: abre Docker Desktop');
  }
}

for (const pendiente of pendientes) console.log(`  · pendiente: ${pendiente}`);

if (fallos.length > 0) {
  console.error('\n✗ El contrato del entorno local no se cumple:\n');
  for (const fallo of fallos) console.error(`  · ${fallo}`);
  console.error(`\n${fallos.length} fallo(s).`);
  process.exit(1);
}

console.log(
  `✓ Entorno local: ${Object.keys(servicios).length} servicios, imagenes fijadas, ` +
    `${VARIABLES.length} variables declaradas.`,
);
