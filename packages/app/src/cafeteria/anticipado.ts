import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { comandarLineasPendientes } from '../restaurante/comandar-pendientes.ts';

/**
 * F-330 · El pedido anticipado, que es el cliente de oficina.
 *
 * ── El dolor ───────────────────────────────────────────────────────────────
 * «Se pierde el cliente de oficina que quiere seis cafés a las 8:15 y no tiene
 * forma de pedirlos antes.» Seis cafés es media hora de barra en el pico, y
 * llega justo cuando la fila da la vuelta a la esquina.
 *
 * ── Lo que se vende de más es LA PROMESA ──────────────────────────────────
 * Un pedido que entra a la fila cuando llega el cliente no es un pedido
 * anticipado: es uno normal con el cliente esperando. El dato que importa —y
 * que hoy no existe— es la distancia entre `hora_prometida` y `entregado_en`.
 *
 * ── Se reserva SIN PAGO y se cobra al recoger (C.14 de la 2.4) ──────────
 * Aquí decía que se cobraba ANTES, porque una reserva sin prenda es el no-show. La
 * decisión de Miguel es la otra mientras no haya pasarela (§10): «se reserva sin
 * pago y se cobra al recoger». Así que la orden llega CONFIRMADA —desde el menú
 * público (`portal/anticipado.ts`) o desde el mostrador—, la barra la prepara cuando
 * toca (`encolar` emite su comanda ANTES del pago) y `entregar` exige la orden
 * pagada: nada sale sin cobrar. El riesgo del no-show se acota con los tres pedidos
 * por hueco y con `no_recogido`.
 */

const ROLES = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

/**
 * Cuántos pedidos caben en el mismo hueco de cinco minutos.
 *
 * El hueco es de cinco minutos porque es lo que tarda un barista en sacar tres
 * bebidas seguidas. Aceptar más en el mismo hueco es prometer algo que no se
 * puede cumplir, y una promesa incumplida en este giro cuesta el cliente.
 */
const CABEN_POR_HUECO = 3;
const MINUTOS_DEL_HUECO = 5;
const MS_POR_MINUTO = 60_000;

export const entradaProgramarPedido = z.object({
  ordenId: z.uuid(),
  nombre: z.string().trim().min(1).max(40),
  telefono: z.string().trim().min(7).max(20).optional(),
  horaPrometida: z.iso.datetime(),
});

export interface ResultadoProgramado {
  readonly pedidoId: string;
  readonly horaPrometida: string;
  /** Cuántos pedidos hay ya en ese hueco de cinco minutos, contándose éste. */
  readonly enElHueco: number;
}

export const programarPedido = definirComando<
  Transaccion,
  typeof entradaProgramarPedido,
  ResultadoProgramado
>({
  nombre: 'cafeteria.programar_pedido',
  entidad: 'pedido_anticipado',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaProgramarPedido,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Un pedido anticipado se recoge en un local: hace falta saber en cuál.',
      );
    }

    const prometida = new Date(entrada.horaPrometida);
    if (prometida.getTime() <= ctx.ahora.getTime()) {
      // Un pedido anticipado para dentro de un minuto no es anticipado: es uno
      // normal, y prometer una hora que ya pasó es empezar incumpliendo.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La hora prometida ya pasó: eso es un pedido normal, no uno anticipado.',
      );
    }

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe en este negocio.');
    }
    if (orden.estado !== 'confirmada' && orden.estado !== 'pagada') {
      // Un borrador no tiene líneas confirmadas: apartarlo sería prometer una hora
      // para algo que todavía nadie pidió. Confirmada (se cobra al recoger) o pagada.
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Sólo se aparta una orden confirmada: primero se arma el pedido.',
      );
    }

    const enElHueco = await contarEnElHueco(ctx, sucursalId, prometida);
    if (enElHueco >= CABEN_POR_HUECO) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `A esa hora ya hay ${String(enElHueco)} pedidos comprometidos. Ofrece otro hueco.`,
        { horaPrometida: entrada.horaPrometida },
      );
    }

    const pedido = await ctx.paso('programar', () =>
      ctx.tx
        .insertInto('pedidos_anticipados')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          orden_id: entrada.ordenId,
          nombre: entrada.nombre,
          telefono: entrada.telefono ?? null,
          hora_prometida: prometida,
          estado: 'programado',
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: pedido.id,
      payload: {
        ordenId: entrada.ordenId,
        nombre: entrada.nombre,
        horaPrometida: entrada.horaPrometida,
      },
    });

    return {
      pedidoId: pedido.id,
      horaPrometida: prometida.toISOString(),
      enElHueco: enElHueco + 1,
    };
  },
});

