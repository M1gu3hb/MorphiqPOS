import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';

import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
import { entradaValorar } from './esquemas.ts';

/**
 * `portal.valorar` — la carita que deja el comensal (E7-3).
 *
 * ── El emoji lo pone el servidor ──────────────────────────────────────────
 * `ValoracionEmoji.jsx:66-70` manda `satisfaccion_emoji` y
 * `satisfaccion_label` desde el navegador. Son dos campos de texto libre que
 * acaban en la base y de ahí en un reporte: cualquiera puede escribir lo que
 * quiera en el emoji de una venta. Aquí el comensal manda el número del 1 al 5
 * y el emoji sale de la tabla de abajo. `satisfaccion_label` no se guarda: es
 * el mismo dato escrito con letra (`F1-04` §6.7).
 *
 * ── Qué venta se valora ───────────────────────────────────────────────────
 * La del comensal que está en la mesa: la viva, o la que se cerró hace poco.
 * «Hace poco» es un turno, no un día: sin ventana, quien escanee el código a
 * las ocho de la noche valoraría la comida de otra persona a mediodía.
 */

export interface ResultadoValoracion {
  readonly ventaId: string;
  readonly score: number;
  readonly yaValorada: boolean;
}

/** Los cinco de `ValoracionEmoji.jsx:7-13`, con su carita. */
const EMOJIS: Readonly<Record<number, string>> = {
  1: '😡',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '🤩',
};

/** Un turno de comida. Más allá, la venta ya no es de quien está sentado. */
const VENTANA_HORAS = 6;
const MILISEGUNDOS_POR_HORA = 3_600_000;

const ESTADOS_VALORABLES = [
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
  'pagada',
] as const;

export const valorarVisita = definirComandoPublico<typeof entradaValorar, ResultadoValoracion>({
  nombre: 'portal.valorar',
  entidad: 'orden',
  accion: 'valorar',
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaValorar,
  async ejecutar(ctx, entrada) {
    const orden = await ctx.paso('buscar_venta', () => ventaValorable(ctx));

    // Doble toque con mala cobertura: se devuelve lo que ya hay en vez de
    // fallar. La valoración no es un cobro; insistir no puede ser un error.
    if (orden.satisfaccion_score !== null) {
      ctx.auditar({ entidadId: orden.id, payload: { yaValorada: true } });
      return { ventaId: orden.id, score: orden.satisfaccion_score, yaValorada: true };
    }

    await ctx.paso('guardar_valoracion', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          satisfaccion_score: entrada.score,
          satisfaccion_emoji: EMOJIS[entrada.score] ?? null,
          satisfaccion_comentario: entrada.comentario === '' ? null : entrada.comentario,
          // El `check orden_satisfaccion_completa` exige que la fecha y la
          // calificación existan o falten a la vez.
          satisfaccion_en: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', orden.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: { score: entrada.score, conComentario: entrada.comentario !== '' },
    });

    return { ventaId: orden.id, score: entrada.score, yaValorada: false };
  },
});

interface VentaValorable {
  readonly id: string;
  readonly satisfaccion_score: number | null;
}

async function ventaValorable(ctx: ContextoPortal): Promise<VentaValorable> {
  const desde = new Date(ctx.ahora.getTime() - VENTANA_HORAS * MILISEGUNDOS_POR_HORA);

  const orden = await ctx.tx
    .selectFrom('ordenes')
    .select(['id', 'satisfaccion_score'])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('estado', 'in', ESTADOS_VALORABLES)
    .where('created_at', '>=', desde)
    .orderBy('created_at', 'desc')
    .executeTakeFirst();

  if (orden === undefined) {
    throw new ErrorDominio(
      'ORDEN_NO_ENCONTRADA',
      'No encontramos una visita reciente en esta mesa para valorar.',
    );
  }
  return orden;
}
