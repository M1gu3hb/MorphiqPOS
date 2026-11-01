/**
 * Lo que comparten los guiones de la mudanza (`exportar-negocio.mjs`, `importar-negocio.mjs`):
 * el `.env` y los argumentos. Viene de POS Don Poncho (DP-5h), sin lo que sólo usaban sus
 * guiones del menú.
 */
import { existsSync, readFileSync } from 'node:fs';

/** El `.env` de la raíz, sin pisar lo que ya trae el entorno. */
export function cargarEntorno() {
  for (const linea of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split('\n')) {
    const encontrado = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linea.trim());
    if (encontrado !== null && process.env[encontrado[1]] === undefined) {
      process.env[encontrado[1]] = encontrado[2].replace(/^["']|["']$/g, '');
    }
  }
  process.env['MORPHIQPOS_DB_POOL_MAX'] ??= '3';
}

/**
 * Un archivo de entorno explícito (`--entorno ..\_PRIVADO\fase-a.env`): PISA lo que traiga el
 * entorno, porque es justo lo que se pidió (una `DATABASE_URL` vieja exportada en la terminal no
 * gana). Tolera BOM, CRLF y comillas. Lanza si el archivo no existe. No imprime nada de él.
 */
export function cargarArchivoDeEntorno(ruta) {
  if (!existsSync(ruta)) throw new Error(`No existe el archivo de entorno ${ruta}.`);
  for (const linea of readFileSync(ruta, 'utf8')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)) {
    const par = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (par !== null) process.env[par[1]] = par[2].replace(/^["']|["']$/g, '');
  }
}

/** `--nombre valor` de la línea de comandos, o `porOmision`. */
export function argumento(nombre, porOmision = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : (process.argv[i + 1] ?? porOmision);
}
