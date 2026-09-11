import 'server-only';

import { conTransaccion, type Transaccion } from '@morphiqpos/data';

import { FORMA_PIN, hashearPin } from '../identidad/pin.ts';

/**
 * El primer acceso: la única puerta al sistema cerrado (F1.1-C-04).
 *
 * ── Por qué esto NO es un comando ──────────────────────────────────────────
 * Para crear un PIN hace falta un comando; para ejecutar un comando hace falta
 * sesión; para tener sesión hace falta un PIN. El bucle no se rompe desde
 * dentro. Este script corre en el servidor, con acceso directo a la base, y es
 * la **única excepción legítima** al envoltorio `comando()`.
 *
 * Que sea una excepción no lo exime de nada:
 *   · el PIN se guarda con Argon2id y pimienta, igual que por el camino normal;
 *   · **el PIN no se imprime nunca**, ni siquiera aquí;
 *   · todo ocurre en UNA transacción, así que no deja medio dueño creado.
 *
 * ── Ya no genera código de enrolamiento ────────────────────────────────────
 * Se retiró en T2 del port del restaurante: la terminal se da de alta sola la
 * primera vez que alguien entra con su PIN. Este script deja la cuenta lista y
 * se acabó; el dueño abre `/login-pos`, toca su nombre y teclea su PIN.
 *
 * ── Idempotente a propósito ────────────────────────────────────────────────
 * Correrlo dos veces no duplica personas ni empleos: reusa lo que encuentra y
 * **rota** el PIN. Es lo que se quiere de un arranque que alguien va a ejecutar
 * tres veces mientras averigua qué argumentos lleva.
 */

export interface PeticionPrimerAcceso {
  /** `slug` de la organización. Tiene que existir: aquí no se crean negocios. */
  readonly organizacionSlug: string;
  readonly nombrePersona: string;
  readonly pin: string;
  readonly pimienta: string;
  /**
   * Terminal a preparar. Si no se da, se toma la primera activa —y si el
   * negocio todavía no tiene ninguna, no pasa nada: se crea sola al entrar.
   */
  readonly nombreTerminal?: string | undefined;
}

export interface ResultadoPrimerAcceso {
  readonly organizacion: string;
  readonly sucursal: string;
  /** `null` cuando el negocio todavía no tiene ninguna caja dada de alta. */
  readonly terminal: string | null;
  readonly persona: string;
  readonly empleoId: string;
  readonly pinRotado: boolean;
}

export async function prepararPrimerAcceso(
  peticion: PeticionPrimerAcceso,
): Promise<ResultadoPrimerAcceso> {
  if (!FORMA_PIN.test(peticion.pin)) {
    throw new Error('El PIN tiene que ser de 4 a 8 dígitos.');
  }
  if (peticion.pimienta.length < 16) {
    throw new Error('PIN_PEPPER es demasiado corta. Sin pimienta larga el hash no vale.');
  }

  const hash = await hashearPin(peticion.pin, peticion.pimienta);

  const preparado = await conTransaccion(async (tx) => {
    const negocio = await localizarNegocio(tx, peticion.organizacionSlug, peticion.nombreTerminal);
    const personaId = await asegurarPersona(tx, negocio.organizacionId, peticion.nombrePersona);
    const identidadId = await asegurarIdentidad(tx, personaId);
    const empleoId = await asegurarEmpleo(tx, negocio, personaId);
    const pinRotado = await guardarPin(tx, identidadId, hash);

    return { ...negocio, personaId, identidadId, empleoId, pinRotado };
  });

  return {
    organizacion: preparado.organizacion,
    sucursal: preparado.sucursal,
    terminal: preparado.terminal,
    persona: peticion.nombrePersona,
    empleoId: preparado.empleoId,
    pinRotado: preparado.pinRotado,
  };
}

interface Negocio {
  readonly organizacionId: string;
  readonly organizacion: string;
  readonly sucursalId: string;
  readonly sucursal: string;
  readonly terminal: string | null;
}

