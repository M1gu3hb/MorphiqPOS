import 'server-only';

import { conTransaccion, type Transaccion } from '@morphiqpos/data';

import { generarCodigoDeEnrolamiento } from '../identidad/enrolar.ts';
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
 *   · el código de enrolamiento se muestra una vez y en la base queda su hash;
 *   · todo ocurre en UNA transacción, así que no deja medio dueño creado.
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
  /** Terminal a preparar. Si no se da, se toma la primera activa. */
  readonly nombreTerminal?: string | undefined;
}

export interface ResultadoPrimerAcceso {
  readonly organizacion: string;
  readonly sucursal: string;
  readonly terminal: string;
  readonly persona: string;
  readonly empleoId: string;
  /** En claro y una sola vez. En la base sólo queda su hash. */
  readonly codigoEnrolamiento: string;
  readonly expiraEn: Date;
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
    await liberarTerminal(tx, negocio.terminalId);

    return { ...negocio, personaId, identidadId, empleoId, pinRotado };
  });

  // Fuera de la transacción anterior a propósito: `generarCodigoDeEnrolamiento`
  // abre la suya, y anidarlas con este cliente daría una transacción dentro de
  // otra. Si esto fallara, el dueño ya existe y basta con volver a correrlo.
  const { codigo, expiraEn } = await generarCodigoDeEnrolamiento(
    preparado.terminalId,
    peticion.pimienta,
  );

  return {
    organizacion: preparado.organizacion,
    sucursal: preparado.sucursal,
    terminal: preparado.terminal,
    persona: peticion.nombrePersona,
    empleoId: preparado.empleoId,
    codigoEnrolamiento: codigo,
    expiraEn,
    pinRotado: preparado.pinRotado,
  };
}

/**
 * Suelta el dispositivo que tuviera la terminal, para que el código nuevo sirva.
 *
 * `enrolarTerminal` rechaza una terminal que ya tiene dispositivo —y hace bien:
 * si no, cualquiera con el código se lleva la caja de otro—. Pero entonces el
 * código que este script acaba de generar sería inútil, y "vuelve a correr el
 * arranque" dejaría de ser la salida cuando algo se atora.
 *
 * Así que el arranque es también el **reseteo** de la terminal, y sólo él puede
 * serlo: corre en el servidor, con acceso directo a la base, y no hay ninguna
 * ruta HTTP que llegue aquí. Desde la aplicación, dar de baja un dispositivo
 * seguirá exigiendo un comando con su rol y su auditoría.
 */
async function liberarTerminal(tx: Transaccion, terminalId: string): Promise<void> {
  await tx
    .updateTable('terminales')
    .set({ device_token_hash: null, enrolada_en: null })
    .where('id', '=', terminalId)
    .execute();
}

interface Negocio {
  readonly organizacionId: string;
  readonly organizacion: string;
  readonly sucursalId: string;
  readonly sucursal: string;
  readonly terminalId: string;
  readonly terminal: string;
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
    .innerJoin('terminales as t', (union) =>
      union.onRef('t.sucursal_id', '=', 's.id').on('t.activa', '=', true),
    )
    .select([
      'o.id as organizacionId',
      'o.nombre as organizacion',
      's.id as sucursalId',
      's.nombre as sucursal',
      't.id as terminalId',
      't.nombre as terminal',
    ])
    .where('o.slug', '=', slug)
    .where('o.activa', '=', true);

  if (nombreTerminal !== undefined) consulta = consulta.where('t.nombre', '=', nombreTerminal);

  const fila = await consulta.orderBy('s.created_at').orderBy('t.created_at').executeTakeFirst();

  if (fila === undefined) {
    throw new Error(
      `No hay una organización activa con slug "${slug}" que tenga sucursal y terminal activas` +
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
