import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoOrdenes, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto, desdeDiezmilesimas } from '@morphiqpos/domain/catalogo';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import { valorarLinea } from '../venta/valorar.ts';
import { abrirNotaDeMostrador } from './nota-de-mostrador.ts';

/**
 * F-153 · SURTIR la lista del albañil: de su papel a una nota que la caja cobra.
 *
 * ── Qué faltaba ──────────────────────────────────────────────────────────
 * La lista se capturaba y se cerraba, y entre las dos cosas no pasaba nada: la
 * pantalla decía que el surtido «pasa en la pantalla de venta», y la venta no
 * sabía de listas. Así que el mostradorista volvía a teclear los veintitrés
 * renglones en el mostrador, la lista se quedaba en «0 de 23» y la columna
 * `surtida` —que existe desde la 119 para contar lo entregado— no la escribía
 * nadie (C.10 de la 2.4).
 *
 * ── Cómo surte ───────────────────────────────────────────────────────────
 * Cada renglón dice CUÁNTO se entrega ahora y, si todavía es sólo texto
 * («cemento del gris»), A QUÉ PRODUCTO se traduce. El comando abre UNA nota de
 * mostrador —la misma `abrirNotaDeMostrador` del mostrador y del corte— con el
 * cliente de la lista, mete cada partida valorada por el servidor y anota lo
 * surtido en el renglón. Lo que no hay se marca `sin_existencia`: es lo que
 * convierte una lista a medias en el pedido al proveedor del lunes.
 *
 * ── Lo que NO se deja hacer ──────────────────────────────────────────────
 * · Surtir más de lo que pidió: la base lo rechaza (`linea_lista_no_sobresurtida`)
 *   y aquí se dice antes, con el renglón, en vez de un 23514 sin nombre.
 * · Retraducir un renglón que ya se surtió en parte: la mitad de la varilla
 *   entregada ya es de la del 3; cambiarla a la del 4 reescribiría lo entregado.
 * · Surtir una lista cerrada.
 *
 * ── El estado de la lista ────────────────────────────────────────────────
 * `surtida` cuando TODOS sus renglones están completos (`surtida >= cantidad`,
 * el mismo criterio de la vista 177), con su fecha; `parcial` cuando algo se
 * entregó y algo falta. La orden que la surtió queda en la lista (la última) y en
 * cada renglón (la suya).
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaRenglonesDeLista = z.object({ listaId: z.uuid() });

export const entradaSurtirLista = z.object({
  listaId: z.uuid(),
  renglones: z
    .array(
      z.object({
        renglonId: z.uuid(),
        /** Para traducir un renglón que todavía es texto, o confirmar el suyo. */
        productoId: z.uuid().nullable().default(null),
        /** Lo que se entrega AHORA. Cero o nada: no se entrega en esta nota. */
        cantidad: z.string().regex(CANTIDAD, 'Cantidad con cuatro decimales.').nullable(),
        /**
         * Lo que PIDIÓ, al traducir un renglón que no lo decía. Sin él, lo pedido es
         * lo que se entrega: «medio bulto de cal» traducido a 0.5 bultos.
         */
        cantidadPedida: z
          .string()
          .regex(CANTIDAD, 'Cantidad con cuatro decimales.')
          .nullable()
          .default(null),
        /** No hay: se le debe y va al pedido del proveedor. */
        sinExistencia: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(200),
});

export interface RenglonDeLista {
  readonly renglonId: string;
  readonly textoPedido: string;
  readonly productoId: string | null;
  readonly productoNombre: string | null;
  readonly unidad: string | null;
  readonly cantidad: string | null;
  readonly surtida: string;
  readonly sinExistencia: boolean;
}

export interface ResultadoRenglones {
  readonly listaId: string;
  readonly folio: string;
  readonly estado: string;
  readonly renglones: readonly RenglonDeLista[];
}

export interface ResultadoSurtidoDeLista {
  readonly listaId: string;
  readonly estado: string;
  /** Nula cuando sólo se marcó lo que no hay: no se abrió nota. */
  readonly notaFolio: string | null;
  readonly ordenId: string | null;
  readonly partidas: number;
  readonly totalCentavos: string;
}

interface FilaRenglon {
  readonly id: string;
  readonly texto_pedido: string;
  readonly producto_id: string | null;
  readonly cantidad: string | null;
  readonly unidad: string | null;
  readonly surtida: string;
  readonly sin_existencia: boolean;
}

interface FilaLista {
  readonly id: string;
  readonly folio: string;
  readonly estado: string;
  readonly cliente_id: string | null;
  readonly obra_id: string | null;
  readonly nombre_libre: string | null;
  readonly telefono_libre: string | null;
}