async function localizarNegocio(
  tx: Transaccion,
  slug: string,
  nombreTerminal: string | undefined,
): Promise<Negocio> {
  let consulta = tx
    .selectFrom('organizaciones as o')
    .innerJoin('sucursales as s', (union) =>
      union.onRef('s.organizacion_id', '=', 'o.id').on('s.activa', '=', true),
    )
    // `leftJoin` desde que la terminal se da de alta sola: un negocio recién
    // sembrado no tiene ninguna, y con `innerJoin` el arranque fallaba diciendo
    // que «no hay organización activa», que apunta al sitio equivocado.
    .leftJoin('terminales as t', (union) =>
      union.onRef('t.sucursal_id', '=', 's.id').on('t.activa', '=', true),
    )
    .select([
      'o.id as organizacionId',
      'o.nombre as organizacion',
      's.id as sucursalId',
      's.nombre as sucursal',
      't.nombre as terminal',
    ])
    .where('o.slug', '=', slug)
    .where('o.activa', '=', true);

  if (nombreTerminal !== undefined) consulta = consulta.where('t.nombre', '=', nombreTerminal);

  const fila = await consulta.orderBy('s.created_at').orderBy('t.created_at').executeTakeFirst();

  if (fila === undefined) {
    throw new Error(
      `No hay una organización activa con slug "${slug}" que tenga una sucursal activa` +
        (nombreTerminal === undefined ? '.' : ` y una terminal llamada "${nombreTerminal}".`),
    );
  }
  return fila;
}

async function asegurarPersona(
  tx: Transaccion,
  organizacionId: string,
  nombre: string,
): Promise<string> {
  const existente = await tx
    .selectFrom('personas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('nombre', '=', nombre)
    .executeTakeFirst();
  if (existente !== undefined) return existente.id;

  const creada = await tx
    .insertInto('personas')
    .values({ organizacion_id: organizacionId, nombre })
    .returning('id')
    .executeTakeFirstOrThrow();
  return creada.id;
}

async function asegurarIdentidad(tx: Transaccion, personaId: string): Promise<string> {
  const existente = await tx
    .selectFrom('identidades')
    .select('id')
    .where('persona_id', '=', personaId)
    .executeTakeFirst();
  if (existente !== undefined) {
    // Una identidad desactivada por una baja anterior no sirve para entrar, y
    // dejarla así haría que el arranque "funcione" y el login no.
    await tx
      .updateTable('identidades')
      .set({ activa: true })
      .where('id', '=', existente.id)
      .execute();
    return existente.id;
  }

  const creada = await tx
    .insertInto('identidades')
    .values({ persona_id: personaId })
    .returning('id')
    .executeTakeFirstOrThrow();
  return creada.id;
}

async function asegurarEmpleo(
  tx: Transaccion,
  negocio: Negocio,
  personaId: string,
): Promise<string> {
  const existente = await tx
    .selectFrom('empleos')
    .select('id')
    .where('organizacion_id', '=', negocio.organizacionId)
    .where('persona_id', '=', personaId)
    .executeTakeFirst();

  if (existente !== undefined) {
    // El arranque siempre deja un DUEÑO: es la cuenta con la que se configura
    // todo lo demás. Y `vigente_hasta` se limpia porque un empleo caducado
    // hace que `resolverAmbito` devuelva "revocada" en la primera petición.
    await tx
      .updateTable('empleos')
      .set({ rol: 'dueno', activo: true, vigente_hasta: null, sucursal_id: negocio.sucursalId })
      .where('id', '=', existente.id)
      .execute();
    return existente.id;
  }

  const creado = await tx
    .insertInto('empleos')
    .values({
      organizacion_id: negocio.organizacionId,
      persona_id: personaId,
      sucursal_id: negocio.sucursalId,
      rol: 'dueno',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return creado.id;
}

/** Devuelve `true` si rotó un PIN que ya existía. */
async function guardarPin(tx: Transaccion, identidadId: string, hash: string): Promise<boolean> {
  const existente = await tx
    .selectFrom('credenciales_pin')
    .select('id')
    .where('identidad_id', '=', identidadId)
    .executeTakeFirst();

  if (existente !== undefined) {
    await tx
      .updateTable('credenciales_pin')
      .set({
        pin_hash: hash,
        algoritmo: 'argon2id',
        // Rotar el PIN limpia el bloqueo: si no, alguien que se pasó de
        // intentos seguiría fuera con la credencial nueva y sin entender por qué.
        intentos_fallidos: 0,
        bloqueada_hasta: null,
        rotada_en: new Date(),
      })
      .where('id', '=', existente.id)
      .execute();
    return true;
  }

  await tx
    .insertInto('credenciales_pin')
    .values({ identidad_id: identidadId, pin_hash: hash, algoritmo: 'argon2id' })
    .execute();
  return false;
}
