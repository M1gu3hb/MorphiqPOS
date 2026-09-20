import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `restaurante.relevar_responsable` — F-325.
 *
 * ── Las 17:00 ──────────────────────────────────────────────────────────────
 * El mesero de mediodía se va con mesas vivas. Hoy o se cierra la mesa antes de
 * tiempo —y el comensal se queda sin cuenta abierta— o la propina de la noche
 * se le acredita a quien ya se fue. Las dos salidas son malas y las dos se usan.
 *
 * ── Es distinto de F-304, asignar ──────────────────────────────────────────
 * Asignar dice quién atiende una mesa. Relevar parte la ATRIBUCIÓN EN EL
 * TIEMPO: la cuenta sigue siendo la misma, y lo que cambia es que de aquí en
 * adelante el trabajo lo hace otro. Sin ese corte, la propina de una mesa que
 * cambió de mesero a media noche no se puede repartir.
 *
 * ── El primer tramo se abre AQUÍ, no al abrir la mesa ──────────────────────
 * Una cuenta que nunca cambió de mesero no necesita ledger: su propina es
 * entera de `ordenes.empleado_atiende_id`. Escribir un tramo por cada cuenta
 * abierta sería una fila por venta para el caso que no ocurre. Cuando ocurre,
 * este comando escribe los DOS: el del que se va, cerrado con el consumo de
 * ahora, y el del que entra.
 */

export const entradaRelevarResponsable = z.object({
  /** Quién se va. Sus cuentas vivas son las que se relevan. */
  empleadoSaleId: z.uuid(),
  /** Quién entra. Queda como responsable de todas ellas. */
  empleadoEntraId: z.uuid(),
});

export interface CuentaRelevada {
  readonly ordenId: string;
  readonly mesaId: string | null;
  readonly consumoCentavos: string;
}

export interface ResultadoRelevo {
  readonly empleadoSaleId: string;
  readonly empleadoEntraId: string;
  readonly cuentas: readonly CuentaRelevada[];
}

/** Relevar es una decisión de quien manda el turno, no del que se va. */
const ROLES = ['gerente', 'administrador', 'dueno', 'cajero'] as const;

const CUENTAS_VIVAS = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

export const relevarResponsable = definirComando<
  Transaccion,
  typeof entradaRelevarResponsable,
  ResultadoRelevo
