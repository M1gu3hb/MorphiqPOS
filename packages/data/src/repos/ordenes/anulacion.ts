import { ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Transaccion } from '../../cliente.ts';

/**
 * F-324 · El SQL de anular una línea ya comandada.
 *
 * ── Anular no es borrar, y por eso hay dos filas ───────────────────────────
 * Cuando se anula PARTE de una línea, la fila original se queda viva con lo que
 * sigue cobrándose y nace una fila hermana con la porción anulada y su sello.
 * Al revés —dejar la original como anulada y crear la viva— rompería el vínculo
 * `comanda_items.orden_linea_id`: cocina seguiría apuntando a la mitad que ya
 * no se prepara.
 *
 * ── Lo que pasa en cocina ──────────────────────────────────────────────────
 * Anular entera cancela el item de comanda. Anular parte le resta cantidad: la
 * cocina hace dos en vez de tres. Y lo que ya está `entregado` no se toca: ese
 * plato existió, salió y se comió o se tiró; borrarlo del registro de cocina
 * convertiría la merma del turno en un misterio.
 */

export interface PorcionParaEscribir {
  readonly cantidad: string;
  readonly subtotalCentavos: bigint;
  readonly descuentoCentavos: bigint;
  readonly totalCentavos: bigint;
}

export interface DatosDeAnulacion {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly ordenId: string;
  readonly lineaId: string;
  readonly mesaId: string | null;
  readonly porcionAnulada: PorcionParaEscribir;
  /** `null` ⇒ se anula la línea entera. */
  readonly porcionRestante: PorcionParaEscribir | null;
  readonly motivo: string;
  readonly nota: string | null;
  readonly empleadoId: string;
  readonly ahora: Date;
}

export interface AnulacionEscrita {
  /** La fila que quedó marcada como anulada. */
  readonly lineaAnuladaId: string;
  /** La fila que sigue cobrándose, si quedó algo. */
  readonly lineaVivaId: string | null;
  readonly itemsCancelados: number;
  readonly itemsReducidos: number;
}

/** Los estados de cocina sobre los que todavía se puede actuar. */
const ITEMS_VIVOS = ['pendiente', 'en_preparacion', 'listo'] as const;

export async function anularLinea(
  tx: Transaccion,
  datos: DatosDeAnulacion,
): Promise<AnulacionEscrita> {
  const linea = await tx
    .selectFrom('orden_lineas')
    .selectAll()
    .where('organizacion_id', '=', datos.organizacionId)
    .where('orden_id', '=', datos.ordenId)
    .where('id', '=', datos.lineaId)
    .executeTakeFirst();

  if (linea === undefined) {
    throw new ErrorDominio('LINEA_NO_ENCONTRADA', 'Esa línea no es de esta cuenta.');
  }
  if (linea.anulada_en !== null) {
    throw new ErrorDominio('ORDEN_NO_EDITABLE', 'Esa línea ya está anulada.', {
      lineaId: datos.lineaId,
    });
  }

  const sello = {
    anulada_en: datos.ahora,
    motivo_anulacion: datos.motivo,
    empleado_anula_id: datos.empleadoId,
  };

  let lineaAnuladaId = datos.lineaId;
  let lineaVivaId: string | null = null;

  if (datos.porcionRestante === null) {
    await tx
      .updateTable('orden_lineas')
      .set(sello)
      .where('organizacion_id', '=', datos.organizacionId)
      .where('id', '=', datos.lineaId)
      // Si otra caja la anuló entre la lectura y esta escritura, cero filas.
      .where('anulada_en', 'is', null)
      .execute();
  } else {
    // La original se queda VIVA con lo que sigue cobrándose. Ver el docblock.
    await tx
      .updateTable('orden_lineas')
      .set({
        cantidad: datos.porcionRestante.cantidad,
        subtotal_centavos: datos.porcionRestante.subtotalCentavos,
        descuento_centavos: datos.porcionRestante.descuentoCentavos,
        total_centavos: datos.porcionRestante.totalCentavos,
        updated_at: datos.ahora,
      })
      .where('organizacion_id', '=', datos.organizacionId)
      .where('id', '=', datos.lineaId)
      .where('anulada_en', 'is', null)
      .execute();
    lineaVivaId = datos.lineaId;

    const hermana = await tx
      .insertInto('orden_lineas')
      .values({
        organizacion_id: datos.organizacionId,
        orden_id: datos.ordenId,
        producto_id: linea.producto_id,
        // Instantáneas: el ticket de dentro de un año tiene que seguir diciendo
        // qué se anuló, aunque el producto se haya renombrado.
        producto_nombre: linea.producto_nombre,
        sku: linea.sku,
        codigo_barras: linea.codigo_barras,
        cantidad: datos.porcionAnulada.cantidad,
        unidad: linea.unidad,
        precio_unitario_centavos: linea.precio_unitario_centavos,
        costo_unitario_centavos: linea.costo_unitario_centavos,
        subtotal_centavos: datos.porcionAnulada.subtotalCentavos,
        descuento_centavos: datos.porcionAnulada.descuentoCentavos,
        total_centavos: datos.porcionAnulada.totalCentavos,
        es_mayoreo: linea.es_mayoreo,
        tipo_venta: linea.tipo_venta,
        notas: linea.notas,
        orden_visual: linea.orden_visual,
        estado_preparacion: linea.estado_preparacion,
        ...sello,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    lineaAnuladaId = hermana.id;
  }

  const { cancelados, reducidos } = await ajustarCocina(tx, datos, linea.cantidad);

  await tx
    .insertInto('movimientos_cuenta')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.sucursalId,
      tipo: 'anulacion_linea',
      orden_origen_id: datos.ordenId,
      mesa_origen_id: datos.mesaId,
      lineas: JSON.stringify([
        {
          linea_id: lineaAnuladaId,
          linea_origen_id: datos.lineaId,
          producto_nombre: linea.producto_nombre,
          cantidad: datos.porcionAnulada.cantidad,
          importe_centavos: datos.porcionAnulada.totalCentavos.toString(),
        },
      ]),
      // La 070 exige motivo para este tipo: anular sin motivo es el camino
      // corto para que desaparezca comida sin que nadie responda.
      motivo: datos.nota === null ? datos.motivo : `${datos.motivo} · ${datos.nota}`,
      empleado_id: datos.empleadoId,
      created_at: datos.ahora,
    })
    .execute();

  return { lineaAnuladaId, lineaVivaId, itemsCancelados: cancelados, itemsReducidos: reducidos };
}

