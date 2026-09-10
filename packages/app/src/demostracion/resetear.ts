import { PAQUETES, ErrorDominio, esPaquete } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { validarEntorno } from '@morphiqpos/contracts';

import { definirComando } from '../comando.ts';
import { recalcularCostosRecetas } from '../inventario/recetas.ts';
import { semillaParaPaquete } from './datos.ts';
import { limpiarSala, sembrarSala, type ResumenSala } from './sala.ts';

export const entradaResetearDemo = z.object({ confirmacion: z.literal('RESETEAR') });

export const resetearDemo = definirComando<
  Transaccion,
  typeof entradaResetearDemo,
  { readonly productos: number; readonly insumos: number; readonly sala: ResumenSala | null }
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

    // La SALA sólo tiene sentido en un restaurante: mesas, zonas, estaciones y
    // los tres roles que operan de verdad. Sin ella, Mesero y Cocina abren
    // vacías y el mapa de mesas —la pantalla que Miguel más quiere ver— no
    // tiene nada que pintar.
    const sala =
      organizacion.paquete === 'restaurante'
        ? await ctx.paso('sembrar_sala', () =>
            sembrarSala(
              ctx.tx,
              ctx.ambito.organizacionId,
              sucursalId,
              validarEntorno(process.env).PIN_PEPPER,
            ),
          )
        : null;

    ctx.auditar({
      entidadId: ctx.ambito.organizacionId,
      payload: { productos, insumos, paquete: organizacion.paquete, ...(sala ?? {}) },
    });
    return { productos, insumos, sala };
  },
});

/**
 * Borra los datos de demostración de una organización.
 *
 * ── Por qué se borra también la OPERACIÓN, y no sólo el catálogo ──────────
 * La primera versión borraba catálogo e inventario y dejaba las ventas. El
 * resultado, comprobado ejecutándolo: la clave foránea de `orden_lineas` es
 * `on delete set null`, así que **las nueve líneas de órdenes ya cobradas se
 * quedaron con `producto_id` en nulo**, en silencio. El ticket seguía
 * reimprimiéndose porque la línea guarda su propia foto del producto, pero el
 * rastro hacia el catálogo se perdía sin que nadie lo pidiera.
 *
 * Y además el folio seguía subiendo sobre unas ventas que ya no existían.
 *
 * Un reseteo de demostración devuelve el negocio a su punto de partida: eso
 * incluye las ventas. Es destructivo a conciencia — por eso pide la palabra
 * `RESETEAR` y sólo lo puede hacer un dueño o un administrador.
 *
 * El orden importa: hijos antes que padres, o la clave foránea lo impide.
 */
async function limpiar(tx: Transaccion, organizacionId: string): Promise<void> {
  // ── Sala del restaurante ──────────────────────────────────────────────────
  // Va PRIMERO, y no es un detalle de orden: `mesas.orden_activa_id` apunta a
  // `ordenes` y `ordenes.mesa_id` apunta a `mesas`. Sin soltar el lado de la
  // mesa antes, borrar órdenes aborta la transacción entera por la foránea.
  await limpiarSala(tx, organizacionId);

  // ── Operación: ventas, cobros y caja ──────────────────────────────────────
  await sql`delete from pagos where organizacion_id = ${organizacionId}`.execute(tx);
  // Esta tabla NO lleva `organizacion_id`: cuelga de la línea, que sí lo lleva.
  // Se filtra por la línea, no por la organización, y por eso va antes que ella.
  await sql`delete from orden_linea_modificadores where orden_linea_id in (
    select id from orden_lineas where organizacion_id = ${organizacionId}
  )`.execute(tx);
  await sql`delete from orden_lineas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from ordenes where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from movimientos_caja where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from sesiones_caja where organizacion_id = ${organizacionId}`.execute(tx);
  // El consecutivo vuelve a empezar. Si no, la demostración arrancaría en el
  // folio 47 y la primera venta que se le enseña a un cliente no sería la 1.
  await sql`delete from folios where organizacion_id = ${organizacionId}`.execute(tx);

  // ── Catálogo e inventario ─────────────────────────────────────────────────
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
