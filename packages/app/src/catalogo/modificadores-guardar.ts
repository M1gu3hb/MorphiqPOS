import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { desdeTexto } from '@morphiqpos/domain/dinero';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

/**
 * `catalogo.guardar_modificadores` — el juego ENTERO, en una transacción.
 *
 * ── El defecto que cierra ──────────────────────────────────────────────────
 * `ModificadoresDialog.jsx:60` guarda todos los grupos de una vez con
 *
 *     await api.entidades.ProductoTerminado.update(producto.id, {
 *       modificadores: limpio,
 *     });
 *
 * y `modificadores` no es un campo del puente: no es una columna de `productos`,
 * son dos tablas y una de unión. El puente lo rechaza, así que **guardar las
 * opciones de preparación de un producto no funcionaba nunca**, y el `catch` de
 * la pantalla lo convertía en «No se pudo guardar. Intenta de nuevo.» — un
 * mensaje que invita a repetir algo que no puede salir bien.
 *
 * `catalogo.crear_modificador` ya existía, pero crea UN grupo. Esta pantalla no
 * añade: REEMPLAZA el juego completo, que es otra operación.
 *
 * ── Por qué reemplaza y no fusiona ─────────────────────────────────────────
 * Porque es lo que hace el diálogo: se editan los grupos en pantalla y se
 * guarda el resultado. Fusionar exigiría que el cliente mandara qué borró, y
 * eso es estado que el navegador no tiene por qué llevar. Borrar e insertar
 * dentro de la MISMA transacción es lo que impide el estado a medias que tenía
 * `RecetaFormDialog` antes de `guardar_receta` (D-11): si falla, no se toca
 * nada.
 *
 * La lista VACÍA se admite y significa «este producto no lleva opciones», que
 * es justo lo que su pantalla llama «Opciones eliminadas».
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

const opcion = z.object({
  nombre: z.string().trim().min(1).max(80),
  /**
   * En TEXTO, como el resto del catálogo: `desdeTexto` lo pasa a centavos.
   *
   * Hoy siempre llega en cero. El editor de Miguel no pide precio —sus
   * modificadores son «sin cebolla», «término medio», que no cambian lo que se
   * cobra— y por eso la columna existe pero nadie la llena. Los modificadores
   * DE PAGO son E9-3 y no están: cuando lleguen, este campo ya tiene su sitio
   * y su conversión exacta, en vez de un `Math.round(x * 100)` improvisado.
   */
  precioExtra: z
    .string()
    .trim()
    .regex(/^\d{1,9}(?:\.\d{1,2})?$/)
    .default('0'),
  activa: z.boolean().default(true),
});

const grupo = z.object({
  nombre: z.string().trim().min(1).max(80),
  obligatorio: z.boolean().default(false),
  tipo: z.enum(['unica', 'multiple']).default('unica'),
  activo: z.boolean().default(true),
  opciones: z.array(opcion).min(1).max(30),
});

export const entradaGuardarModificadores = z.object({
  productoId: z.uuid(),
  grupos: z.array(grupo).max(20),
});

export interface ResultadoGuardarModificadores {
  readonly productoId: string;
  readonly grupos: number;
  readonly opciones: number;
}

export const guardarModificadores = definirComando<
  Transaccion,
  typeof entradaGuardarModificadores,
  ResultadoGuardarModificadores
>({
  nombre: 'catalogo.guardar_modificadores',
  entidad: 'modificador',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaGuardarModificadores,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('verificar_producto', () =>
      ctx.tx
        .updateTable('productos')
        .set({ updated_at: ctx.ahora })
        .where('id', '=', entrada.productoId)
        .where('organizacion_id', '=', organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('CATALOGO_INVALIDO', 'El producto no existe.');
    }

    // Los que había, para poder borrarlos DESPUÉS de soltar la unión: la llave
    // foránea de `producto_modificadores` los sujeta.
    const previos = await ctx.paso('cargar_previos', () =>
      ctx.tx
        .selectFrom('producto_modificadores')
        .select('modificador_id as id')
        .where('organizacion_id', '=', organizacionId)
        .where('producto_id', '=', entrada.productoId)
        .execute(),
    );

    if (previos.length > 0) {
      const ids = previos.map((p) => p.id);
      await ctx.paso('soltar_union', () =>
        ctx.tx
          .deleteFrom('producto_modificadores')
          .where('organizacion_id', '=', organizacionId)
          .where('producto_id', '=', entrada.productoId)
          .execute(),
      );
      // `modificador_opciones` NO tiene `organizacion_id` —cuelga de su
      // modificador— así que se acota por el padre, igual que en las purgas.
      await ctx.paso('borrar_opciones_previas', () =>
        ctx.tx.deleteFrom('modificador_opciones').where('modificador_id', 'in', ids).execute(),
      );
      // Sólo se borran los que NO usa ningún otro producto: un grupo compartido
      // —«Término de la carne» en tres platos— no puede irse porque uno lo
      // quite. La consulta lo pregunta dentro de la misma transacción.
      const compartidos = await ctx.paso('buscar_compartidos', () =>
        ctx.tx
          .selectFrom('producto_modificadores')
          .select('modificador_id as id')
          .where('organizacion_id', '=', organizacionId)
          .where('modificador_id', 'in', ids)
          .execute(),
      );
      const enUso = new Set(compartidos.map((c) => c.id));
      const huerfanos = ids.filter((id) => !enUso.has(id));
      if (huerfanos.length > 0) {
        await ctx.paso('borrar_modificadores_previos', () =>
          ctx.tx
            .deleteFrom('modificadores')
            .where('organizacion_id', '=', organizacionId)
            .where('id', 'in', huerfanos)
            .execute(),
        );
      }
    }

    let opciones = 0;
    for (const [orden, g] of entrada.grupos.entries()) {
      const creado = await ctx.paso('crear_modificador', () =>
        ctx.tx
          .insertInto('modificadores')
          .values({
            organizacion_id: organizacionId,
            nombre: g.nombre,
            obligatorio: g.obligatorio,
            tipo: g.tipo,
            activo: g.activo,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      await ctx.paso('crear_opciones', () =>
        ctx.tx
          .insertInto('modificador_opciones')
          .values(
            g.opciones.map((o, i) => ({
              modificador_id: creado.id,
              nombre: o.nombre,
              // En centavos enteros y con `desdeTexto`: `11.80 * 100` da
              // 1179.9999999999998 y un céntimo por ticket se nota al mes.
              precio_extra_centavos: desdeTexto(o.precioExtra),
              orden: i,
              activa: o.activa,
            })),
          )
          .execute(),
      );
      opciones += g.opciones.length;

      await ctx.paso('vincular_producto', () =>
        ctx.tx
          .insertInto('producto_modificadores')
          .values({
            producto_id: entrada.productoId,
            modificador_id: creado.id,
            organizacion_id: organizacionId,
            orden,
          })
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: entrada.productoId,
      payload: { grupos: entrada.grupos.length, opciones, previos: previos.length },
    });

    return { productoId: entrada.productoId, grupos: entrada.grupos.length, opciones };
  },
});
