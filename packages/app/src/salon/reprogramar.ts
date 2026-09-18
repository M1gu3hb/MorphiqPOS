import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { elProfesionalPuede, type Rango } from '@morphiqpos/domain/agenda';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import {
  agendarCita,
  comoMultirango,
  comoRango,
  desdeMultirango,
  desdeRango,
  type ResultadoAgenda,
} from './agenda.ts';

/**
 * F-406-bis y F-402 · Mover una cita, y la que entra sin avisar.
 *
 * ── Reprogramar NO es cancelar y volver a agendar ────────────────────────
 * Es lo que se hace hoy en los sistemas que no lo tienen, y cuesta tres cosas:
 * se pierde el folio —que es lo que la clienta trae anotado—, se pierde el
 * anticipo que colgaba de la cita, y el historial dice que faltó cuando sólo
 * cambió de día. Al tercer mes el salón deja de reprogramar y le dice a la
 * clienta que llame otra vez.
 *
 * ── Y tampoco es volver a planear ────────────────────────────────────────
 * Los servicios son los mismos, las personas son las mismas y sus factores de
 * duración son los mismos: la cita entera se DESPLAZA. Replanearla desde cero
 * volvería a leer el catálogo, y un cambio de duración entre ayer y hoy haría
 * que mover la cita al jueves le cambiara la hora de salida a la clienta sin
 * que nadie lo pidiera.
 *
 * ── El precio no se toca, y ésa es la promesa ────────────────────────────
 * Se congeló al agendar. Mover la cita no es volver a venderla: si el salón
 * subió el tinte el martes, la clienta que agendó el lunes paga lo del lunes
 * aunque venga el viernes.
 *
 * ── El walk-in es la misma cita, no otra cosa ────────────────────────────
 * Entra sin avisar y se atiende ahora. Modelarlo aparte daría un segundo camino
 * para ocupar a alguien, con su propia comprobación de choques —o sin ella—, y
 * la ocupación real del salón se repartiría entre dos tablas.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaReprogramar = z.object({
  citaId: z.uuid(),
  /** La hora NUEVA de arranque. Todo lo demás se mueve con ella. */
  inicio: z.iso.datetime(),
  motivo: z.string().trim().max(200).nullable().default(null),
});

export const entradaWalkIn = z.object({
  clienteId: z.uuid().optional(),
  servicios: z
    .array(z.object({ servicioId: z.uuid(), profesionalId: z.uuid() }))
    .min(1)
    .max(8),
  notas: z.string().trim().max(500).optional(),
});

export interface ServicioMovido {
  readonly citaServicioId: string;
  readonly profesionalId: string;
  readonly inicio: string;
  readonly fin: string;
}

export interface ResultadoReprogramacion {
  readonly citaId: string;
  readonly folio: string;
  readonly deInicio: string;
  readonly aInicio: string;
  readonly minutosMovidos: number;
  readonly servicios: readonly ServicioMovido[];
}

const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = 86_400_000;
/** Una cita ya cobrada, cancelada o marcada como no-show no se mueve. */
const ESTADOS_MOVIBLES = ['agendada', 'confirmada'] as const;

export const reprogramarCita = definirComando<
  Transaccion,
  typeof entradaReprogramar,
  ResultadoReprogramacion
