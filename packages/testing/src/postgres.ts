import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';

import { esDeUnProyectoIntocable } from '@morphiqpos/contracts/negocios';
import { Client } from 'pg';

/**
 * Arranque de Postgres para las pruebas de integracion (F1.0-T10).
 *
 * `13-PRUEBAS §2`: "Prohibido mockear la base de datos en pruebas de
 * integracion. Un mock no reproduce restricciones unicas, transacciones ni
 * carreras — que es exactamente lo que se esta probando."
 *
 * Tres formas de conseguir una base, en este orden:
 *
 *   1. `DATABASE_URL_PRUEBAS` en el entorno. Es lo que usa CI —donde Postgres
 *      viene como servicio del workflow— y es tambien la forma local
 *      recomendada: una RAMA del proyecto de Supabase, que es una base entera,
 *      aislada y desechable. Para nada de esto hace falta Docker.
 *   2. Un contenedor efimero, si hay Docker. Comodo cuando ya esta encendido.
 *   3. Nada. Y entonces **falla con un mensaje claro** (R12), que ahora explica
 *      la rama de Supabase en vez de pedir Docker.
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

/**
 * Comprueba que POSTGRES contesta, no que el puerto acepte.
 *
 * ── El defecto que esto arregla, medido en CI ──────────────────────────────
 * `aceptaConexiones` sólo abre un socket, y eso NO significa que la base esté
 * lista: el proxy de Docker publica el puerto en cuanto arranca el contenedor,
 * mientras Postgres todavía está inicializando su clúster. El primer `select`
 * que llega se encuentra la conexión cerrada, y el error que sale es
 * **«Connection terminated unexpectedly»** — que no se parece en nada a «la base
 * aún no está lista» y manda a buscar el fallo donde no está.
 *
 * Pasó exactamente así: en el CI del PR #1, los DOS PRIMEROS archivos de la
 * suite de integración fallaron con ese error y los TRES SIGUIENTES pasaron, con
 * `fileParallelism: false`, es decir en orden. No era una carrera entre pruebas:
 * era la base terminando de arrancar mientras las dos primeras ya consultaban.
 *
 * Un `select 1` de verdad es la única espera que no miente.
 */
async function postgresContesta(url: string, esperaMs: number): Promise<boolean> {
  const cliente = new Client({ connectionString: url, connectionTimeoutMillis: esperaMs });
  try {
    await cliente.connect();
    await cliente.query('select 1');
    return true;
  } catch {
    return false;
  } finally {
    // Un `end()` que lanza aquí no dice nada útil: si la conexión no se pudo
    // abrir, cerrarla tampoco. Lo que importa es no dejar el socket colgando.
    try {
      await cliente.end();
    } catch {
      /* nada que hacer */
    }
  }
}

/**
 * Espera a que la base conteste, sea local o REMOTA.
 *
 * ── El defecto que esto arregla, y lo que costó ────────────────────────
 * Sacaba el PUERTO de la URL y luego abría el socket contra `localhost`, siempre.
 * Con una `DATABASE_URL_PRUEBAS` remota —una base de Supabase, por ejemplo— el
 * puerto 5432 de esta máquina no tiene a nadie escuchando, así que la espera se
 * agotaba sin intentar ni una vez el `select 1` que sí habría funcionado, y el
 * mensaje que salía era «lDATABASE_URL_PRUEBAS apunta a … y ahí no contesta
 * ningún Postgres»: una acusación falsa contra la base.
 *
 * Cuatro reportes seguidos dijeron que estas pruebas necesitaban Docker. No lo
 * necesitaban: necesitaban que esta función mirara el host de la URL.
 */
async function esperarPostgres(url: string, limiteMs = 60_000): Promise<boolean> {
  const destino = new URL(url);
  const host = destino.hostname;
  const puerto = Number(destino.port || 5432);
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    // El socket primero porque es barato y falla rápido mientras nadie escucha;
    // el `select 1` después, que es el que de verdad dice «lista».
    if (await aceptaConexiones(host, puerto, 1_000)) {
      if (await postgresContesta(url, 2_000)) return true;
    }
    await new Promise((listo) => setTimeout(listo, 500));
  }
  return false;
}

