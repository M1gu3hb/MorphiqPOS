import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import { anularLinea, type Transaccion } from '@morphiqpos/data';
import { MOTIVOS_ANULACION, partirLineaParaAnular } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';

/**
 * `restaurante.anular_linea` — F-324.
 *
 * ── El hueco que cierra ────────────────────────────────────────────────────
 * F-221 cancela la venta entera y F-202 descuenta la línea, pero ninguna
 * resuelve «de las tres hamburguesas, una salió mal y se repone». Hoy el mesero
 * borra la línea y la recaptura con dos, y en ese borrado desaparece el rastro
 * de que hubo un error, de quién fue y de cuánto costó.
 *
 * ── El motivo es obligatorio y está cerrado ────────────────────────────────
 * No es burocracia: cada motivo apunta a un responsable y a una cuenta
 * distinta. Un texto libre los mezcla y a fin de mes no se puede contestar
 * cuánto costó la cocina, cuánto la captura y cuánto se regaló.
 *
 * ── Lo que el cliente NO manda ─────────────────────────────────────────────
 * Ni un importe. Manda qué línea y cuánta cantidad; lo que deja de cobrarse lo
 * calcula el servidor partiendo los importes que ya tenía la línea, y los
 * totales de la cuenta se recalculan con la misma `cotizar` del cobro.
 */

const CANTIDAD = /^\d+(\.\d{1,4})?$/;

export const entradaAnularLinea = z.object({
  ordenId: z.uuid(),
  lineaId: z.uuid(),
  /**
   * Sin cantidad se anula la línea entera, que es el caso común.
   *
   * Texto y no número: `numeric(14,4)` son diezmilésimas y `0.1 + 0.2` no es
   * `0.3`. Un `z.number()` aquí metería coma flotante en el camino del dinero.
   */
  cantidad: z.string().regex(CANTIDAD, 'La cantidad va con hasta cuatro decimales.').optional(),
  motivo: z.enum(MOTIVOS_ANULACION),
  nota: z.string().trim().min(1).max(200).optional(),
});

export interface ResultadoAnulacion {
  readonly ordenId: string;
  readonly lineaAnuladaId: string;
  readonly lineaVivaId: string | null;
  readonly importeAnuladoCentavos: string;
  readonly totalCentavos: string;
  readonly itemsCancelados: number;
  readonly itemsReducidos: number;
}

/**
 * Anular es una decisión de CAJA.
 *
 * El mesero queda fuera por la misma razón que en la cancelación de la cuenta:
 * es quien tiene el incentivo más directo sobre la cuenta que atiende, y anular
 * una línea es hacer desaparecer consumo del ticket. Sale de `ctx.ambito.rol`,
 * de la sesión del servidor, nunca del cuerpo.
 */
const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Estados en los que una cuenta todavía se puede tocar. */
const EDITABLES = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

export const anularLineaComando = definirComando<
  Transaccion,
  typeof entradaAnularLinea,
  ResultadoAnulacion
>({
  nombre: 'restaurante.anular_linea',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaAnularLinea,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'mesa_id', 'sucursal_id', 'version'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );

    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta no existe en este negocio.');
    }
    if (!(EDITABLES as readonly string[]).includes(orden.estado)) {
      // Una cuenta ya cobrada NO se anula: se devuelve. Son dos caminos
      // distintos porque uno mueve dinero de vuelta al cliente y el otro no, y
      // fundirlos daría una segunda puerta a los reembolsos sin su control.
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya no se edita: una cobrada se devuelve, una cancelada ya no existe.',
        { estado: orden.estado },
      );
    }

    const linea = await ctx.paso('cargar_linea', () =>
      ctx.tx
        .selectFrom('orden_lineas')
        .select([
          'id',
          'cantidad',
          'subtotal_centavos',
          'descuento_centavos',
          'total_centavos',
          'anulada_en',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('orden_id', '=', orden.id)
        .where('id', '=', entrada.lineaId)
        .executeTakeFirst(),
    );

    if (linea === undefined) {
      throw new ErrorDominio('LINEA_NO_ENCONTRADA', 'Esa línea no es de esta cuenta.');
    }
    if (linea.anulada_en !== null) {
      throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa línea ya está anulada.');
    }

    const partida = partirLineaParaAnular(
      {
        cantidad: linea.cantidad,
        subtotalCentavos: linea.subtotal_centavos,
        descuentoCentavos: linea.descuento_centavos,
        totalCentavos: linea.total_centavos,
      },
      entrada.cantidad,
    );

    const escrita = await ctx.paso('anular', () =>
      anularLinea(ctx.tx, {
        organizacionId,
        sucursalId: orden.sucursal_id,
        ordenId: orden.id,
        lineaId: entrada.lineaId,
        mesaId: orden.mesa_id,
        porcionAnulada: partida.anulada,
        porcionRestante: partida.restante,
        motivo: entrada.motivo,
        nota: entrada.nota ?? null,
        empleadoId: empleoId,
        ahora: ctx.ahora,
      }),
    );

    // Los totales se recalculan desde las líneas VIVAS, con la misma `cotizar`
    // del cobro. Restarle el importe anulado al total guardado sería un segundo
    // sitio donde se calcula un total, que es la señal 4 de desviación
    // arquitectónica de `04-ARQUITECTURA §9`.
    const { totales } = await ctx.paso('recalcular_totales', () =>
      cotizar(ctx.tx, organizacionId, orden.id),
    );

    await ctx.paso('guardar_totales', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          subtotal_centavos: totales.subtotalCentavos,
          descuento_centavos: totales.descuentoCentavos,
          impuestos_centavos: totales.impuestosCentavos,
          total_centavos: totales.totalCentavos,
          costo_total_centavos: totales.costoTotalCentavos,
          utilidad_centavos: totales.utilidadCentavos,
          margen_bp: totales.margenBp,
          version: orden.version + 1,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', orden.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        lineaId: entrada.lineaId,
        motivo: entrada.motivo,
        cantidadAnulada: partida.anulada.cantidad,
        importeAnuladoCentavos: partida.anulada.totalCentavos.toString(),
        entera: partida.restante === null,
        itemsCancelados: escrita.itemsCancelados,
        itemsReducidos: escrita.itemsReducidos,
      },
    });

    return {
      ordenId: orden.id,
      lineaAnuladaId: escrita.lineaAnuladaId,
      lineaVivaId: escrita.lineaVivaId,
      importeAnuladoCentavos: partida.anulada.totalCentavos.toString(),
      totalCentavos: totales.totalCentavos.toString(),
      itemsCancelados: escrita.itemsCancelados,
      itemsReducidos: escrita.itemsReducidos,
    };
  },
});
