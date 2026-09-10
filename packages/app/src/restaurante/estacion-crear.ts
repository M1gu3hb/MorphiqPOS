import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

/**
 * `restaurante.crear_estacion` — la estación de preparación, y su respaldo.
 *
 * ── El defecto que cierra ──────────────────────────────────────────────────
 * `EstacionesPreparacionSection.jsx` tiene dos botones que crean estaciones —
 * una normal, y la «Cocina general» que sirve de respaldo— y los dos mandaban
 * `es_general` en el cuerpo. Ese campo está declarado `escribible: false` en el
 * puente (`mapa.ts:773`) precisamente porque es la regla 10: tiene que haber
 * UNA y no se puede apagar. El puente los rechazaba, así que **crear una
 * estación no funcionaba nunca** — ni la normal ni la general.
 *
 * La solución no es abrir el campo: es que lo decida el servidor. Aquí
 * `esGeneral` sí viaja, pero es una PETICIÓN, no un dato: quien la concede es
 * el índice único parcial `estaciones_una_general` de la migración 046, y lo
 * que este comando aporta es que su 23505 llegue al usuario como una frase y no
 * como un 500.
 *
 * ── Por qué no es una escritura del puente ─────────────────────────────────
 * Porque «crear la estación general» no es guardar una fila: es afirmar que el
 * negocio no tiene ninguna. Eso es una regla, y las reglas no viajan en el
 * cuerpo de un `update`.
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export const entradaCrearEstacion = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(300).default(''),
  /** `#rrggbb`, como el resto del sistema de diseño. */
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#64748b'),
  orden: z.number().int().min(0).max(999).default(0),
  /**
   * Pide ser la estación de respaldo. Si ya hay una, falla: no se cambia de
   * mano sin decirlo, porque la comanda que no encuentra estación acaba en ella.
   */
  esGeneral: z.boolean().default(false),
});

export interface ResultadoCrearEstacion {
  readonly estacionId: string;
  readonly nombre: string;
  readonly esGeneral: boolean;
}

export const crearEstacion = definirComando<
  Transaccion,
  typeof entradaCrearEstacion,
  ResultadoCrearEstacion
>({
  nombre: 'restaurante.crear_estacion',
  entidad: 'estacion_preparacion',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaCrearEstacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // Se comprueba ANTES de insertar para poder decirlo con palabras. El índice
    // único es el que manda —dos peticiones a la vez no pueden colar dos
    // generales aunque las dos lean «no hay ninguna»— y su 23505 se traduce
    // abajo; esto sólo evita que el camino normal acabe en un error de base.
    if (entrada.esGeneral) {
      const ya = await ctx.paso('buscar_general', () =>
        ctx.tx
          .selectFrom('estaciones_preparacion')
          .select(['id', 'nombre'])
          .where('organizacion_id', '=', organizacionId)
          .where('es_general', '=', true)
          .executeTakeFirst(),
      );
      if (ya !== undefined) {
        throw new ErrorDominio(
          'ESTACION_YA_EXISTE',
          `Ya existe una estación general: «${ya.nombre}». Sólo puede haber una, ` +
            'porque es a donde van las comandas que no encuentran estación propia.',
          { estacionId: ya.id },
        );
      }
    }

    const fila = await ctx.paso('crear_estacion', async () => {
      try {
        return await ctx.tx
          .insertInto('estaciones_preparacion')
          .values({
            organizacion_id: organizacionId,
            nombre: entrada.nombre,
            descripcion: entrada.descripcion === '' ? null : entrada.descripcion,
            color: entrada.color,
            orden: entrada.orden,
            activa: true,
            es_general: entrada.esGeneral,
          })
          .returning(['id', 'nombre', 'es_general as esGeneral'])
          .executeTakeFirstOrThrow();
      } catch (error) {
        // `estaciones_una_general` (046 §35.8) es un índice único PARCIAL: dos
        // peticiones simultáneas que lean «no hay general» chocan aquí, y el
        // cocinero tiene que leer una frase, no un 23505.
        if (typeof error === 'object' && error !== null && 'code' in error) {
          if ((error as { code?: string }).code === '23505') {
            throw new ErrorDominio(
              'ESTACION_YA_EXISTE',
              'Alguien creó la estación general un segundo antes. Recarga la pantalla.',
            );
          }
        }
        throw error;
      }
    });

    ctx.auditar({
      entidadId: fila.id,
      payload: { nombre: fila.nombre, esGeneral: fila.esGeneral },
    });

    return { estacionId: fila.id, nombre: fila.nombre, esGeneral: fila.esGeneral };
  },
});