>({
  nombre: 'agenda.reprogramar',
  entidad: 'cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaReprogramar,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const cita = await ctx.paso('leer_cita', () =>
      ctx.tx
        .selectFrom('citas')
        .select(['id', 'folio', 'estado', 'agendada_para', 'notas'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .executeTakeFirst(),
    );
    if (cita === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
    }
    if (!ESTADOS_MOVIBLES.includes(cita.estado as (typeof ESTADOS_MOVIBLES)[number])) {
      // Una cita en curso no se mueve: la clienta ya está sentada. Y una
      // cobrada tampoco: mover su hora reescribiría el día que ya se cerró.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Una cita «${cita.estado}» ya no se reprograma.`,
      );
    }

    const nuevoInicio = new Date(entrada.inicio);
    const desplazamiento = nuevoInicio.getTime() - cita.agendada_para.getTime();
    if (desplazamiento === 0) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esa cita ya está a esa hora.');
    }

    const servicios = await ctx.paso('leer_servicios', () =>
      ctx.tx
        .selectFrom('cita_servicios')
        .select(['id', 'profesional_id', 'rango_activo', 'rango_ocupacion'])
        .where('organizacion_id', '=', organizacionId)
        .where('cita_id', '=', entrada.citaId)
        .execute(),
    );
    if (servicios.length === 0) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Esa cita no tiene servicios que mover.');
    }

    const movidos: ServicioMovido[] = [];

    for (const servicio of servicios) {
      const activos = desdeMultirango(servicio.rango_activo).map((r) => mover(r, desplazamiento));
      const ocupacionVieja = desdeRango(servicio.rango_ocupacion);
      if (ocupacionVieja === null) {
        throw new ErrorDominio(
          'CONFIGURACION_INVALIDA',
          'Ese servicio no tiene horario: no hay qué mover.',
        );
      }
      const ocupacion = mover(ocupacionVieja, desplazamiento);

      // El choque se comprueba contra las OTRAS citas de esa persona, y se
      // excluyen a mano las de esta misma: si no, la cita se estorbaría a sí
      // misma en su posición vieja y nada se podría mover nunca.
      // Se acota por `agendada_para` —que está indexada— y el solape se decide
      // después, con la misma función que usa `agendarCita`. Dejar el `&&` en
      // SQL daría dos criterios de choque: uno al agendar y otro al mover, y
      // sólo discreparían en el borde, que es donde duele.
      //
      // Y en dos consultas: `citas` y `cita_servicios` tienen las dos una
      // columna `estado` con significados distintos, y mezclarlas con alias es
      // la consulta en la que escribir una por la otra no falla.
      const vivas = await ctx.paso('leer_citas_vivas', () =>
        ctx.tx
          .selectFrom('citas')
          .select(['id'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '!=', entrada.citaId)
          .where('estado', 'in', ['agendada', 'confirmada', 'en_curso'])
          .where('agendada_para', '>=', new Date(ocupacion.inicio.getTime() - MS_POR_DIA))
          .where('agendada_para', '<', new Date(ocupacion.fin.getTime() + MS_POR_DIA))
          .execute(),
      );

      const ajenas =
        vivas.length === 0
          ? []
          : await ctx.paso('leer_ajenas', () =>
              ctx.tx
                .selectFrom('cita_servicios')
                .select(['rango_activo'])
                .where('organizacion_id', '=', organizacionId)
                .where('profesional_id', '=', servicio.profesional_id)
                .where(
                  'cita_id',
                  'in',
                  vivas.map((v) => v.id),
                )
                .execute(),
            );

      const ocupados = ajenas.flatMap((a) => desdeMultirango(a.rango_activo));
      if (!elProfesionalPuede(activos, ocupados)) {
        throw new ErrorDominio(
          'CONFIGURACION_CONFLICTO',
          'Esa persona ya tiene a alguien a la hora nueva.',
          { profesionalId: servicio.profesional_id },
        );
      }

      await ctx.paso('mover_servicio', () =>
        ctx.tx
          .updateTable('cita_servicios')
          .set({
            rango_activo: comoMultirango(activos),
            rango_ocupacion: comoRango(ocupacion),
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', servicio.id)
          .execute(),
      );

      movidos.push({
        citaServicioId: servicio.id,
        profesionalId: servicio.profesional_id,
        inicio: ocupacion.inicio.toISOString(),
        fin: ocupacion.fin.toISOString(),
      });
    }

    // La nota queda EN la cita y no en un registro aparte: la pregunta de
    // mostrador es «¿por qué está a otra hora?» con la clienta enfrente. Y se
    // AÑADE a lo que hubiera: una cita movida dos veces tiene dos motivos, y
    // el segundo pisando al primero deja la historia a medias.
    const notas =
      entrada.motivo === null
        ? cita.notas
        : [cita.notas, `Reprogramada: ${entrada.motivo}`].filter((n) => n !== null).join('\n');

    await ctx.paso('mover_cita', () =>
      ctx.tx
        .updateTable('citas')
        .set({ agendada_para: nuevoInicio, notas, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .execute(),
    );

    ctx.auditar({
      entidadId: entrada.citaId,
      payload: {
        de: cita.agendada_para.toISOString(),
        a: nuevoInicio.toISOString(),
        servicios: movidos.length,
      },
    });
    return {
      citaId: entrada.citaId,
      folio: cita.folio,
      deInicio: cita.agendada_para.toISOString(),
      aInicio: nuevoInicio.toISOString(),
      minutosMovidos: Math.round(desplazamiento / MS_POR_MINUTO),
      servicios: movidos,
    };
  },
});

export const agendarWalkIn = definirComando<Transaccion, typeof entradaWalkIn, ResultadoAgenda>({
  nombre: 'agenda.walk_in',
  entidad: 'cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaWalkIn,
  async ejecutar(ctx, entrada) {
    // Delega en `agendarCita` y NO reimplementa nada. Un segundo camino para
    // ocupar a alguien tendría su propia comprobación de choques —o no la
    // tendría—, y la ocupación real del salón acabaría repartida entre dos
    // aritméticas que no coinciden.
    return agendarCita.ejecutar(ctx, {
      ...(entrada.clienteId === undefined ? {} : { clienteId: entrada.clienteId }),
      origen: 'walk_in',
      // AHORA, y del reloj del servidor: la hora que manda la pantalla es la
      // del dispositivo del mostrador, y con dos minutos de desfase el
      // walk-in se solapa con la cita que acaba de empezar.
      inicio: ctx.ahora.toISOString(),
      servicios: entrada.servicios,
      ...(entrada.notas === undefined ? {} : { notas: entrada.notas }),
    });
  },
});

function mover(rango: Rango, ms: number): Rango {
  return {
    inicio: new Date(rango.inicio.getTime() + ms),
    fin: new Date(rango.fin.getTime() + ms),
  };
}
