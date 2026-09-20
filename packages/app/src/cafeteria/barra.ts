import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * La fila de despacho de mostrador — F-328 y F-329.
 *
 * ── El hueco más grande de la carpeta ──────────────────────────────────────
 * Se cobra y el vaso DESAPARECE del sistema. Quince personas esperando algo que
 * el punto de venta no sabe que existe: la barra trabaja de memoria, el cliente
 * pregunta y nadie puede contestar. Es lo que convierte a `operativo` en «un POS
 * de tienda vendiendo café».
 *
 * ── El nombre vive escrito con plumón ──────────────────────────────────────
 * Y en la memoria de alguien con las dos manos ocupadas. Se entregan bebidas a
 * quien no era, se quedan vasos fríos, y nadie puede decir cuánto tardó de
 * verdad un pedido.
 *
 * ── Sobre los roles ────────────────────────────────────────────────────────
 * El modelo habla de «barista», que NO es uno de los siete roles del sistema.
 * Un barista cobra y prepara, así que estos comandos los pueden ejecutar
 * `cajero` y `cocina` —los dos papeles que un barista hace a la vez— además de
 * la dirección. Queda anotado como reclasificación.
 */

const ROLES_DE_BARRA = ['cajero', 'cocina', 'gerente', 'administrador', 'dueno'] as const;

export const MEDIOS_DE_LLAMADO = ['pantalla', 'voz', 'whatsapp'] as const;

export const entradaLlamarPedido = z.object({
  pedidoId: z.uuid(),
  medio: z.enum(MEDIOS_DE_LLAMADO),
});

export const entradaPedidoDeBarra = z.object({ pedidoId: z.uuid() });

export interface ResultadoLlamado {
  readonly pedidoId: string;
  readonly numeroLlamado: number;
  readonly medio: string;
  readonly puedeDarsePorNoRecogido: boolean;
}

export interface ResultadoEntrega {
  readonly pedidoId: string;
  readonly estado: string;
  readonly segundosDeEspera: number;
}

/** Estados en los que el pedido sigue en la fila. */
const EN_LA_FILA = ['nuevo', 'en_preparacion', 'listo'] as const;

/** Tres llamados antes de tirar una bebida que alguien pagó. */
const LLAMADOS_PARA_ABANDONAR = 3;

/**
 * Un minuto para deshacer una entrega.
 *
 * Se valida en el SERVIDOR y no escondiendo el botón: la pantalla de barra vive
 * abierta horas y su reloj se desincroniza, y un «deshacer» sin límite real es
 * la puerta por la que un pedido entregado vuelve a la fila al día siguiente.
 */
const SEGUNDOS_PARA_DESHACER = 60;

export const llamarPedido = definirComando<
  Transaccion,
  typeof entradaLlamarPedido,
  ResultadoLlamado
>({
  nombre: 'cafeteria.llamar_pedido',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_BARRA],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaLlamarPedido,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;
    const pedido = await ctx.paso('cargar_pedido', () =>
      cargarPedido(ctx.tx, organizacionId, entrada.pedidoId),
    );

    if (!(EN_LA_FILA as readonly string[]).includes(pedido.estado)) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        pedido.estado === 'entregado'
          ? 'Ese pedido ya se entregó: no hay a quién llamar.'
          : 'Ese pedido ya no está en la fila.',
        { estado: pedido.estado },
      );
    }

    const numeroLlamado = pedido.llamados + 1;

    await ctx.paso('anotar_llamado', () =>
      ctx.tx
        .insertInto('llamados_pedido')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: pedido.sucursalId,
          comanda_id: pedido.id,
          medio: entrada.medio,
          numero_llamado: numeroLlamado,
          empleado_id: empleoId,
          ocurrido_en: ctx.ahora,
        })
        .execute(),
    );

    // El PRIMER llamado sella `lista_en` si la barra no lo había marcado: si
    // grita el nombre es que la bebida está hecha, y sin este sello el tiempo
    // de preparación de ese pedido sería un hueco en la medición.
    const sello = pedido.listaEn === null ? { lista_en: ctx.ahora } : {};

    await ctx.paso('contar_llamado', () =>
      ctx.tx
        .updateTable('comandas')
        .set({ llamados: numeroLlamado, ...sello })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', pedido.id)
        // La guarda de la carrera: dos baristas tocando a la vez. El segundo
        // actualiza cero filas, su `insert` ya chocó con `llamado_numero_unico`
        // y la transacción entera revierte.
        .where('llamados', '=', pedido.llamados)
        .execute(),
    );

    ctx.auditar({
      entidadId: pedido.id,
      payload: { numeroLlamado, medio: entrada.medio, nombre: pedido.nombrePedido },
    });

    return {
      pedidoId: pedido.id,
      numeroLlamado,
      medio: entrada.medio,
      puedeDarsePorNoRecogido: numeroLlamado >= LLAMADOS_PARA_ABANDONAR,
    };
  },
});

