import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import type { LineaDivisible, ParticionCalculada } from '@morphiqpos/domain/venta';

import { cotizar } from '../venta/cotizar.ts';
import { partirLinea } from './division-partir-linea.ts';

/**
 * El SQL de dividir la cuenta de una mesa (F-321, día completo del restaurante, 2.4).
 *
 * Vive aparte de `division.ts` para que allí se lea la REGLA —quién divide, qué se rechaza,
 * qué le pasa a la mesa— sin que la tape el SQL que la cumple. Y existe porque la escritura
 * de `@morphiqpos/data` (`dividirCuenta`) hacía cuatro cosas que, con una mesa de verdad
 * delante, dejaban la división inservible:
 *
 *  1. **Movía la línea ENTERA aunque la parte se llevara una unidad.** El reparto —por
 *     unidades: «yo pago mi cerveza»— lo calcula el dominio, pero el SQL sólo cambiaba
 *     `orden_id`: dos cervezas repartidas entre dos cuentas se quedaban las dos en la
 *     primera. La hija decía 384.00 y sus líneas sumaban 768.00; la otra decía 499.00 y su
 *     única línea valía 115.00. Aquí la línea se PARTE en una fila hermana por cada cuenta
 *     que se lleva unidades —igual que la anulación parcial—, con sus tres importes
 *     repartidos con los mismos pesos que usó el dominio, y lo de cocina la sigue.
 *  2. **Dejaba las hijas en `confirmada`.** Quien divide lo hace porque la mesa pidió cuentas
 *     separadas: cada parte ES una cuenta pedida, y nace así para que la caja la encuentre.
 *     Con `confirmada` ninguna pantalla las listaba y nadie podía cobrarlas.
 *  3. **Tomaba un folio por hija al dividir** y otro al cobrar: dos folios por cuenta y un
 *     hueco permanente en la serie por cada parte. El folio se toma al COBRAR, como en toda
 *     cuenta.
 *  4. **No heredaba la propina** que el mesero acordó con la mesa, así que cada parte se
 *     cobraba sin ella y sin muro que lo dijera.
 */

/** Los estados desde los que una cuenta se puede dividir: la mesa ya pidió la cuenta o no. */
export const DIVISIBLES = ['borrador', 'confirmada', 'cuenta_solicitada'] as const;

/** Lo que se copia de la cuenta madre a cada hija. */
export interface MadreParaDividir {
  readonly id: string;
  readonly serie: string;
  readonly sesionCajaId: string | null;
  readonly empleadoAtiendeId: string | null;
  readonly terminalId: string | null;
  readonly estrategiaCaptura: string;
  readonly estrategiaCumplimiento: string;
}

/** La propina de cada parte: la que acordó la mesa, o la que decide la caja. */
export interface PropinaDeLasPartes {
  readonly tipo: string;
  readonly puntosBase: number;
  readonly origen: string;
}

export interface DatosDeLaDivision {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly madre: MadreParaDividir;
  /** El código que la mesa ya llevaba impreso; cada parte lo extiende: `M03-4821-1`. */
  readonly codigoBase: string;
  /** «Mesa 3»: con qué palabras se nombra la mesa en la etiqueta de cada parte. */
  readonly rotuloDeLaMesa: string;
  readonly propina: PropinaDeLasPartes;
  /** Las líneas vivas de la madre, con sus unidades y su importe: lo que calculó el servidor. */
  readonly lineas: readonly LineaDivisible[];
  readonly particiones: readonly ParticionCalculada[];
  readonly empleoId: string;
  readonly mesaId: string | null;
  readonly ahora: Date;
}

export interface HijaEscrita {
  readonly ordenId: string;
  readonly indice: number;
  readonly codigoCaja: string;
  /** Lo que la caja lee en su lista: «Mesa 3 · cuenta 1 de 2». */
  readonly etiqueta: string;
  readonly totalCentavos: bigint;
}

