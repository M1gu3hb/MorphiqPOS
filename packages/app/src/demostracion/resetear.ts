import { PAQUETES, ErrorDominio, esPaquete } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../comando';
import { recalcularCostosRecetas } from '../inventario/recetas';
import { semillaParaPaquete } from './datos';

export const entradaResetearDemo = z.object({ confirmacion: z.literal('RESETEAR') });

export const resetearDemo = definirComando<
  Transaccion,
  typeof entradaResetearDemo,
  { readonly productos: number; readonly insumos: number }
>({
  nombre: 'configuracion.resetear_demo',
  entidad: 'organizacion',
  escribe: true,
  roles: ['dueno', 'administrador'],
  paquetes: PAQUETES,
  entrada: entradaResetearDemo,
  async ejecutar(ctx) {
    const organizacion = await ctx.tx
      .selectFrom('organizaciones')
      .select('paquete')
      .where('id', '=', ctx.ambito.organizacionId)
      .executeTakeFirst();
    if (organizacion === undefined || !esPaquete(organizacion.paquete)) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La organización no tiene un paquete válido.',
      );
    }
    const sucursalId = ctx.ambito.sucursalId;
    if (sucursalId === null)
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Selecciona una sucursal para cargar la demostración.',
      );
    const semilla = semillaParaPaquete(organizacion.paquete);
    await ctx.paso('limpiar_demo', () => limpiar(ctx.tx, ctx.ambito.organizacionId));
    const almacen = await ctx.tx
      .insertInto('almacenes')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        sucursal_id: sucursalId,
        nombre: 'Almacén principal',
        principal: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const categorias = new Map<string, string>();
    for (const [orden, nombre] of semilla.categorias.entries()) {
      const fila = await ctx.tx
        .insertInto('categorias')
        .values({ organizacion_id: ctx.ambito.organizacionId, tipo: 'producto', nombre, orden })
        .returning('id')
        .executeTakeFirstOrThrow();
      categorias.set(nombre, fila.id);
    }
    let productos = 0;
    let insumos = 0;
    for (const dato of semilla.productos) {
      const producto = await ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          categoria_id: categorias.get(dato.categoria) ?? null,
          nombre: dato.nombre,
          sku: dato.sku,
          codigo_barras: dato.codigoBarras ?? null,
          precio_venta_centavos: dato.precioCentavos,
          costo_unitario_centavos: dato.costoCentavos,
          estrategia_consumo: 'sku',
          stock_minimo: '2',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const insumo = await ctx.tx
        .insertInto('insumos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          producto_id: producto.id,
          nombre: dato.nombre,
          unidad_base: 'pieza',
          costo_unitario_centavos: dato.costoCentavos,
          stock_minimo: '2',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await entradaInicial(
        ctx.tx,
        ctx.ambito.organizacionId,
        almacen.id,
        insumo.id,
        dato.stock,
        'pieza',
        dato.costoCentavos,
      );
      productos += 1;
      insumos += 1;
    }
    const insumosCafe = new Map<string, { id: string; unidad: string }>();
    for (const dato of semilla.insumos) {
      const insumo = await ctx.tx
        .insertInto('insumos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          nombre: dato.nombre,
          unidad_base: dato.unidad,
          costo_unitario_centavos: dato.costoCentavos,
          stock_minimo: '5',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await entradaInicial(
        ctx.tx,
        ctx.ambito.organizacionId,
        almacen.id,
        insumo.id,
        dato.stock,
        dato.unidad,
        dato.costoCentavos,
      );
      insumosCafe.set(dato.clave, { id: insumo.id, unidad: dato.unidad });
      insumos += 1;
    }
    for (const dato of semilla.recetas) {
      const producto = await ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          categoria_id: categorias.get(dato.categoria) ?? null,
          nombre: dato.nombre,
          precio_venta_centavos: dato.precioCentavos,
          estrategia_consumo: 'receta',
          permite_venta_sin_stock: false,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      for (const ingrediente of dato.ingredientes) {
        const insumo = insumosCafe.get(ingrediente.clave);
        if (insumo === undefined)
          throw new ErrorDominio('INVENTARIO_INVALIDO', 'La semilla tiene un insumo desconocido.');
        await sql`insert into recetas (organizacion_id, producto_id, insumo_id, cantidad, unidad, merma_bp)
          values (${ctx.ambito.organizacionId}, ${producto.id}, ${insumo.id}, ${ingrediente.cantidad}, ${insumo.unidad}, 0)`.execute(
          ctx.tx,
        );
      }
      productos += 1;
    }
    await recalcularCostosRecetas(ctx.tx, ctx.ambito.organizacionId);
    ctx.auditar({
      entidadId: ctx.ambito.organizacionId,
      payload: { productos, insumos, paquete: organizacion.paquete },
    });
    return { productos, insumos };
  },
});

async function limpiar(tx: Transaccion, organizacionId: string): Promise<void> {
  await sql`delete from movimientos_stock where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from existencias where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from recetas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from producto_modificadores where organizacion_id = ${organizacionId}`.execute(
    tx,
  );
  await sql`delete from modificador_opciones where modificador_id in (select id from modificadores where organizacion_id = ${organizacionId})`.execute(
    tx,
  );
  await sql`delete from modificadores where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from insumos where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from productos where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from categorias where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from almacenes where organizacion_id = ${organizacionId}`.execute(tx);
}

async function entradaInicial(
  tx: Transaccion,
  org: string,
  almacen: string,
  insumo: string,
  cantidad: string,
  unidad: string,
  costo: bigint,
): Promise<void> {
  await tx
    .insertInto('existencias')
    .values({ organizacion_id: org, almacen_id: almacen, insumo_id: insumo, cantidad })
    .execute();
  await tx
    .insertInto('movimientos_stock')
    .values({
      organizacion_id: org,
      almacen_id: almacen,
      insumo_id: insumo,
      tipo: 'inventario_inicial',
      cantidad,
      unidad,
      costo_unitario_centavos: costo,
      referencia_tipo: 'manual',
    })
    .execute();
}
