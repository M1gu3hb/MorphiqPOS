import 'server-only';

import type { Kysely } from 'kysely';

import type { Esquema } from '../esquema.ts';

/**
 * Lo que hace falta para armar el ámbito de una petición (F1.1-X-01).
 *
 * Una sola consulta con dos joins, no tres consultas: `12A` del gate prohíbe el
 * N+1, y esto corre en CADA petición autenticada del punto de venta.
 */

export interface AmbitoResuelto {
  readonly organizacionId: string;
  readonly sucursalId: string | null;
  readonly identidadId: string;
  readonly empleoId: string;
  readonly rol: string;
}

/**
 * Resuelve el ámbito desde la identidad y el empleo que trae la sesión.
 *
 * Comprueba la vigencia aquí y no en el código que llama: un empleo dado de baja
 * a media jornada deja de servir en la siguiente petición, no cuando expire la
 * cookie. Es la razón de que el token guarde identificadores y no el rol.
 */
export async function resolverAmbito(
  db: Kysely<Esquema>,
  identidadId: string,
  empleoId: string,
): Promise<AmbitoResuelto | null> {
  const fila = await db
    .selectFrom('identidades')
    .innerJoin('personas', 'personas.id', 'identidades.persona_id')
    .innerJoin('empleos', 'empleos.persona_id', 'personas.id')
    .innerJoin('organizaciones', 'organizaciones.id', 'empleos.organizacion_id')
    .select([
      'empleos.organizacion_id as organizacionId',
      'empleos.sucursal_id as sucursalId',
      'identidades.id as identidadId',
      'empleos.id as empleoId',
      'empleos.rol as rol',
    ])
    .where('identidades.id', '=', identidadId)
    .where('identidades.activa', '=', true)
    .where('empleos.id', '=', empleoId)
    .where('empleos.activo', '=', true)
    .where('organizaciones.activa', '=', true)
    // La vigencia es un rango, no sólo el booleano `activo`.
    .where((eb) =>
      eb.or([
        eb('empleos.vigente_hasta', 'is', null),
        eb('empleos.vigente_hasta', '>=', new Date().toISOString().slice(0, 10)),
      ]),
    )
    .executeTakeFirst();

  return fila ?? null;
}

/**
 * Comprueba que la terminal está enrolada y pertenece a la organización.
 *
 * Se valida aparte del ámbito porque el dueño entra por correo desde un teléfono
 * sin enrolar: tiene ámbito válido y NO tiene terminal. Es lo que hace que pueda
 * ver gestión y no pueda abrir caja.
 */
export async function terminalActiva(
  db: Kysely<Esquema>,
  terminalId: string,
  organizacionId: string,
): Promise<{ readonly sucursalId: string } | null> {
  const fila = await db
    .selectFrom('terminales')
    .select(['sucursal_id as sucursalId'])
    .where('id', '=', terminalId)
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .where('enrolada_en', 'is not', null)
    .executeTakeFirst();

  return fila ?? null;
}
