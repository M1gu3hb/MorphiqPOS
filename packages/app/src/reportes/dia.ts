import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * EL DÍA DEL NEGOCIO, en la zona que el negocio declaró.
 *
 * ── Por qué no se puede calcular en TypeScript ─────────────────────────────
 * Porque en México son seis horas de corrimiento y eso no es un detalle de
 * formato: con el día en UTC, la venta de las 19:40 cae en el día siguiente y el
 * tablero de la noche enseña el día de mañana en cero. Ya pasó en la agenda del
 * salón, medido y documentado (`salon/consultas.ts`).
 *
 * La zona la declara el negocio —`organizaciones.zona_horaria`— y la conversión la
 * hace Postgres, que es quien tiene la tabla de husos y sus cambios de horario.
 * Un desfase fijo en el código se rompe dos veces al año.
 */

const MS_POR_DIA = 86_400_000;

export interface LimitesDelDia {
  /** El instante en que empezó el día del negocio. */
  readonly desde: Date;
  /** El instante en que empieza el siguiente. Medio abierto: `[desde, hasta)`. */
  readonly hasta: Date;
  /** La fecha que el negocio llamaría «hoy», `YYYY-MM-DD`. */
  readonly fecha: string;
  /** Cuántos días lleva el mes hasta hoy, para el acumulado. */
  readonly inicioDelMes: Date;
  /** El mismo día de la SEMANA PASADA, que es la única comparación con sentido. */
  readonly haceUnaSemana: Date;
  /** Y su final, para acotar la comparación a ese día y no a la semana. */
  readonly finHaceUnaSemana: Date;
  /** 1 = lunes … 7 = domingo, como `proveedores.dia_visita`. */
  readonly diaDeLaSemana: number;
  /** El de MAÑANA, que es el que decide a quién hay que pedirle hoy. */
  readonly diaDeLaSemanaDeManana: number;
}

/**
 * Los límites del día de HOY del negocio, con lo que hace falta para comparar.
 *
 * Una sola consulta: son seis instantes derivados de la misma zona, y pedirlos por
 * separado abriría la puerta a que dos de ellos se calculen con husos distintos si
 * alguien cambia la zona a media consulta.
 */
export async function diaDelNegocio(
  tx: Transaccion,
  organizacionId: string,
  ahora: Date,
): Promise<LimitesDelDia> {
  const filas = await sql<{
    fecha: string;
    desde: Date;
    hasta: Date;
    inicio_mes: Date;
    hace_semana: Date;
    fin_hace_semana: Date;
    dow: number;
  }>`
    with z as (
      select o.zona_horaria as zona,
             (${ahora.toISOString()}::timestamptz at time zone o.zona_horaria)::date as hoy
        from organizaciones o
       where o.id = ${organizacionId}
    )
    select to_char(z.hoy, 'YYYY-MM-DD')                              as fecha,
           (z.hoy::timestamp             at time zone z.zona)        as desde,
           ((z.hoy + 1)::timestamp       at time zone z.zona)        as hasta,
           (date_trunc('month', z.hoy)::timestamp at time zone z.zona) as inicio_mes,
           ((z.hoy - 7)::timestamp       at time zone z.zona)        as hace_semana,
           ((z.hoy - 6)::timestamp       at time zone z.zona)        as fin_hace_semana,
           extract(isodow from z.hoy)::int                           as dow
      from z
  `.execute(tx);

  const fila = filas.rows[0];
  if (fila === undefined) {
    // No puede pasar —el ámbito viene de una organización que existe— y si pasa,
    // el día en UTC es mejor que ningún día: el tablero enseña algo.
    const desde = new Date(`${ahora.toISOString().slice(0, 10)}T00:00:00.000Z`);
    return {
      desde,
      hasta: new Date(desde.getTime() + MS_POR_DIA),
      fecha: ahora.toISOString().slice(0, 10),
      inicioDelMes: new Date(`${ahora.toISOString().slice(0, 7)}-01T00:00:00.000Z`),
      haceUnaSemana: new Date(desde.getTime() - 7 * MS_POR_DIA),
      finHaceUnaSemana: new Date(desde.getTime() - 6 * MS_POR_DIA),
      diaDeLaSemana: ((desde.getUTCDay() + 6) % 7) + 1,
      diaDeLaSemanaDeManana: (desde.getUTCDay() % 7) + 1,
    };
  }

  const dow = fila.dow;
  return {
    fecha: fila.fecha,
    desde: new Date(fila.desde),
    hasta: new Date(fila.hasta),
    inicioDelMes: new Date(fila.inicio_mes),
    haceUnaSemana: new Date(fila.hace_semana),
    finHaceUnaSemana: new Date(fila.fin_hace_semana),
    diaDeLaSemana: dow,
    // Del domingo (7) se pasa al lunes (1), no al ocho.
    diaDeLaSemanaDeManana: dow === 7 ? 1 : dow + 1,
  };
}