>({
  nombre: 'restaurante.relevar_responsable',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  modulo: 'mesero',
  entrada: entradaRelevarResponsable,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;

    if (entrada.empleadoSaleId === entrada.empleadoEntraId) {
      throw new ErrorDominio(
        'ACCESO_NO_ENCONTRADO',
        'Nadie se releva a sí mismo: el tramo no cambiaría de dueño.',
      );
    }

    const entra = await ctx.paso('cargar_quien_entra', () =>
      ctx.tx
        .selectFrom('empleos')
        .select(['id', 'activo'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.empleadoEntraId)
        .executeTakeFirst(),
    );

    // Relevar hacia alguien que ya no trabaja aquí dejaría las mesas sin dueño
    // real y la propina de la noche apuntando a una baja.
    if (entra?.activo !== true) {
      throw new ErrorDominio(
        'ACCESO_NO_ENCONTRADO',
        'Ese empleado no está activo en este negocio: no puede recibir las mesas.',
      );
    }

    let consulta = ctx.tx
      .selectFrom('ordenes')
      .select(['id', 'mesa_id', 'sucursal_id', 'total_centavos'])
      .where('organizacion_id', '=', organizacionId)
      .where('empleado_atiende_id', '=', entrada.empleadoSaleId)
      .where('estado', 'in', [...CUENTAS_VIVAS]);

    if (sucursalId !== null) {
      consulta = consulta.where('sucursal_id', '=', sucursalId);
    }

    const cuentas = await ctx.paso('cargar_cuentas', () => consulta.execute());

    if (cuentas.length === 0) {
      // No es un error: el mesero se va sin mesas abiertas, que es lo normal a
      // mitad de semana. Fallar aquí obligaría a la pantalla a distinguir dos
      // casos que para quien cierra el turno son el mismo.
      ctx.auditar({ entidadId: null, payload: { cuentas: 0, sale: entrada.empleadoSaleId } });
      return {
        empleadoSaleId: entrada.empleadoSaleId,
        empleadoEntraId: entrada.empleadoEntraId,
        cuentas: [],
      };
    }

    const abiertos = await ctx.paso('cargar_tramos_abiertos', () =>
      ctx.tx
        .selectFrom('relevos_atencion')
        .select(['id', 'orden_id'])
        .where('organizacion_id', '=', organizacionId)
        .where(
          'orden_id',
          'in',
          cuentas.map((c) => c.id),
        )
        .where('hasta', 'is', null)
        .execute(),
    );
    const abiertoPorOrden = new Map(abiertos.map((t) => [t.orden_id, t.id]));

    for (const cuenta of cuentas) {
      const tramoAbierto = abiertoPorOrden.get(cuenta.id);

      if (tramoAbierto === undefined) {
        // Primer relevo de esta cuenta: el tramo del que se va no existía
        // todavía, y se escribe entero y cerrado. Arranca en cero consumo
        // porque él la abrió; termina con lo que la cuenta lleva ahora.
        await ctx.tx
          .insertInto('relevos_atencion')
          .values({
            organizacion_id: organizacionId,
            // La sucursal sale de la CUENTA y no de la sesión: quien releva
            // puede estar en otra terminal, y el tramo pertenece al salón donde
            // está la mesa.
            sucursal_id: cuenta.sucursal_id,
            orden_id: cuenta.id,
            empleado_id: entrada.empleadoSaleId,
            desde: ctx.ahora,
            hasta: ctx.ahora,
            consumo_inicio_centavos: 0n,
            consumo_fin_centavos: cuenta.total_centavos,
            empleado_releva_id: entrada.empleadoEntraId,
          })
          .execute();
      } else {
        await ctx.tx
          .updateTable('relevos_atencion')
          .set({
            hasta: ctx.ahora,
            consumo_fin_centavos: cuenta.total_centavos,
            empleado_releva_id: entrada.empleadoEntraId,
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', tramoAbierto)
          .where('hasta', 'is', null)
          .execute();
      }

      await ctx.tx
        .insertInto('relevos_atencion')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: cuenta.sucursal_id,
          orden_id: cuenta.id,
          empleado_id: entrada.empleadoEntraId,
          desde: ctx.ahora,
          // El que entra arranca desde el consumo que encontró: lo de antes no
          // lo levantó él.
          consumo_inicio_centavos: cuenta.total_centavos,
        })
        .execute();
    }

    const ids = cuentas.map((c) => c.id);

    await ctx.paso('reapuntar_cuentas', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({ empleado_atiende_id: entrada.empleadoEntraId, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', 'in', ids)
        .execute(),
    );

    // Y las mesas, o el mapa del salón seguiría enseñando al que se fue.
    const mesaIds = cuentas.map((c) => c.mesa_id).filter((id): id is string => id !== null);

    if (mesaIds.length > 0) {
      await ctx.paso('reapuntar_mesas', () =>
        ctx.tx
          .updateTable('mesas')
          .set({ empleado_atiende_id: entrada.empleadoEntraId })
          .where('organizacion_id', '=', organizacionId)
          .where('id', 'in', mesaIds)
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: null,
      payload: {
        sale: entrada.empleadoSaleId,
        entra: entrada.empleadoEntraId,
        cuentas: cuentas.length,
        consumoRelevadoCentavos: cuentas.reduce((a, c) => a + c.total_centavos, 0n).toString(),
      },
    });

    return {
      empleadoSaleId: entrada.empleadoSaleId,
      empleadoEntraId: entrada.empleadoEntraId,
      cuentas: cuentas.map((c) => ({
        ordenId: c.id,
        mesaId: c.mesa_id,
        consumoCentavos: c.total_centavos.toString(),
      })),
    };
  },
});