export const entregarPedidoDeBarra = definirComando<
  Transaccion,
  typeof entradaPedidoDeBarra,
  ResultadoEntrega
>({
  nombre: 'cafeteria.entregar_pedido',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_BARRA],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaPedidoDeBarra,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const pedido = await ctx.paso('cargar_pedido', () =>
      cargarPedido(ctx.tx, organizacionId, entrada.pedidoId),
    );

    if (!(EN_LA_FILA as readonly string[]).includes(pedido.estado)) {
      throw new ErrorDominio('TRANSICION_INVALIDA', 'Ese pedido ya salió de la fila.', {
        estado: pedido.estado,
      });
    }

    const movidas = await ctx.paso('entregar', () =>
      ctx.tx
        .updateTable('comandas')
        .set({
          estado: 'entregado',
          entregada_en: ctx.ahora,
          // Si se entrega sin haber marcado listo, la bebida estuvo lista en
          // algún momento: sellarlo aquí es menos falso que dejarlo vacío.
          ...(pedido.listaEn === null ? { lista_en: ctx.ahora } : {}),
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', pedido.id)
        .where('estado', 'in', [...EN_LA_FILA])
        .executeTakeFirst(),
    );

    if (Number(movidas.numUpdatedRows) !== 1) {
      throw new ErrorDominio('TRANSICION_INVALIDA', 'Ese pedido cambió desde otra pantalla.');
    }

    const segundos = esperaEnSegundos(pedido.encoladoEn, ctx.ahora);
    ctx.auditar({
      entidadId: pedido.id,
      payload: { nombre: pedido.nombrePedido, segundosDeEspera: segundos },
    });

    return { pedidoId: pedido.id, estado: 'entregado', segundosDeEspera: segundos };
  },
});

export const marcarNoRecogido = definirComando<
  Transaccion,
  typeof entradaPedidoDeBarra,
  ResultadoEntrega
