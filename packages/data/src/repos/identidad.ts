import 'server-only';

import type { Kysely } from 'kysely';

import type { Esquema } from '../esquema.ts';
import type { Transaccion } from '../cliente.ts';

/**
 * Acceso a identidad, credenciales y terminales (F1.1-A-02, A-03).
 *
 * **Ninguna función de este archivo devuelve `pin_hash` fuera del propio módulo
 * de verificación.** `03-MODELO` lo pide literal: «El hash nunca sale de la
 * base. Ninguna consulta lo devuelve.» `credencialParaVerificar` es la única
 * excepción, existe para una sola llamada, y su resultado nunca llega a una
 * respuesta HTTP.
 */

export interface CredencialParaVerificar {
  readonly credencialId: string;
  readonly identidadId: string;
  readonly empleoId: string;
  readonly organizacionId: string;
  readonly pinHash: string;
  readonly intentosFallidos: number;
  readonly bloqueadaHasta: Date | null;
}

/**
 * Busca la credencial de un empleo dentro de una organización.
 *
 * Se busca por EMPLEO y no por PIN. Buscar «quién tiene este PIN» es lo que
 * hacía la fuente, y obliga a traer todos los hashes de la organización para
 * compararlos uno por uno: el mismo PIN en dos personas sería ambiguo, y el
 * coste crece con la plantilla.
 */
export async function credencialParaVerificar(
  db: Kysely<Esquema>,
  organizacionId: string,
  empleoId: string,
): Promise<CredencialParaVerificar | null> {
  const fila = await db
    .selectFrom('credenciales_pin')
    .innerJoin('identidades', 'identidades.id', 'credenciales_pin.identidad_id')
    .innerJoin('personas', 'personas.id', 'identidades.persona_id')
    .innerJoin('empleos', 'empleos.persona_id', 'personas.id')
    .select([
      'credenciales_pin.id as credencialId',
      'identidades.id as identidadId',
      'empleos.id as empleoId',
      'empleos.organizacion_id as organizacionId',
      'credenciales_pin.pin_hash as pinHash',
      'credenciales_pin.intentos_fallidos as intentosFallidos',
      'credenciales_pin.bloqueada_hasta as bloqueadaHasta',
    ])
    .where('empleos.id', '=', empleoId)
    .where('empleos.organizacion_id', '=', organizacionId)
    .where('empleos.activo', '=', true)
    .where('identidades.activa', '=', true)
    .executeTakeFirst();

  return fila ?? null;
}

/** Empleados con PIN de una sucursal, para el selector de la pantalla de acceso. */
export interface EmpleadoParaEntrar {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
}

/**
 * Lista quién puede entrar en esta terminal.
 *
 * Devuelve nombre y rol, jamás el hash ni el número de intentos. Enumerar los
 * empleados de una sucursal en la propia terminal no es una fuga: quien está
 * frente a la caja los ve por la puerta. El PIN sigue siendo el secreto.
 */
export async function empleadosConPin(
  db: Kysely<Esquema>,
  organizacionId: string,
  sucursalId: string,
): Promise<EmpleadoParaEntrar[]> {
  return db
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .innerJoin('identidades', 'identidades.persona_id', 'personas.id')
    .innerJoin('credenciales_pin', 'credenciales_pin.identidad_id', 'identidades.id')
    .select(['empleos.id as empleoId', 'personas.nombre as nombre', 'empleos.rol as rol'])
    .where('empleos.organizacion_id', '=', organizacionId)
    .where('empleos.sucursal_id', '=', sucursalId)
    .where('empleos.activo', '=', true)
    .where('identidades.activa', '=', true)
    .orderBy('personas.nombre')
    .limit(50)
    .execute();
}

export async function registrarIntentoFallido(
  tx: Transaccion,
  credencialId: string,
  bloqueadaHasta: Date | null,
): Promise<void> {
  await tx
    .updateTable('credenciales_pin')
    .set((eb) => ({
      intentos_fallidos: eb('intentos_fallidos', '+', 1),
      bloqueada_hasta: bloqueadaHasta,
    }))
    .where('id', '=', credencialId)
    .execute();
}

export async function limpiarIntentos(tx: Transaccion, credencialId: string): Promise<void> {
  await tx
    .updateTable('credenciales_pin')
    .set({ intentos_fallidos: 0, bloqueada_hasta: null })
    .where('id', '=', credencialId)
    .execute();
}

// ── Terminales ─────────────────────────────────────────────────────────────

export interface TerminalPendiente {
  readonly terminalId: string;
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly codigoHash: string | null;
  readonly expiraEn: Date | null;
  readonly enroladaEn: Date | null;
}

/** Busca una terminal por su código de enrolamiento, en toda la instalación. */
export async function terminalPorCodigo(
  db: Kysely<Esquema>,
  codigoHash: string,
): Promise<TerminalPendiente | null> {
  const fila = await db
    .selectFrom('terminales')
    .select([
      'id as terminalId',
      'organizacion_id as organizacionId',
      'sucursal_id as sucursalId',
      'codigo_enrolamiento_hash as codigoHash',
      'codigo_expira_en as expiraEn',
      'enrolada_en as enroladaEn',
    ])
    .where('codigo_enrolamiento_hash', '=', codigoHash)
    .where('activa', '=', true)
    .executeTakeFirst();

  return fila ?? null;
}

/**
 * Marca la terminal como enrolada y **quema el código**.

 * Poner `codigo_enrolamiento_hash` a null es lo que hace que sea de un solo uso.
 * Sin eso, el papelito con el código sirve para enrolar diez dispositivos.
 */
export async function completarEnrolamiento(
  tx: Transaccion,
  terminalId: string,
  deviceTokenHash: string,
  ahora: Date,
): Promise<void> {
  await tx
    .updateTable('terminales')
    .set({
      device_token_hash: deviceTokenHash,
      codigo_enrolamiento_hash: null,
      codigo_expira_en: null,
      enrolada_en: ahora,
      ultima_actividad: ahora,
    })
    .where('id', '=', terminalId)
    .execute();
}

export async function guardarCodigoDeEnrolamiento(
  tx: Transaccion,
  terminalId: string,
  codigoHash: string,
  expiraEn: Date,
): Promise<void> {
  await tx
    .updateTable('terminales')
    .set({ codigo_enrolamiento_hash: codigoHash, codigo_expira_en: expiraEn })
    .where('id', '=', terminalId)
    .execute();
}