/**
 * Le quita a cocina lo que se anuló.
 *
 * Entera ⇒ el item se cancela. Parcial ⇒ se le resta la cantidad, y si llega a
 * cero se cancela igual. `entregado` nunca se toca: ver el docblock del módulo.
 */
async function ajustarCocina(
  tx: Transaccion,
  datos: DatosDeAnulacion,
  cantidadOriginal: string,
): Promise<{ readonly cancelados: number; readonly reducidos: number }> {
  const items = await tx
    .selectFrom('comanda_items')
    .select(['id', 'cantidad', 'estado'])
    .where('organizacion_id', '=', datos.organizacionId)
    .where('orden_linea_id', '=', datos.lineaId)
    .where('estado', 'in', [...ITEMS_VIVOS])
    .execute();

  if (items.length === 0) return { cancelados: 0, reducidos: 0 };

  if (datos.porcionRestante === null) {
    for (const item of items) {
      await tx
        .updateTable('comanda_items')
        .set({ estado: 'cancelado' })
        .where('organizacion_id', '=', datos.organizacionId)
        .where('id', '=', item.id)
        .execute();
    }
    return { cancelados: items.length, reducidos: 0 };
  }

  // Parcial. Se le resta al item la proporción que se anuló, en su misma
  // escala: el item pudo haberse comandado por menos que la línea entera.
  let porQuitar = escala(cantidadOriginal) - escala(datos.porcionRestante.cantidad);
  let cancelados = 0;
  let reducidos = 0;

  for (const item of items) {
    if (porQuitar <= 0n) break;
    const tiene = escala(item.cantidad);
    const quita = tiene < porQuitar ? tiene : porQuitar;
    porQuitar -= quita;

    if (tiene - quita <= 0n) {
      await tx
        .updateTable('comanda_items')
        .set({ estado: 'cancelado' })
        .where('organizacion_id', '=', datos.organizacionId)
        .where('id', '=', item.id)
        .execute();
      cancelados += 1;
    } else {
      await tx
        .updateTable('comanda_items')
        .set({ cantidad: texto(tiene - quita) })
        .where('organizacion_id', '=', datos.organizacionId)
        .where('id', '=', item.id)
        .execute();
      reducidos += 1;
    }
  }

  return { cancelados, reducidos };
}

/**
 * `numeric(14,4)` a diezmilésimas enteras.
 *
 * Duplica a propósito `aDiezmilesimas` del dominio: `packages/data` no depende
 * de `packages/domain` —lo comprueba `verify:estructura`— y hacerlo depender
 * para cuatro líneas de aritmética entera abriría la puerta a que el SQL
 * empiece a llamar reglas de negocio.
 */
const ESCALA = 10_000n;

function escala(cantidad: string): bigint {
  const [entera = '0', decimal = ''] = cantidad.split('.');
  return BigInt(entera || '0') * ESCALA + BigInt(decimal.padEnd(4, '0').slice(0, 4));
}

function texto(valor: bigint): string {
  return `${(valor / ESCALA).toString()}.${(valor % ESCALA).toString().padStart(4, '0')}`;
}
