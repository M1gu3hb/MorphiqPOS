import 'server-only';

import type { Transaccion } from '../cliente.ts';

/**
 * F-017 · El vocabulario que un negocio cambió a mano.
 *
 * ── Qué vive aquí y qué vive en el código ──────────────────────────────────
 * El diccionario del GIRO vive en `packages/domain/src/vocabulario`: es la misma
 * decisión de producto para los 78 modelos y tiene que poder corregirse con un
 * despliegue, no negocio por negocio. Lo que vive en esta tabla son las
 * EXCEPCIONES: que Doña Meche llame «tablón» a lo que el sistema llama «mesa».
 *
 * ── Por qué esto también faltaba ───────────────────────────────────────────
 * `crearVocabulario()` acepta un parámetro `personalizado` desde el primer día
 * y **nadie se lo pasaba nunca**, porque no existía quien leyera la tabla. El
 * diccionario del giro funcionaba y la personalización era un hueco: tres
 * modelos la pidieron por su nombre y ninguno la tenía.
 */

export interface TerminoGuardado {
  readonly entidad: string;
  readonly singular: string;
  readonly plural: string;
  readonly genero: string;
}

/** Lo que este negocio cambió. Vacío es la respuesta normal, no un error. */
export async function leerVocabulario(
  tx: Transaccion,
  organizacionId: string,
): Promise<readonly TerminoGuardado[]> {
  const filas = await tx
    .selectFrom('vocabulario_negocio')
    .select(['entidad', 'singular', 'plural', 'genero'])
    .where('organizacion_id', '=', organizacionId)
    .orderBy('entidad')
    .execute();

  return filas.map((f) => ({
    entidad: f.entidad,
    singular: f.singular,
    plural: f.plural,
    genero: f.genero,
  }));
}

export interface DatosDeTermino {
  readonly organizacionId: string;
  readonly entidad: string;
  readonly singular: string;
  readonly plural: string;
  readonly genero: string;
  readonly empleadoId: string;
  readonly ahora: Date;
}

/**
 * Fija el término de una entidad para este negocio.
 *
 * Singular, plural **y género**, los tres juntos y siempre. El género no se
 * deduce de la terminación porque no se puede: «mesa» y «cabina» acaban en -a y
 * son femeninos; «día» y «sofá» también y son masculinos. Un sistema que lo
 * adivine escribe «la día» tarde o temprano, y ése es exactamente el error que
 * F-017 existe para impedir.
 */
export async function fijarTermino(tx: Transaccion, datos: DatosDeTermino): Promise<void> {
  await tx
    .insertInto('vocabulario_negocio')
    .values({
      organizacion_id: datos.organizacionId,
      entidad: datos.entidad,
      singular: datos.singular,
      plural: datos.plural,
      genero: datos.genero,
      empleado_id: datos.empleadoId,
      updated_at: datos.ahora,
    })
    .onConflict((oc) =>
      oc.columns(['organizacion_id', 'entidad']).doUpdateSet({
        singular: datos.singular,
        plural: datos.plural,
        genero: datos.genero,
        empleado_id: datos.empleadoId,
        updated_at: datos.ahora,
      }),
    )
    .execute();
}

/** Devuelve la entidad al nombre de su giro. Devuelve cuántas filas quitó. */
export async function quitarTermino(
  tx: Transaccion,
  organizacionId: string,
  entidad: string,
): Promise<number> {
  const resultado = await tx
    .deleteFrom('vocabulario_negocio')
    .where('organizacion_id', '=', organizacionId)
    .where('entidad', '=', entidad)
    .executeTakeFirst();

  return Number(resultado.numDeletedRows);
}
