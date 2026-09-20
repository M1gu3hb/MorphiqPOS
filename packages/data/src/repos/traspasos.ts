import { ErrorDominio } from '@morphiqpos/contracts/errores';

import type { Transaccion } from '../cliente.ts';

/**
 * F-105 · Traspaso entre almacenes.
 *
 * ── Por qué las dos mitades van en la MISMA transacción ────────────────────
 * Un traspaso son dos movimientos de stock: salida en el origen y entrada en el
 * destino. Si sólo pasa el primero, hay producto que salió de un almacén y no
 * llegó al otro, y eso no se descubre hasta el conteo físico — semanas después,
 * cuando ya nadie recuerda qué pasó.
 *
 * ── Lo que esta capa NO hace ───────────────────────────────────────────────
 * No decide permisos ni valida importes: eso es del comando. Aquí sólo vive el
 * SQL, y con una regla: cada estado que la base exige acompañado se escribe con
 * su columna en el mismo `set`. El contrato `estados-con-columna` lo vigila, y
 * nació porque esa familia de defectos ya tumbó todos los cobros del sistema una
 * vez.
 */

export interface LineaDeTraspaso {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly unidad: string;
}

export interface DatosDeTraspaso {
  readonly organizacionId: string;
  readonly almacenOrigen: string;
  readonly almacenDestino: string;
  readonly empleadoId: string;
  readonly motivo: string | null;
  readonly lineas: readonly LineaDeTraspaso[];
  readonly ahora: Date;
}

export interface TraspasoCreado {
  readonly traspasoId: string;
  readonly lineas: number;
}

/**
 * Crea el traspaso y lo deja ENVIADO en un solo paso.
 *
 * No existe el borrador a medias desde el servidor: o el traspaso sale con sus
 * líneas o no existe. El estado `borrador` de la tabla es para la pantalla, que
 * arma la lista antes de mandarla.
 */
export async function enviarTraspaso(
  tx: Transaccion,
  datos: DatosDeTraspaso,
): Promise<TraspasoCreado> {
  if (datos.lineas.length === 0) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'Un traspaso necesita al menos una línea.');
  }
  if (datos.almacenOrigen === datos.almacenDestino) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'El origen y el destino no pueden ser el mismo.');
  }

  const traspaso = await tx
    .insertInto('traspasos')
    .values({
      organizacion_id: datos.organizacionId,
      almacen_origen: datos.almacenOrigen,
      almacen_destino: datos.almacenDestino,
      // `enviado` exige `enviado_en`: el check `traspaso_enviado_con_fecha` lo
      // rechaza con 23514 si falta, y los dos se escriben aquí en el mismo
      // objeto a propósito.
      estado: 'enviado',
      enviado_en: datos.ahora,
      motivo: datos.motivo,
      empleado_id: datos.empleadoId,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  await tx
    .insertInto('traspaso_lineas')
    .values(
      datos.lineas.map((linea) => ({
        traspaso_id: traspaso.id,
        insumo_id: linea.insumoId,
        cantidad: linea.cantidad,
        unidad: linea.unidad,
      })),
    )
    .execute();

  return { traspasoId: traspaso.id, lineas: datos.lineas.length };
}

export interface RecepcionDeTraspaso {
  readonly organizacionId: string;
  readonly traspasoId: string;
  readonly empleadoId: string;
  /** Lo que de VERDAD llegó, por insumo. Puede diferir de lo enviado. */
  readonly recibido: readonly { readonly insumoId: string; readonly cantidad: string }[];
  readonly ahora: Date;
}

export interface TraspasoRecibido {
  readonly filas: number;
  /** Los insumos donde lo recibido no coincide con lo enviado. */
  readonly diferencias: readonly string[];
}

/**
 * Marca el traspaso como recibido y anota lo que llegó de verdad.
 *
 * La DIFERENCIA entre lo enviado y lo recibido es el dato que importa: sin ella
 * el traspaso cuadra siempre en el papel y nunca en el estante. Se devuelve
 * para que el comando decida qué hacer —avisar, pedir autorización, generar
 * merma— en vez de esconderla.
 */
export async function recibirTraspaso(
  tx: Transaccion,
  datos: RecepcionDeTraspaso,
): Promise<TraspasoRecibido> {
  for (const linea of datos.recibido) {
    await tx
      .updateTable('traspaso_lineas')
      .set({ cantidad_recibida: linea.cantidad })
      .where('traspaso_id', '=', datos.traspasoId)
      .where('insumo_id', '=', linea.insumoId)
      .execute();
  }

  const resultado = await tx
    .updateTable('traspasos')
    .set({
      // `recibido` exige enviado_en Y recibido_en (`traspaso_recibido_completo`).
      // Los dos, en el mismo objeto.
      estado: 'recibido',
      recibido_en: datos.ahora,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.traspasoId)
    // Sólo un traspaso enviado se puede recibir. Recibir uno ya recibido
    // duplicaría la entrada de stock, que es el error que más caro sale aquí.
    .where('estado', '=', 'enviado')
    .executeTakeFirst();

  const filas = Number(resultado.numUpdatedRows);
  if (filas !== 1) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Ese traspaso ya no estaba en tránsito al recibirlo.',
    );
  }

  const conDiferencia = await tx
    .selectFrom('traspaso_lineas')
    .select('insumo_id')
    .where('traspaso_id', '=', datos.traspasoId)
    .where((eb) =>
      eb.or([
        eb('cantidad_recibida', 'is', null),
        eb(eb.ref('cantidad_recibida'), '<>', eb.ref('cantidad')),
      ]),
    )
    .execute();

  return { filas, diferencias: conDiferencia.map((f) => f.insumo_id) };
}
