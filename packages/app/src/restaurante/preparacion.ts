import 'server-only';

import { PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { comandaPorId, ordenDeMesa, type ComandaViva } from './datos.ts';
import { entradaEntregarPedidos, entradaTransicionarPedido } from './esquemas.ts';
import { ajustarComandaAlMinimo, itemDeComanda, moverItem, type ItemDeComanda } from './items.ts';
import { marcarEntregadas, moverComanda, sincronizarMesa } from './preparacion-escrituras.ts';
import { propagarAItems, recalcularEstadoDeLineas } from './propagacion.ts';
import { estadoComandaDeItem, evaluarTransicion, type EstadoComanda } from './transiciones.ts';

/**
 * El ciclo de preparación: `transicionar_pedido` y `entregar_pedidos` (E6-6).
 *
 * Los dos comparten la misma mecánica y por eso viven juntos: mueven comandas,
 * arrastran sus items y las líneas de venta en la MISMA transacción, y después
 * deciden si la mesa avanza.
 *
 * ── La versión monotónica ──────────────────────────────────────────────────
 * No hay columna `version` en `comandas`: la versión es el rango del estado
 * (ver `transiciones.ts`). Un toque que llega tarde pidiendo `en_preparacion`
 * sobre una comanda que ya está `listo` NO devuelve el plato al fuego: se
 * rechaza con `TRANSICION_INVALIDA`. Y el `where estado = <el que leímos>` de
 * cada `update` es lo que hace que dos pantallas de cocina abiertas a la vez no
 * se pisen: la segunda actualiza cero filas y revierte.
 */

const ROLES_DE_COCINA = [
  'cocina',
  'mesero',
  'cajero',
  'gerente',
  'administrador',
  'dueno',
] as const;

export interface ResultadoTransicion {
  readonly comandaId: string;
  readonly estado: string;
  readonly estadoAnterior: string;
  readonly estadoMesa: string | null;
}

export const transicionarPedido = definirComando<
  Transaccion,
  typeof entradaTransicionarPedido,
  ResultadoTransicion
>({
  nombre: 'restaurante.transicionar_pedido',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_COCINA],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaTransicionarPedido,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const comanda = await ctx.paso('cargar_comanda', () =>
      comandaPorId(ctx.tx, organizacionId, entrada.comandaId),
    );

    const itemId = entrada.comandaItemId;
    const item =
      itemId === undefined
        ? null
        : await ctx.paso('cargar_item', () =>
            itemDeComanda(ctx.tx, organizacionId, comanda.id, itemId),
          );

    // Lanza TRANSICION_INVALIDA si el destino no sigue a la tabla o retrocede.
    // Sobre el item se evalúa la MISMA tabla, traduciendo `pendiente` a `nuevo`.
    const partida = item === null ? comanda.estado : estadoComandaDeItem(item.estado);
    const movimiento = evaluarTransicion(partida, entrada.estado);

    if (movimiento.tipo === 'sin_cambio') {
      ctx.auditar({
        entidadId: comanda.id,
        payload: { estado: comanda.estado, itemId: itemId ?? null, sinCambio: true },
      });
      return {
        comandaId: comanda.id,
        estado: comanda.estado,
        estadoAnterior: comanda.estado,
        estadoMesa: null,
      };
    }

    const estadoComanda =
      item === null
        ? await moverToda(ctx, comanda, entrada.estado, empleoId)
        : await moverUnPlato(ctx, comanda, item, entrada.estado);

    await ctx.paso('recalcular_lineas', () =>
      recalcularEstadoDeLineas(ctx.tx, organizacionId, [comanda.id]),
    );

    const estadoMesa = await ctx.paso('avanzar_mesa', () =>
      sincronizarMesa(ctx.tx, {
        organizacionId,
        ordenId: comanda.ordenId,
        mesaId: comanda.mesaId,
        comandasMovidas: [comanda.id],
        estadoComanda,
      }),
    );

    ctx.auditar({
      entidadId: comanda.id,
      payload: {
        de: comanda.estado,
        a: estadoComanda,
        itemId: itemId ?? null,
        estacion: comanda.estacionNombre,
        estadoMesa,
      },
    });

    return {
      comandaId: comanda.id,
      estado: estadoComanda,
      estadoAnterior: comanda.estado,
      estadoMesa,
    };
  },
});

