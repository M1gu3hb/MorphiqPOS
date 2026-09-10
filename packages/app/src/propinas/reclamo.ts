import { ErrorDominio } from '@morphiqpos/contracts';

/**
 * Por qué el `UPDATE` no reclamó todas las ventas que el diálogo enseñó.
 *
 * ── El defecto que esto cierra ─────────────────────────────────────────────
 * `LiquidarPropinasDialog.jsx:113-126` marca las ventas en lotes de cinco y en
 * `:122` **se traga el error** con un `console.error`. Si un `update` falla, la
 * liquidación ya está creada, la venta sigue pendiente y se vuelve a liquidar la
 * próxima vez: la misma propina, pagada dos veces (F1-04 §30.2).
 *
 * Aquí la protección no es un `if` optimista antes de escribir —entre la lectura
 * y la escritura cabe otra caja haciendo lo mismo—, sino el propio `UPDATE … WHERE
 * propina_liquidacion_id is null … RETURNING id`: Postgres serializa las dos
 * transacciones en la fila y la segunda ve el puntero ya puesto, así que no la
 * reclama. Esta función sólo EXPLICA la diferencia entre lo que se pidió y lo que
 * se reclamó, después de que la base ya decidió.
 */

export interface Reclamo {
  /** Las órdenes que el diálogo enseñó, si las mandó. Vacío = «todo el rango». */
  readonly solicitadas: readonly string[];
  /** Las que el `UPDATE` marcó de verdad. */
  readonly reclamadas: readonly string[];
  /** De las solicitadas, las que ya tenían `propina_liquidacion_id`. */
  readonly yaLiquidadas: readonly string[];
}

/**
 * Devuelve el error que hay que lanzar, o `null` si el reclamo está completo.
 *
 * Se devuelve en vez de lanzarse para que sea una función pura y se pueda probar
 * sin base: el orden de estas tres ramas es exactamente lo que decide si el
 * administrador ve «esa propina ya se liquidó» o un 500 sin explicación.
 */
export function explicarReclamo(reclamo: Reclamo): ErrorDominio | null {
  const { solicitadas, reclamadas, yaLiquidadas } = reclamo;

  if (yaLiquidadas.length > 0) {
    return new ErrorDominio(
      'PROPINA_YA_LIQUIDADA',
      yaLiquidadas.length === solicitadas.length
        ? 'Esas propinas ya se liquidaron. Actualiza la pantalla antes de volver a intentarlo.'
        : `${yaLiquidadas.length} de esas ventas ya tenían su propina liquidada. ` +
            'No se liquidó ninguna: actualiza la pantalla y vuelve a intentarlo.',
      { solicitadas: solicitadas.length, yaLiquidadas: yaLiquidadas.length },
    );
  }

  if (reclamadas.length === 0) {
    return new ErrorDominio('LIQUIDACION_INVALIDA', 'No hay propinas pendientes en ese periodo.', {
      solicitadas: solicitadas.length,
    });
  }

  if (solicitadas.length > 0 && reclamadas.length !== solicitadas.length) {
    // Ni liquidadas ni reclamadas: la venta se canceló, cambió de mesero o cayó
    // fuera del periodo mientras el diálogo estaba abierto. Se aborta entero en
    // vez de liquidar «casi todas»: una liquidación parcial que nadie pidió es
    // peor que un reintento.
    return new ErrorDominio(
      'LIQUIDACION_INVALIDA',
      'Algunas ventas del listado ya no cumplen el periodo o el mesero elegido. ' +
        'Actualiza la pantalla y vuelve a intentarlo.',
      { solicitadas: solicitadas.length, reclamadas: reclamadas.length },
    );
  }

  return null;
}
