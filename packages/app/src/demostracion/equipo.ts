import 'server-only';

import type { Giro } from '@morphiqpos/contracts';
import { equipoDeDemo, type EmpleadoDemo } from '@morphiqpos/contracts/negocios/equipo';
import type { Transaccion } from '@morphiqpos/data';

import { hashearPin } from '../identidad/pin.ts';

/**
 * EL EQUIPO de cada demostración: una persona por cada rol que opera de verdad.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 * Las cinco demos tenían UN empleado, el dueño que crea `db:bootstrap`. Con uno
 * solo no se puede enseñar nada de lo que este sistema hace: los permisos por
 * rol no se ven —el dueño lo puede todo—, la pantalla de acceso enseña una sola
 * tarjeta, el corte de caja no distingue quién cobró, y la comisión de un salón
 * o la propina de un restaurante no tienen a quién repartirse.
 *
 * Y peor para quien revisa: «entra con el dueño y mira» no prueba que un cajero
 * NO pueda cambiar la plantilla, que es media seguridad del sistema.
 *
 * ── Los PIN, y por qué están aquí escritos ─────────────────────────────────
 * Son de DEMOSTRACIÓN, de cuatro dígitos y **distintos por rol a propósito**,
 * para que al revisar se sepa con quién se entró sin mirar dos veces. Se hashean
 * con Argon2id y pimienta igual que cualquier otro: no hay un camino distinto
 * para sembrar, y nunca se guarda un PIN en claro — precisamente porque «es sólo
 * la demo» es como acaban los PIN en claro en producción.
 *
 * El del DUEÑO no está aquí: lo pone `db:bootstrap` cuando se crea el negocio, y
 * un reseteo de demostración no tiene por qué cambiarle la contraseña a nadie.
 *
 * ── Los nombres ────────────────────────────────────────────────────────────
 * Personas reconocibles y distintas en cada demo, para que al abrir una captura
 * de pantalla se sepa de qué negocio es. No «Usuario 2» ni «Cajero Demo»: una
 * pantalla de acceso con nombres genéricos se ve como un sistema sin terminar.
 */

export type { EmpleadoDemo };

/**
 * El equipo de cada giro. La TABLA vive en `@morphiqpos/contracts/negocios/equipo`
 * desde la 2.4: la leen también las pruebas de extremo a extremo, que entran con el
 * rol que toca a cada paso del día. Aquí sólo se decide qué giro siembra cuál.
 */
export function equipoDelGiro(giro: Giro): readonly EmpleadoDemo[] {
  return equipoDeDemo(giro);
}

/**
 * Siembra el equipo. Devuelve el `empleos.id` de cada persona, por su nombre.
 *
 * Los devuelve porque los necesitan dos cosas: la ficha de profesional de un
 * salón —que cuelga de un empleo— y la sesión de caja, que guarda quién la
 * abrió. Sin eso habría que volver a consultar por nombre, que es la clase de
 * atajo con el que dos personas homónimas rompen una demostración.
 *
 * Es idempotente por (organización, nombre, apellidos): correrlo dos veces no
 * duplica a nadie, y devuelve igual el empleo de quien ya estaba.
 *
 * ── Y a quien ya estaba lo REPONE (bloque B.2 de la 2.4) ──────────────────
 * Antes lo saltaba tal cual, y eso dejaba la demo como la había dejado la última
 * prueba: `humo-accesos` le cambia el PIN a alguien, una prueba de seguridad lo
 * bloquea por intentos, otra lo da de baja o le cambia el rol. La corrida siguiente
 * —o la demostración delante de un cliente— no podía entrar con el PIN que
 * `ACCESOS-DEMO.md` publica. Ahora cada persona sembrada vuelve a su rol, a su PIN,
 * a cero intentos, sin bloqueo y activa.
 */
export async function sembrarEquipo(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  giro: Giro,
  pimienta: string,
): Promise<Map<string, string>> {
  const empleos = new Map<string, string>();

  for (const empleado of equipoDelGiro(giro)) {
    const clave = `${empleado.nombre} ${empleado.apellidos}`;

    const yaEsta = await tx
      .selectFrom('personas')
      .innerJoin('empleos', 'empleos.persona_id', 'personas.id')
      .select(['empleos.id as empleoId', 'personas.id as personaId'])
      .where('personas.organizacion_id', '=', organizacionId)
      .where('personas.nombre', '=', empleado.nombre)
      .where('personas.apellidos', '=', empleado.apellidos)
      .executeTakeFirst();
    if (yaEsta !== undefined) {
      await tx
        .updateTable('empleos')
        .set({
          rol: empleado.rol,
          color: empleado.color,
          activo: true,
          vigente_hasta: null,
          sucursal_id: sucursalId,
          ve_todas_las_estaciones: empleado.rol === 'cocina',
        })
        .where('id', '=', yaEsta.empleoId)
        .execute();
      await reponerPin(tx, yaEsta.personaId, empleado.pin, pimienta);
      empleos.set(clave, yaEsta.empleoId);
      continue;
    }

    const persona = await tx
      .insertInto('personas')
      .values({
        organizacion_id: organizacionId,
        nombre: empleado.nombre,
        apellidos: empleado.apellidos,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // `identidades` y `credenciales_pin` NO llevan `organizacion_id`: cuelgan de
    // la persona, que sí lo lleva. El ámbito viaja por la relación, no repetido.
    const identidad = await tx
      .insertInto('identidades')
      .values({ persona_id: persona.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const empleo = await tx
      .insertInto('empleos')
      .values({
        organizacion_id: organizacionId,
        persona_id: persona.id,
        sucursal_id: sucursalId,
        rol: empleado.rol,
        color: empleado.color,
        // Quien prepara ve TODAS las estaciones: en un negocio de doce mesas no
        // hay un cocinero por estación, y filtrarle la mitad de las comandas
        // sería enseñar una pantalla que miente sobre lo que falta por salir.
        ve_todas_las_estaciones: empleado.rol === 'cocina',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await tx
      .insertInto('credenciales_pin')
      .values({
        identidad_id: identidad.id,
        pin_hash: await hashearPin(empleado.pin, pimienta),
      })
      .execute();

    empleos.set(clave, empleo.id);
  }

  return empleos;
}

/**
 * El PIN de una persona, como recién sembrado: el publicado, cero intentos fallidos y
 * sin bloqueo. Si la persona perdió su credencial, se le vuelve a dar.
 */
export async function reponerPin(
  tx: Transaccion,
  personaId: string,
  pin: string,
  pimienta: string,
): Promise<void> {
  const identidad = await tx
    .selectFrom('identidades')
    .select('id')
    .where('persona_id', '=', personaId)
    .executeTakeFirst();
  const identidadId =
    identidad?.id ??
    (
      await tx
        .insertInto('identidades')
        .values({ persona_id: personaId })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const hash = await hashearPin(pin, pimienta);
  const repuesta = await tx
    .updateTable('credenciales_pin')
    .set({ pin_hash: hash, intentos_fallidos: 0, bloqueada_hasta: null, rotada_en: new Date() })
    .where('identidad_id', '=', identidadId)
    .returning('id')
    .execute();
  if (repuesta.length === 0) {
    await tx
      .insertInto('credenciales_pin')
      .values({ identidad_id: identidadId, pin_hash: hash })
      .execute();
  }
}
