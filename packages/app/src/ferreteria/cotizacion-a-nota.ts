import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoOrdenes, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { centavos, repartirPorPesos } from '@morphiqpos/domain/dinero';
import { sigueVigente } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import { cargar as cargarCotizacion, ganarCotizacion } from './cotizacion.ts';
import { abrirNotaDeMostrador, type ResultadoNotaMostrador } from './nota-de-mostrador.ts';

/**
 * F-604 · LA COTIZACIÓN GANADA SE CONVIERTE EN VENTA: una nota en la caja con los precios
 * que se cotizaron (bloque D de la 2.4).
 *
 * La pantalla de cotización tenía «Convertir en venta o pedido» sin nada detrás, y
 * `cotizacion.convertir` pide una orden que ya exista: ningún camino llevaba lo cotizado a
 * la caja. Aquí se hace en UNA transacción, con las dos piezas que ya existían:
 *
 * 1 · `abrirNotaDeMostrador` —la misma con que el mostrador y el corte de material abren
 *     la suya—: orden cobrable, folio `N-…` y fila de nota, a nombre del cliente y la obra
 *     de la cotización;
 * 2 · las partidas al PRECIO COTIZADO, que es «lo que se honra mientras la cotización
 *     viva» (`cotizacion_lineas.precio_unitario_centavos`): el catálogo pudo subir desde
 *     entonces, y cobrar el de hoy sería cobrar otro número que el que el cliente aprobó;
 * 3 · `ganarCotizacion`: vigente, mandada y ganada con su orden, como siempre.
 *
 * La nota no cobra nada: la cobra la caja, como cualquier otra.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaConvertirEnNota = z.object({
  cotizacionId: z.uuid(),
});

export const convertirCotizacionEnNota = definirComando<
  Transaccion,
  typeof entradaConvertirEnNota,
  ResultadoNotaMostrador
>({
  nombre: 'cotizacion.convertir_en_nota',
  entidad: 'cotizacion',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaConvertirEnNota,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const cotizacion = await cargarCotizacion(ctx, entrada.cotizacionId);
    // Antes de abrir nada: una nota que nace de una cotización que no se puede ganar se
    // quedaría en la caja como una venta que nadie aprobó.
    if (!['enviada', 'aprobada'].includes(cotizacion.estado)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Sólo se convierte lo que se mandó: esa cotización está cerrada o es un borrador.',
        { estado: cotizacion.estado },
      );
    }
    if (!sigueVigente(cotizacion.vence_el, ctx.ahora)) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa cotización venció: convertirla es cerrar en pérdida la venta que se celebró.',
      );
    }

    const lineas = await ctx.paso('leer_partidas', () =>
      ctx.tx
        .selectFrom('cotizacion_lineas')
        .select([
          'producto_id',
          'descripcion',
          'cantidad',
          'unidad',
          'precio_unitario_centavos',
          'total_centavos',
          'orden_visual',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('cotizacion_id', '=', entrada.cotizacionId)
        .orderBy('orden_visual')
        .execute(),
    );
    if (lineas.length === 0) {
      throw new ErrorDominio('ORDEN_VACIA', 'Esa cotización no tiene partidas que vender.');
    }

    const { ordenId, notaId, folio } = await abrirNotaDeMostrador(ctx, {
      clienteId: cotizacion.cliente_id,
      obraId: cotizacion.obra_id,
      nombreLibre: cotizacion.nombre_libre ?? undefined,
      telefono: cotizacion.telefono_libre ?? undefined,
    });

    // El descuento de la cotización entera, si lo llevó, repartido EXACTO entre las
    // partidas en proporción a lo que cada una vale: la nota cobra el total cotizado.
    const descuento = await ctx.paso('leer_descuento', () =>
      ctx.tx
        .selectFrom('cotizaciones')
        .select(['descuento_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.cotizacionId)
        .executeTakeFirst(),
    );
    const partes = repartirPorPesos(
      centavos(descuento?.descuento_centavos ?? 0n),
      lineas.map((l) => Number(l.total_centavos)),
    );

    for (const [indice, linea] of lineas.entries()) {
      const productoId = linea.producto_id;
      const producto =
        productoId === null
          ? null
          : await ctx.paso(`cargar_material_${String(indice)}`, () =>
              repoVentaCatalogo.productoParaVender(ctx.tx, organizacionId, productoId),
            );
      // Una partida escrita a mano —«flete», «mano de obra»— se cotiza y no se vende por
      // aquí: la caja cobra material del catálogo, que es lo que sale del almacén.
      if (producto === null) {
        throw new ErrorDominio(
          'PRODUCTO_NO_ENCONTRADO',
          `La partida «${linea.descripcion}» no es un material del catálogo: dala de alta o quítala de la cotización antes de convertirla.`,
        );
      }
      const parte = BigInt(partes[indice] ?? 0n);
      const lineaId = await ctx.paso(`insertar_partida_${String(indice)}`, () =>
        repoOrdenes.agregarLinea(ctx.tx, {
          organizacionId,
          ordenId,
          productoId: producto.id,
          productoNombre: producto.nombre,
          sku: producto.sku,
          codigoBarras: producto.codigoBarras,
          cantidad: linea.cantidad,
          unidad: linea.unidad,
          precioUnitarioCentavos: linea.precio_unitario_centavos,
          costoUnitarioCentavos: producto.costoUnitarioCentavos,
          subtotalCentavos: linea.total_centavos,
          totalCentavos: linea.total_centavos - parte,
          esMayoreo: false,
          tipoVenta: producto.tipoVenta,
          ordenVisual: indice + 1,
        }),
      );
      if (parte > 0n) {
        await ctx.paso(`descontar_partida_${String(indice)}`, () =>
          ctx.tx
            .updateTable('orden_lineas')
            .set({ descuento_centavos: parte })
            .where('organizacion_id', '=', organizacionId)
            .where('id', '=', lineaId)
            .execute(),
        );
      }
    }

    // El total con la cuenta del cobro, escrito en la orden: la caja lo lee de ahí.
    const { totales } = await ctx.paso('cotizar', () => cotizar(ctx.tx, organizacionId, ordenId));
    await ctx.paso('anotar_totales', () =>
      repoOrdenes.anotarTotales(ctx.tx, organizacionId, ordenId, totales),
    );

    await ganarCotizacion(ctx, entrada.cotizacionId, ordenId);

    ctx.auditar({
      entidadId: entrada.cotizacionId,
      payload: {
        ordenId,
        notaId,
        folio,
        cotizacion: cotizacion.folio,
        totalCentavos: totales.totalCentavos.toString(),
      },
    });
    return {
      ordenId,
      notaId,
      folio,
      partidas: lineas.length,
      totalCentavos: totales.totalCentavos.toString(),
    };
  },
});
