import 'server-only';

import type { ConnectionOptions } from 'node:tls';

import { RAIZ_SUPABASE } from './certificados/supabase-root-2021.ts';

/**
 * TLS de la conexión a Postgres.
 *
 * Supabase firma el certificado de su base y de su pooler con **su propia
 * raíz**, que no está en el almacén de CAs del sistema. Con la configuración
 * por omisión de `pg` la conexión falla con «self-signed certificate in
 * certificate chain», y la salida fácil —`rejectUnauthorized: false`— deja el
 * canal cifrado pero **sin autenticar**: cualquiera en la ruta puede
 * presentarse como la base y leer las ventas del cliente en claro.
 *
 * Así que se fija la raíz, y va embebida en el código en vez de leerse del
 * disco: ver el comentario de `certificados/supabase-root-2021.ts`.
 */

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
  return { rejectUnauthorized: true, ca: RAIZ_SUPABASE };
}
