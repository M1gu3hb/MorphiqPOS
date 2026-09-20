import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `venta.devolver` — devolverle el dinero de un pedido que nadie recogió (F-262).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `cafeteria/CierreDeTurno.tsx` no deja cerrar el turno con pedidos en la fila, y
 * ofrece las TRES salidas: entregarlo, darlo por no recogido, o devolverlo. Las
 * dos primeras existían; la tercera publicaba en `/api/venta/devolver`, **una ruta
 * que no existía**, y la pantalla lo decía en un comentario. Sin ella, el barista
 * que cierra a las nueve con un café pagado y sin dueño tiene dos salidas y
 * ninguna es la correcta: «entregarlo» miente —nadie se lo llevó— y «nadie vino»
 * deja el dinero cobrado sin devolver.
 *
 * ── Por qué entra por el PEDIDO y no por la orden ────────────────────────
 * Porque es donde está la persona: el diálogo del cierre de turno enseña la fila,
 * no las ventas. La orden se resuelve desde el pedido.
 *
 * ── Qué se devuelve, y qué NO se toca ────────────────────────────────────
 * El EFECTIVO sale del cajón como movimiento `devolucion`, con signo negativo, y
 * por eso el arqueo cuadra: el esperado es la suma de `movimientos_caja` y nada
 * más. Lo cobrado con tarjeta o transferencia **no genera movimiento**, porque no
 * hay billetes que sacar: se devuelve por la terminal bancaria, y el comando lo
 * informa por método para que quien cierra sepa qué le falta reversar. Fingir un
 * movimiento de efectivo por un cargo a tarjeta le pediría al cajero un faltante
 * que nunca existió.
 *
 * Los pagos quedan en `reembolsado`, y eso saca la venta del corte: `ventasCentavos`
 * suma los pagos CONFIRMADOS. Sin ese cambio, el turno cerraría con una venta que
 * ya no es venta y el reporte del día contaría un café que se devolvió.
 *
 * El INVENTARIO no se devuelve. La bebida se hizo: la leche y el grano ya se
 * consumieron, y un movimiento de entrada diría que el insumo volvió al almacén.
 * Lo que se perdió se ve en el margen, que es donde se tiene que ver.
 *
 * ── Y por qué es idempotente ─────────────────────────────────────────────
 * Porque es dinero y el botón está en un diálogo que se recarga: dos toques no
 * pueden sacar dos veces el efectivo del cajón. Si la venta ya está reembolsada se
 * devuelve lo mismo que la primera vez, sin escribir.
 */

const CIERRA_TURNO = ['cajero', 'cocina', 'gerente', 'administrador', 'dueno'] as const;

/** Los estados en los que un pedido todavía está en la fila de la barra. */
const EN_LA_FILA = ['nuevo', 'en_preparacion', 'listo'] as const;

export const entradaDevolverPedido = z.object({ pedidoId: z.uuid() });

export interface DineroPorMetodo {
  readonly metodo: string;
  readonly montoCentavos: string;
}

export interface ResultadoDevolucion {
  readonly pedidoId: string;
  readonly ordenId: string;
  /** Lo que sale del cajón. Sólo el efectivo: lo demás se reversa en su terminal. */
  readonly efectivoDevueltoCentavos: string;
  readonly totalDevueltoCentavos: string;
  /** Lo que hay que reversar a mano, por método. Vacío si todo fue en efectivo. */
  readonly porReversar: readonly DineroPorMetodo[];
  /** `true` si ya estaba devuelta: el segundo toque no saca dinero otra vez. */
  readonly yaEstaba: boolean;
}

export const devolverPedido = definirComando<
  Transaccion,
  typeof entradaDevolverPedido,
  ResultadoDevolucion
