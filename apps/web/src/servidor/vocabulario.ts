import 'server-only';

import { terminosDeLaOrganizacion } from '@morphiqpos/app/configuracion';

import { sesionDelServidor } from './http';
import type { TerminosSerializados } from '~/cliente/vocabulario';

/**
 * F-017 · Los términos del negocio, para un envoltorio de servidor.
 *
 * ── Por qué falla en silencio ──────────────────────────────────────────────
 * Devuelve `null` si no hay sesión o si la lectura revienta, y el proveedor
 * cae al vocabulario neutro. Es deliberado: el vocabulario NO autoriza nada,
 * sólo nombra. Tumbar el marco entero de la aplicación porque no se pudo leer
 * cómo se llama una mesa sería cambiar un problema cosmético por una pantalla
 * en blanco, y la pantalla en blanco es la que impide cobrar.
 *
 * Lo que sí autoriza —qué comandos existen, qué módulos hay— pasa por
 * `comando()` y falla CERRADO, como debe.
 */
export async function terminosDelServidor(): Promise<TerminosSerializados | null> {
  const sesion = await sesionDelServidor();
  if (sesion === null) return null;

  try {
    return await terminosDeLaOrganizacion(sesion.organizacionId);
  } catch {
    return null;
  }
}
