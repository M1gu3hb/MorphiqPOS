import 'server-only';

import { ErrorDominio, validarEntorno, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoSesion, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { FORMA_PIN, hashearPin } from './pin.ts';

/**
 * `identidad.guardar_empleado` — dar de alta y editar a la plantilla.
 *
 * ── El hueco que cierra ────────────────────────────────────────────────────
 * `Configuracion.jsx:219` y `:222` guardan usuarios con
 * `api.entidades.UsuarioPOS.create/update`, y `UsuarioPOS` es una entidad que
 * el puente **sólo sabe LEER**: `puente/usuarios.ts` tiene una consulta y nada
 * más. No hay camino de escritura en todo el sistema, así que **crear o editar
 * un usuario del POS no funcionaba**, ni siquiera mal: la petición moría en el
 * puente con «no existe en el mapa».
 *
 * Se descubrió con `verificar-escrituras.mjs` DESPUÉS de haber escrito «cero
 * escrituras bloqueadas» en el informe de entrega. El `grep` que usé buscaba
 * las doce entidades transaccionales y no miraba las que ni siquiera están en
 * el mapa.
 *
 * ── Lo que su sistema guardaba en una fila, aquí son cuatro tablas ─────────
 * `personas` (quién es), `empleos` (qué hace y dónde), `identidades` (con qué
 * entra) y `credenciales_pin` (cómo). El identificador que ve su frontend es el
 * del EMPLEO. Las cuatro se escriben en la MISMA transacción: un empleado a
 * medias —persona sin empleo, empleo sin identidad— es un usuario que aparece
 * en la lista y no puede entrar.
 *
 * ── EL PIN ─────────────────────────────────────────────────────────────────
 * Viaja hacia aquí y no vuelve nunca. Se hashea con Argon2id y pimienta dentro
 * de esta transacción, igual que en `identidad.establecer_pin`, y ninguna
 * respuesta de este comando lo contiene. Es opcional: dar de alta a alguien y
 * ponerle el PIN después son dos actos distintos, y obligar a juntarlos hace
 * que el PIN se elija con prisa.
 */

const SOLO_MANDOS = ['dueno', 'administrador'] as const;

/**
 * Qué rol puede repartir cada rol.
 *
 * ES LA GUARDA MÁS IMPORTANTE DE ESTE ARCHIVO. Sin ella, un administrador se
 * crea un usuario `dueno`, entra con él y ya no hay nada por encima suyo: los
 * comandos de dueño son los que borran la contabilidad y vacían el negocio.
 * Que la pantalla no ofrezca ese rol no cuenta — el botón se salta con la
 * consola, que es el defecto que este proyecto entero persigue.
 */
const PUEDE_OTORGAR: Readonly<Record<string, readonly string[]>> = {
  dueno: ['dueno', 'administrador', 'gerente', 'cajero', 'mesero', 'cocina', 'almacen'],
  administrador: ['gerente', 'cajero', 'mesero', 'cocina', 'almacen'],
};

const ROLES_DE_LA_BASE = [
  'dueno',
  'administrador',
  'gerente',
  'cajero',
  'mesero',
  'cocina',
  'almacen',
] as const;

/**
 * Su vocabulario → el de la base.
 *
 * `puente/roles.ts` traduce en el otro sentido para pintar el menú. Aquí hace
 * falta la vuelta, porque el diálogo guarda `rol: 'caja'` y la columna espera
 * `cajero`. La tabla es deliberadamente CONSERVADORA: `administrador` de su
 * sistema se guarda como `administrador`, nunca como `dueno`. Traducir hacia
 * arriba sería regalar el rol que reparte roles.
 */
const DESDE_SU_VOCABULARIO: Readonly<Record<string, string>> = {
  administrador: 'administrador',
  caja: 'cajero',
  cajero: 'cajero',
  mesero: 'mesero',
  cocina: 'cocina',
  almacen: 'almacen',
  gerente: 'gerente',
  dueno: 'dueno',
  // `barra` es el rol heredado que su `constants.js` declara retirado: «Barra
  // deja de ser rol principal, ahora es una estación de la cocina».
  barra: 'cocina',
};

function pimienta(): string {
  return validarEntorno(process.env).PIN_PEPPER;
}

export const entradaGuardarEmpleado = z.object({
  /**
   * Ausente al dar de alta; presente al editar. Es el id del EMPLEO que se
   * edita — no el de quien manda, que sale de la sesión.
   *
   * Se llama `empleado` y no `empleoId` porque `definirComando` RECHAZA AL
   * CARGAR EL MÓDULO cualquier entrada con `empleo_id`: ese nombre pertenece al
   * ámbito, y aceptarlo dejaría que quien llama eligiera desde qué empleo
   * escribe. Es el mismo nombre que usa `identidad.establecer_pin`.
   */
  empleado: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  /**
   * El puesto que se le da, en SU vocabulario: el diálogo guarda `caja`, no
   * `cajero`.
   *
   * Se llama `puesto` y no `rol` porque `definirComando` rechaza AL CARGAR EL
   * MÓDULO cualquier entrada con `rol`, y hace bien: ese nombre es del ÁMBITO
   * —quién pregunta— y aceptarlo por el cuerpo es el defecto D-03, el peor del
   * sistema de Miguel. Aquí no se declara quién manda: se declara qué puesto se
   * reparte, y quién puede repartirlo lo decide `PUEDE_OTORGAR` con el rol de
   * la SESIÓN. La guarda obligó a un nombre que no se puede confundir, que es
   * exactamente para lo que está.
   */
  puesto: z.string().trim().min(2).max(20),
  telefono: z.string().trim().max(40).nullable().default(null),
  /** `#rrggbb`. Es lo que pinta su mapa de mesas. */
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  estacionPreparacionId: z.uuid().nullable().default(null),
  veTodasLasEstaciones: z.boolean().default(false),
  activo: z.boolean().default(true),
  /** Opcional. Se hashea aquí y no vuelve en la respuesta. */
  pin: z.string().regex(FORMA_PIN, 'El PIN son de 4 a 8 dígitos.').optional(),
});

export interface ResultadoGuardarEmpleado {
  readonly empleoId: string;
  readonly nombre: string;
  readonly rol: string;
  readonly creado: boolean;
  /** `true` si en esta llamada se puso o rotó el PIN. Nunca el PIN. */
  readonly pinEstablecido: boolean;
}

export const guardarEmpleado = definirComando<
  Transaccion,
  typeof entradaGuardarEmpleado,
  ResultadoGuardarEmpleado
>({
  nombre: 'identidad.guardar_empleado',
  entidad: 'empleo',
  escribe: true,
  roles: [...SOLO_MANDOS],
  paquetes: PAQUETES_TODOS,
  entrada: entradaGuardarEmpleado,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, rol: rolDeQuienManda, empleoId: yo } = ctx.ambito;

    const rolPedido = DESDE_SU_VOCABULARIO[entrada.puesto.toLowerCase()];
    if (rolPedido === undefined || !(ROLES_DE_LA_BASE as readonly string[]).includes(rolPedido)) {
      throw new ErrorDominio('PUESTO_INVALIDO', `«${entrada.puesto}» no es un puesto del sistema.`);
    }

    const puede = PUEDE_OTORGAR[rolDeQuienManda] ?? [];
    if (!puede.includes(rolPedido)) {
      throw new ErrorDominio(
        'PUESTO_NO_OTORGABLE',
        `Tu puesto no puede dar de alta a un ${rolPedido}. Pídeselo al dueño.`,
        { rolPedido },
      );
    }

    const creado = entrada.empleado === undefined;
    let empleoId: string;
    let personaId: string;

    if (entrada.empleado !== undefined) {
      // El filtro por organización va SIEMPRE: sin él, conocer un uuid ajeno
      // basta para cambiarle el rol al cajero de otro negocio.
      const actual = await ctx.paso('cargar_empleo', () =>
        ctx.tx
          .selectFrom('empleos')
          .select(['id', 'persona_id as personaId', 'rol', 'activo'])
          .where('id', '=', entrada.empleado ?? '')
          .where('organizacion_id', '=', organizacionId)
          .executeTakeFirst(),
      );
      if (actual === undefined) {
        throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Ese usuario no existe en este negocio.');
      }

      // Quitarse a uno mismo el puesto, o darse de baja, deja el negocio sin
      // quien administre si era el único. Se rehúsa en vez de dejarlo pasar y
      // que el siguiente inicio de sesión no lleve a ninguna parte.
      if (actual.id === yo && (!entrada.activo || rolPedido !== actual.rol)) {
        throw new ErrorDominio(
          'PUESTO_NO_OTORGABLE',
          'No puedes cambiarte el puesto ni darte de baja a ti mismo. Que lo haga otro.',
        );
      }

      // Y el rol que TENÍA también tiene que estar a su alcance: un
      // administrador no puede editar —ni desactivar— a un dueño.
      if (!puede.includes(actual.rol)) {
        throw new ErrorDominio(
          'PUESTO_NO_OTORGABLE',
          `Tu puesto no puede modificar a un ${actual.rol}.`,
          { rolActual: actual.rol },
        );
      }

      empleoId = actual.id;
      personaId = actual.personaId;

      await ctx.paso('actualizar_persona', () =>
        ctx.tx
          .updateTable('personas')
          .set({ nombre: entrada.nombre, telefono: entrada.telefono, updated_at: ctx.ahora })
          .where('id', '=', personaId)
          .where('organizacion_id', '=', organizacionId)
          .execute(),
      );
      await ctx.paso('actualizar_empleo', () =>
        ctx.tx
          .updateTable('empleos')
          .set({
            rol: rolPedido,
            activo: entrada.activo,
            color: entrada.color,
            estacion_preparacion_id: entrada.estacionPreparacionId,
            ve_todas_las_estaciones: entrada.veTodasLasEstaciones,
            updated_at: ctx.ahora,
          })
          .where('id', '=', empleoId)
          .where('organizacion_id', '=', organizacionId)
          .execute(),
      );

      if (rolPedido !== actual.rol || (actual.activo && !entrada.activo)) {
        await ctx.paso('revocar_sesiones', () =>
          repoSesion.revocarSesionesDeEmpleo(ctx.tx, organizacionId, empleoId, ctx.ahora),
        );
      }
    } else {
      const persona = await ctx.paso('crear_persona', () =>
        ctx.tx
          .insertInto('personas')
          .values({
            organizacion_id: organizacionId,
            nombre: entrada.nombre,
            telefono: entrada.telefono,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );
      personaId = persona.id;

      const empleo = await ctx.paso('crear_empleo', () =>
        ctx.tx
          .insertInto('empleos')
          .values({
            persona_id: personaId,
            organizacion_id: organizacionId,
            // La sucursal de quien da el alta. No viaja en el cuerpo: es ámbito.
            sucursal_id: sucursalId,
            rol: rolPedido,
            activo: entrada.activo,
            color: entrada.color,
            estacion_preparacion_id: entrada.estacionPreparacionId,
            ve_todas_las_estaciones: entrada.veTodasLasEstaciones,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );
      empleoId = empleo.id;
    }

    // La identidad es con lo que ENTRA, y se crea aunque no haya PIN todavía:
    // sin ella, poner el PIN después con `identidad.establecer_pin` fallaría
    // con «ese empleado no existe», que es mentira.
    const identidad = await ctx.paso('asegurar_identidad', async () => {
      const ya = await ctx.tx
        .selectFrom('identidades')
        .select('id')
        .where('persona_id', '=', personaId)
        .executeTakeFirst();
      if (ya !== undefined) return ya;
      return ctx.tx
        .insertInto('identidades')
        .values({ persona_id: personaId, activa: true })
        .returning('id')
        .executeTakeFirstOrThrow();
    });

    let pinEstablecido = false;
    if (entrada.pin !== undefined) {
      const hash = await hashearPin(entrada.pin, pimienta());
      await ctx.paso('guardar_pin', async () => {
        const previa = await ctx.tx
          .selectFrom('credenciales_pin')
          .select('id')
          .where('identidad_id', '=', identidad.id)
          .executeTakeFirst();
        if (previa === undefined) {
          await ctx.tx
            .insertInto('credenciales_pin')
            .values({ identidad_id: identidad.id, pin_hash: hash, algoritmo: 'argon2id' })
            .execute();
        } else {
          // Poner un PIN nuevo levanta el bloqueo, igual que en
          // `establecer_pin`: si no, quien se pasó de intentos sigue fuera con
          // la clave nueva y nadie entiende por qué.
          await ctx.tx
            .updateTable('credenciales_pin')
            .set({
              pin_hash: hash,
              algoritmo: 'argon2id',
              intentos_fallidos: 0,
              bloqueada_hasta: null,
              updated_at: ctx.ahora,
            })
            .where('id', '=', previa.id)
            .execute();
        }
      });
      pinEstablecido = true;
    }

    // El PIN NO entra en la auditoría, ni su hash, ni su longitud. Sólo que se
    // puso: la auditoría se consulta desde la aplicación y no puede volverse
    // una pista sobre las credenciales de nadie.
    ctx.auditar({
      entidadId: empleoId,
      payload: { creado, rol: rolPedido, activo: entrada.activo, pinEstablecido },
    });

    return { empleoId, nombre: entrada.nombre, rol: rolPedido, creado, pinEstablecido };
  },
});
