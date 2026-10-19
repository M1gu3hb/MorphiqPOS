import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * Los motivos de merma que ESTE negocio puede elegir (C.10 de la 2.4).
 *
 * `motivos_merma` es un catálogo del sistema, sin organización: los del tronco (`giro`
 * nulo) y los de cada giro. Una tienda no debe ver «calibración del molino» ni «retazo de
 * corte». El conteo los necesita para que cada diferencia lleve SU motivo —«caducado» no es
 * «roto» ni «faltante»— en vez de cerrarse todas con el de omisión, y el kardex para decir
 * en palabras lo que la base guarda como clave.
 */

export const entradaMotivosDeMerma = z.object({});

export interface MotivoDeMerma {
  readonly clave: string;
  readonly etiqueta: string;
  /** Si apunta a un responsable: decide si el número sirve para detectar robo. */
  readonly imputable: boolean;
}

export interface ResultadoMotivosDeMerma {
  readonly motivos: readonly MotivoDeMerma[];
}

export const motivosDeMerma = definirComando<
  Transaccion,
  typeof entradaMotivosDeMerma,
  ResultadoMotivosDeMerma
>({
  nombre: 'inventario.motivos_de_merma',
  entidad: 'movimiento_stock',
  escribe: false,
  roles: ['cajero', 'gerente', 'administrador', 'dueno', 'almacen'],
  paquetes: PAQUETES_TODOS,
  entrada: entradaMotivosDeMerma,
  async ejecutar(ctx) {
    const organizacion = await ctx.paso('leer_giro', () =>
      ctx.tx
        .selectFrom('organizaciones')
        .select(['giro'])
        .where('id', '=', ctx.ambito.organizacionId)
        .executeTakeFirst(),
    );
    const giro = organizacion?.giro ?? null;
    const filas = await ctx.paso('leer_motivos', () =>
      ctx.tx
        .selectFrom('motivos_merma')
        .select(['clave', 'etiqueta', 'imputable'])
        .where('activo', '=', true)
        .where((eb) =>
          giro === null
            ? eb('giro', 'is', null)
            : eb.or([eb('giro', 'is', null), eb('giro', '=', giro)]),
        )
        .orderBy('etiqueta')
        .execute(),
    );
    return { motivos: filas };
  },
});
