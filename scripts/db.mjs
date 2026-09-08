#!/usr/bin/env node
/**
 * Gobierna el entorno local de datos (F1.0-T05).
 *
 *   node scripts/db.mjs up       levanta Postgres y el almacenamiento
 *   node scripts/db.mjs down     los apaga, conservando los datos
 *   node scripts/db.mjs reset    los apaga, BORRA los volumenes y relevanta
 *   node scripts/db.mjs logs     registros en vivo
 *   node scripts/db.mjs estado   que hay levantado
 *   node scripts/db.mjs migrate  aplica las migraciones      (necesita packages/data)
 *   node scripts/db.mjs seed     siembra datos de ejemplo    (necesita packages/data)
 *
 * R12 — ningun error critico se silencia. Si Docker no esta, si un contenedor no
 * llega a sano, o si falta la capa de datos, este script lo dice y devuelve
 * codigo distinto de cero. Nunca finge exito.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const COMPOSE = join(RAIZ, 'infra', 'docker', 'docker-compose.yml');
const DATA = join(RAIZ, 'packages', 'data');

/**
 * Ejecuta un comando heredando la consola. Devuelve el codigo de salida.
 *
 * Sin `shell: true`: en Windows eso concatena los argumentos sin escaparlos
 * (DEP0190). `docker` y `git` son ejecutables reales y se resuelven solos.
 * Los shims .cmd de Windows se manejan aparte, en `correrShim`.
 */
function correr(comando, argumentos, opciones = {}) {
  const resultado = spawnSync(comando, argumentos, {
    stdio: 'inherit',
    cwd: RAIZ,
    ...opciones,
  });
  if (resultado.error) {
    if (resultado.error.code === 'ENOENT') return 127;
    throw resultado.error;
  }
  return resultado.status ?? 1;
}

/**
 * Ejecuta un shim de Windows (.cmd), que spawn no puede lanzar directamente.
 * Se usa solo con argumentos constantes escritos en este archivo: aqui nunca
 * entra texto del usuario, asi que la concatenacion del shell no es una via de
 * inyeccion.
 */
function correrShim(comando, argumentos) {
  const esWindows = process.platform === 'win32';
  return correr(esWindows ? `${comando}.cmd` : comando, argumentos, { shell: false });
}

/** Comprueba que Docker esta instalado y su motor responde. */
function exigirDocker() {
  const version = spawnSync('docker', ['--version'], { encoding: 'utf8' });

  if (version.error?.code === 'ENOENT' || version.status !== 0) {
    console.error('✗ Docker no esta instalado o no esta en el PATH.');
    console.error('');
    console.error('  El entorno local de MorphiqPOS corre sobre Docker: es el');
    console.error('  requisito A-27 (el backend completo debe poder correr en la');
    console.error('  PC de un cliente, sin internet).');
    console.error('');
    console.error('  Instala Docker Desktop y, en Settings > Resources > Advanced,');
    console.error('  mueve "Disk image location" al disco D.');
    process.exit(2);
  }

  const motor = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });

  if (motor.status !== 0) {
    console.error('✗ Docker esta instalado pero el motor no responde.');
    console.error('  Abre Docker Desktop y espera a que diga "Engine running".');
    process.exit(2);
  }

  console.log(`  Docker ${version.stdout.trim()} · motor ${motor.stdout.trim()}`);
}

function compose(...argumentos) {
  return correr('docker', ['compose', '-f', COMPOSE, ...argumentos]);
}

/** Espera a que todos los servicios con healthcheck esten sanos. */
function esperarSanos() {
  const LIMITE_MS = 120_000;
  const INTERVALO_MS = 2_000;
  const SERVICIOS = ['postgres', 'almacenamiento'];
  const inicio = Date.now();

  process.stdout.write('  esperando a que los servicios esten sanos');

  for (;;) {
    const pendientes = SERVICIOS.filter((servicio) => {
      const id = spawnSync('docker', ['compose', '-f', COMPOSE, 'ps', '-q', servicio], {
        encoding: 'utf8',
      });
      const contenedor = id.stdout.trim();
      if (contenedor.length === 0) return true;

      const salud = spawnSync('docker', ['inspect', '-f', '{{.State.Health.Status}}', contenedor], {
        encoding: 'utf8',
      });
      return salud.stdout.trim() !== 'healthy';
    });

    if (pendientes.length === 0) {
      process.stdout.write(' listo\n');
      return;
    }

    if (Date.now() - inicio > LIMITE_MS) {
      process.stdout.write('\n');
      console.error(`✗ Tras 120 s siguen sin estar sanos: ${pendientes.join(', ')}`);
      console.error('  Revisa los registros con: pnpm db:logs');
      process.exit(1);
    }

    process.stdout.write('.');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, INTERVALO_MS);
  }
}

/** Delega en packages/data, que todavia no existe en F1.0. */
function delegarEnData(tarea) {
  if (!existsSync(join(DATA, 'package.json'))) {
    console.error(`✗ "${tarea}" necesita packages/data, que llega en F1.1.`);
    console.error('  El ejecutor de migraciones esta decidido en docs/adr/0001-acceso-postgres.md');
    console.error('  (Kysely con proveedor de archivos .sql). Todavia no hay ninguna migracion.');
    process.exit(3);
  }
  process.exit(correrShim('pnpm', ['--filter', '@morphiqpos/data', tarea]));
}

const accion = process.argv[2] ?? 'ayuda';

switch (accion) {
  case 'up': {
    exigirDocker();
    const codigo = compose('up', '-d', '--wait');
    if (codigo !== 0) process.exit(codigo);
    esperarSanos();
    console.log('✓ Entorno local levantado.');
    console.log('  Postgres        localhost:5433');
    console.log('  Almacenamiento  localhost:9000 · consola en localhost:9001');
    break;
  }

  case 'down':
    exigirDocker();
    process.exit(compose('down'));
    break;

  case 'reset': {
    exigirDocker();
    console.log('  Borrando volumenes: se pierden TODOS los datos locales.');
    compose('down', '-v');
    const codigo = compose('up', '-d', '--wait');
    if (codigo !== 0) process.exit(codigo);
    esperarSanos();
    console.log('✓ Entorno local reiniciado desde cero.');
    break;
  }

  case 'logs':
    exigirDocker();
    process.exit(compose('logs', '-f', '--tail', '100'));
    break;

  case 'estado':
    exigirDocker();
    process.exit(compose('ps'));
    break;

  case 'migrate':
    delegarEnData('migrate');
    break;

  case 'seed':
    delegarEnData('seed');
    break;

  default:
    console.log('Uso: node scripts/db.mjs <up|down|reset|logs|estado|migrate|seed>');
    process.exit(accion === 'ayuda' ? 0 : 1);
}
