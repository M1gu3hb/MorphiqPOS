import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';
import { z } from 'zod';

import { archivarProducto } from '../catalogo/productos.ts';
import { definirComando, type ContextoComando } from '../comando.ts';

const ROLES = ['dueno', 'administrador', 'gerente', 'almacen'] as const;

/**
 * Quién puede RETIRAR una receta. Almacén no.
 *
 * `eliminar_receta` no sólo borra las líneas: archiva el producto, y para eso
 * llama al CUERPO de `catalogo.archivar_producto`. Llamar al cuerpo se salta la
 * comprobación de rol, que vive en el envoltorio (`comando.ts:98`) y no en la
 * definición. Con `ROLES` a secas, un usuario de almacén —que no está en la
 * lista de `catalogo.archivar_producto`— retiraba un platillo del menú pasando
 * por esta puerta.
 *
 * Ajustar existencias y retirar un platillo de la carta no son la misma
 * decisión. Así que esta lista es la del comando que se invoca, y hay una
 * prueba que falla si las dos dejan de coincidir.
 *
 * Se escribe LITERAL, y no como `ROLES.filter(...)`, porque el catálogo de
 * `pnpm docs:comandos` lee el código y una expresión no se resuelve: la tabla
 * publicaba «(ROLES_PARA_RETIRAR)» en la columna de roles. La prueba
 * «NO deja entrar a nadie que no pueda archivar un producto» es la que impide
 * que esta lista y la de `catalogo.archivar_producto` se separen.
 */
const ROLES_PARA_RETIRAR = ['dueno', 'administrador', 'gerente'] as const;
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

export const entradaEliminarReceta = z.object({ productoId: z.uuid() });

export interface ResultadoEliminarReceta {
  readonly productoId: string;
  readonly lineasEliminadas: number;
}

/**
 * Eliminar una receta: borrar sus líneas y retirar el producto, a la vez.
 *
 * ── Por qué las dos cosas van juntas ───────────────────────────────────────
 * `Recetas.jsx:137` hace hoy varias llamadas sueltas desde el navegador: borra
 * cada línea con `RecetaEscandallo.delete(...)` dentro de un `Promise.all` y
 * con un `.catch(() => {})` POR LÍNEA, y después archiva el producto. Si una
 * línea falla, el `catch` se la traga, el archivado sigue adelante y el
 * producto queda archivado con media receta viva. Eso importa porque el costo
 * del producto se calcula SUMANDO las líneas (`recalcularCostosRecetas`): con
 * la mitad borrada, `costo_unitario_centavos` —y con él `utilidad_unitaria` y
 * `margen_bp`, que son columnas generadas— pasan a ser cifras que no
 * corresponden a ninguna receta que exista.
 *
 * Aquí es UNA transacción: o se borra la receta entera y el producto queda
 * retirado, o no pasa nada.
 *
 * ── Por qué se archiva y no se borra ───────────────────────────────────────
 * Lo dice el comentario del propio código de Miguel («no borrar — preservar
 * ventas históricas») y lo respalda la base: `orden_lineas.producto_id` apunta
 * al producto, y `recetas.insumo_id` es `on delete restrict`. Un `delete from
 * productos` de verdad arrastraría en cascada el insumo espejo y Postgres lo
 * frenaría con un 23503 en la cara del almacenista.
 */
export const eliminarReceta = definirComando<
  Transaccion,
  typeof entradaEliminarReceta,
  ResultadoEliminarReceta
