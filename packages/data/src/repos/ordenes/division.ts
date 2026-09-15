import { ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Transaccion } from '../../cliente.ts';
import { tomarFolio } from '../folios.ts';

/**
 * F-321 · El SQL de dividir una cuenta.
 *
 * ── Las hijas nacen sin mesa ───────────────────────────────────────────────
 * `ordenes_una_activa_por_mesa` (migración 046) impide dos cuentas vivas en la
 * misma mesa, y con razón: el mesero comandaría en una y el cajero cobraría la
 * otra. Las hijas cuelgan de la madre por `orden_padre_id`; la madre conserva
 * la mesa y pasa a `dividida`, que no está entre los estados activos.
 *
 * ── Cada hija lleva folio propio ───────────────────────────────────────────
 * Porque cada una se cobra por separado y cada cobro necesita su ticket. El
 * folio sale de `tomarFolio`, que es atómico desde la Fase 1 — leerlo y
 * escribirlo en dos sentencias dejaba que dos cajas tomaran el mismo número.
 */

export interface LineaMovida {
  readonly lineaId: string;
  readonly cantidad: number;
  readonly importeCentavos: bigint;
}

export interface ParticionParaEscribir {
  readonly indice: number;
  readonly totalCentavos: bigint;
  readonly lineas: readonly LineaMovida[];
}

export interface DatosDeDivision {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly ordenMadreId: string;
  readonly mesaId: string | null;
  readonly serie: string;
  readonly empleadoId: string;
  readonly particiones: readonly ParticionParaEscribir[];
  readonly ahora: Date;
}

export interface HijaCreada {
  readonly ordenId: string;
  readonly indice: number;
  readonly serie: string;
  readonly folio: string;
  readonly totalCentavos: string;
}

/**
 * Crea las hijas, mueve las líneas y sella la madre. Todo en la transacción del
 * comando: una división a medias deja consumo que nadie cobra.
 */
export async function dividirCuenta(
  tx: Transaccion,
  datos: DatosDeDivision,
): Promise<readonly HijaCreada[]> {
  const madre = await tx
    .selectFrom('ordenes')
    .select(['estado', 'total_centavos', 'sesion_caja_id', 'empleado_atiende_id', 'terminal_id'])
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenMadreId)
    .executeTakeFirst();

  if (madre === undefined) {
    throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa cuenta no existe en este negocio.');
  }
  // Una cuenta pagada no se divide: se devuelve. Y una ya dividida no se vuelve
  // a dividir, o las hijas de las hijas dejarían de sumar a la madre.
  if (madre.estado !== 'borrador' && madre.estado !== 'confirmada') {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Sólo se divide una cuenta abierta: una cobrada se devuelve, una dividida ya lo está.',
      { estado: madre.estado },
    );
  }

  const hijas: HijaCreada[] = [];

  for (const particion of datos.particiones) {
    const { folio } = await tomarFolio(tx, datos.organizacionId, datos.sucursalId, datos.serie);

    const hija = await tx
      .insertInto('ordenes')
      .values({
        organizacion_id: datos.organizacionId,
        sucursal_id: datos.sucursalId,
        // SIN mesa: la conserva la madre. Ver el docblock.
        mesa_id: null,
        estado: 'confirmada',
        serie: datos.serie,
        folio,
        orden_padre_id: datos.ordenMadreId,
        division_indice: particion.indice,
        total_centavos: particion.totalCentavos,
        subtotal_centavos: particion.totalCentavos,
        empleado_atiende_id: madre.empleado_atiende_id,
        sesion_caja_id: madre.sesion_caja_id,
        terminal_id: madre.terminal_id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    for (const linea of particion.lineas) {
      await tx
        .updateTable('orden_lineas')
        .set({ orden_id: hija.id })
        .where('orden_id', '=', datos.ordenMadreId)
        .where('id', '=', linea.lineaId)
        .execute();
    }

    hijas.push({
      ordenId: hija.id,
      indice: particion.indice,
      serie: datos.serie,
      folio: String(folio),
      totalCentavos: particion.totalCentavos.toString(),
    });
  }

  // La madre queda sellada al final: mientras se creaban las hijas seguía
  // siendo la dueña de las líneas, y el trigger diferido de la 070 comprueba
  // la suma al CERRAR la transacción, no en cada paso.
  const sellada = await tx
    .updateTable('ordenes')
    .set({ estado: 'dividida' })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.ordenMadreId)
    .where('estado', 'in', ['borrador', 'confirmada'])
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
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.sucursalId,
      tipo: 'division',
      orden_origen_id: datos.ordenMadreId,
      mesa_origen_id: datos.mesaId,
      lineas: JSON.stringify(
        datos.particiones.flatMap((p) =>
          p.lineas.map((l) => ({
            linea_id: l.lineaId,
            cantidad: l.cantidad,
            importe_centavos: l.importeCentavos.toString(),
            parte: p.indice,
          })),
        ),
      ),
      empleado_id: datos.empleadoId,
      created_at: datos.ahora,
    })
    .execute();

  return hijas;
}
