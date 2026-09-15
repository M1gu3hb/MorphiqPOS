import { ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Transaccion } from '../cliente.ts';

/**
 * F-106 · Toma de inventario físico, y F-149 · conteo cíclico por zona.
 *
 * ── Por qué el conteo NO escribe existencias ───────────────────────────────
 * Escribe lo CONTADO. La diferencia contra lo esperado sale después como un
 * movimiento de stock con motivo `ajuste_conteo`, y por eso el kardex puede
 * explicar por qué cambió el saldo. Si el conteo escribiera existencias
 * directamente, el saldo cambiaría sin renglón que lo justifique — que es
 * exactamente la pregunta que el dueño hace («¿por qué dice 40 y hay 36?») y la
 * única razón por la que se cuenta.
 *
 * ── Por qué `esperado` se congela al contar ────────────────────────────────
 * Entre el conteo y el cierre pudo haber ventas. Comparar lo contado a las 11:00
 * contra el saldo de las 14:00 daría una diferencia falsa, y una diferencia
 * falsa gasta la confianza más rápido que no tener el dato.
 */

export interface AperturaDeToma {
  readonly organizacionId: string;
  readonly almacenId: string;
  readonly empleadoId: string;
  /** `null` = toma completa. Con valor = conteo cíclico de una zona (F-149). */
  readonly zona: string | null;
  readonly ahora: Date;
}

export async function abrirToma(tx: Transaccion, datos: AperturaDeToma): Promise<string> {
  // Dos tomas abiertas en el mismo almacén producen dos «esperados» distintos
  // para el mismo insumo, y la segunda que cierre pisa a la primera.
  const abierta = await tx
    .selectFrom('tomas_inventario')
    .select('id')
    .where('organizacion_id', '=', datos.organizacionId)
    .where('almacen_id', '=', datos.almacenId)
    .where('estado', '=', 'abierta')
    .executeTakeFirst();

  if (abierta !== undefined) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Ya hay una toma de inventario abierta en ese almacén.',
    );
  }

  const creada = await tx
    .insertInto('tomas_inventario')
    .values({
      organizacion_id: datos.organizacionId,
      almacen_id: datos.almacenId,
      estado: 'abierta',
      iniciada_en: datos.ahora,
      zona: datos.zona,
      empleado_id: datos.empleadoId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return creada.id;
}

export interface ConteoDeInsumo {
  readonly insumoId: string;
  readonly contado: string;
  readonly unidad: string;
}

/**
 * Anota lo contado, congelando el esperado del sistema en ese instante.
 *
 * El `esperado` se lee de `existencias` DENTRO de la misma transacción: leerlo
 * fuera abriría la ventana en la que una venta cambia el saldo entre la lectura
 * y la escritura, que es la trampa del read-then-write.
 */
export async function anotarConteo(
  tx: Transaccion,
  tomaId: string,
  almacenId: string,
  conteo: ConteoDeInsumo,
  empleadoId: string,
  ahora: Date,
): Promise<void> {
  const existencia = await tx
    .selectFrom('existencias')
    .select('cantidad')
    .where('almacen_id', '=', almacenId)
    .where('insumo_id', '=', conteo.insumoId)
    .executeTakeFirst();

  await tx
    .insertInto('toma_conteos')
    .values({
      toma_id: tomaId,
      insumo_id: conteo.insumoId,
      // Sin existencia previa el esperado es cero, no null: un insumo que nunca
      // entró y que aparece contado ES una diferencia, y de las que importan.
      esperado: existencia?.cantidad ?? '0',
      contado: conteo.contado,
      unidad: conteo.unidad,
      contado_en: ahora,
      empleado_id: empleadoId,
    })
    .onConflict((oc) =>
      oc.columns(['toma_id', 'insumo_id']).doUpdateSet({
        contado: conteo.contado,
        contado_en: ahora,
        empleado_id: empleadoId,
      }),
    )
    .execute();
}

export interface DiferenciaDeToma {
  readonly insumoId: string;
  readonly esperado: string;
  readonly contado: string;
  readonly unidad: string;
}

/** Las diferencias de una toma: lo único que el conteo existe para producir. */
export async function diferenciasDeToma(
  tx: Transaccion,
  tomaId: string,
): Promise<readonly DiferenciaDeToma[]> {
  const filas = await tx
    .selectFrom('toma_conteos')
    .select(['insumo_id', 'esperado', 'contado', 'unidad'])
    .where('toma_id', '=', tomaId)
    .where((eb) => eb(eb.ref('contado'), '<>', eb.ref('esperado')))
    .execute();

  return filas.map((f) => ({
    insumoId: f.insumo_id,
    esperado: String(f.esperado),
    contado: String(f.contado),
    unidad: f.unidad,
  }));
}

export async function cerrarToma(
  tx: Transaccion,
  organizacionId: string,
  tomaId: string,
  ahora: Date,
): Promise<number> {
  const resultado = await tx
    .updateTable('tomas_inventario')
    .set({
      // `cerrada` exige `cerrada_en` (check `toma_cerrada_con_fecha`). Los dos
      // en el mismo objeto, que es la regla que el contrato vigila.
      estado: 'cerrada',
      cerrada_en: ahora,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', tomaId)
    // Cerrar una toma ya cerrada volvería a generar sus ajustes de stock.
    .where('estado', '=', 'abierta')
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}