>({
  nombre: 'venta.devolver',
  entidad: 'orden',
  escribe: true,
  roles: [...CIERRA_TURNO],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaDevolverPedido,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId, empleoId } = ctx.ambito;

    // DOS consultas y no un `join`: las dos tablas tienen una columna `estado` y
    // el pedido y la venta pueden estar en estados distintos. Un `join` que
    // proyectara las dos como alias deja el código a merced de cuál gana, y lo que
    // se decide aquí es justamente con el estado de cada una.
    const pedido = await ctx.paso('cargar_pedido', () =>
      ctx.tx
        .selectFrom('comandas')
        .select(['id', 'estado', 'orden_id as ordenId'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.pedidoId)
        .executeTakeFirst(),
    );
    if (pedido === undefined) {
      throw new ErrorDominio('COMANDA_NO_ENCONTRADA', 'Ese pedido no existe en este negocio.');
    }

    // `comandas.orden_id` es `not null`: un pedido siempre cuelga de una venta.
    // Lo que sí puede faltar es la FILA, si el id apunta a una de otro negocio.
    const ordenId = pedido.ordenId;
    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'nombre_pedido as nombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      // Sin venta que leer no hay nada que devolver, y decirlo es mejor que
      // sacar dinero del cajón contra una cuenta que no se puede mirar.
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Ese pedido no tiene una venta cobrada detrás: si nadie vino, márcalo como no recogido.',
      );
    }

    const pagos = await ctx.paso('leer_pagos', () =>
      ctx.tx
        .selectFrom('pagos')
        .select(['id', 'metodo', 'monto_centavos as monto', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', ordenId)
        .execute(),
    );

    const sumar = (metodo: (m: string) => boolean): bigint =>
      pagos
        .filter((p) => p.estado === 'confirmado' && metodo(p.metodo))
        .reduce((total, p) => total + p.monto, 0n);

    // ── Idempotencia: el segundo toque no saca dinero otra vez ─────────────
    if (orden.estado === 'reembolsada') {
      const yaReembolsados = pagos.filter((p) => p.estado === 'reembolsado');
      const efectivo = yaReembolsados
        .filter((p) => p.metodo === 'efectivo')
        .reduce((total, p) => total + p.monto, 0n);
      const total = yaReembolsados.reduce((suma, p) => suma + p.monto, 0n);
      ctx.auditar({ entidadId: ordenId, payload: { pedidoId: pedido.id, yaEstaba: true } });
      return {
        pedidoId: pedido.id,
        ordenId,
        efectivoDevueltoCentavos: efectivo.toString(),
        totalDevueltoCentavos: total.toString(),
        porReversar: yaReembolsados
          .filter((p) => p.metodo !== 'efectivo')
          .map((p) => ({ metodo: p.metodo, montoCentavos: p.monto.toString() })),
        yaEstaba: true,
      };
    }

    if (orden.estado !== 'pagada') {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Esa venta no está cobrada: no hay dinero que devolver. Si nadie vino, márcalo como no ' +
          'recogido.',
        { estado: orden.estado },
      );
    }

    if (!(EN_LA_FILA as readonly string[]).includes(pedido.estado)) {
      throw new ErrorDominio('TRANSICION_INVALIDA', 'Ese pedido ya salió de la fila.', {
        estado: pedido.estado,
      });
    }

    const efectivo = sumar((m) => m === 'efectivo');
    const total = sumar(() => true);
    if (total === 0n) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Esa venta no tiene ningún pago confirmado que devolver.',
      );
    }

    // El efectivo sale de ESTA caja, y la caja sale de la terminal de la sesión.
    // Sin caja abierta el billete saldría del cajón sin renglón que lo explique, y
    // el corte de quien la abra mañana aparecería con un faltante.
    if (efectivo > 0n) {
      if (terminalId === null) {
        throw new ErrorDominio(
          'VENTA_SIN_TERMINAL',
          'La devolución en efectivo se registra desde la terminal donde está el cajón.',
        );
      }
      const sesion = await ctx.paso('cargar_caja', () =>
        repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
      );
      if (sesion === null) {
        throw new ErrorDominio(
          'CAJA_CERRADA',
          'No hay caja abierta en esta terminal: abre la caja para poder devolver el efectivo.',
        );
      }

      await ctx.paso('sacar_del_cajon', () =>
        repoCaja.registrarMovimiento(ctx.tx, {
          organizacionId,
          sesionCajaId: sesion.id,
          tipo: 'devolucion',
          // NEGATIVO, y lo pone el servidor: `movimiento_signo_coherente` exige
          // que una devolución reste, y el arqueo es la suma de los movimientos.
          montoCentavos: -efectivo,
          referenciaTipo: 'orden',
          referenciaId: ordenId,
          empleadoId: empleoId,
          motivo: `Devolución de ${orden.nombre ?? 'pedido'} no recogido`,
        }),
      );
    }

    // Los pagos dejan de ser venta. El corte suma los CONFIRMADOS, así que sin
    // esto el turno cerraría contando un café que se devolvió.
    await ctx.paso('reembolsar_pagos', () =>
      ctx.tx
        .updateTable('pagos')
        .set({ estado: 'reembolsado' })
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', ordenId)
        .where('estado', '=', 'confirmado')
        .execute(),
    );

    const movidas = await ctx.paso('marcar_reembolsada', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({ estado: 'reembolsada' })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', ordenId)
        // La guarda de la carrera: dos pantallas devolviendo a la vez. La segunda
        // mueve cero filas y la transacción entera revierte, así que el efectivo
        // no sale dos veces.
        .where('estado', '=', 'pagada')
        .executeTakeFirst(),
    );
    if (Number(movidas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('TRANSICION_INVALIDA', 'Esa venta cambió desde otra pantalla.');
    }

    // Y el pedido sale de la fila. `cancelado` y no `no_recogido`: no recogido es
    // «se quedó sin dueño y el negocio se queda el dinero»; esto es lo contrario.
    await ctx.paso('sacar_de_la_fila', () =>
      ctx.tx
        .updateTable('comandas')
        .set({ estado: 'cancelado' })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', pedido.id)
        .where('estado', 'in', [...EN_LA_FILA])
        .execute(),
    );

    ctx.auditar({
      entidadId: ordenId,
      payload: {
        pedidoId: pedido.id,
        efectivoCentavos: (-efectivo).toString(),
        totalCentavos: total.toString(),
        yaEstaba: false,
      },
    });

    return {
      pedidoId: pedido.id,
      ordenId,
      efectivoDevueltoCentavos: efectivo.toString(),
      totalDevueltoCentavos: total.toString(),
      porReversar: pagos
        .filter((p) => p.estado === 'confirmado' && p.metodo !== 'efectivo')
        .map((p) => ({ metodo: p.metodo, montoCentavos: p.monto.toString() })),
      yaEstaba: false,
    };
  },
});
