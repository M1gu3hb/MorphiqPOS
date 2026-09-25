import type { Transaccion } from '@morphiqpos/data';
import type { EfectoDeOpcion } from '@morphiqpos/domain/inventario';

/**
 * F-027 · Lo que las opciones ELEGIDAS le hacen a la receta de cada línea: con qué
 * insumo sustituyen y cuánto la escalan (C.10 de la 2.4).
 *
 * Se lee de `orden_linea_modificadores` —la forma consultable de lo que se eligió,
 * que `cafeteria.agregar_bebida` escribe— y NO de `orden_lineas.opciones`, que es la
 * del ticket y guarda nombres, no ids. El sustituto y el factor se leen del catálogo
 * VIVO al cobrar: son de la receta, no del precio, y el precio ya quedó congelado.
 *
 * ── Por qué cuatro lecturas y no un `join` ───────────────────────────────
 * Las mismas razones que `leerOpciones` de la bebida: `modificador_opciones` no lleva
 * `organizacion_id` —cuelga de su grupo—, así que la guarda por organización va sobre
 * el GRUPO y sobre el INSUMO sustituto, explícita. Una opción de otro negocio no
 * sustituye nada aquí aunque su id llegara colado en una línea.
 *
 * Todo esto corre dentro de la transacción del cobro: sin opciones elegidas es UNA
 * lectura vacía y se sale, que es el caso de la tienda, la ferretería y el salón.
 */
export async function efectosDeOpcionesPorLinea(
  tx: Transaccion,
  organizacionId: string,
  lineaIds: readonly string[],
): Promise<ReadonlyMap<string, readonly EfectoDeOpcion[]>> {
  const salida = new Map<string, EfectoDeOpcion[]>();
  if (lineaIds.length === 0) return salida;

  const elegidas = (
    await tx
      .selectFrom('orden_linea_modificadores')
      .select(['orden_linea_id', 'opcion_id'])
      .where('orden_linea_id', 'in', [...lineaIds])
      .execute()
  ).filter(
    (fila): fila is { orden_linea_id: string; opcion_id: string } => fila.opcion_id !== null,
  );
  if (elegidas.length === 0) return salida;

  const opciones = await tx
    .selectFrom('modificador_opciones')
    .select(['id', 'modificador_id', 'insumo_sustituto_id', 'factor_cantidad'])
    .where('id', 'in', [...new Set(elegidas.map((e) => e.opcion_id))])
    .execute();
  if (opciones.length === 0) return salida;

  const grupos = new Set(
    (
      await tx
        .selectFrom('modificadores')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('id', 'in', [...new Set(opciones.map((o) => o.modificador_id))])
        .execute()
    ).map((g) => g.id),
  );

  const sustitutoIds = [
    ...new Set(
      opciones.map((o) => o.insumo_sustituto_id).filter((id): id is string => id !== null),
    ),
  ];
  const unidades = new Map(
    sustitutoIds.length === 0
      ? []
      : (
          await tx
            .selectFrom('insumos')
            .select(['id', 'unidad_base'])
            .where('organizacion_id', '=', organizacionId)
            .where('activo', '=', true)
            .where('id', 'in', sustitutoIds)
            .execute()
        ).map((i) => [i.id, i.unidad_base] as const),
  );

  const porOpcion = new Map(opciones.map((o) => [o.id, o]));
  for (const elegida of elegidas) {
    const opcion = porOpcion.get(elegida.opcion_id);
    // Sin grupo de este negocio, la opción no existe para este negocio.
    if (opcion === undefined || !grupos.has(opcion.modificador_id)) continue;
    const unidad =
      opcion.insumo_sustituto_id === null ? undefined : unidades.get(opcion.insumo_sustituto_id);
    const efecto: EfectoDeOpcion = {
      grupoId: opcion.modificador_id,
      // Un sustituto archivado o ajeno NO sustituye: se descuenta lo de la receta.
      insumoSustitutoId: unidad === undefined ? null : opcion.insumo_sustituto_id,
      unidadBaseSustituto: unidad ?? null,
      factor: opcion.factor_cantidad,
    };
    salida.set(elegida.orden_linea_id, [...(salida.get(elegida.orden_linea_id) ?? []), efecto]);
  }
  return salida;
}
