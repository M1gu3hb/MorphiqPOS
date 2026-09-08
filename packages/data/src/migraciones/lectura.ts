import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lectura de migraciones del disco: nombre, orden y hash.
 *
 * Está separado de `ejecutor.ts` a propósito. Leer archivos y ordenarlos no
 * necesita una conexión a Postgres, y mientras las dos cosas vivían juntas la
 * prueba unitaria arrastraba `cliente.ts` —y con él `server-only`— al grafo de
 * módulos, sólo para comprobar que "010" va después de "002".
 *
 * Eso no era un detalle de empaquetado: `server-only` lanza fuera de un
 * contexto de servidor, así que la suite fallaba entera por una dependencia
 * que la prueba no usaba. Un módulo puro se prueba sin ceremonia.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

/** Nombre válido: `NNN_snake_case.sql`. El prefijo ordena. */
const NOMBRE = /^(\d{3})_([a-z0-9_]+)\.sql$/;

export interface Migracion {
  readonly version: number;
  readonly nombre: string;
  readonly archivo: string;
  readonly sql: string;
  readonly hash: string;
}

/**
 * Hash del contenido, normalizando saltos de línea.
 *
 * Sin normalizar, un `checkout` en Windows con `core.autocrlf` cambiaría el hash
 * de todas las migraciones y el ejecutor gritaría que fueron editadas.
 */
function hashDe(contenido: string): string {
  const normalizado = contenido.replaceAll('\r\n', '\n').trim();

  // FNV-1a de 64 bits. No es criptográfico y no necesita serlo: detecta una
  // edición accidental, no defiende contra quien ya puede escribir en el repo.
  let hash = 0xcbf2_9ce4_8422_2325n;
  const primo = 0x0000_0100_0000_01b3n;
  const mascara = 0xffff_ffff_ffff_ffffn;

  for (let i = 0; i < normalizado.length; i += 1) {
    hash = ((hash ^ BigInt(normalizado.charCodeAt(i))) * primo) & mascara;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Lee las migraciones del disco, ordenadas por versión. */
export function leerMigraciones(carpeta: string = join(AQUI, 'sql')): Migracion[] {
  const archivos = readdirSync(carpeta).filter((nombre) => nombre.endsWith('.sql'));
  const migraciones: Migracion[] = [];
  const vistas = new Map<number, string>();

  for (const archivo of archivos) {
    // Se leen los dos grupos y se comprueban juntos. La alternativa era
    // aseverar con `!`, y aquí eso sería aseverar sobre un índice de array: si
    // alguien cambiara la expresión regular y quitara un grupo, la aserción
    // seguiría compilando y `nombre` valdría `undefined` en tiempo de
    // ejecución. Comprobar es lo que hace que ese cambio se note.
    const coincidencia = NOMBRE.exec(archivo);
    const versionTexto = coincidencia?.[1];
    const nombreMigracion = coincidencia?.[2];
    if (versionTexto === undefined || nombreMigracion === undefined) {
      throw new Error(
        `Migración con nombre inválido: "${archivo}". El formato es NNN_snake_case.sql, ` +
          'y el prefijo numérico es lo que fija el orden de aplicación.',
      );
    }

    const version = Number.parseInt(versionTexto, 10);
    const previa = vistas.get(version);
    if (previa !== undefined) {
      throw new Error(
        `Dos migraciones comparten la versión ${version}: "${previa}" y "${archivo}". ` +
          'El orden pasaría a ser el del sistema de archivos, que cambia entre máquinas.',
      );
    }
    vistas.set(version, archivo);

    const contenido = readFileSync(join(carpeta, archivo), 'utf8');
    migraciones.push({
      version,
      nombre: nombreMigracion,
      archivo,
      sql: contenido,
      hash: hashDe(contenido),
    });
  }

  return migraciones.sort((a, b) => a.version - b.version);
}
