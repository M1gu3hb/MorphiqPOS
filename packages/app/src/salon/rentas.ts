import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-441 · La renta de estación: cobrarla.
 *
 * ── El modelo de negocio que el sistema no sabía nombrar ─────────────────
 * En una parte de los salones la estilista no es empleada ni comisionista:
 * RENTA la silla. Paga fijo por semana o por mes, cobra ella sus servicios y el
 * salón no toca ese dinero. Sin esto, el salón mete a esas personas como
 * empleadas con comisión del 100 %, y entonces sus servicios inflan la venta
 * del negocio, el IVA que reporta y el impuesto que paga por dinero que nunca
 * entró al cajón.
 *
 * ── Por qué la renta se COBRA y no se «descuenta» ────────────────────────
 * Quien renta no tiene regla de comisión —la migración 130 lo exige con
 * `profesional_renta_sin_comision`— así que no hay liquidación de la que
 * restarla. Colgarla de una obligaría a inventar una liquidación de cero pesos
 * cada semana sólo para poder descontar la renta.
 *
 * ── Y el PERIODO es un rango, no una fecha ───────────────────────────────
 * Para que dos cobros del mismo periodo no puedan existir. Una renta cobrada
 * dos veces es la discusión más cara que puede tener un salón con alguien que
 * no depende de él: no hay nómina donde ajustarlo. La exclusión GiST de la
 * migración 136 lo hace imposible, y aquí se comprueba además contra las filas
 * que ya hay para poder decirlo con palabras en vez de con un 23P01.
 */

const COBRA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaCobrarRenta = z.object({
  rentaId: z.uuid(),
  /** El periodo que se está cobrando, en fechas de día. */
  periodoDesde: z.iso.date(),
  periodoHasta: z.iso.date(),
  metodo: z.enum(['efectivo', 'transferencia', 'tarjeta', 'descuento_liquidacion']),
  sesionCajaId: z.uuid().nullable().default(null),
});

export interface ResultadoCobroRenta {
  readonly cobroId: string;
  readonly montoCentavos: string;
  readonly periodo: string;
}

export const cobrarRenta = definirComando<
  Transaccion,
  typeof entradaCobrarRenta,
  ResultadoCobroRenta
>({
  nombre: 'renta.cobrar',
  entidad: 'cobro_renta',
  escribe: true,
  roles: [...COBRA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCobrarRenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    if (entrada.periodoHasta <= entrada.periodoDesde) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'El periodo de la renta termina antes de empezar.',
      );
    }

    const renta = await ctx.paso('leer_renta', () =>
      ctx.tx
        .selectFrom('rentas_estacion')
        .select(['id', 'profesional_id', 'monto_centavos', 'activa', 'vigente_hasta'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.rentaId)
        .executeTakeFirst(),
    );
    if (renta === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa renta no existe en este negocio.');
    }
    if (!renta.activa) {
      // Cobrar una renta dada de baja es cobrarle a quien ya se fue. Pasa, y el
      // que lo descubre es quien recibe la llamada.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa renta ya no está activa: no se le puede cobrar.',
      );
    }

    // La exclusión GiST de la 136 impide el duplicado, pero un 23P01 no dice
    // QUÉ periodo chocó. Esto sí, y es lo que el mostrador necesita leer.
    const yaCobrado = await ctx.paso('buscar_duplicado', () =>
      ctx.tx
        .selectFrom('cobros_renta')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('renta_id', '=', entrada.rentaId)
        .where(
          sql<boolean>`periodo && daterange(${entrada.periodoDesde}::date, ${entrada.periodoHasta}::date, '[)')`,
        )
        .executeTakeFirst(),
    );
    if (yaCobrado !== undefined) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Ese periodo de renta ya se cobró: revisa antes de volver a cobrarlo.',
      );
    }

    const cobro = await ctx.paso('cobrar', () =>
      ctx.tx
        .insertInto('cobros_renta')
        .values({
          organizacion_id: organizacionId,
          renta_id: entrada.rentaId,
          profesional_id: renta.profesional_id,
          periodo: sql<string>`daterange(${entrada.periodoDesde}::date, ${entrada.periodoHasta}::date, '[)')`,
          // El monto sale de la RENTA, no de la entrada: aceptarlo de la
          // pantalla convertiría un cobro fijo en uno negociable por teclado.
          monto_centavos: renta.monto_centavos,
          metodo: entrada.metodo,
          sesion_caja_id: entrada.sesionCajaId,
          cobrado_en: ctx.ahora,
          cobrado_por: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: cobro.id,
      payload: { rentaId: entrada.rentaId, desde: entrada.periodoDesde },
    });
    return {
      cobroId: cobro.id,
      montoCentavos: renta.monto_centavos.toString(),
      periodo: `${entrada.periodoDesde}/${entrada.periodoHasta}`,
    };
  },
});
