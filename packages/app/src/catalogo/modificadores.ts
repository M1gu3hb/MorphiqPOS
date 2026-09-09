import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { desdeTexto } from '@morphiqpos/domain/dinero';

import { definirComando } from '../comando.ts';
import { entradaCrearModificador } from './esquemas.ts';

export const crearModificadorProducto = definirComando<
  Transaccion,
  typeof entradaCrearModificador,
  { readonly id: string }
>({
  nombre: 'catalogo.crear_modificador',
  entidad: 'modificador',
  escribe: true,
  roles: ['dueno', 'administrador', 'gerente'],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaCrearModificador,
  async ejecutar(ctx, entrada) {
    const producto = await ctx.paso('verificar_producto', () =>
      ctx.tx
        .updateTable('productos')
        .set({ updated_at: ctx.ahora })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('CATALOGO_INVALIDO', 'El producto no existe.');
    }

    const modificador = await ctx.paso('crear_modificador', () =>
      ctx.tx
        .insertInto('modificadores')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          nombre: entrada.nombre,
          obligatorio: entrada.obligatorio,
          tipo: entrada.tipo,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('crear_opciones', () =>
      ctx.tx
        .insertInto('modificador_opciones')
        .values(
          entrada.opciones.map((opcion, orden) => ({
            modificador_id: modificador.id,
            nombre: opcion.nombre,
            precio_extra_centavos: desdeTexto(opcion.precioExtra),
            orden,
          })),
        )
        .execute(),
    );
    await ctx.paso('vincular_producto', () =>
      ctx.tx
        .insertInto('producto_modificadores')
        .values({
          producto_id: producto.id,
          modificador_id: modificador.id,
          organizacion_id: ctx.ambito.organizacionId,
        })
        .execute(),
    );

    ctx.auditar({
      entidadId: modificador.id,
      payload: { productoId: producto.id, opciones: entrada.opciones.length },
    });
    return { id: modificador.id };
  },
});
