import 'server-only';

import type { Kysely } from 'kysely';

import type { Esquema } from '../esquema.ts';

/**
 * A qué negocio sirve este despliegue.
 *
 * Existe porque la pantalla de acceso enseña la lista de empleados ANTES de que
 * haya sesión, y alguien tiene que decir de qué organización son. Ese alguien
 * es el servidor: la organización NUNCA llega en un parámetro del cliente
 * (R16). Antes lo decía la terminal enrolada; ahora lo dice la configuración
 * del despliegue, y esto sólo la lee.
 */

export interface OrganizacionDelDespliegue {
  readonly organizacionId: string;
  readonly nombre: string;
  readonly slug: string;
}

export async function porSlug(
  db: Kysely<Esquema>,
  slug: string,
): Promise<OrganizacionDelDespliegue | null> {
  const fila = await db
    .selectFrom('organizaciones')
    .select(['id as organizacionId', 'nombre', 'slug'])
    .where('slug', '=', slug)
    .where('activa', '=', true)
    .executeTakeFirst();

  return fila ?? null;
}

/**
 * Las organizaciones activas, con tope.
 *
 * El tope es `2` a propósito: quien llama sólo necesita distinguir «hay una»
 * de «hay más de una». Traerlas todas para contarlas sería pedirle a la base
 * un trabajo que nadie va a mirar.
 */
export async function activas(
  db: Kysely<Esquema>,
  limite = 2,
): Promise<readonly OrganizacionDelDespliegue[]> {
  return db
    .selectFrom('organizaciones')
    .select(['id as organizacionId', 'nombre', 'slug'])
    .where('activa', '=', true)
    .orderBy('slug')
    .limit(limite)
    .execute();
}
