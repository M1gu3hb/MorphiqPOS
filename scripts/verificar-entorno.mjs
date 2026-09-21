#!/usr/bin/env node
/**
 * Verifica el contrato del entorno local (F1.0-T05).
 *
 * A-27 es la regla dura que este archivo protege: el backend completo debe poder
 * correr en la PC de un cliente, sin internet y sin cuenta de terceros. Si alguien
 * mete un servicio propietario o una imagen "latest" en el compose, aqui falla.
 *
 * La comprobacion EN VIVO tiene dos mitades y cada una corre cuando puede: el
 * ESQUEMA se prueba contra cualquier Postgres 17 ajeno (`DATABASE_URL_PRUEBAS`,
 * una rama del proyecto basta) y el EMPAQUETADO offline contra el compose. Lo
 * que no corre queda declarado, nunca silenciado, y se dice que mitad falta.
 *
 * Se ejecuta con: pnpm verify:entorno
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { parse } from 'yaml';

import { leerMigraciones } from '../packages/data/src/migraciones/lectura.ts';
import {
  cadenaDeVerificacion,
  consultarEn,
  referenciaDeLaCadena,
} from '../packages/data/src/verificacion/consulta-directa.ts';

const RAIZ = process.cwd();
const COMPOSE = join(RAIZ, 'infra', 'docker', 'docker-compose.yml');
const EJEMPLO = join(RAIZ, '.env.example');

/** Servicios que el entorno local debe ofrecer, con lo que se exige de cada uno. */
const SERVICIOS = {
  // Postgres 17 y no 16: el proyecto gestionado de Supabase (A-39) corre 17.6, y
  // la prueba de portabilidad sirve justo para eso — comprobar que el MISMO
  // esquema aplica igual en el Postgres de un cliente sin internet (A-27). Con
  // motores distintos a los dos lados, la prueba diria que si y no probaria nada:
  // `on delete set null (columna)`, que 004 usa en once restricciones, no existe
  // antes de Postgres 15.
  postgres: { imagen: /^postgres:17\./, sano: true, volumen: true },
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
const enVivo = [];

/** La clave de la excepcion, tal cual se escribe en el archivo de excepciones. */
const EXCEPCION_EN_VIVO = 'PUERTA verify:entorno/comprobacion-en-vivo';

/** Salto de linea, en cualquiera de las dos formas. */
const LINEAS = new RegExp(String.raw`
?
`);

/**
 * Si una comprobacion esta declarada como excepcion, con su motivo.
 *
 * Se exige que la fila traiga TEXTO en la columna del motivo: una excepcion sin
 * razon escrita es un permiso en blanco, y este archivo existe justamente para
 * que la razon quede contada en vez de escondida.
 */
function excepcionDeclarada(clave) {
  const archivo = join(RAIZ, 'docs', 'fase-2', 'EXCEPCIONES-COBERTURA.md');
  if (!existsSync(archivo)) return false;
  for (const linea of readFileSync(archivo, 'utf8').split(LINEAS)) {
    if (!linea.includes(clave)) continue;
    const columnas = linea.split('|').map((c) => c.trim());
    // clave | que no se comprueba | por que  → la ultima columna es el motivo
    if (columnas.length >= 4 && columnas[3].length > 40) return true;
  }
  return false;
}

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

// --- 7 · Comprobacion EN VIVO de A-27 ----------------------------------------
// Esta puerta imprimia «· pendiente: Docker no esta instalado» y salia en 0. Es
// decir: aprobaba A-27 —«el backend completo debe poder correr en la PC de un
// cliente»— sin haberlo probado NUNCA. Una puerta que aprueba declarando un
// chequeo sin hacer no es una puerta; es un mensaje que nadie lee.
//
// Y Docker no es la unica forma de probarlo, ni la principal. Lo que A-27 exige
// demostrar es que el esquema COMPLETO aplica en un Postgres 17 que no es el de
// la aplicacion. Eso se prueba con CUALQUIER Postgres 17 ajeno —una rama del
// proyecto de Supabase sirve, y es lo que usa `test:integracion`: ver
// docs/fase-2/BASE-DE-PRUEBAS.md—. Asi que hay dos comprobaciones, y cada una
// corre cuando puede:
//
//   A · EL ESQUEMA en un Postgres ajeno, por `DATABASE_URL_PRUEBAS`.
//   B · EL EMPAQUETADO offline, por `docker compose config`.
//
// Si ninguna de las dos pudo correr, hace falta la excepcion declarada. Si una
// corre, se dice cual y —esto importa— QUE MITAD sigue sin demostrarse.

/** Major de Postgres que el compose fija, para exigirselo a la base ajena. */
function majorDelCompose() {
  const imagen = String(servicios['postgres']?.image ?? '');
  const encontrado = /^postgres:(\d+)\./.exec(imagen);
  return encontrado === null ? undefined : Number(encontrado[1]);
}

const cadenaAjena = (process.env['DATABASE_URL_PRUEBAS'] ?? '').trim();
let esquemaComprobado = false;

if (cadenaAjena !== '') {
  const propia = cadenaDeVerificacion();
  const refAjena = referenciaDeLaCadena(cadenaAjena);
  const refPropia = propia === undefined ? undefined : referenciaDeLaCadena(propia);

  if (refAjena !== undefined && refAjena === refPropia) {
    // Leer la base de la APLICACION y llamarlo portabilidad es el mismo vicio que
    // declarar el chequeo sin hacerlo: pasaria siempre y no probaria nada.
    fallos.push(
      'DATABASE_URL_PRUEBAS apunta al MISMO proyecto que la aplicacion ' +
        `(${refAjena}). Eso no prueba portabilidad: apuntala a otro Postgres 17 ` +
        '—una rama basta, ver docs/fase-2/BASE-DE-PRUEBAS.md—.',
    );
  } else {
    try {
      const version = await consultarEn(cadenaAjena, 'select current_setting($1) as num', [
        'server_version_num',
      ]);
      const ledger = await consultarEn(
        cadenaAjena,
        'select count(*)::int as n from public._migraciones',
      );
      const major = Math.floor(Number(version.rows[0]?.num ?? 0) / 10_000);
      const exigido = majorDelCompose();
      const aplicadas = Number(ledger.rows[0]?.n ?? 0);
      const enDisco = leerMigraciones().length;

      if (exigido !== undefined && major !== exigido) {
        fallos.push(
          `la base de pruebas corre Postgres ${String(major)} y el compose fija ` +
            `${String(exigido)}. Con motores distintos la prueba diria que si sin probar nada.`,
        );
      } else if (aplicadas !== enDisco) {
        fallos.push(
          `la base de pruebas tiene ${String(aplicadas)} migracion(es) aplicadas y en disco hay ` +
            `${String(enDisco)}. Aplicalas ahi antes de correr esta puerta: ver ` +
            'docs/fase-2/BASE-DE-PRUEBAS.md.',
        );
      } else {
        esquemaComprobado = true;
        enVivo.push(
          `el esquema completo (${String(enDisco)} migraciones) esta aplicado en un Postgres ` +
            `${String(major)} AJENO al de la aplicacion`,
        );
      }
    } catch (error) {
      fallos.push(
        'no se pudo comprobar la base de pruebas · ' +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

const docker = spawnSync('docker', ['--version'], { encoding: 'utf8' });
const hayDocker = docker.error?.code !== 'ENOENT' && docker.status === 0;

if (hayDocker) {
  const valido = spawnSync('docker', ['compose', '-f', COMPOSE, 'config', '--quiet'], {
    encoding: 'utf8',
  });
  if (valido.status !== 0) {
    fallos.push(`docker compose config rechaza el archivo:\n${valido.stderr}`);
  } else {
    enVivo.push('el compose del entorno offline es valido para docker');
  }

  const motor = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (motor.status !== 0) {
    pendientes.push('el motor de contenedores no responde: la mitad del EMPAQUETADO no se levanto');
  }
}

if (!esquemaComprobado && !hayDocker) {
  // Ni base ajena ni compose. La excepcion se exige igual que en verify:cobertura:
  // si la fila esta, la puerta lo dice en voz alta y sigue; si no esta, falla.
  if (excepcionDeclarada(EXCEPCION_EN_VIVO)) {
    pendientes.push(
      'la comprobacion EN VIVO no se ejecuto: no hay base ajena en ' +
        'DATABASE_URL_PRUEBAS ni compose que validar. Esta DECLARADA en ' +
        `docs/fase-2/EXCEPCIONES-COBERTURA.md como "${EXCEPCION_EN_VIVO}". ` +
        'A-27 no esta demostrado por esta corrida',
    );
  } else {
    fallos.push(
      'la comprobacion en vivo no corrio y no esta declarada como excepcion. ' +
        'Apunta DATABASE_URL_PRUEBAS a un Postgres 17 con el esquema aplicado ' +
        '—una rama del proyecto basta: docs/fase-2/BASE-DE-PRUEBAS.md— o declara ' +
        `"${EXCEPCION_EN_VIVO}" en docs/fase-2/EXCEPCIONES-COBERTURA.md con su ` +
        'motivo. Lo que no vale es aprobar A-27 sin haberlo probado.',
    );
  }
} else if (!esquemaComprobado) {
  pendientes.push(
    'el ESQUEMA en un Postgres ajeno no se comprobo (falta DATABASE_URL_PRUEBAS): ' +
      'de A-27 solo esta demostrado el empaquetado',
  );
} else if (!hayDocker) {
  pendientes.push(
    'el EMPAQUETADO offline no se valido (no hay motor de contenedores en esta ' +
      'maquina): de A-27 esta demostrado que el esquema viaja, no que el paquete arranca',
  );
}

for (const linea of enVivo) console.log(`  · en vivo: ${linea}`);

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
