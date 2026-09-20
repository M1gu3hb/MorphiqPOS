import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar, type LineaCotizada } from '../venta/cotizar.ts';

/**
 * `restaurante.imprimir_precuenta` — la hoja que el comensal tiene en la mano.
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `restaurante/Precuenta.tsx` tiene UNA sola acción, IMPRIMIR, y publicaba en
 * `/api/restaurante/imprimir-precuenta`, **una ruta que no existía**. El fallo no
 * se tragaba —la pantalla lo enseña y ofrece la salida alterna, llevar al comensal
 * a caja con el código— pero el servidor no se enteraba nunca de que esa hoja
 * había salido, 40 a 100 veces al día.
 *
 * ── Qué hace que NO pueda hacer el navegador ─────────────────────────────
 * Dos cosas, y las dos son del negocio:
 *
 * 1. CONTAR la hoja. Una cuenta se escapa por ahí: se imprime la precuenta, la
 *    mesa pide dos cervezas más, se imprime otra, y en caja se paga la primera.
 *    Desde la segunda, la hoja sale marcada como reimpresión, y eso es lo que hace
 *    que el cajero mire el total antes de cobrar. El contador vive en la orden
 *    porque es de la orden: la misma cuenta la puede imprimir quien releve.
 *
 * 2. SUMAR. El total lo da `cotizar`, el mismo código que usa el cobro, sobre las
 *    líneas persistidas. La pantalla suma para enseñar; lo que se imprime tiene
 *    que ser lo que la caja va a cobrar, o la hoja es una promesa distinta.
 *
 * ── Por qué NO cambia el estado de la cuenta ─────────────────────────────
 * Porque eso ya lo hace `restaurante.solicitar_cuenta`: ahí la orden pasa a
 * `cuenta_solicitada`, se sella el `codigo_caja` y la mesa avanza. Imprimir es
 * imprimir. Que un comando de impresión moviera el estado haría que reimprimir
 * volviera a mover la mesa, y una mesa que «vuelve a pedir la cuenta» cada vez
 * que se rompe una hoja es ruido en la pantalla de sala.
 *
 * ── Y por qué el ANCHO no se guarda ──────────────────────────────────────
 * Es del hardware de la terminal, no de la cuenta. Guardarlo en la orden diría
 * que esta cuenta «es de 80 mm», que no significa nada el día que se imprima
 * desde la otra caja. Se recibe para que el servidor pueda decir en el rastro con
 * qué rollo salió, y ahí se queda.
 */

const ROLES_DE_SALA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Una cuenta cobrada o cancelada ya no tiene PREcuenta: tiene ticket. */
const ORDEN_CERRADA = ['pagada', 'cancelada'] as const;

export const entradaImprimirPrecuenta = z.object({
  ordenId: z.uuid(),
  /** Los dos rollos que existen en un restaurante. Lista cerrada a propósito. */
  anchoMm: z.union([z.literal(58), z.literal(80)]).default(80),
});

export interface PrecuentaImpresa {
  readonly ordenId: string;
  /** El código que el comensal lleva a la caja; el folio si aún no se sella. */
  readonly codigo: string;
  readonly mesaNumero: number | null;
  readonly lineas: readonly LineaCotizada[];
  readonly subtotalCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
  readonly anchoMm: number;
  /** 1 es la original; de 2 en adelante la hoja va marcada como reimpresión. */
  readonly copia: number;
  readonly impresaEn: string;
}

export const imprimirPrecuenta = definirComando<
  Transaccion,
  typeof entradaImprimirPrecuenta,
  PrecuentaImpresa
>({
  nombre: 'restaurante.imprimir_precuenta',
  entidad: 'orden',
  // Escribe: cuenta la hoja. Una impresión que no deja rastro es justo la que
  // permite cobrar la hoja vieja sin que nadie sepa que hubo dos.
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaImprimirPrecuenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .leftJoin('mesas', 'mesas.id', 'ordenes.mesa_id')
        .select([
          'ordenes.id as id',
          'ordenes.estado as estado',
          'ordenes.codigo_caja as codigoCaja',
          'ordenes.folio as folio',
          'ordenes.precuentas_impresas as impresas',
          'mesas.numero as mesaNumero',
        ])
        .where('ordenes.organizacion_id', '=', organizacionId)
        .where('ordenes.id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta no existe en este negocio.');
    }
    if ((ORDEN_CERRADA as readonly string[]).includes(orden.estado)) {
      // Un papel que dice PRECUENTA sobre algo ya pagado es la puerta por la que
      // se cobra dos veces la misma mesa.
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya se cerró en caja: lo que se imprime de una venta pagada es su ticket.',
        { estado: orden.estado },
      );
    }

    const { totales, cotizacion } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (cotizacion.lineas.length === 0) {
      throw new ErrorDominio(
        'ORDEN_VACIA',
        'Esa mesa todavía no ha consumido nada: no hay precuenta que imprimir.',
      );
    }

    // El contador sube EN LA BASE y devuelve el valor nuevo: dos meseros que
    // aprietan imprimir a la vez obtienen 1 y 2, no 1 y 1. Leer, sumar y escribir
    // desde el servidor daría dos hojas que las dos dicen ser la primera.
    const contada = await ctx.paso('contar_hoja', () =>
      sql<{ copia: number }>`
        update ordenes
           set precuentas_impresas = precuentas_impresas + 1,
               precuenta_impresa_en = ${ctx.ahora}
         where organizacion_id = ${organizacionId} and id = ${entrada.ordenId}
        returning precuentas_impresas as copia
      `.execute(ctx.tx),
    );
    const copia = contada.rows[0]?.copia ?? orden.impresas + 1;

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: {
        copia,
        anchoMm: entrada.anchoMm,
        totalCentavos: totales.totalCentavos.toString(),
      },
    });

    return {
      ordenId: entrada.ordenId,
      // El folio cuando el código aún no se ha sellado: la hoja sin ningún número
      // no la puede encontrar el cajero entre veinte pendientes.
      codigo: orden.codigoCaja ?? (orden.folio === null ? '' : String(orden.folio)),
      mesaNumero: orden.mesaNumero,
      lineas: cotizacion.lineas,
      subtotalCentavos: totales.subtotalCentavos.toString(),
      descuentoCentavos: totales.descuentoCentavos.toString(),
      impuestosCentavos: totales.impuestosCentavos.toString(),
      totalCentavos: totales.totalCentavos.toString(),
      anchoMm: entrada.anchoMm,
      copia,
      impresaEn: ctx.ahora.toISOString(),
    };
  },
});
