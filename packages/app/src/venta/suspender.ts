import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar } from './cotizar.ts';

/**
 * F-224 · La venta que se aparta para atender a otro.
 *
 * ── El caso, que es de todos los días ────────────────────────────────────
 * El cliente lleva doce artículos escaneados y se acuerda de que falta el pan.
 * Detrás hay cuatro personas. Sin esto hay dos salidas: se cancela y se vuelve a
 * escanear todo cuando regrese —y la fila se para dos veces—, o se le pide a la
 * fila que espere. Las dos cuestan más que una columna.
 *
 * ── Suspender NO es cancelar, y ésa es toda la diferencia ────────────────
 * Cancelar deja la orden muerta y su folio quemado; suspender la deja viva y
 * recuperable con un código de tres dígitos. Modelarlo como cancelar-y-recrear
 * pierde las líneas, el descuento autorizado y el cliente identificado, que es
 * justo lo que costó tiempo.
 *
 * ── El código es corto porque se dice en voz alta ────────────────────────
 * «Tu venta es la 47.» Un uuid no se dice, y un consecutivo global haría que el
 * código del martes fuera 1,284. Se recicla dentro de la terminal y del día:
 * tres dígitos bastan porque nunca hay cuarenta suspendidas a la vez.
 *
 * ── Y NO mueve inventario ────────────────────────────────────────────────
 * El descuento de stock cuelga del cobro, y una venta suspendida no se cobró.
 * Descontar aquí dejaría el anaquel corto mientras el cliente busca el pan, y si
 * no vuelve, corto para siempre.
 */

const MOSTRADOR = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

/** Tres dígitos: nunca hay cuarenta suspendidas a la vez en una terminal. */
const CODIGOS_POSIBLES = 1_000;

export const entradaSuspender = z.object({
  ordenId: z.uuid(),
  /** Para reconocerla: «el señor de la gorra». Se dice, no se teclea entero. */
  nota: z.string().trim().max(60).nullable().default(null),
});

export const entradaRetomar = z.object({
  /** El código corto que se dijo en voz alta. */
  codigo: z
    .string()
    .trim()
    .regex(/^\d{1,3}$/, 'El código de una venta en espera son tres dígitos.'),
});

export const entradaSuspendidas = z.object({});

export interface ResultadoSuspension {
  readonly ordenId: string;
  readonly codigo: string;
  readonly lineas: number;
  readonly totalCentavos: string;
}

export interface VentaEnEspera {
  readonly ordenId: string;
  readonly codigo: string;
  readonly nota: string | null;
  readonly lineas: number;
  readonly totalCentavos: string;
  readonly minutosEsperando: number;
}

export interface ResultadoEnEspera {
  readonly ventas: readonly VentaEnEspera[];
}

/** Un renglón de la venta retomada, para que el mostrador la vuelva a pintar tal cual. */
export interface RenglonRetomado {
  readonly productoId: string | null;
  readonly nombre: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly precioUnitarioCentavos: string;
  /** El código con el que entró: el de la caja, si fue una presentación (F-147). */
  readonly codigoBarras: string | null;
  /** No nula en una presentación: lo que descuenta en unidad base. */
  readonly cantidadBaseConsumo: string | null;
}

export interface ResultadoRetomada {
  readonly ordenId: string;
  readonly codigo: string;
  readonly lineas: number;
  readonly totalCentavos: string;
  /**
   * Los renglones, para el mostrador que arma la venta en la pantalla (abarrotes): sin
   * ellos, retomar dejaba la orden viva en el servidor y la pantalla vacía (C.10 de la 2.4).
   */
  readonly renglones: readonly RenglonRetomado[];
}

const MS_POR_MINUTO = 60_000;

export const suspenderVenta = definirComando<
  Transaccion,
  typeof entradaSuspender,
  ResultadoSuspension