/** Cuántas unidades de una línea se lleva cada parte, en el orden de las partes. */
function unidadesPorParte(
  particiones: readonly ParticionCalculada[],
  lineaId: string,
): readonly number[] {
  return particiones.map((p) =>
    p.tomas.filter((t) => t.lineaId === lineaId).reduce((suma, t) => suma + t.cantidad, 0),
  );
}

/**
 * Crea las hijas, reparte las líneas y sella la madre. Todo en la transacción del comando:
 * una división a medias deja consumo que nadie cobra.
 */
export async function escribirDivision(
  tx: Transaccion,
  datos: DatosDeLaDivision,
): Promise<readonly HijaEscrita[]> {
  const { organizacionId, madre, particiones } = datos;
  const hijas: HijaEscrita[] = [];

  for (const parte of particiones) {
    const codigoCaja = `${datos.codigoBase}-${String(parte.indice)}`;
    const etiqueta = `${datos.rotuloDeLaMesa} · cuenta ${String(parte.indice)} de ${String(particiones.length)}`;
    const hija = await tx
      .insertInto('ordenes')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: datos.sucursalId,
        // SIN mesa: la conserva la madre, y `ordenes_una_activa_por_mesa` no admite dos
        // cuentas vivas de la misma mesa.
        mesa_id: null,
        // La mesa pidió cuentas separadas: cada parte es una cuenta PEDIDA.
        estado: 'cuenta_solicitada',
        serie: madre.serie,
        // Sin folio: se toma al cobrar, igual que en cualquier cuenta de mesa.
        orden_padre_id: madre.id,
        division_indice: parte.indice,
        total_centavos: parte.totalCentavos,
        subtotal_centavos: parte.totalCentavos,
        empleado_atiende_id: madre.empleadoAtiendeId,
        sesion_caja_id: madre.sesionCajaId,
        terminal_id: madre.terminalId,
        estrategia_captura: madre.estrategiaCaptura,
        estrategia_cumplimiento: madre.estrategiaCumplimiento,
        codigo_caja: codigoCaja,
        cliente_nombre: etiqueta,
        propina_tipo: datos.propina.tipo,
        propina_puntos_base: datos.propina.puntosBase,
        propina_origen: datos.propina.origen,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    hijas.push({
      ordenId: hija.id,
      indice: parte.indice,
      codigoCaja,
      etiqueta,
      totalCentavos: parte.totalCentavos,
    });
  }

  // Lo que cada parte se llevó de cada línea, tal como quedó escrito.
  const cuotasPorLinea = new Map<string, readonly bigint[]>();

  for (const linea of datos.lineas) {
    const unidades = unidadesPorParte(particiones, linea.lineaId);
    const destinos = unidades.flatMap((u, i) => (u > 0 ? [i] : []));
    const primera = destinos[0];
    if (primera === undefined) continue;

    if (destinos.length === 1) {
      // Una sola cuenta se la lleva entera: la fila se muda y ya.
      await tx
        .updateTable('orden_lineas')
        .set({ orden_id: hijas[primera]?.ordenId ?? madre.id, updated_at: datos.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', linea.lineaId)
        .execute();
      cuotasPorLinea.set(
        linea.lineaId,
        unidades.map((_, i) => (i === primera ? linea.importeCentavos : 0n)),
      );
      continue;
    }

    cuotasPorLinea.set(
      linea.lineaId,
      await partirLinea(tx, {
        organizacionId,
        lineaId: linea.lineaId,
        unidades,
        ordenes: hijas.map((h) => h.ordenId),
        ahora: datos.ahora,
      }),
    );
  }

  // CADA PARTE VALE LO QUE `cotizar` LE COBRARÁ (cierre del 21-10). Su total salía del
  // reparto del dominio y el cobro lo recalcula de sus líneas: con un descuento o con el IVA
  // fuera del precio no daban lo mismo, y ninguna parte se podía cobrar. Ahora el total que la
  // división enseña es el de sus líneas, con la misma regla de impuesto que el cobro.
  for (const [i, hija] of hijas.entries()) {
    const { totales } = await cotizar(tx, organizacionId, hija.ordenId);
    await tx
      .updateTable('ordenes')
      .set({
        subtotal_centavos: totales.subtotalCentavos,
        descuento_centavos: totales.descuentoCentavos,
        impuestos_centavos: totales.impuestosCentavos,
        total_centavos: totales.totalCentavos,
        costo_total_centavos: totales.costoTotalCentavos,
        utilidad_centavos: totales.utilidadCentavos,
        margen_bp: totales.margenBp,
        updated_at: datos.ahora,
      })
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', hija.ordenId)
      .execute();
    hijas[i] = { ...hija, totalCentavos: totales.totalCentavos };
  }
  // Y la madre, lo que suman: con el IVA fuera del precio, el de cada parte se redondea por
  // separado y puede diferir un centavo del de la cuenta entera; lo que se cobra son las partes.
  await ajustarLaMadreASusPartes(tx, organizacionId, madre.id, datos.ahora);

  const sellada = await tx
    .updateTable('ordenes')
    .set({ estado: 'dividida', updated_at: datos.ahora })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', madre.id)
    .where('estado', 'in', [...DIVISIBLES])
    .executeTakeFirst();

  if (Number(sellada.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Esa cuenta dejó de ser divisible mientras se dividía.',
    );
  }

  await tx
    .insertInto('movimientos_cuenta')
    .values({
      organizacion_id: organizacionId,
      sucursal_id: datos.sucursalId,
      tipo: 'division',
      orden_origen_id: madre.id,
      mesa_origen_id: datos.mesaId,
      // Lo que cada parte se lleva de cada línea, con SU cuota del importe: la que quedó escrita
      // en sus líneas, no el importe de la línea entera.
      lineas: JSON.stringify(
        particiones.flatMap((parte, i) =>
          datos.lineas.flatMap((linea) => {
            const unidades = unidadesPorParte(particiones, linea.lineaId);
            const cantidad = unidades[i] ?? 0;
            if (cantidad === 0) return [];
            const cuota = cuotasPorLinea.get(linea.lineaId)?.[i] ?? 0n;
            return [
              {
                linea_id: linea.lineaId,
                cantidad,
                importe_centavos: cuota.toString(),
                parte: parte.indice,
              },
            ];
          }),
        ),
      ),
      empleado_id: datos.empleoId,
      created_at: datos.ahora,
    })
    .execute();

  return hijas;
}

/**
 * LA MADRE VALE LO QUE SUMAN SUS PARTES VIVAS (cierre del 21-10).
 *
 * Es la regla que la base exige al confirmar (`division_cuadra`, 070): madre = Σ hijas no
 * canceladas. Se llama al dividir —el IVA fuera del precio se redondea por parte— y al
 * descontar una parte ya dividida, que bajaba el total de la hija sin tocar el de la madre y
 * reventaba al confirmar como «Algo falló de nuestro lado».
 */
export async function ajustarLaMadreASusPartes(
  tx: Transaccion,
  organizacionId: string,
  madreId: string,
  ahora: Date,
): Promise<void> {
  const hijas = await tx
    .selectFrom('ordenes')
    .select(['subtotal_centavos', 'descuento_centavos', 'impuestos_centavos', 'total_centavos'])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_padre_id', '=', madreId)
    .where('estado', '<>', 'cancelada')
    .execute();
  const suma = (
    columna: 'subtotal_centavos' | 'descuento_centavos' | 'impuestos_centavos' | 'total_centavos',
  ) => hijas.reduce((total, hija) => total + hija[columna], 0n);
  await tx
    .updateTable('ordenes')
    .set({
      subtotal_centavos: suma('subtotal_centavos'),
      descuento_centavos: suma('descuento_centavos'),
      impuestos_centavos: suma('impuestos_centavos'),
      total_centavos: suma('total_centavos'),
      updated_at: ahora,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', madreId)
    .execute();
}
