import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { areaPorOmision } from '@morphiqpos/domain/catalogo';

/**
 * EL ÁREA DE UN PLATILLO QUE SE CREA SIN ELLA (DP-9.1).
 *
 * Por el puente, un platillo creado sin `area_preparacion` caía en el valor por omisión de la
 * columna, `ninguno`: no generaba comanda y nadie lo había decidido. Ahora, al crear un
 * `ProductoTerminado` sin área, se aprende de su categoría o de su estación
 * (`areaPorOmision`); si no hay de dónde, se niega y pide decidirlo. Si el área viene, se
 * respeta (también `ninguno`: eso sí es una decisión). Editar no pasa por aquí.
 */
export async function completarAreaAlCrear(
  tx: Transaccion,
  peticion: {
    readonly organizacionId: string;
    readonly entidad: string;
    readonly operacion: string;
    readonly datos: Readonly<Record<string, unknown>>;
  },
): Promise<Readonly<Record<string, unknown>>> {
  const { organizacionId, datos } = peticion;
  if (peticion.entidad !== 'ProductoTerminado' || peticion.operacion !== 'create') return datos;
  const enviada = datos['area_preparacion'];
  if (typeof enviada === 'string' && enviada !== '') return datos;

  const categoriaId = typeof datos['categoria_id'] === 'string' ? datos['categoria_id'] : null;
  const area = categoriaId === null ? null : await aprenderArea(tx, organizacionId, categoriaId);
  if (area === null) {
    throw new ErrorDominio(
      'AREA_DE_PREPARACION_REQUERIDA',
      'Elige el área de preparación de este platillo (Cocina, Bebidas o las dos): su categoría ' +
        'y su estación todavía no tienen platillos de los que aprenderla.',
    );
  }
  return { ...datos, area_preparacion: area };
}

async function aprenderArea(tx: Transaccion, organizacionId: string, categoriaId: string) {
  const categoria = await tx
    .selectFrom('categorias')
    .select('estacion_preparacion_id')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', categoriaId)
    .executeTakeFirst();
  if (categoria === undefined) return null;

  const estacionId = categoria.estacion_preparacion_id;
  const hermanas =
    estacionId === null
      ? [categoriaId]
      : (
          await tx
            .selectFrom('categorias')
            .select('id')
            .where('organizacion_id', '=', organizacionId)
            .where('estacion_preparacion_id', '=', estacionId)
            .execute()
        ).map((c) => c.id);
  const deLaEstacion = new Set([categoriaId, ...hermanas]);

  const productos = await tx
    .selectFrom('productos')
    .select(['categoria_id', 'area_preparacion', 'activo'])
    .where('organizacion_id', '=', organizacionId)
    .where('categoria_id', 'in', [...deLaEstacion])
    .execute();
  return areaPorOmision(
    categoriaId,
    productos.map((p) => ({
      categoriaId: p.categoria_id,
      area: p.area_preparacion,
      activo: p.activo,
    })),
    estacionId === null ? new Set() : deLaEstacion,
  );
}