>({
  nombre: 'cafeteria.marcar_no_recogido',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_BARRA],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaPedidoDeBarra,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const pedido = await ctx.paso('cargar_pedido', () =>
      cargarPedido(ctx.tx, organizacionId, entrada.pedidoId),
    );

    if (!(EN_LA_FILA as readonly string[]).includes(pedido.estado)) {
      throw new ErrorDominio('TRANSICION_INVALIDA', 'Ese pedido ya salió de la fila.', {
        estado: pedido.estado,
      });
    }

    // TRES LLAMADOS, y no es burocracia: `no_recogido` es la decisión de tirar
    // una bebida que alguien pagó. Es la diferencia entre «el cliente se fue» y
    // «el barista se hartó», y la que permite defender el dato después. El
    // trigger de la 082 lo vuelve a exigir en la base, porque este comando no es
    // el único camino que toca `comandas.estado`.
    if (pedido.llamados < LLAMADOS_PARA_ABANDONAR) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Ese pedido se llamó ${String(pedido.llamados)} vez(ces): hacen falta ${String(LLAMADOS_PARA_ABANDONAR)} antes de darlo por no recogido.`,
        { llamados: pedido.llamados },
      );
    }

    await ctx.paso('marcar', () =>
      ctx.tx
        .updateTable('comandas')
        .set({ estado: 'no_recogido' })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', pedido.id)
        .where('estado', 'in', [...EN_LA_FILA])
        .execute(),
    );

    const segundos = esperaEnSegundos(pedido.encoladoEn, ctx.ahora);
    ctx.auditar({
      entidadId: pedido.id,
      payload: { nombre: pedido.nombrePedido, llamados: pedido.llamados, segundos },
    });

    return { pedidoId: pedido.id, estado: 'no_recogido', segundosDeEspera: segundos };
  },
});

export const deshacerEntrega = definirComando<
  Transaccion,
  typeof entradaPedidoDeBarra,
  ResultadoEntrega
>({
  nombre: 'cafeteria.deshacer_entrega',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_BARRA],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaPedidoDeBarra,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const pedido = await ctx.paso('cargar_pedido', () =>
      cargarPedido(ctx.tx, organizacionId, entrada.pedidoId),
    );

    if (pedido.estado !== 'entregado' || pedido.entregadaEn === null) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        'Ese pedido no está entregado: no hay nada que deshacer.',
        { estado: pedido.estado },
      );
    }

    // EL LÍMITE LO PONE EL SERVIDOR. La pantalla de barra vive abierta horas y
    // su reloj se desincroniza; un «deshacer» que sólo se esconda en la interfaz
    // es la puerta por la que un pedido entregado vuelve a la fila mañana.
    const segundos = esperaEnSegundos(pedido.entregadaEn, ctx.ahora);
    if (segundos > SEGUNDOS_PARA_DESHACER) {
      throw new ErrorDominio(
        'TRANSICION_INVALIDA',
        `Ese pedido se entregó hace ${String(segundos)} segundos: deshacer sólo vale dentro del primer minuto.`,
        { segundos },
      );
    }

    await ctx.paso('deshacer', () =>
      ctx.tx
        .updateTable('comandas')
        .set({ estado: 'listo', entregada_en: null })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', pedido.id)
        .where('estado', '=', 'entregado')
        .execute(),
    );

    ctx.auditar({ entidadId: pedido.id, payload: { deshecho: true, segundos } });
    return { pedidoId: pedido.id, estado: 'listo', segundosDeEspera: segundos };
  },
});

interface PedidoDeBarra {
  readonly id: string;
  readonly sucursalId: string;
  readonly estado: string;
  readonly llamados: number;
  readonly nombrePedido: string | null;
  readonly encoladoEn: Date;
  readonly listaEn: Date | null;
  readonly entregadaEn: Date | null;
}

async function cargarPedido(
  tx: Transaccion,
  organizacionId: string,
  pedidoId: string,
): Promise<PedidoDeBarra> {
  const fila = await tx
    .selectFrom('comandas as c')
    .leftJoin('ordenes as o', 'o.id', 'c.orden_id')
    .select([
      'c.id as id',
      'c.sucursal_id as sucursalId',
      'c.estado as estado',
      'c.llamados as llamados',
      'c.cobrado_en as cobradoEn',
      'c.created_at as creadoEn',
      'c.lista_en as listaEn',
      'c.entregada_en as entregadaEn',
      'o.nombre_pedido as nombrePedido',
      'o.sucursal_id as sucursalDeOrden',
    ])
    .where('c.organizacion_id', '=', organizacionId)
    .where('c.id', '=', pedidoId)
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio('COMANDA_NO_ENCONTRADA', 'Ese pedido no existe en este negocio.');
  }

  return {
    id: fila.id,
    // `comandas.sucursal_id` nació en la 082 y lo histórico lo tiene nulo: se
    // cae a la de la orden, que es de donde lo heredaba antes.
    sucursalId: fila.sucursalId ?? fila.sucursalDeOrden ?? '',
    estado: fila.estado,
    llamados: fila.llamados,
    nombrePedido: fila.nombrePedido,
    // El reloj de la espera arranca al COBRAR: es cuando el cliente empieza a
    // esperar, no cuando el sistema decide encolarlo.
    encoladoEn: fila.cobradoEn ?? fila.creadoEn,
    listaEn: fila.listaEn,
    entregadaEn: fila.entregadaEn,
  };
}

function esperaEnSegundos(desde: Date, hasta: Date): number {
  return Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 1000));
}
