import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-061 · La foto de mostrador, y por qué NO es la foto del catálogo.
 *
 * ── Dos fotos con dos trabajos distintos ─────────────────────────────────
 * La del catálogo es de estudio y sirve para que el cliente reconozca lo que
 * compra. La de mostrador la toma el mostradorista con el teléfono, mal
 * iluminada, y sirve para UNA cosa: que quien nunca ha visto esa pieza la
 * encuentre en la gaveta. Es un apunte visual, no material de venta, y
 * mezclarlas hace que el catálogo de una ferretería se llene de fotos borrosas
 * de tornillos sobre un mostrador sucio.
 *
 * ── Y por eso su valor está en la UBICACIÓN, no en la pieza ──────────────
 * «Es ésta, y está en la gaveta de arriba a la derecha del pasillo 3.» Un
 * mostradorista nuevo tarda seis meses en aprender dónde está cada cosa; con la
 * foto del anaquel tarda dos semanas. Ése es todo el caso de uso, y por eso la
 * foto se ata al producto Y a su ubicación: sin la segunda es una foto más.
 *
 * ── Lo que este comando NO hace: subir el archivo ────────────────────────
 * La subida ya existe y está probada (`archivos/subir`). Aquí sólo se ata la
 * URL resultante al producto. Reimplementar la subida daría un segundo camino
 * con su propia cuota, su propia validación de tipo y su propio agujero.
 */

const CATALOGO = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaFotoDeMostrador = z.object({
  productoId: z.uuid(),
  /** La URL que devolvió la subida. Este comando no toca bytes. */
  url: z.url().max(500),
  /** Dónde está la pieza. Es la mitad del valor de la foto. */
  ubicacionId: z.uuid().nullable().default(null),
  nota: z.string().trim().max(200).nullable().default(null),
});

export interface ResultadoFoto {
  readonly productoId: string;
  readonly url: string;
  readonly conUbicacion: boolean;
}

export const guardarFotoDeMostrador = definirComando<
  Transaccion,
  typeof entradaFotoDeMostrador,
  ResultadoFoto
>({
  nombre: 'catalogo.foto_mostrador',
  entidad: 'producto',
  escribe: true,
  roles: [...CATALOGO],
  paquetes: PAQUETES_TODOS,
  entrada: entradaFotoDeMostrador,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'ubicacion_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }

    // Si viene ubicación, tiene que ser de este negocio: una foto atada a la
    // gaveta de otra sucursal manda al mostradorista a un pasillo que no existe.
    if (entrada.ubicacionId !== null) {
      const ubicacion = await ctx.paso('leer_ubicacion', () =>
        ctx.tx
          .selectFrom('ubicaciones')
          .select(['id'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.ubicacionId)
          .executeTakeFirst(),
      );
      if (ubicacion === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa ubicación no existe en este negocio.');
      }
    }

    const cambios: Record<string, unknown> = {
      foto_mostrador_url: entrada.url,
      updated_at: ctx.ahora,
    };
    // La ubicación sólo se toca cuando VIENE. Mandarla en `null` desde una
    // pantalla que sólo quería cambiar la foto borraría dónde está la pieza,
    // que es el dato caro de los dos.
    if (entrada.ubicacionId !== null) cambios['ubicacion_id'] = entrada.ubicacionId;

    await ctx.paso('guardar_foto', () =>
      ctx.tx
        .updateTable('productos')
        .set(cambios)
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .execute(),
    );

    const conUbicacion = (entrada.ubicacionId ?? producto.ubicacion_id) !== null;
    ctx.auditar({ entidadId: entrada.productoId, payload: { conUbicacion } });
    return { productoId: entrada.productoId, url: entrada.url, conUbicacion };
  },
});