async function leerLista(ctx: ContextoComando<Transaccion>, listaId: string): Promise<FilaLista> {
  const fila = await ctx.paso('leer_lista', () =>
    ctx.tx
      .selectFrom('listas_trabajo')
      .select(['id', 'folio', 'estado', 'cliente_id', 'obra_id', 'nombre_libre', 'telefono_libre'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', listaId)
      .executeTakeFirst(),
  );
  // Ajena e inexistente contestan igual: distinguirlas sondea las listas de otro.
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa lista no existe en este negocio.');
  }
  return fila;
}

async function leerRenglones(
  ctx: ContextoComando<Transaccion>,
  listaId: string,
): Promise<readonly FilaRenglon[]> {
  const filas = await ctx.paso('leer_renglones', () =>
    ctx.tx
      .selectFrom('lineas_lista_trabajo')
      .select([
        'id',
        'texto_pedido',
        'producto_id',
        'cantidad',
        'unidad',
        'surtida',
        'sin_existencia',
      ])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('lista_id', '=', listaId)
      .orderBy('orden_visual', 'asc')
      .execute(),
  );
  return filas;
}

/** El mismo criterio que la vista 177: completo es `surtida >= cantidad`. */
function completo(cantidadPedida: string | null, surtida: string): boolean {
  return cantidadPedida !== null && cantidad(surtida) >= cantidad(cantidadPedida);
}

export const renglonesDeLista = definirComando<
  Transaccion,
  typeof entradaRenglonesDeLista,
  ResultadoRenglones
>({
  nombre: 'lista_trabajo.renglones',
  entidad: 'lista_trabajo',
  escribe: false,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaRenglonesDeLista,
  async ejecutar(ctx, entrada) {
    const lista = await leerLista(ctx, entrada.listaId);
    const filas = await leerRenglones(ctx, lista.id);

    const ids = [...new Set(filas.flatMap((f) => (f.producto_id === null ? [] : [f.producto_id])))];
    const nombres =
      ids.length === 0
        ? []
        : await ctx.paso('leer_productos', () =>
            ctx.tx
              .selectFrom('productos')
              .select(['id', 'nombre'])
              .where('organizacion_id', '=', ctx.ambito.organizacionId)
              .where('id', 'in', ids)
              .execute(),
          );
    const nombrePorId = new Map(nombres.map((p) => [p.id, p.nombre]));

    return {
      listaId: lista.id,
      folio: lista.folio,
      estado: lista.estado,
      renglones: filas.map((f) => ({
        renglonId: f.id,
        textoPedido: f.texto_pedido,
        productoId: f.producto_id,
        productoNombre: f.producto_id === null ? null : (nombrePorId.get(f.producto_id) ?? null),
        unidad: f.unidad,
        cantidad: f.cantidad,
        surtida: f.surtida,
        sinExistencia: f.sin_existencia,
      })),
    };
  },
});

type RenglonPedido = z.infer<typeof entradaSurtirLista>['renglones'][number];

/** Lo que se entrega de un renglón, ya comprobado contra lo que pidió. */
interface Entrega {
  readonly renglon: FilaRenglon;
  readonly productoId: string;
  readonly ahora: bigint;
  readonly pedida: string;
}

function planearEntrega(renglon: FilaRenglon, pedido: RenglonPedido): Entrega | null {
  const ahora = pedido.cantidad === null ? 0n : cantidad(pedido.cantidad);
  if (ahora === 0n) return null;

  const productoId = pedido.productoId ?? renglon.producto_id;
  if (productoId === null) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `«${renglon.texto_pedido}» todavía no dice qué producto es: elígelo antes de entregarlo.`,
      { renglonId: renglon.id },
    );
  }
  const yaSurtida = cantidad(renglon.surtida);
  if (renglon.producto_id !== null && renglon.producto_id !== productoId && yaSurtida > 0n) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `«${renglon.texto_pedido}» ya se entregó en parte como otro producto: lo entregado no se cambia.`,
      { renglonId: renglon.id },
    );
  }

  const pedida =
    renglon.producto_id === productoId && renglon.cantidad !== null
      ? renglon.cantidad
      : (pedido.cantidadPedida ?? cantidadATexto(desdeDiezmilesimas(yaSurtida + ahora)));
  if (yaSurtida + ahora > cantidad(pedida)) {
    throw new ErrorDominio(
      'CANTIDAD_INVALIDA',
      `De «${renglon.texto_pedido}» pidió ${pedida} y ya se le dieron ${cantidadATexto(
        desdeDiezmilesimas(yaSurtida),
      )}: no se le puede entregar más de lo que pidió.`,
      { renglonId: renglon.id },
    );
  }
  return { renglon, productoId, ahora, pedida };
}

