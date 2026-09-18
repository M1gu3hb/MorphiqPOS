import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-140 y F-142 · La nota de mostrador, apartada y entregada.
 *
 * ── Las tres cosas que pasan en un mostrador ─────────────────────────────
 * El cliente pide, se le arma lo que pidió, y entonces puede pasar cualquiera
 * de tres cosas: se lo lleva y paga, se lo lleva a crédito, o dice «déjamelo
 * apartado, ahorita vuelvo con la camioneta». Las tres son la misma nota en
 * tres estados, y la tercera —que es diaria— no tiene sitio en una tabla de
 * órdenes: o se cierra una venta que no se cobró, o se pierde el armado y hay
 * que hacerlo otra vez cuando el cliente vuelva.
 *
 * ── Por qué apartar EXIGE una fecha de caducidad ─────────────────────────
 * Es la única regla dura de este archivo, y la base también la exige
 * (`nota_apartada_con_vencimiento`). Sin fecha, el patio se llena de material
 * comprometido para clientes que no volvieron: la existencia miente hacia
 * abajo, el sistema pide material que sí hay, y nadie sabe qué liberar.
 *
 * ── Y por qué entregar sella la HORA ─────────────────────────────────────
 * Porque «¿cuándo se llevó esto?» es la primera pregunta cuando el cliente
 * dice que no le dieron todo. Derivarla del `updated_at` mentiría a la primera
 * corrección de una nota.
 *
 * ── Lo que estos dos comandos NO hacen ───────────────────────────────────
 * No cobran. Apartar no mueve dinero y entregar tampoco: el cobro es
 * `venta.cobrar` y pasa en la caja, a veces con otra persona. Juntarlos haría
 * que apartar material descontara existencia y cobrara, que es exactamente lo
 * que el mostrador no quiere.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Apartar por más de un mes es no apartar: es esconder material. */
const DIAS_MAXIMOS_DE_APARTADO = 30;

export const entradaApartarNota = z.object({
  notaId: z.uuid(),
  /** Hasta cuándo se guarda. La base la exige y aquí se acota por arriba. */
  apartaHasta: z.iso.datetime(),
  nota: z.string().trim().max(200).optional(),
});

export const entradaEntregarNota = z.object({
  notaId: z.uuid(),
});

export interface ResultadoNota {
  readonly notaId: string;
  readonly estado: string;
}

interface FilaDeNota {
  readonly id: string;
  readonly estado: string;
  readonly orden_id: string;
}

async function cargarNota(ctx: ContextoComando<Transaccion>, notaId: string): Promise<FilaDeNota> {
  const fila = await ctx.paso('leer_nota', () =>
    ctx.tx
      .selectFrom('notas_mostrador')
      .select(['id', 'estado', 'orden_id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', notaId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa nota no existe en este negocio.');
  }
  return fila;
}

export const apartarNota = definirComando<Transaccion, typeof entradaApartarNota, ResultadoNota>({
  nombre: 'nota_mostrador.apartar',
  entidad: 'nota_mostrador',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaApartarNota,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await cargarNota(ctx, entrada.notaId);

    const hasta = new Date(entrada.apartaHasta);
    // Hacia atrás no se aparta: sería material comprometido y ya vencido en el
    // mismo movimiento, y la lista de la mañana lo enseñaría como caducado sin
    // que nadie lo hubiera apartado nunca.
    if (hasta.getTime() <= ctx.ahora.getTime()) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La fecha hasta la que se aparta tiene que ser posterior a ahora.',
      );
    }
    const dias = (hasta.getTime() - ctx.ahora.getTime()) / 86_400_000;
    if (dias > DIAS_MAXIMOS_DE_APARTADO) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `Apartar por más de ${DIAS_MAXIMOS_DE_APARTADO} días no es apartar: es esconder material.`,
      );
    }

    // El estado y su fecha en la MISMA escritura: la migración 116 lo exige con
    // `nota_apartada_con_vencimiento`, y separarlos dejaría material apartado
    // sin caducidad —que es como el patio se llena—.
    const tocadas = await ctx.paso('apartar', () =>
      ctx.tx
        .updateTable('notas_mostrador')
        .set({
          estado: 'apartada',
          aparta_hasta: hasta,
          nota: entrada.nota ?? null,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.notaId)
        .where('estado', 'in', ['armando', 'apartada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      // Único cerrojo, y cubre las dos: la nota ya entregada —apartarla la
      // devolvería al patio sin que la mercancía esté— y la cancelada.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa nota ya no se puede apartar: o se entregó, o se canceló.',
      );
    }

    ctx.auditar({ entidadId: entrada.notaId, payload: { apartaHasta: entrada.apartaHasta } });
    return { notaId: entrada.notaId, estado: 'apartada' };
  },
});

export const entregarNota = definirComando<Transaccion, typeof entradaEntregarNota, ResultadoNota>({
  nombre: 'nota_mostrador.entregar',
  entidad: 'nota_mostrador',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEntregarNota,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    await cargarNota(ctx, entrada.notaId);

    // La hora se SELLA aquí. «¿Cuándo se llevó esto?» es la primera pregunta
    // cuando el cliente dice que no le dieron todo, y derivarla de `updated_at`
    // mentiría a la primera corrección de la nota.
    const tocadas = await ctx.paso('entregar', () =>
      ctx.tx
        .updateTable('notas_mostrador')
        .set({
          estado: 'entregada',
          entregada_en: ctx.ahora,
          cerrada_en: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.notaId)
        .where('estado', 'in', ['armando', 'apartada', 'por_cobrar'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa nota ya estaba entregada o cancelada.',
      );
    }

    ctx.auditar({ entidadId: entrada.notaId, payload: { entregada: true } });
    return { notaId: entrada.notaId, estado: 'entregada' };
  },
});
