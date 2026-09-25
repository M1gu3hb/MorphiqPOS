import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import type { ContextoComando } from '../comando.ts';

/**
 * LA ESTILISTA SÓLO VE LO SUYO, también en los comandos (C.10 de la 2.4).
 *
 * ── El defecto ────────────────────────────────────────────────────────────
 * C.7 recortó el PUENTE: para el rol de la profesional, `Cita`, `Profesional` y sus
 * comisiones sólo devuelven las filas de la profesional ligada al empleo de la sesión
 * (`soloDeQuienEntra`). Pero la agenda dejó de leer el puente —ahora es `agenda.dia`— y
 * «Mi día» y la liquidación leen `profesionales.mi_dia` y `profesionales.comisiones`.
 * Los cuatro comandos aceptaban ese rol y no miraban quién entraba: una estilista veía
 * todas las columnas de la agenda y, pasando el id de otra, sus comisiones.
 *
 * ── La regla, la misma del puente ────────────────────────────────────────
 * Para los roles de `SOLO_LO_SUYO`, la profesional es la ligada al empleo de la sesión.
 * Sin pedir una, se le da la suya; pidiendo OTRA, se niega —no se le da la suya en
 * silencio: quien pidió a otra tiene que saber que no puede—. Sin profesional ligada no
 * hay «suya»: cero filas, nunca todas. Los demás roles piden lo que quieran.
 *
 * El permiso por persona (`ver_agenda_ajena`) no existe todavía; hoy manda el rol,
 * como en el puente (`puente/tipos.ts`, `soloDeQuienEntra`).
 */
export const SOLO_LO_SUYO: readonly string[] = ['mesero'];

/** Un id que no es de nadie: filtrar por él devuelve cero filas. */
const NINGUNA = '00000000-0000-4000-8000-000000000000';

export async function profesionalVisible(
  ctx: ContextoComando<Transaccion>,
  pedida: string | null,
): Promise<string | null> {
  if (!SOLO_LO_SUYO.includes(ctx.ambito.rol)) return pedida;
  const propia = await ctx.paso('leer_mi_profesional', () =>
    ctx.tx
      .selectFrom('profesionales')
      .select('id')
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('empleo_id', '=', ctx.ambito.empleoId)
      .executeTakeFirst(),
  );
  const suya = propia?.id ?? NINGUNA;
  if (pedida !== null && pedida !== suya) {
    throw new ErrorDominio(
      'PUENTE_SIN_PERMISO',
      'Sólo puedes ver tu propia agenda y tus comisiones.',
    );
  }
  return suya;
}

/** La misma, para los comandos que SIEMPRE piden una profesional. */
export async function profesionalExigida(
  ctx: ContextoComando<Transaccion>,
  pedida: string,
): Promise<string> {
  return (await profesionalVisible(ctx, pedida)) ?? pedida;
}
