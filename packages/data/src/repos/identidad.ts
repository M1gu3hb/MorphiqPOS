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
 * Lista quién puede entrar.
 *
 * Devuelve nombre y rol, jamás el hash ni el número de intentos. Enumerar los
 * empleados del negocio en su propia pantalla de acceso no es una fuga: quien
 * está frente a la caja los ve por la puerta. El PIN sigue siendo el secreto.
 *
 * `sucursalId` es opcional desde que se retiró el enrolamiento de terminal: un
 * dispositivo nuevo todavía no tiene sucursal asignada, así que la lista es la
 * del negocio entero. Con sucursal, se acota a ella.
 */
export async function empleadosConPin(
  db: Kysely<Esquema>,
  organizacionId: string,
  sucursalId: string | null,
): Promise<EmpleadoParaEntrar[]> {
  let consulta = db
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .innerJoin('identidades', 'identidades.persona_id', 'personas.id')
    .innerJoin('credenciales_pin', 'credenciales_pin.identidad_id', 'identidades.id')
    .select(['empleos.id as empleoId', 'personas.nombre as nombre', 'empleos.rol as rol'])
    .where('empleos.organizacion_id', '=', organizacionId)
    .where('empleos.activo', '=', true)
    .where('identidades.activa', '=', true);

  if (sucursalId !== null) consulta = consulta.where('empleos.sucursal_id', '=', sucursalId);

  return consulta.orderBy('personas.nombre').limit(50).execute();
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

/**
 * Cuántas terminales tiene una sucursal. Sirve para nombrar la siguiente.
 */
export async function contarTerminales(
  db: Kysely<Esquema>,
  organizacionId: string,
  sucursalId: string,
): Promise<number> {
  const fila = await db
    .selectFrom('terminales')
    .select((eb) => eb.fn.countAll<string>().as('total'))
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .executeTakeFirst();

  return Number(fila?.total ?? 0);
}

/**
 * Da de alta el dispositivo que acaba de entrar, sin código de por medio.
 *
 * Sustituye al enrolamiento de seis dígitos, que era un paso que nadie pidió y
 * que dejaba una caja nueva sin poder vender hasta que alguien fuera a gestión
 * a generar un número. Ahora el dispositivo se da de alta SOLO, y sólo después
 * de que el PIN se verificó: sin credencial correcta no se crea nada.
 *
 * Nace ya enrolada porque el paso que faltaba —probar quién eres— acaba de
 * ocurrir. El token sigue guardándose hasheado, igual que antes.
 */
export async function crearTerminalParaDispositivo(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly sucursalId: string;
    readonly nombre: string;
    readonly deviceTokenHash: string;
    readonly ahora: Date;
  },
): Promise<string | null> {
  try {
    const fila = await tx
      .insertInto('terminales')
      .values({
        organizacion_id: datos.organizacionId,
        sucursal_id: datos.sucursalId,
        nombre: datos.nombre,
        device_token_hash: datos.deviceTokenHash,
        enrolada_en: datos.ahora,
        ultima_actividad: datos.ahora,
        activa: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return fila.id;
  } catch (error) {
    // `terminales_nombre_unico` es `(sucursal_id, lower(nombre))`. Dos cajas
    // que entran por primera vez a la vez cuentan las mismas terminales y
    // proponen el mismo «Caja 3»: la segunda choca. Devolver `null` en vez de
    // reventar deja que quien llama pruebe con el siguiente numero — que es
    // exactamente lo que haria una persona.
    //
    // SOLO ese conflicto. Cualquier otro fallo de la base sube: tragarlos aqui
    // convertiria una caida de Postgres en «no se pudo dar de alta la caja».
    if (esNombreDuplicado(error)) return null;
    throw error;
  }
}

/** `23505` es `unique_violation` en Postgres. */
function esNombreDuplicado(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const codigo = (error as { code?: unknown }).code;
  const restriccion = (error as { constraint?: unknown }).constraint;
  return codigo === '23505' && restriccion === 'terminales_nombre_unico';
}
