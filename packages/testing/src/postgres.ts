import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';

/**
 * Arranque de Postgres para las pruebas de integracion (F1.0-T10).
 *
 * `13-PRUEBAS §2`: "Prohibido mockear la base de datos en pruebas de
 * integracion. Un mock no reproduce restricciones unicas, transacciones ni
 * carreras — que es exactamente lo que se esta probando."
 *
 * Tres formas de conseguir una base, en este orden:
 *
 *   1. `DATABASE_URL_PRUEBAS` en el entorno. Es lo que usa CI, donde Postgres
 *      viene como servicio del workflow.
 *   2. Un contenedor efimero, si hay Docker. Es lo que se usa en local.
 *   3. Nada. Y entonces **falla con un mensaje claro** (R12).
 *
 * El punto 3 importa mas de lo que parece. Lo facil seria saltarse las pruebas
 * de integracion cuando no hay base, y entonces la suite sale verde sin haber
 * probado la mitad que mas riesgo tiene. Aqui no: si no hay base, no hay verde.
 */

const IMAGEN = 'postgres:16.15-alpine';
const CONTENEDOR = 'morphiqpos-pruebas';
const PUERTO = 5434;
const USUARIO = 'morphiqpos';
const CLAVE = 'morphiqpos_pruebas';
const BASE = 'morphiqpos_pruebas';

export const URL_CONTENEDOR = `postgres://${USUARIO}:${CLAVE}@localhost:${PUERTO}/${BASE}`;

function hayDocker(): boolean {
  const resultado = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  return resultado.status === 0;
}

/** Comprueba que algo acepta conexiones en ese puerto. */
function aceptaConexiones(host: string, puerto: number, esperaMs: number): Promise<boolean> {
  return new Promise((resolver) => {
    const socket = connect({ host, port: puerto });
    const cerrar = (resultado: boolean) => {
      socket.destroy();
      resolver(resultado);
    };
    socket.setTimeout(esperaMs);
    socket.once('connect', () => {
      cerrar(true);
    });
    socket.once('timeout', () => {
      cerrar(false);
    });
    socket.once('error', () => {
      cerrar(false);
    });
  });
}

async function esperarPostgres(puerto: number, limiteMs = 60_000): Promise<boolean> {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    if (await aceptaConexiones('localhost', puerto, 1_000)) return true;
    await new Promise((listo) => setTimeout(listo, 500));
  }
  return false;
}

/**
 * Devuelve la URL de una base lista para pruebas, o lanza explicando por que no.
 *
 * El contenedor se levanta con `--tmpfs /var/lib/postgresql/data`: los datos
 * viven en memoria y desaparecen al pararlo. Es lo que hace que la corrida sea
 * efimera de verdad y no arrastre estado de la anterior — la clase de suciedad
 * que hace que una prueba pase sola y falle en grupo.
 */
export async function prepararPostgres(): Promise<string> {
  const delEntorno = process.env['DATABASE_URL_PRUEBAS'];
  if (delEntorno !== undefined && delEntorno.length > 0) {
    if (await esperarPostgres(Number(new URL(delEntorno).port || 5432), 30_000)) {
      return delEntorno;
    }
    throw new Error(`DATABASE_URL_PRUEBAS apunta a ${delEntorno} pero ahi no responde nadie.`);
  }

  if (!hayDocker()) {
    throw new Error(
      [
        'No hay base de datos para las pruebas de integracion.',
        '',
        'Opciones:',
        '  · Levanta Docker Desktop y vuelve a correr. Se crea un contenedor efimero.',
        '  · O exporta DATABASE_URL_PRUEBAS apuntando a un Postgres 16 de usar y tirar.',
        '',
        'Estas pruebas NO se saltan cuando falta la base: son la mitad de la piramide',
        'que mas riesgo cubre —transacciones, restricciones unicas y carreras— y una',
        'suite verde sin ellas da una seguridad que no existe (13-PRUEBAS §2).',
      ].join('\n'),
    );
  }

  spawnSync('docker', ['rm', '-f', CONTENEDOR], { stdio: 'ignore' });

  const arranque = spawnSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      CONTENEDOR,
      '--publish',
      `${PUERTO}:5432`,
      '--env',
      `POSTGRES_USER=${USUARIO}`,
      '--env',
      `POSTGRES_PASSWORD=${CLAVE}`,
      '--env',
      `POSTGRES_DB=${BASE}`,
      // Datos en memoria: la corrida es efimera de verdad.
      '--tmpfs',
      '/var/lib/postgresql/data',
      IMAGEN,
    ],
    { encoding: 'utf8' },
  );

  if (arranque.status !== 0) {
    throw new Error(`No se pudo levantar el contenedor de pruebas:\n${arranque.stderr}`);
  }

  if (!(await esperarPostgres(PUERTO))) {
    spawnSync('docker', ['rm', '-f', CONTENEDOR], { stdio: 'ignore' });
    throw new Error('El contenedor de Postgres no acepto conexiones en 60 s.');
  }

  return URL_CONTENEDOR;
}

/** Apaga el contenedor efimero, si lo levantamos nosotros. */
export function detenerPostgres(): void {
  const delEntorno = process.env['DATABASE_URL_PRUEBAS'];
  if (delEntorno !== undefined && delEntorno.length > 0) return;
  spawnSync('docker', ['rm', '-f', CONTENEDOR], { stdio: 'ignore' });
}
