import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `catalogo.aplicar_precio_sugerido` — el precio que sube CUANDO SUBE EL COSTO.
 *
 * ── Por qué existe, y qué pasaba sin él ──────────────────────────────────
 * `ferreteria/Entradas.tsx` enseña, al recibir una nota, qué materiales subieron
 * de costo, con el precio de hoy al lado y el sugerido para conservar el margen.
 * El botón «Aplicar» publicaba en `/api/precios/aplicar-sugerido`, **una ruta que
 * no existe**, así que el aviso se veía y no se podía obedecer: en cable y cobre,
 * eso es el mostrador vendiendo a pérdida toda la semana sin enterarse.
 *
 * ── Por qué no es `catalogo.cambiar_precio` ──────────────────────────────
 * Porque ese comando reescribe el BLOQUE de precios entero —venta, costo,
 * mayoreo con su mínimo, variable, porción— y exige todos esos campos juntos. La
 * pantalla de entradas tiene UNO: el de venta sugerido. Llamarlo desde aquí
 * obligaría a la pantalla a mandar los demás, y lo que no tiene lo mandaría en
 * nulo: el precio de mayoreo del cobre desaparecería al aceptar una sugerencia.
 *
 * Éste toca UNA columna y deja el resto como estaba. Es la diferencia entre
 * «acepta el precio nuevo» y «vuelve a capturar el producto».
 *
 * ── Y el costo NO se toca aquí ───────────────────────────────────────────
 * El costo lo escribe la recepción de la nota, que es donde se supo. Escribirlo
 * otra vez en este comando sería un segundo sitio donde el costo cambia, y el día
 * que los dos no coincidan nadie sabría cuál ganó.
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export const entradaPrecioSugerido = z.object({
  /** El material al que se le aplica. La pantalla lo llama `materialId`. */
  materialId: z.uuid(),
  /**
   * El precio de venta nuevo, en centavos enteros.
   *
   * Aquí sí en centavos y no en texto: no lo teclea nadie —lo calculó el
   * servidor al comparar el costo nuevo con el margen de hoy— y la pantalla sólo
   * lo devuelve tal cual. Un importe que nace y muere en centavos no gana nada
   * pasando por una cadena.
   */
  precioCentavos: z.number().int().min(1).max(100_000_000),
});

export interface ResultadoPrecioSugerido {
  readonly productoId: string;
  readonly precioAnteriorCentavos: string;
  readonly precioCentavos: string;
}

export const aplicarPrecioSugerido = definirComando<
  Transaccion,
  typeof entradaPrecioSugerido,
  ResultadoPrecioSugerido
>({
  nombre: 'catalogo.aplicar_precio_sugerido',
  entidad: 'producto',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  entrada: entradaPrecioSugerido,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('cargar_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'precio_venta_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.materialId)
        .executeTakeFirst(),
    );
    // Un material de otra organización responde igual que uno inexistente.
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese material no está en este catálogo.');
    }

    await ctx.paso('fijar_precio', () =>
      ctx.tx
        .updateTable('productos')
        .set({ precio_venta_centavos: BigInt(entrada.precioCentavos), updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.materialId)
        .execute(),
    );

    ctx.auditar({
      entidadId: producto.id,
      payload: {
        nombre: producto.nombre,
        // Los dos, porque «subió el precio» sin el anterior no se puede revisar:
        // el encargado que acepta veinte sugerencias necesita poder explicar una.
        anteriorCentavos: producto.precio_venta_centavos.toString(),
        nuevoCentavos: entrada.precioCentavos,
      },
    });

    return {
      productoId: producto.id,
      precioAnteriorCentavos: producto.precio_venta_centavos.toString(),
      precioCentavos: String(entrada.precioCentavos),
    };
  },
});
