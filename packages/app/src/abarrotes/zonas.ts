import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-149 · LAS ZONAS DEL ANAQUEL, que nadie podía crear (D-33 de la 2.4).
 *
 * El conteo cíclico cuenta UNA zona al día —la más atrasada— (`conteo_de_zona`, 173), y
 * `zonas_anaquel` (091) e `insumos.zona_id` son todo lo que necesita. Pero ningún comando
 * creaba una zona ni ponía un producto en ella: la pantalla de Conteo decía «Hoy no toca
 * ninguna zona» para siempre y su botón «Programar las zonas del anaquel» llevaba a
 * Configuración, donde no hay zonas. Lo encontró el día completo de la tienda.
 *
 * Dos comandos y nada más: guardar una zona (nombre, cada cuántos días toca, su lugar en el
 * recorrido) y decir qué productos viven en ella. Lo cuenta quien cuenta: el almacén.
 */

const ROLES = ['almacen', 'gerente', 'administrador', 'dueno'] as const;

export const entradaGuardarZona = z.object({
  /** Presente = se edita; ausente = se crea. */
  zonaId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(60),
  /** Cada cuántos días le vuelve a tocar: la que más se mueve, más seguido. */
  diasEntreConteos: z.number().int().min(1).max(365),
  /** Su lugar en el recorrido físico de la tienda. */
  orden: z.number().int().min(0).max(999).optional(),
  activa: z.boolean().optional(),
});

export interface ZonaGuardada {
  readonly zonaId: string;
  readonly nombre: string;
}

export const guardarZona = definirComando<Transaccion, typeof entradaGuardarZona, ZonaGuardada>({
  nombre: 'inventario.guardar_zona',
  entidad: 'zona_anaquel',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaGuardarZona,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;

    // El nombre es único por sucursal (091), pero con la sucursal en nulo Postgres no lo
    // vigila: se mira aquí, sin distinguir mayúsculas, que es como lo lee el encargado.
    const mismoNombre = await ctx.paso('buscar_mismo_nombre', () =>
      ctx.tx
        .selectFrom('zonas_anaquel')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('nombre', 'ilike', entrada.nombre)
        .executeTakeFirst(),
    );
    if (mismoNombre !== undefined && mismoNombre.id !== entrada.zonaId) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Ya hay una zona que se llama «${entrada.nombre}».`,
      );
    }

    if (entrada.zonaId !== undefined) {
      const zonaId = entrada.zonaId;
      const cambiada = await ctx.paso('editar_zona', () =>
        ctx.tx
          .updateTable('zonas_anaquel')
          .set({
            nombre: entrada.nombre,
            dias_entre_conteos: entrada.diasEntreConteos,
            ...(entrada.orden === undefined ? {} : { orden: entrada.orden }),
            ...(entrada.activa === undefined ? {} : { activa: entrada.activa }),
            updated_at: ctx.ahora,
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', zonaId)
          .returning(['id'])
          .executeTakeFirst(),
      );
      if (cambiada === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa zona no existe en este negocio.');
      }
      ctx.auditar({ entidadId: zonaId, payload: { ...entrada } });
      return { zonaId, nombre: entrada.nombre };
    }

    const creada = await ctx.paso('crear_zona', () =>
      ctx.tx
        .insertInto('zonas_anaquel')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          nombre: entrada.nombre,
          dias_entre_conteos: entrada.diasEntreConteos,
          ...(entrada.orden === undefined ? {} : { orden: entrada.orden }),
          ...(entrada.activa === undefined ? {} : { activa: entrada.activa }),
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow(),
    );
    ctx.auditar({ entidadId: creada.id, payload: { ...entrada } });
    return { zonaId: creada.id, nombre: entrada.nombre };
  },
});

export const entradaAsignarZona = z.object({
  /** `null` saca los productos de su zona: dejan de contarse por ciclo. */
  zonaId: z.uuid().nullable(),
  insumoIds: z.array(z.uuid()).min(1).max(500),
});

export interface ZonaAsignada {
  readonly zonaId: string | null;
  readonly asignados: number;
}

export const asignarZona = definirComando<Transaccion, typeof entradaAsignarZona, ZonaAsignada>({
  nombre: 'inventario.asignar_zona',
  entidad: 'zona_anaquel',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAsignarZona,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const zonaId = entrada.zonaId;

    if (zonaId !== null) {
      const zona = await ctx.paso('cargar_zona', () =>
        ctx.tx
          .selectFrom('zonas_anaquel')
          .select(['id', 'activa'])
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', zonaId)
          .executeTakeFirst(),
      );
      if (zona === undefined) {
        throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa zona no existe en este negocio.');
      }
      if (!zona.activa) {
        throw new ErrorDominio('INVENTARIO_INVALIDO', 'Esa zona está apagada.');
      }
    }

    // Sólo los de ESTE negocio: un id ajeno no se mueve, y si alguno falta se dice.
    const movidos = await ctx.paso('asignar_productos', () =>
      ctx.tx
        .updateTable('insumos')
        .set({ zona_id: zonaId })
        .where('organizacion_id', '=', organizacionId)
        .where('id', 'in', entrada.insumoIds)
        .returning(['id'])
        .execute(),
    );
    if (movidos.length !== new Set(entrada.insumoIds).size) {
      throw new ErrorDominio(
        'PUENTE_NO_ENCONTRADO',
        'Alguno de esos productos no existe en este negocio: no se movió ninguno.',
      );
    }

    ctx.auditar({
      entidadId: zonaId ?? organizacionId,
      payload: { zonaId, insumos: entrada.insumoIds.length },
    });
    return { zonaId, asignados: movidos.length };
  },
});
