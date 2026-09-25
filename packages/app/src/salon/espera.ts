import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-409 · La lista de espera de citas: anotar, avisar y agendar.
 *
 * ── Por qué es el otro lado del no-show ──────────────────────────────────
 * Un hueco que se abre a las diez de la mañana del sábado se llena en quince
 * minutos SI alguien sabe a quién llamar. Sin lista, ese hueco se queda vacío y
 * la capacidad perdida se duplica: se pierde la cita que faltó y se pierde la
 * que habría entrado en su lugar.
 *
 * ── Se guarda una VENTANA y no una hora ──────────────────────────────────
 * Nadie dice «quiero el sábado a las 11:00»: dice «el sábado por la mañana» o
 * «cualquier día de esta semana después de las cinco». Guardar una hora exacta
 * obligaría a inventar una, y a no encontrar a nadie cuando el hueco cae a las
 * 11:30.
 *
 * ── Avisar y agendar son DOS pasos, y eso es deliberado ──────────────────
 * Entre uno y otro pasa la vida real: la clienta no contesta, lo piensa, dice
 * que sí y luego no puede. Un solo paso obligaría a agendar en el momento de
 * llamar —y entonces el hueco se ocupa con alguien que todavía no ha dicho que
 * sí— o a no registrar la llamada, y entonces se llama tres veces a la misma
 * persona el mismo día.
 *
 * ── Las dos fechas que la base exige ─────────────────────────────────────
 * `espera_cita_avisada_con_fecha` y `espera_cita_agendada_con_cita`. Una espera
 * avisada sin hora de aviso no se puede ordenar por «a quién le toca que le
 * vuelvan a llamar», y una agendada sin cita es una fila que dice que alguien
 * ya tiene lugar sin que exista el lugar.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAnotarEnEspera = z.object({
  clienteId: z.uuid(),
  servicioId: z.uuid().nullable().default(null),
  /** `null` es «con quien sea», y es una respuesta perfectamente válida. */
  profesionalId: z.uuid().nullable().default(null),
  desde: z.iso.datetime(),
  hasta: z.iso.datetime(),
  flexibleDeDia: z.boolean().default(false),
  prioridad: z.number().int().min(0).max(100).default(0),
  nota: z.string().trim().max(200).nullable().default(null),
});

export const entradaAvisarDeHueco = z.object({
  esperaId: z.uuid(),
});

export const entradaAgendarDesdeEspera = z.object({
  esperaId: z.uuid(),
  /** La cita que se acaba de crear. Sin ella la fila mentiría. */
  citaId: z.uuid(),
});

export interface ResultadoEspera {
  readonly esperaId: string;
  readonly estado: string;
}

export async function exigirEspera(
  ctx: ContextoComando<Transaccion>,
  esperaId: string,
): Promise<void> {
  const fila = await ctx.paso('leer_espera', () =>
    ctx.tx
      .selectFrom('lista_espera_citas')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', esperaId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa espera no existe en este negocio.');
  }
}

export const anotarEnEspera = definirComando<
  Transaccion,
  typeof entradaAnotarEnEspera,
  ResultadoEspera
>({
  nombre: 'lista_espera_citas.anotar',
  entidad: 'lista_espera_cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAnotarEnEspera,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    const desde = new Date(entrada.desde);
    const hasta = new Date(entrada.hasta);

    // Una ventana vacía o invertida no es una preferencia: es un tecleo. Y el
    // `check` de la base la rechazaría con un 23514 sin decir cuál de las dos
    // fechas estaba mal.
    if (hasta.getTime() <= desde.getTime()) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La ventana de espera tiene que terminar después de empezar.',
      );
    }

    const espera = await ctx.paso('anotar', () =>
      ctx.tx
        .insertInto('lista_espera_citas')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          cliente_id: entrada.clienteId,
          servicio_id: entrada.servicioId,
          profesional_id: entrada.profesionalId,
          // `[)` cerrado por abajo y abierto por arriba, como todos los rangos
          // de este proyecto: así dos ventanas consecutivas no se solapan por
          // el instante que comparten.
          ventana: sql<string>`tstzrange(${desde}, ${hasta}, '[)')`,
          flexible_de_dia: entrada.flexibleDeDia,
          prioridad: entrada.prioridad,
          estado: 'esperando',
          nota: entrada.nota,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({ entidadId: espera.id, payload: { clienteId: entrada.clienteId } });
    return { esperaId: espera.id, estado: 'esperando' };
  },
});

export const avisarDeHueco = definirComando<
  Transaccion,
  typeof entradaAvisarDeHueco,
  ResultadoEspera
>({
  nombre: 'lista_espera_citas.avisar',
  entidad: 'lista_espera_cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAvisarDeHueco,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await exigirEspera(ctx, entrada.esperaId);

    // Estado y hora en la MISMA escritura: la base lo exige, y sin la hora no
    // se puede ordenar por «a quién le toca que le vuelvan a llamar», que es
    // para lo único que sirve haber llamado.
    const tocadas = await ctx.paso('avisar', () =>
      ctx.tx
        .updateTable('lista_espera_citas')
        .set({ estado: 'avisada', avisada_en: ctx.ahora, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.esperaId)
        .where('estado', 'in', ['esperando', 'avisada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa espera ya no está viva: o se agendó, o venció, o se canceló.',
      );
    }

    ctx.auditar({ entidadId: entrada.esperaId, payload: { avisada: true } });
    return { esperaId: entrada.esperaId, estado: 'avisada' };
  },
});

export const agendarDesdeEspera = definirComando<
  Transaccion,
  typeof entradaAgendarDesdeEspera,
  ResultadoEspera
>({
  nombre: 'lista_espera_citas.agendar',
  entidad: 'lista_espera_cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAgendarDesdeEspera,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await exigirEspera(ctx, entrada.esperaId);

    const cita = await ctx.paso('leer_cita', () =>
      ctx.tx
        .selectFrom('citas')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .executeTakeFirst(),
    );
    if (cita === undefined) {
      // La cita se crea ANTES y se ata aquí. Sin esta comprobación se podría
      // cerrar una espera apuntando a una cita de otra organización, y la fila
      // diría que alguien tiene lugar en un salón donde no lo tiene.
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
    }

    const tocadas = await ctx.paso('agendar', () =>
      ctx.tx
        .updateTable('lista_espera_citas')
        .set({ estado: 'agendada', cita_id: entrada.citaId, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.esperaId)
        .where('estado', 'in', ['esperando', 'avisada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa espera ya no está viva: o se agendó, o venció, o se canceló.',
      );
    }

    ctx.auditar({ entidadId: entrada.esperaId, payload: { citaId: entrada.citaId } });
    return { esperaId: entrada.esperaId, estado: 'agendada' };
  },
});
