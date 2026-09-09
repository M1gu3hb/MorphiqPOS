import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

const ROLES = ['dueno', 'administrador', 'gerente', 'almacen'] as const;
const unidad = z.enum(['pieza', 'kg', 'g', 'l', 'ml', 'm']);
const ingrediente = z.object({
  insumoId: z.uuid(),
  cantidad: z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/),
  unidad,
  mermaBp: z.number().int().min(0).max(10_000),
});

export const entradaGuardarReceta = z.object({
  productoId: z.uuid(),
  ingredientes: z.array(ingrediente).min(1).max(50),
});
export const entradaActualizarCostoInsumo = z.object({
  insumoId: z.uuid(),
  costoUnitario: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
});

export const guardarReceta = definirComando<
  Transaccion,
  typeof entradaGuardarReceta,
  { readonly productoId: string }
>({
  nombre: 'inventario.guardar_receta',
  entidad: 'receta',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaGuardarReceta,
  async ejecutar(ctx, entrada) {
    const producto = await ctx.tx
      .selectFrom('productos')
      .select('id')
      .where('id', '=', entrada.productoId)
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('activo', '=', true)
      .executeTakeFirst();
    if (producto === undefined)
      throw new ErrorDominio('CATALOGO_INVALIDO', 'El producto no existe.');
    const filas: { insumoId: string; cantidad: string; unidad: string; mermaBp: number }[] = [];
    for (const item of entrada.ingredientes) {
      const insumo = await ctx.tx
        .selectFrom('insumos')
        .select(['id', 'unidad_base'])
        .where('id', '=', item.insumoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('activo', '=', true)
        .executeTakeFirst();
      if (insumo?.unidad_base !== item.unidad) {
        throw new ErrorDominio(
          'UNIDAD_INCOMPATIBLE',
          'La unidad de la receta debe coincidir con la del insumo.',
        );
      }
      filas.push({
        insumoId: item.insumoId,
        cantidad: cantidadATexto(cantidad(item.cantidad)),
        unidad: item.unidad,
        mermaBp: item.mermaBp,
      });
    }
    await ctx.paso('reemplazar_receta', async () => {
      await sql`delete from recetas where organizacion_id = ${ctx.ambito.organizacionId} and producto_id = ${entrada.productoId}`.execute(
        ctx.tx,
      );
      const valores = filas.map(
        (item) =>
          sql`(${ctx.ambito.organizacionId}, ${entrada.productoId}, ${item.insumoId}, ${item.cantidad}, ${item.unidad}, ${item.mermaBp})`,
      );
      await sql`insert into recetas (organizacion_id, producto_id, insumo_id, cantidad, unidad, merma_bp) values ${sql.join(valores)}`.execute(
        ctx.tx,
      );
    });
    await ctx.tx
      .updateTable('productos')
      .set({ estrategia_consumo: 'receta', updated_at: ctx.ahora })
      .where('id', '=', entrada.productoId)
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .execute();
    await recalcularCostosRecetas(ctx.tx, ctx.ambito.organizacionId, entrada.productoId);
    ctx.auditar({ entidadId: entrada.productoId, payload: { ingredientes: filas.length } });
    return { productoId: entrada.productoId };
  },
});

export const actualizarCostoInsumo = definirComando<
  Transaccion,
  typeof entradaActualizarCostoInsumo,
  { readonly productosRecalculados: number }
>({
  nombre: 'inventario.actualizar_costo',
  entidad: 'insumo',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaActualizarCostoInsumo,
  async ejecutar(ctx, entrada) {
    const insumo = await ctx.paso('actualizar_costo_insumo', () =>
      ctx.tx
        .updateTable('insumos')
        .set({ costo_unitario_centavos: desdeTexto(entrada.costoUnitario), updated_at: ctx.ahora })
        .where('id', '=', entrada.insumoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (insumo === undefined) throw new ErrorDominio('INVENTARIO_INVALIDO', 'El insumo no existe.');
    const resultado = await recalcularCostosRecetas(ctx.tx, ctx.ambito.organizacionId);
    ctx.auditar({ entidadId: insumo.id, payload: { productosRecalculados: resultado } });
    return { productosRecalculados: resultado };
  },
});

export async function recalcularCostosRecetas(
  tx: Transaccion,
  organizacionId: string,
  productoId?: string,
): Promise<number> {
  const resultado = await sql<{ id: string }>`
    update productos p set costo_unitario_centavos = costos.costo, updated_at = now()
    from (
      select r.producto_id, coalesce(sum(round(i.costo_unitario_centavos::numeric * r.cantidad * (10000 + r.merma_bp) / 10000)), 0)::bigint costo
      from recetas r join insumos i on i.id = r.insumo_id and i.organizacion_id = r.organizacion_id
      where r.organizacion_id = ${organizacionId} ${productoId === undefined ? sql`` : sql`and r.producto_id = ${productoId}`}
      group by r.producto_id
    ) costos
    where p.id = costos.producto_id and p.organizacion_id = ${organizacionId}
    returning p.id
  `.execute(tx);
  return resultado.rows.length;
}