>({
  nombre: 'inventario.eliminar_receta',
  entidad: 'receta',
  escribe: true,
  roles: ROLES_PARA_RETIRAR,
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaEliminarReceta,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // ── Lo que la base impide en un `delete`, y aquí hay que impedir a mano ──
    // Un producto puede tener insumo espejo (`insumos.producto_id`), y ese
    // insumo puede ser ingrediente de OTRA receta: la salsa que se vende sola y
    // además va en los tacos. Ante un `delete`, `recetas_insumo_misma_org ...
    // on delete restrict` lo frena. Pero aquí el insumo no se borra: se
    // ARCHIVA, y un `activo = false` no dispara ninguna llave foránea. La otra
    // receta se quedaría apuntando a un insumo que `guardar_receta` ya no
    // acepta —exige `activo = true`— y que el selector de ingredientes ya no
    // lista: quedaría inmodificable sin que nadie dijera por qué.
    const otraReceta = await ctx.paso('mirar_uso_como_insumo', () =>
      ctx.tx
        .selectFrom('recetas')
        .innerJoin('insumos', (enlace) =>
          enlace
            .onRef('insumos.id', '=', 'recetas.insumo_id')
            .onRef('insumos.organizacion_id', '=', 'recetas.organizacion_id'),
        )
        .innerJoin('productos', 'productos.id', 'recetas.producto_id')
        .select(['recetas.producto_id as productoId', 'productos.nombre as nombre'])
        .where('recetas.organizacion_id', '=', organizacionId)
        .where('insumos.producto_id', '=', entrada.productoId)
        .where('recetas.producto_id', '!=', entrada.productoId)
        .limit(1)
        .executeTakeFirst(),
    );

    if (otraReceta !== undefined) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        `No se puede eliminar: la receta de «${otraReceta.nombre}» usa este producto como ` +
          'ingrediente. Quítalo de esa receta y vuelve a intentarlo.',
        { productoQueLoUsa: otraReceta.productoId },
      );
    }

    // `returning` en vez de contar antes y borrar después: una sola ida a la
    // base da el efecto y la prueba de que hubo efecto.
    const lineas = await ctx.paso('borrar_receta', () =>
      ctx.tx
        .deleteFrom('recetas')
        .where('organizacion_id', '=', organizacionId)
        .where('producto_id', '=', entrada.productoId)
        .returning('id')
        .execute(),
    );

    // Cero líneas es la única puerta que tiene este comando, y hace dos cosas.
    //
    // La primera, decir la verdad: el producto no existe, es de otra
    // organización —la llave `recetas_producto_misma_org` garantiza que si hay
    // líneas de esta organización el producto es de esta organización— o
    // alguien ya borró la receta mientras esta pantalla estaba abierta.
    //
    // La segunda, acotar el permiso: `catalogo.archivar_producto` NO admite a
    // `almacen` y este comando sí, así que sin esta guarda un almacenista
    // podría archivar cualquier producto del catálogo pasando su id por aquí.
    // Con ella sólo alcanza a los productos que tienen receta, que son
    // exactamente los que ya puede editar con `inventario.guardar_receta`.
    if (lineas.length === 0) {
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        'Ese producto no tiene receta que eliminar. Puede que alguien más ya la haya borrado; ' +
          'recarga la pantalla.',
        { productoId: entrada.productoId },
      );
    }

    // ── Reutilizar `catalogo.archivar_producto` en vez de copiarlo ──────────
    // Ya hace la mitad del trabajo —`activo = false`, `visible_en_pos = false`
    // y el archivado del insumo espejo— y esa última parte es fácil de olvidar
    // al copiar. Se LLAMA, no se toca.
    //
    // El rastro del comando anidado se recoge aparte a propósito. El envoltorio
    // escribe UNA sola fila de auditoría y toma `rastro[0]`, así que si el
    // anidado escribiera en el `ctx` de fuera, la fila de este comando diría
    // «archivado» y perdería de vista cuántas líneas de receta se borraron —y
    // dependería del orden en que se llamó a `auditar`, que es la clase de
    // detalle que se rompe en silencio. Se pliega abajo, en el payload.
    const rastroDelArchivado: { entidadId: string | null; payload: Record<string, unknown> }[] = [];
    const ctxDelArchivado: ContextoComando<Transaccion> = {
      ...ctx,
      auditar: (datos) => {
        rastroDelArchivado.push(datos);
      },
    };

    await archivarProducto.ejecutar(ctxDelArchivado, { productoId: entrada.productoId });

    // La otra mitad. `catalogo.archivar_producto` no conoce
    // `visible_en_menu_digital`: esa columna la agregó `045_restaurante.sql`,
    // del carril de restaurante, y el comando de catálogo es anterior. Se
    // completa aquí, en la MISMA transacción, en vez de duplicar su cuerpo para
    // añadirle una columna.
    await ctx.paso('ocultar_del_menu_digital', () =>
      ctx.tx
        .updateTable('productos')
        .set({ visible_en_menu_digital: false, updated_at: ctx.ahora })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', organizacionId)
        .execute(),
    );

    // `costo_unitario_centavos` NO se recalcula ni se pone en cero, a
    // propósito. `recalcularCostosRecetas` agrupa sobre `recetas`: sin líneas
    // el producto no aparece en el `from` y su costo se queda como estaba, que
    // es el último costo real que tuvo la receta el día que se retiró. Ponerlo
    // en cero haría que `margen_bp` —columna generada— dijera 100 % de margen
    // sobre un producto archivado, que es peor que un dato viejo: es falso.

    const payloadDelArchivado = rastroDelArchivado.reduce<Record<string, unknown>>(
      (acumulado, rastro) => ({ ...acumulado, ...rastro.payload }),
      {},
    );

    ctx.auditar({
      entidadId: entrada.productoId,
      payload: {
        ...payloadDelArchivado,
        lineasEliminadas: lineas.length,
        visibleEnMenuDigital: false,
      },
    });

    return { productoId: entrada.productoId, lineasEliminadas: lineas.length };
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