export const entradaEncolarPedido = z.object({ pedidoId: z.uuid() });

export interface ResultadoEncolado {
  readonly pedidoId: string;
  /** Minutos de adelanto (positivo) o de retraso (negativo) contra la promesa. */
  readonly minutosDeAdelanto: number;
}

/**
 * Mete el pedido a la fila de barra.
 *
 * Lo dispara el planificador unos minutos antes de la hora prometida, no la
 * llegada del cliente: si se esperara a que llegue, el pedido anticipado no
 * adelantaría nada y toda la función sobraría.
 */
export const encolarPedido = definirComando<
  Transaccion,
  typeof entradaEncolarPedido,
  ResultadoEncolado
>({
  nombre: 'cafeteria.encolar_anticipado',
  entidad: 'pedido_anticipado',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaEncolarPedido,
  async ejecutar(ctx, entrada) {
    const pedido = await cargar(ctx, entrada.pedidoId);

    const tocadas = await ctx.paso('encolar', () =>
      ctx.tx
        .updateTable('pedidos_anticipados')
        // `estado` y `encolado_en` en la MISMA escritura: la 089 lo exige con
        // `pedido_anticipado_en_fila_con_hora`, y separarlas dejaría un pedido
        // en fila sin hora de entrada, que es el dato contra el que se mide.
        .set({ estado: 'en_fila', encolado_en: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', entrada.pedidoId)
        .where('estado', '=', 'programado')
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Ese pedido ya no estaba programado: o ya está en la fila, o ya se entregó.',
      );
    }

    /**
     * Y A LA BARRA, ANTES DEL PAGO (C.14 de la 2.4).
     *
     * Encolar sólo cambiaba el estado del pedido: la barra lee sus comandas, y la
     * comanda nacía hasta el COBRO. Un apartado que se prepara cuando la clienta
     * llega y paga no adelanta nada. Se emiten aquí con la misma función que usa el
     * cobro —las líneas que aún no salieron—, así que cobrar al recoger no las manda
     * dos veces. El `cobrado_en` de esa comanda es, en un apartado, la hora en que
     * entró a la barra: es desde cuándo se mide su espera.
     */
    await ctx.paso('comandar', () =>
      comandarLineasPendientes(ctx.tx, ctx.ambito.organizacionId, pedido.orden_id, ctx.ahora),
    );

    const minutos = Math.round(
      (pedido.hora_prometida.getTime() - ctx.ahora.getTime()) / MS_POR_MINUTO,
    );

    ctx.auditar({ entidadId: entrada.pedidoId, payload: { minutosDeAdelanto: minutos } });

    return { pedidoId: entrada.pedidoId, minutosDeAdelanto: minutos };
  },
});

export const entradaEntregarAnticipado = z.object({ pedidoId: z.uuid() });

export interface ResultadoEntregaAnticipada {
  readonly pedidoId: string;
  /** Contra la PROMESA, no contra la preparación. Negativo es tarde. */
  readonly minutosContraLaPromesa: number;
  readonly aTiempo: boolean;
}

export const entregarAnticipado = definirComando<
  Transaccion,
  typeof entradaEntregarAnticipado,
  ResultadoEntregaAnticipada
>({
  nombre: 'cafeteria.entregar_anticipado',
  entidad: 'pedido_anticipado',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaEntregarAnticipado,
  async ejecutar(ctx, entrada) {
    const pedido = await cargar(ctx, entrada.pedidoId);

    // Se cobra al recoger (C.14): lo que no se ha cobrado no sale de la barra.
    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['estado'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', pedido.orden_id)
        .executeTakeFirst(),
    );
    if (orden?.estado !== 'pagada') {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Cóbralo antes de entregarlo: el apartado se paga al recoger.',
      );
    }

    const tocadas = await ctx.paso('entregar', () =>
      ctx.tx
        .updateTable('pedidos_anticipados')
        // Las dos juntas otra vez: `pedido_anticipado_entregado_con_hora`.
        .set({ estado: 'entregado', entregado_en: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', entrada.pedidoId)
        .where('estado', 'in', ['programado', 'en_fila'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Ese pedido ya se había entregado o se marcó como no recogido.',
      );
    }

    /**
     * Y SU COMANDA DE BARRA, ENTREGADA (C.14 de la 2.4).
     *
     * El apartado se entrega por aquí, no por la tarjeta de la barra; sin esto su
     * comanda se quedaba en la fila y el cierre de turno la contaba como «cobrado
     * que nadie ha entregado», y no dejaba cerrar. `lista_en` se sella si faltaba,
     * igual que `cafeteria.entregar_pedido`: la bebida estuvo lista en algún momento.
     */
    const EN_LA_FILA = ['nuevo', 'en_preparacion', 'listo'];
    await ctx.paso('sellar_lista', () =>
      ctx.tx
        .updateTable('comandas')
        .set({ lista_en: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('orden_id', '=', pedido.orden_id)
        .where('estado', 'in', EN_LA_FILA)
        .where('lista_en', 'is', null)
        .execute(),
    );
    await ctx.paso('entregar_comandas', () =>
      ctx.tx
        .updateTable('comandas')
        .set({ estado: 'entregado', entregada_en: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('orden_id', '=', pedido.orden_id)
        .where('estado', 'in', EN_LA_FILA)
        .execute(),
    );

    // Contra la PROMESA, no contra la preparación. Medir desde que la comanda
    // llegó a barra diría que se cumplió el compromiso cuando lo que se
    // prometió fue una hora del reloj.
    const minutos = Math.round(
      (pedido.hora_prometida.getTime() - ctx.ahora.getTime()) / MS_POR_MINUTO,
    );

    ctx.auditar({
      entidadId: entrada.pedidoId,
      payload: { minutosContraLaPromesa: minutos, nombre: pedido.nombre },
    });

    return {
      pedidoId: entrada.pedidoId,
      minutosContraLaPromesa: minutos,
      aTiempo: minutos >= 0,
    };
  },
});

async function cargar(
  ctx: ContextoComando<Transaccion>,
  pedidoId: string,
): Promise<{ hora_prometida: Date; nombre: string; orden_id: string }> {
  const fila = await ctx.paso('cargar_pedido', () =>
    ctx.tx
      .selectFrom('pedidos_anticipados')
      .select(['hora_prometida', 'nombre', 'orden_id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', pedidoId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese pedido anticipado no existe aquí.');
  }
  return fila;
}

/**
 * Cuántos pedidos hay comprometidos en el mismo hueco de cinco minutos.
 *
 * Se cuenta en vez de guardarse: materializar la capacidad crearía un segundo
 * sitio donde la verdad puede divergir, y el primero que se desincronice va a
 * ser justo el que decide si se acepta el pedido.
 */
async function contarEnElHueco(
  ctx: ContextoComando<Transaccion>,
  sucursalId: string,
  prometida: Date,
): Promise<number> {
  const inicio = new Date(
    Math.floor(prometida.getTime() / (MINUTOS_DEL_HUECO * MS_POR_MINUTO)) *
      (MINUTOS_DEL_HUECO * MS_POR_MINUTO),
  );
  const fin = new Date(inicio.getTime() + MINUTOS_DEL_HUECO * MS_POR_MINUTO);

  const filas = await ctx.paso('contar_hueco', () =>
    ctx.tx
      .selectFrom('pedidos_anticipados')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('sucursal_id', '=', sucursalId)
      .where('estado', 'in', ['programado', 'en_fila'])
      .where('hora_prometida', '>=', inicio)
      .where('hora_prometida', '<', fin)
      .execute(),
  );
  return filas.length;
}
