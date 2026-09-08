import { ErrorDominio } from '@morphiqpos/contracts/errores';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import type { MovimientoPlaneado } from '@morphiqpos/domain/inventario';
import { sql } from 'kysely';

import type { Transaccion } from '../cliente';

interface MovimientoValidado {
  readonly movimiento: MovimientoPlaneado;
  readonly cantidad: string;
}

/**
 * Aplica decrementos y escribe el ledger dentro de la transacción del comando.
 * Los bloqueos se toman en orden estable para evitar ciclos entre dos órdenes.
 */
export async function aplicarMovimientos(
  movimientos: MovimientoPlaneado[],
  tx: Transaccion,
): Promise<void> {
  const validados = movimientos.map(validar).sort(compararSaldo);
  if (validados.length === 0) return;

  for (const { movimiento, cantidad: consumo } of validados) {
    if (movimiento.permiteNegativo) {
      await sql`
        insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
        values (${movimiento.organizacionId}, ${movimiento.almacenId}, ${movimiento.insumoId}, 0)
        on conflict (almacen_id, insumo_id) do nothing
      `.execute(tx);
    }

    const resultado = await sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad - ${consumo},
             actualizado_en = now()
       where organizacion_id = ${movimiento.organizacionId}
         and almacen_id = ${movimiento.almacenId}
         and insumo_id = ${movimiento.insumoId}
         and (cantidad >= ${consumo} or ${movimiento.permiteNegativo})
       returning cantidad
    `.execute(tx);

    if (resultado.rows.length !== 1) {
      throw new ErrorDominio(
        'STOCK_INSUFICIENTE',
        'No hay inventario suficiente para completar la venta.',
        { insumoId: movimiento.insumoId },
      );
    }
  }

  const filas = validados.map(
    ({ movimiento, cantidad: consumo }) => sql`(
    ${movimiento.organizacionId},
    ${movimiento.almacenId},
    ${movimiento.insumoId},
    ${movimiento.tipo},
    ${`-${consumo}`},
    ${movimiento.unidad},
    ${movimiento.referenciaTipo},
    ${movimiento.referenciaId},
    ${movimiento.empleadoId ?? null},
    ${movimiento.idempotencyKey}
  )`,
  );

  await sql`
    insert into movimientos_stock (
      organizacion_id,
      almacen_id,
      insumo_id,
      tipo,
      cantidad,
      unidad,
      referencia_tipo,
      referencia_id,
      empleado_id,
      idempotency_key
    ) values ${sql.join(filas)}
  `.execute(tx);
}

function validar(movimiento: MovimientoPlaneado): MovimientoValidado {
  const valor = cantidad(movimiento.cantidad);
  if (valor === 0n) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'Un movimiento de stock no puede ser cero.');
  }
  return { movimiento, cantidad: cantidadATexto(valor) };
}

function compararSaldo(a: MovimientoValidado, b: MovimientoValidado): number {
  const claveA = `${a.movimiento.organizacionId}\u0000${a.movimiento.almacenId}\u0000${a.movimiento.insumoId}`;
  const claveB = `${b.movimiento.organizacionId}\u0000${b.movimiento.almacenId}\u0000${b.movimiento.insumoId}`;
  return claveA < claveB ? -1 : claveA > claveB ? 1 : 0;
}