>({
  nombre: 'venta.suspender',
  entidad: 'orden',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaSuspender,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId } = ctx.ambito;
    if (terminalId === null) {
      // El código se recicla por TERMINAL: sin ella, dos cajas darían el mismo
      // «47» y una retomaría la venta de la otra.
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Una venta se aparta en una caja concreta: hace falta la terminal.',
      );
    }

    const orden = await ctx.paso('leer_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'total_centavos', 'codigo_espera'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa venta no existe en este negocio.');
    }
    if (orden.estado !== 'borrador') {
      // Una orden cobrada o cancelada no se aparta: apartarla dejaría un
      // código vivo apuntando a algo que ya no se puede retomar.
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Una venta «${orden.estado}» ya no se aparta.`,
      );
    }

    const lineas = await ctx.paso('contar_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', entrada.ordenId)
        .execute(),
    );
    if (lineas.length === 0) {
      // Apartar un carrito vacío quema un código y deja a alguien buscando qué
      // se apartó. La respuesta es: nada.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Ese carrito está vacío: no hay nada que apartar.',
      );
    }

    const enEspera = await ctx.paso('leer_en_espera', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['codigo_espera'])
        .where('organizacion_id', '=', organizacionId)
        .where('terminal_id', '=', terminalId)
        .where('estado', '=', 'suspendida')
        .execute(),
    );

    const tomados = new Set(enEspera.map((o) => o.codigo_espera));
    let codigo: string | null = null;
    for (let n = 1; n < CODIGOS_POSIBLES; n += 1) {
      const candidato = n.toString();
      if (!tomados.has(candidato)) {
        codigo = candidato;
        break;
      }
    }
    if (codigo === null) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esta caja tiene demasiadas ventas apartadas: cobra o cancela alguna.',
      );
    }

    // El TOTAL, calculado ahora: un borrador no lo tiene —se congela al cobrar— y la
    // lista de apartadas enseñaba «$0.00» en cada una. Y la NOTA, guardada: se pedía
    // («el señor de la gorra») y se perdía (C.10 de la 2.4).
    const { totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );

    // El estado se escribe LITERAL: el contrato de «estado ⇒ columna» necesita
    // ver el valor en el objeto para saber que hay código que lo produce.
    await ctx.paso('suspender', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          estado: 'suspendida',
          codigo_espera: codigo,
          total_centavos: totales.totalCentavos,
          notas: entrada.nota,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .execute(),
    );

    // NO se toca el inventario. El descuento cuelga del cobro, y ésta no se
    // cobró: descontar aquí dejaría el anaquel corto mientras el cliente busca
    // el pan, y corto para siempre si no vuelve.
    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: { codigo, lineas: lineas.length, nota: entrada.nota },
    });
    return {
      ordenId: entrada.ordenId,
      codigo,
      lineas: lineas.length,
      totalCentavos: totales.totalCentavos.toString(),
    };
  },
});

export const ventasEnEspera = definirComando<
  Transaccion,
  typeof entradaSuspendidas,
  ResultadoEnEspera
>({
  nombre: 'venta.en_espera',
  entidad: 'orden',
  escribe: false,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaSuspendidas,
  async ejecutar(ctx) {
    const { organizacionId, terminalId } = ctx.ambito;
    if (terminalId === null) return { ventas: [] };

    const ordenes = await ctx.paso('leer_suspendidas', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'codigo_espera', 'total_centavos', 'notas', 'updated_at'])
        .where('organizacion_id', '=', organizacionId)
        .where('terminal_id', '=', terminalId)
        .where('estado', '=', 'suspendida')
        .orderBy('updated_at', 'asc')
        .execute(),
    );
    if (ordenes.length === 0) return { ventas: [] };

    const lineas = await ctx.paso('contar_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select(['orden_id'])
        .where('organizacion_id', '=', organizacionId)
        .where(
          'orden_id',
          'in',
          ordenes.map((o) => o.id),
        )
        .execute(),
    );
    const porOrden = new Map<string, number>();
    for (const linea of lineas) {
      porOrden.set(linea.orden_id, (porOrden.get(linea.orden_id) ?? 0) + 1);
    }

    return {
      ventas: ordenes.map((o) => ({
        ordenId: o.id,
        codigo: o.codigo_espera ?? '',
        nota: o.notas,
        lineas: porOrden.get(o.id) ?? 0,
        totalCentavos: o.total_centavos.toString(),
        // Los minutos esperando van en la lista: una apartada hace dos minutos
        // y una de hace dos horas no se tratan igual, y la segunda casi siempre
        // es alguien que ya no volvió.
        minutosEsperando: Math.floor(
          (ctx.ahora.getTime() - o.updated_at.getTime()) / MS_POR_MINUTO,
        ),
      })),
    };
  },
});

export const retomarVenta = definirComando<Transaccion, typeof entradaRetomar, ResultadoRetomada>({
  nombre: 'venta.retomar',
  entidad: 'orden',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaRetomar,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId } = ctx.ambito;
    if (terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Una venta apartada se retoma en la caja donde se apartó.',
      );
    }

    const orden = await ctx.paso('buscar_por_codigo', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'total_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('terminal_id', '=', terminalId)
        .where('estado', '=', 'suspendida')
        .where('codigo_espera', '=', entrada.codigo)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio(
        'PUENTE_NO_ENCONTRADO',
        `No hay ninguna venta apartada con el código ${entrada.codigo} en esta caja.`,
      );
    }

    const lineas = await ctx.paso('contar_lineas', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select([
          'id',
          'producto_id',
          'producto_nombre',
          'cantidad',
          'unidad',
          'precio_unitario_centavos',
          'codigo_barras',
          'cantidad_base_consumo',
          'orden_visual',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', orden.id)
        .orderBy('orden_visual')
        .execute(),
    );

    // EL CARRITO QUE YA ESTABA EN ESTA CAJA. Una caja tiene UN borrador de mostrador
    // (`ordenes_carrito_por_terminal`), y la apartada vuelve a serlo: si ya hay otro, el
    // `update` de abajo chocaba con el índice. Vacío —lo que deja un cobro que no se
    // completó— se retira; con líneas, es una venta a medias y no se pisa.
    const carrito = await ctx.paso('buscar_carrito', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('terminal_id', '=', terminalId)
        .where('estado', '=', 'borrador')
        .where('estrategia_captura', '=', 'mostrador')
        .executeTakeFirst(),
    );
    if (carrito !== undefined) {
      const suyas = await ctx.paso('lineas_del_carrito', () =>
        ctx.tx
          .selectFrom('orden_lineas')
          .select(['id'])
          .where('organizacion_id', '=', organizacionId)
          .where('orden_id', '=', carrito.id)
          .execute(),
      );
      if (suyas.length > 0) {
        throw new ErrorDominio(
          'CONFIGURACION_CONFLICTO',
          'Hay una venta a medias en esta caja: cóbrala o apártala antes de retomar otra.',
        );
      }
      await ctx.paso('retirar_carrito_vacio', () =>
        ctx.tx
          .deleteFrom('ordenes')
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', carrito.id)
          .where('estado', '=', 'borrador')
          .execute(),
      );
    }

    // Vuelve a ser borrador Y LIBERA EL CÓDIGO. Dejarlo puesto haría que la
    // siguiente suspensión de esa caja tuviera que saltárselo, y a la tercera
    // venta del día los códigos ya no serían cortos.
    await ctx.paso('retomar', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({ estado: 'borrador', codigo_espera: null, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', orden.id)
        .execute(),
    );

    ctx.auditar({ entidadId: orden.id, payload: { codigo: entrada.codigo } });
    return {
      ordenId: orden.id,
      codigo: entrada.codigo,
      lineas: lineas.length,
      totalCentavos: orden.total_centavos.toString(),
      renglones: lineas.map((l) => ({
        productoId: l.producto_id,
        nombre: l.producto_nombre,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precioUnitarioCentavos: l.precio_unitario_centavos.toString(),
        codigoBarras: l.codigo_barras,
        cantidadBaseConsumo: l.cantidad_base_consumo,
      })),
    };
  },
});
