import 'server-only';

import { PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * «LOS OCHO DE SIEMPRE» · F1–F8 del cobro de la tienda (C.10 de la 2.4).
 *
 * El 80 % de las líneas de una tiendita son unos treinta productos, y los ocho de arriba
 * merecen una tecla (`04-INTERFAZ` de abarrotes, PANTALLA 1). Ocho que el servidor sabe
 * porque los vendió, no los ocho primeros del catálogo: una fila con la memoria muscular
 * equivocada es peor que no tenerla, así que un negocio que aún no vendió nada recibe
 * menos de ocho —o ninguno— y la pantalla no rellena los huecos.
 *
 * Se cuenta por PIEZAS vendidas en la ventana, sólo en ventas cobradas y sin las líneas
 * anuladas ni los canjes de lealtad: un canje no es una venta que se repita.
 */

const DIA_MS = 86_400_000;

export const entradaMasVendidos = z.object({
  /** La ventana, en días hacia atrás. Treinta cubre un mes sin quedarse con la temporada. */
  dias: z.number().int().min(1).max(90).default(30),
  cuantos: z.number().int().min(1).max(12).default(8),
});

export interface ProductoMasVendido {
  readonly productoId: string;
  /** Piezas vendidas en la ventana, como texto decimal. */
  readonly vendidas: string;
}

export interface ResultadoMasVendidos {
  readonly productos: readonly ProductoMasVendido[];
}

/** Lo que cuenta como vendido: lo mismo que el corte (`ESTADOS_VENDIDOS`). */
const VENDIDAS = ['pagada', 'parcialmente_reembolsada'] as const;

export async function masVendidosDe(
  tx: Transaccion,
  organizacionId: string,
  desde: Date,
  cuantos: number,
): Promise<readonly ProductoMasVendido[]> {
  const { rows } = await sql<ProductoMasVendido>`
    select l.producto_id          as "productoId",
           sum(l.cantidad)::text  as "vendidas"
      from orden_lineas l
      join ordenes o on o.id = l.orden_id and o.organizacion_id = l.organizacion_id
     where l.organizacion_id = ${organizacionId}
       and o.estado in (${sql.join(VENDIDAS)})
       and coalesce(o.cobrada_en, o.cerrada_en, o.updated_at) >= ${desde}
       and l.producto_id is not null
       and l.anulada_en is null
       and l.tipo_linea = 'venta'
     group by l.producto_id
     order by sum(l.cantidad) desc, l.producto_id
     limit ${cuantos}
  `.execute(tx);
  return rows;
}

export const masVendidos = definirComando<
  Transaccion,
  typeof entradaMasVendidos,
  ResultadoMasVendidos
>({
  nombre: 'venta.mas_vendidos',
  entidad: 'orden',
  escribe: false,
  roles: ['cajero', 'gerente', 'administrador', 'dueno'],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaMasVendidos,
  async ejecutar(ctx, entrada) {
    const desde = new Date(ctx.ahora.getTime() - entrada.dias * DIA_MS);
    const productos = await ctx.paso('contar', () =>
      masVendidosDe(ctx.tx, ctx.ambito.organizacionId, desde, entrada.cuantos),
    );
    return { productos };
  },
});
