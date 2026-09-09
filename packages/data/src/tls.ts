import 'server-only';

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ConnectionOptions } from 'node:tls';

/**
 * TLS de la conexión a Postgres.
 *
 * Supabase firma el certificado de su base y de su pooler con **su propia raíz**,
 * que no está en el almacén de CAs del sistema. Con la configuración por
 * omisión de `pg` la conexión falla con «self-signed certificate in certificate
 * chain», y la salida fácil —`rejectUnauthorized: false`— deja el canal cifrado
 * pero **sin autenticar**: cualquiera en la ruta puede presentarse como la base
 * y leer las ventas del cliente en claro.
 *
 * Así que se fija la raíz. El `.crt` va en el repositorio porque es público y
 * porque el servidor tiene que poder verificar sin descargar nada al arrancar.
 *
 * En Vercel el archivo tiene que viajar en el bundle: por eso se lee con una
 * ruta derivada de `import.meta.url` y no de `process.cwd()`, que en una
 * función serverless no es la raíz del proyecto.
 */

const RUTA_CA = join(
  dirname(fileURLToPath(import.meta.url)),
  'certificados',
  'supabase-root-2021.crt',
);

let raiz: string | undefined;

/** La raíz de Supabase, leída una sola vez. */
function raizSupabase(): string | undefined {
  if (raiz !== undefined) return raiz;
  try {
    raiz = readFileSync(RUTA_CA, 'utf8');
    return raiz;
  } catch {
    // Sin el archivo se prefiere fallar la verificación a desactivarla: una
    // conexión que no se puede autenticar no se abre a medias.
    return undefined;
  }
}

/**
 * Decide el TLS a partir de la cadena de conexión.
 *
 * Un Postgres local no tiene TLS y forzarlo rompería la prueba de portabilidad
 * que protege A-27 (poder instalarle su propio servidor a un cliente sin
 * internet). Cualquier host remoto se verifica contra la raíz de Supabase más
 * las del sistema, para que una base gestionada por otro proveedor tampoco
 * necesite tocar este archivo.
 */
export function tlsPara(cadena: string): ConnectionOptions | false {
  if (cadena.includes('localhost') || cadena.includes('127.0.0.1')) return false;

  const ca = raizSupabase();
  return {
    rejectUnauthorized: true,
    ...(ca === undefined ? {} : { ca }),
  };
}