async function entregar(
  ctx: ContextoComando<Transaccion>,
  ordenId: string,
  entrega: Entrega,
  indice: number,
): Promise<void> {
  const { organizacionId } = ctx.ambito;
  const producto = await ctx.paso(`cargar_producto_${String(indice)}`, () =>
    repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, entrega.productoId),
  );
  if (producto === null) {
    throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no está disponible.');
  }

  const ahoraTexto = cantidadATexto(desdeDiezmilesimas(entrega.ahora));
  const valorada = valorarLinea(producto, ahoraTexto, undefined);
  const lineaId = await ctx.paso(`insertar_partida_${String(indice)}`, () =>
    repoOrdenes.agregarLinea(ctx.tx, {
      organizacionId,
      ordenId,
      productoId: producto.id,
      productoNombre: producto.nombre,
      sku: producto.sku,
      codigoBarras: producto.codigoBarras,
      cantidad: valorada.cantidad,
      unidad: valorada.unidad,
      precioUnitarioCentavos: valorada.precio.precioUnitarioCentavos,
      costoUnitarioCentavos: producto.costoUnitarioCentavos,
      subtotalCentavos: valorada.precio.subtotalCentavos,
      totalCentavos: valorada.precio.subtotalCentavos,
      esMayoreo: valorada.precio.esMayoreo,
      tipoVenta: producto.tipoVenta,
      ordenVisual: indice + 1,
    }),
  );

  const surtida = cantidadATexto(
    desdeDiezmilesimas(cantidad(entrega.renglon.surtida) + entrega.ahora),
  );
  await ctx.paso(`anotar_renglon_${String(indice)}`, () =>
    ctx.tx
      .updateTable('lineas_lista_trabajo')
      .set({
        producto_id: producto.id,
        cantidad: entrega.pedida,
        unidad: valorada.unidad,
        surtida,
        orden_linea_id: lineaId,
        // Lo que se entregó completo deja de deberse.
        sin_existencia: false,
      })
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', entrega.renglon.id)
      .execute(),
  );
}

async function marcarSinExistencia(
  ctx: ContextoComando<Transaccion>,
  renglonIds: readonly string[],
): Promise<void> {
  if (renglonIds.length === 0) return;
  await ctx.paso('marcar_sin_existencia', () =>
    ctx.tx
      .updateTable('lineas_lista_trabajo')
      .set({ sin_existencia: true })
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', 'in', [...renglonIds])
      .execute(),
  );
}

export const surtirLista = definirComando<
  Transaccion,
  typeof entradaSurtirLista,
  ResultadoSurtidoDeLista
>({
  nombre: 'lista_trabajo.surtir',
  entidad: 'lista_trabajo',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaSurtirLista,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const lista = await leerLista(ctx, entrada.listaId);
    if (lista.estado !== 'abierta' && lista.estado !== 'parcial') {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `La lista ${lista.folio} ya está ${lista.estado}: no se surte una lista cerrada.`,
      );
    }

    const renglones = await leerRenglones(ctx, lista.id);
    const porId = new Map(renglones.map((r) => [r.id, r]));
    const entregas: Entrega[] = [];
    const sinExistencia: string[] = [];
    for (const pedido of entrada.renglones) {
      const renglon = porId.get(pedido.renglonId);
      if (renglon === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese renglón no es de esta lista.', {
          renglonId: pedido.renglonId,
        });
      }
      const entrega = planearEntrega(renglon, pedido);
      if (entrega !== null) entregas.push(entrega);
      else if (pedido.sinExistencia) sinExistencia.push(renglon.id);
    }

    await marcarSinExistencia(ctx, sinExistencia);

    let nota: { readonly ordenId: string; readonly folio: string } | null = null;
    let totalCentavos = 0n;
    if (entregas.length > 0) {
      const abierta = await abrirNotaDeMostrador(ctx, {
        clienteId: lista.cliente_id,
        obraId: lista.obra_id,
        nombreLibre: lista.nombre_libre ?? undefined,
        telefono: lista.telefono_libre ?? undefined,
      });
      for (const [indice, entrega] of entregas.entries()) {
        await entregar(ctx, abierta.ordenId, entrega, indice);
      }
      const { totales } = await ctx.paso('cotizar', () =>
        cotizar(ctx.tx, organizacionId, abierta.ordenId),
      );
      await ctx.paso('anotar_totales', () =>
        repoOrdenes.anotarTotales(ctx.tx, organizacionId, abierta.ordenId, totales),
      );
      totalCentavos = totales.totalCentavos;
      nota = { ordenId: abierta.ordenId, folio: abierta.folio };
    }

    const despues = await leerRenglones(ctx, lista.id);
    const todos = despues.every((r) => completo(r.cantidad, r.surtida));
    const algo = despues.some((r) => cantidad(r.surtida) > 0n);
    const estado = todos ? 'surtida' : algo ? 'parcial' : lista.estado;
    await ctx.paso('anotar_lista', () =>
      ctx.tx
        .updateTable('listas_trabajo')
        .set({
          estado,
          ...(todos ? { cerrada_en: ctx.ahora } : {}),
          ...(nota === null ? {} : { orden_id: nota.ordenId }),
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', lista.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: lista.id,
      payload: {
        folio: lista.folio,
        estado,
        notaFolio: nota?.folio ?? null,
        partidas: entregas.length,
        sinExistencia: sinExistencia.length,
        totalCentavos: totalCentavos.toString(),
      },
    });

    return {
      listaId: lista.id,
      estado,
      notaFolio: nota?.folio ?? null,
      ordenId: nota?.ordenId ?? null,
      partidas: entregas.length,
      totalCentavos: totalCentavos.toString(),
    };
  },
});
