import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `restaurante.marcar_estacion_general` — nombra general una estación que YA existe (DP-10.1).
 *
 * La general es el respaldo de la regla 10: a ella va la comanda cuyo platillo no tiene
 * estación por su categoría (`resolverEstacion`). Hasta aquí sólo se podía CREAR una general
 * (`restaurante.crear_estacion`), y Don Poncho se dio de alta con «Cocina» y «Bebidas» y
 * ninguna general: un platillo nuevo sin estación habría hecho fallar el envío del mesero.
 *
 * No cambia la general de mano. Si ya hay otra, lo dice y no toca nada: la comanda que no
 * encuentra estación acaba en ella, y moverla sin que nadie lo vea es mandar platillos a otra
 * pantalla. Repetirlo sobre la misma es un «sin cambio» (idempotente).
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export const entradaMarcarEstacionGeneral = z.object({ estacionId: z.uuid() }).strict();

export interface ResultadoMarcarEstacionGeneral {
  readonly estacionId: string;
  readonly nombre: string;
  /** `false` si ya era la general. */
  readonly cambio: boolean;
}

export const marcarEstacionGeneral = definirComando<
  Transaccion,
  typeof entradaMarcarEstacionGeneral,
  ResultadoMarcarEstacionGeneral
>({
  nombre: 'restaurante.marcar_estacion_general',
  entidad: 'estacion_preparacion',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaMarcarEstacionGeneral,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // Las estaciones del negocio, bloqueadas: dos «hacer general» a la vez sobre dos
    // estaciones distintas leerían las dos «no hay general». El índice único parcial
    // `estaciones_una_general` también lo impediría, pero con un 23505 y no con una frase.
    const estaciones = await ctx.paso('bloquear_estaciones', () =>
      ctx.tx
        .selectFrom('estaciones_preparacion')
        .select(['id', 'nombre', 'activa', 'es_general as esGeneral'])
        .where('organizacion_id', '=', organizacionId)
        .orderBy('id')
        .forUpdate()
        .execute(),
    );

    const estacion = estaciones.find((e) => e.id === entrada.estacionId);
    if (!estacion?.activa) {
      throw new ErrorDominio(
        'ESTACION_NO_ENCONTRADA',
        'Esa estación no existe o está apagada: la general tiene que poder recibir comandas.',
      );
    }
    if (estacion.esGeneral) {
      // Un comando que escribe deja rastro aunque no haya nada que cambiar.
      ctx.auditar({
        entidadId: estacion.id,
        payload: { nombre: estacion.nombre, sinCambio: true },
      });
      return { estacionId: estacion.id, nombre: estacion.nombre, cambio: false };
    }
    const otra = estaciones.find((e) => e.esGeneral);
    if (otra !== undefined) {
      throw new ErrorDominio(
        'ESTACION_YA_EXISTE',
        `La estación general ya es «${otra.nombre}». Sólo puede haber una, porque es a donde ` +
          'van las comandas que no encuentran estación propia.',
        { estacionId: otra.id },
      );
    }

    await ctx.paso('marcar_general', () =>
      ctx.tx
        .updateTable('estaciones_preparacion')
        .set({ es_general: true })
        .where('id', '=', estacion.id)
        .where('organizacion_id', '=', organizacionId)
        .execute(),
    );

    ctx.auditar({ entidadId: estacion.id, payload: { nombre: estacion.nombre } });

    return { estacionId: estacion.id, nombre: estacion.nombre, cambio: true };
  },
});