/**
 * LA BASE DE LAS PRUEBAS NO PUEDE SER LA DE PRODUCCIÓN (bloque B.5 de la 2.4).
 *
 * `prepararPostgres` aceptaba CUALQUIER url, y las pruebas de integración hacen cosas
 * que en una base viva son un desastre: `archivos-cuota.integracion.test.ts` hace
 * `drop table cuotas_archivos`, que es una tabla real. Y con
 * `MORPHIQPOS_SUPABASE_PROJECT_REF` puesto, la migración de la corrida va al proyecto
 * vinculado (BASE-DE-PRUEBAS §2). Una url copiada del `.env` equivocado bastaba.
 *
 * Se niega si la url —o el proyecto vinculado— es el de producción
 * (`wyqmzhliurwyxuyxznpb`, por su host directo o por el usuario del pooler) o el de
 * otro cliente que esta base de código no toca. Una rama de Supabase tiene su PROPIA
 * referencia, así que la forma recomendada sigue pasando.
 */
export function exigirBaseDesechable(url: string, proyectoVinculado?: string): void {
  if (esDeUnProyectoIntocable(url)) {
    throw new Error(
      [
        'ALTO: DATABASE_URL_PRUEBAS apunta al proyecto de PRODUCCIÓN (o a uno intocable).',
        'Las pruebas de integración borran tablas y siembran datos: sólo corren contra una',
        'base DESECHABLE —una rama de Supabase, con su propia referencia, o un Postgres',
        'local—. Ver docs/fase-2/BASE-DE-PRUEBAS.md.',
      ].join('\n'),
    );
  }
  if (proyectoVinculado !== undefined && esDeUnProyectoIntocable(proyectoVinculado)) {
    throw new Error(
      [
        'ALTO: MORPHIQPOS_SUPABASE_PROJECT_REF es el proyecto de PRODUCCIÓN.',
        'Con esa variable puesta, la migración de la corrida iría a la base viva.',
        'Quítala del entorno para correr las pruebas de integración.',
      ].join('\n'),
    );
  }
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
  exigirBaseDesechable(delEntorno ?? '', process.env['MORPHIQPOS_SUPABASE_PROJECT_REF']);
  if (delEntorno !== undefined && delEntorno.length > 0) {
    if (await esperarPostgres(delEntorno, 30_000)) {
      return delEntorno;
    }
    throw new Error(
      `DATABASE_URL_PRUEBAS apunta a ${delEntorno.replace(/:[^:@]+@/, ':***@')} y ahi no ` +
        'contesta ningun Postgres en 30 s.',
    );
  }

  if (!hayDocker()) {
    throw new Error(
      [
        'No hay base de datos para las pruebas de integracion.',
        '',
        'La forma recomendada, y la que NO necesita Docker: una RAMA del proyecto',
        'de Supabase, que es una base entera, aislada y desechable.',
        '',
        '  supabase branches create pruebas --project-ref <ref-del-proyecto>',
        '  supabase branches get    pruebas --project-ref <ref-del-proyecto>',
        '',
        'De la salida se toma POSTGRES_URL y se le cambia el puerto 6543 por el',
        '5432 —el de sesion, que es el que admite DDL—. Despues, con esa url:',
        '',
        '  DATABASE_URL=<url> pnpm --filter @morphiqpos/data migrate',
        '  DATABASE_URL_PRUEBAS=<url> DATABASE_URL=<url> pnpm test:integracion',
        '',
        'Al terminar: supabase branches delete pruebas --project-ref <ref>.',
        'Cuesta centavos por hora y se borra entera, que es lo que hace la corrida',
        'efimera de verdad. Docker sirve si ya esta encendido, pero NO es requisito',
        'y nunca lo fue: cualquier Postgres 16+ alcanzable vale.',
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

  if (!(await esperarPostgres(URL_CONTENEDOR))) {
    spawnSync('docker', ['rm', '-f', CONTENEDOR], { stdio: 'ignore' });
    throw new Error('El Postgres del contenedor no contesto un «select 1» en 60 s.');
  }

  return URL_CONTENEDOR;
}

/** Apaga el contenedor efimero, si lo levantamos nosotros. */
export function detenerPostgres(): void {
  const delEntorno = process.env['DATABASE_URL_PRUEBAS'];
  if (delEntorno !== undefined && delEntorno.length > 0) return;
  spawnSync('docker', ['rm', '-f', CONTENEDOR], { stdio: 'ignore' });
}
