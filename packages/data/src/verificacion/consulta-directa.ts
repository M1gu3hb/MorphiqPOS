/**
 * Una consulta de sólo lectura contra la base viva, por conexión directa.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * `verificar-esquema-aplicado.mjs` y `verificar-rls.mjs` hablaban con la base
 * de UNA sola manera: lanzando `supabase db query` por `spawnSync`. Eso ata dos
 * puertas del proyecto a que en la máquina haya un ejecutable concreto del CLI
 * de Supabase, y en la máquina donde se hizo el acople no lo hay. Una puerta
 * que no se puede ejecutar no protege nada.
 *
 * Esto NO relaja ninguna comprobación: es el mismo SQL, contra la misma base,
 * leído del mismo catálogo. Cambia el transporte, no el contrato.
 *
 * ── Por qué el rol de la aplicación basta ───────────────────────────────────
 * Las dos consultas leen `pg_catalog`, que es legible por cualquier rol. Que
 * `morphiqpos_app` no pueda hacer DDL es deliberado y no estorba aquí: mirar
 * si una tabla tiene RLS forzada no requiere poder cambiarla. Al contrario —
 * que la puerta corra con el rol MENOS privilegiado es mejor, porque es el rol
 * que la aplicación usa de verdad.
 *
 * ── Lo que este archivo NO hace ─────────────────────────────────────────────
 * No escribe. No abre transacciones. No acepta parámetros interpolados: el SQL
 * llega entero desde quien llama, que siempre es un script del repositorio con
 * una consulta escrita a mano. Aquí nunca entra texto de un usuario.
 */
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { tlsPara } from '../tls.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * Lee el `.env` de la raíz sin depender de dotenv.
 *
 * Los scripts de verificación se ejecutan con el cwd en la raíz, pero no
 * siempre: `turbo` y `pnpm --filter` lo cambian. Resolver la ruta desde este
 * archivo hace que dé igual desde dónde se invoque.
 */
function entorno(clave: string): string | undefined {
  const delProceso = process.env[clave];
  if (delProceso !== undefined && delProceso !== '') return delProceso;

  for (const nombre of ['.env.local', '.env']) {
    const ruta = join(RAIZ, nombre);
    if (!existsSync(ruta)) continue;
    for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
      const limpia = linea.trim();
      if (limpia.length === 0 || limpia.startsWith('#')) continue;
      const corte = limpia.indexOf('=');
      if (corte === -1) continue;
      if (limpia.slice(0, corte).trim() !== clave) continue;
      const valor = limpia
        .slice(corte + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (valor !== '') return valor;
    }
  }
  return undefined;
}

/** La cadena de conexión que usan las verificaciones, o `undefined` si no hay. */
export function cadenaDeVerificacion(): string | undefined {
  return entorno('MORPHIQPOS_DB_VERIFICACION') ?? entorno('DATABASE_URL');
}

/**
 * Comprueba que la conexión apunta al proyecto esperado ANTES de consultar.
 *
 * `verificar-rls.mjs` clava la referencia `wyqmzhliurwyxuyxznpb` a propósito:
 * una puerta que aprueba mirando la base equivocada es peor que no tenerla.
 * Al cambiar de transporte había que conservar ese cerrojo, y aquí está: la
 * referencia del proyecto viaja en el nombre de usuario del pooler de Supabase
 * (`<rol>.<ref>`) y en el host de la conexión directa (`db.<ref>.supabase.co`).
 */
export function referenciaDeLaCadena(cadena: string): string | undefined {
  let url: URL;
  try {
    url = new URL(cadena);
  } catch {
    return undefined;
  }

  const porUsuario = /\.([a-z0-9]{20})$/.exec(decodeURIComponent(url.username));
  if (porUsuario !== null) return porUsuario[1];

  const porHost = /^db\.([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if (porHost !== null) return porHost[1];

  return undefined;
}

export interface OpcionesConsulta {
  /** Referencia de proyecto que la cadena DEBE tener. Si no coincide, lanza. */
  readonly proyectoEsperado?: string;
}

/**
 * Ejecuta `sql` y devuelve las filas. Cierra la conexión pase lo que pase.
 *
 * Devuelve la misma forma que `supabase db query --output-format json`
 * —`{ rows: [...] }`— para que quien lo use no tenga que saber de dónde vino.
 */
export async function consultarViva(
  sql: string,
  opciones: OpcionesConsulta = {},
): Promise<{ readonly rows: readonly Record<string, unknown>[] }> {
  const cadena = cadenaDeVerificacion();
  if (cadena === undefined) {
    throw new Error(
      'No hay conexión de verificación: define MORPHIQPOS_DB_VERIFICACION o DATABASE_URL.',
    );
  }

  const esperado = opciones.proyectoEsperado;
  if (esperado !== undefined) {
    const real = referenciaDeLaCadena(cadena);
    if (real !== esperado) {
      throw new Error(
        `Verificación cancelada: la cadena apunta a ${real ?? 'un destino irreconocible'} ` +
          `y debía apuntar a ${esperado}.`,
      );
    }
  }

  return consultarEn(cadena, sql);
}

/**
 * Lo mismo, contra una cadena que llega por argumento.
 *
 * `verificar-entorno.mjs` la necesita porque su base NO es la de la aplicación:
 * es un Postgres 17 ajeno donde se comprueba que el esquema completo aplica
 * (A-27). El transporte y el TLS son los mismos; lo único que cambia es a dónde
 * apunta, y eso es justamente el punto de esa puerta.
 *
 * Vive aquí, y no en el script, porque `pg` es una dependencia de este paquete:
 * un script de `scripts/` no puede resolverlo, y duplicar el TLS a mano sería la
 * manera de que un día uno de los dos lo baje sin que nadie lo note.
 */
export async function consultarEn(
  cadena: string,
  sql: string,
  valores: readonly unknown[] = [],
): Promise<{ readonly rows: readonly Record<string, unknown>[] }> {
  // El TLS sale de `tlsPara`, el MISMO que usa la aplicación: raíz de Supabase
  // fijada y `rejectUnauthorized: true`. Que esta conexión sólo lea catálogo no
  // es excusa para bajarlo — por ese canal viaja también la contraseña de la
  // base, y un canal cifrado pero sin autenticar se lo entrega a cualquiera que
  // esté en la ruta.
  const cliente = new pg.Client({
    connectionString: cadena,
    ssl: tlsPara(cadena),
    statement_timeout: 60_000,
  });

  await cliente.connect();
  try {
    const resultado = await cliente.query(sql, [...valores]);
    return { rows: resultado.rows as readonly Record<string, unknown>[] };
  } finally {
    await cliente.end();
  }
}