/** La comanda entera: se mueve la cabecera y sus items la siguen. */
async function moverToda(
  ctx: ContextoComando<Transaccion>,
  comanda: ComandaViva,
  destino: EstadoComanda,
  empleoId: string,
): Promise<EstadoComanda> {
  const { organizacionId } = ctx.ambito;
  await ctx.paso('mover_comanda', () =>
    moverComanda(ctx.tx, {
      organizacionId,
      comandaId: comanda.id,
      desde: comanda.estado,
      hacia: destino,
      empleoId,
      ahora: ctx.ahora,
    }),
  );
  await ctx.paso('propagar_items', () =>
    propagarAItems(ctx.tx, organizacionId, [comanda.id], destino),
  );
  return destino;
}

/**
 * Un solo plato: se mueve el item y la comanda se DERIVA del mínimo.
 *
 * Al revés que la rama de arriba, y a propósito. Si aquí se moviera también la
 * cabecera, marcar listo el primero de tres platos dejaría la comanda entera en
 * `listo` y el mesero recogería una charola incompleta.
 */
async function moverUnPlato(
  ctx: ContextoComando<Transaccion>,
  comanda: ComandaViva,
  item: ItemDeComanda,
  destino: EstadoComanda,
): Promise<EstadoComanda> {
  const { organizacionId } = ctx.ambito;
  await ctx.paso('mover_item', () => moverItem(ctx.tx, organizacionId, item, destino));
  return ctx.paso('derivar_comanda', () =>
    ajustarComandaAlMinimo(ctx.tx, organizacionId, comanda.id, comanda.estado, ctx.ahora),
  );
}

export interface ResultadoEntrega {
  readonly ordenId: string;
  readonly entregadas: readonly string[];
  readonly estaciones: readonly string[];
  readonly estadoMesa: string | null;
}

/**
 * Entrega de una vez todo lo que la cocina dejó listo para esa cuenta.
 *
 * Sólo mueve las comandas en `listo`, igual que `entregaPedidos.js:110`: lo que
 * sigue en el fuego no se puede entregar. Que no haya nada listo no es un
 * fallo: es un mesero que llegó antes que el plato, y devolver una lista vacía
 * lo dice sin inventar un error.
 */
export const entregarPedidos = definirComando<
  Transaccion,
  typeof entradaEntregarPedidos,
  ResultadoEntrega
>({
  nombre: 'restaurante.entregar_pedidos',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_COCINA],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaEntregarPedidos,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ordenDeMesa(ctx.tx, organizacionId, entrada.ordenId),
    );

    const listas = await ctx.paso('buscar_listas', () =>
      ctx.tx
        .selectFrom('comandas')
        .select(['id', 'estacion_nombre as estacionNombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', entrada.ordenId)
        .where('estado', '=', 'listo')
        .execute(),
    );

    const ids = listas.map((c) => c.id);

    if (ids.length > 0) {
      await ctx.paso('marcar_entregadas', () =>
        marcarEntregadas(ctx.tx, organizacionId, ids, ctx.ahora),
      );
      await ctx.paso('propagar_items', () =>
        propagarAItems(ctx.tx, organizacionId, ids, 'entregado'),
      );
      await ctx.paso('recalcular_lineas', () =>
        recalcularEstadoDeLineas(ctx.tx, organizacionId, ids),
      );
    }

    const estadoMesa = await ctx.paso('avanzar_mesa', () =>
      sincronizarMesa(ctx.tx, {
        organizacionId,
        ordenId: entrada.ordenId,
        mesaId: orden.mesaId,
        comandasMovidas: ids,
        estadoComanda: 'entregado',
      }),
    );

    const estaciones = [
      ...new Set(listas.map((c) => c.estacionNombre).filter((n): n is string => n !== null)),
    ];

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: { entregadas: ids.length, estaciones, estadoMesa },
    });

    return { ordenId: entrada.ordenId, entregadas: ids, estaciones, estadoMesa };
  },
});
