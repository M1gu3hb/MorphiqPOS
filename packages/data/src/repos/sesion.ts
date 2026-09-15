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
  /**
   * Nombre de la persona. Lo pide la barra lateral para saludar y para la
   * inicial del avatar; viaja aqui porque `personas` YA esta en el join y
   * pedirlo aparte seria una consulta mas en el camino caliente.
   */
  readonly nombrePersona: string;
  /** Paquete contratado. Decide qué comandos existen para este negocio (A-42). */
  readonly paquete: string;
  readonly nombreNegocio: string;
  readonly nombreSucursal: string | null;
}

export interface NuevaSesion {
  readonly sid: string;
  readonly organizacionId: string;
  readonly empleoId: string;
  readonly creadaEn: Date;
  readonly expiraEn: Date;
}

/** Registra la sesión antes de entregar su cookie al navegador. */
export async function crearSesion(db: Kysely<Esquema>, sesion: NuevaSesion): Promise<void> {
  await db
    .insertInto('sesiones')
    .values({
      sid: sesion.sid,
      organizacion_id: sesion.organizacionId,
      empleo_id: sesion.empleoId,
      creada_en: sesion.creadaEn,
      expira_en: sesion.expiraEn,
    })
    .execute();
}

/**
 * Comprueba el registro servidor de la cookie.
 *
 * El empleo forma parte de la condición para que un `sid` no se pueda combinar
 * con la carga de otro token, incluso si ambos tokens tienen firma válida.
 */
export async function sesionActiva(
  db: Kysely<Esquema>,
  sid: string,
  empleoId: string,
  ahora: Date = new Date(),
): Promise<boolean> {
  const fila = await db
    .selectFrom('sesiones')
    .select('sid')
    .where('sid', '=', sid)
    .where('empleo_id', '=', empleoId)
    .where('revocada_en', 'is', null)
    .where('expira_en', '>', ahora)
    .executeTakeFirst();

  return fila !== undefined;
}

/** Marca una sola sesión como revocada. Es idempotente para cierres repetidos. */
export async function revocarSesion(
  db: Kysely<Esquema>,
  sid: string,
  ahora: Date = new Date(),
): Promise<void> {
  await db
    .updateTable('sesiones')
    .set({ revocada_en: ahora })
    .where('sid', '=', sid)
    .where('revocada_en', 'is', null)
    .execute();
}

/** Invalida todas las cookies vivas de un empleo tras un cambio de acceso. */
export async function revocarSesionesDeEmpleo(
  db: Kysely<Esquema>,
  organizacionId: string,
  empleoId: string,
  ahora: Date,
): Promise<void> {
  await db
    .updateTable('sesiones')
    .set({ revocada_en: ahora })
    .where('organizacion_id', '=', organizacionId)
    .where('empleo_id', '=', empleoId)
    .where('revocada_en', 'is', null)
    .execute();
}

/** Conserva siete días de rastro y elimina sesiones ya vencidas más antiguas. */
export async function purgarSesionesAntiguas(
  db: Kysely<Esquema>,
  vencidasAntesDe: Date,
): Promise<void> {
  await db.deleteFrom('sesiones').where('expira_en', '<', vencidasAntesDe).executeTakeFirst();
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
    // El nombre de la sucursal exige un `leftJoin` y no un `innerJoin`: un dueño
    // puede tener empleo sin sucursal asignada, y un `innerJoin` lo dejaría sin
    // ámbito — es decir, sin poder entrar.
    .leftJoin('sucursales', 'sucursales.id', 'empleos.sucursal_id')
    .select([
      'empleos.organizacion_id as organizacionId',
      'empleos.sucursal_id as sucursalId',
      'identidades.id as identidadId',
      'empleos.id as empleoId',
      'empleos.rol as rol',
      'personas.nombre as nombrePersona',
      'organizaciones.paquete as paquete',
      'organizaciones.nombre as nombreNegocio',
      'sucursales.nombre as nombreSucursal',
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
