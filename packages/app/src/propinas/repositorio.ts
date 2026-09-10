import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { etiquetaDeMesero, type PropinaDeMesero, type RenglonDePago } from './desglose.ts';
import {
  aMesero,
  aRenglon,
  NOMBRE_DEL_MESERO,
  PROPINA_DE_LA_ORDEN,
  type FilaDeMesero,
  type FilaDeMetodo,
} from './fragmentos.ts';

/**
 * Lo pendiente de liquidar en un periodo.
 *
 * Aquí sólo se traen filas; sumar por método es de `desglose.ts`, que es puro y
 * se prueba sin base. Los agregados por método y por mesero SÍ se hacen en SQL
 * porque son seis y siete filas: bajarse las 3 000 ventas del mes al servidor
 * para sumarlas en TypeScript es lo que `F1-01` §6 manda dejar de hacer.
 *
 * El listado de ventas sí lleva tope, porque es para dibujar. Los totales no
 * dependen de él: si se toparan, el diálogo enseñaría un total menor del que se
 * va a liquidar.
 */

export interface FiltroDePropinas {
  readonly organizacionId: string;
  readonly inicio: Date;
  readonly fin: Date;
  /** Nulo = todos los meseros. */
  readonly meseroId: string | null;
}

/**
 * Las órdenes pendientes del periodo.
 *
 * ── Por qué `coalesce(cerrada_en, created_at)` ─────────────────────────────
 * Es el mismo respaldo que `tipsUtils.js:41` (`fecha_cierre || fecha_apertura ||
 * created_date`), y hoy hace falta de verdad: `marcarPagada`
 * (`packages/data/src/repos/ordenes/cierre.ts:71-86`) **no escribe `cerrada_en`**,
 * aunque `045_restaurante.sql:51-53` lo exija con un `check`. Sin el `coalesce`,
 * una venta cobrada por un camino que deje esa columna nula desaparecería del
 * periodo y su propina no se liquidaría nunca. Queda anotado en el informe.
 */
export function condicionPendiente(filtro: FiltroDePropinas) {
  return sql`
    o.organizacion_id = ${filtro.organizacionId}
    and o.estado = 'pagada'
    and o.propina_liquidacion_id is null
    and coalesce(o.cerrada_en, o.created_at) >= ${filtro.inicio}
    and coalesce(o.cerrada_en, o.created_at) <= ${filtro.fin}
    and (${filtro.meseroId}::uuid is null or o.empleado_atiende_id = ${filtro.meseroId}::uuid)
  `;
}

/**
 * Desglose EXACTO por método de las ventas con propina pendiente.
 *
 * Entran TODOS los pagos confirmados de esas ventas, no sólo los que llevan
 * propina: si el comensal pagó 700 con tarjeta y 300 en efectivo y dejó la
 * propina sólo en efectivo, la parte de tarjeta sigue siendo venta cobrada con
 * tarjeta y tiene que aparecer donde corresponde.
 */
export async function desglosePendiente(
  tx: Transaccion,
  filtro: FiltroDePropinas,
): Promise<RenglonDePago[]> {
  const filas = await sql<FilaDeMetodo>`
    select pg.metodo,
           coalesce(sum(pg.monto_centavos), 0)::text   as ventas,
           coalesce(sum(pg.propina_centavos), 0)::text as propinas
      from ordenes o
      ${PROPINA_DE_LA_ORDEN}
      join pagos pg
        on pg.orden_id = o.id
       and pg.organizacion_id = o.organizacion_id
       and pg.estado = 'confirmado'
     where ${condicionPendiente(filtro)} and t.propina > 0
     group by pg.metodo
  `.execute(tx);

  return filas.rows.map(aRenglon);
}

/**
 * Propina pendiente por mesero, agrupada por la base.
 *
 * Se agrupa en SQL y no en TypeScript porque el agrupado tiene que cubrir TODAS
 * las ventas del periodo, no las que quepan en el listado: agruparlas sobre la
 * página topada daría un total distinto del que se liquida.
 *
 * Se omiten las propinas en cero, igual que `Caja.jsx:163`: una fila «Juan ·
 * $0.00» no informa de nada y empuja fuera de pantalla a quien sí tiene dinero.
 */
export async function propinasPorMeseroPendientes(
  tx: Transaccion,
  filtro: FiltroDePropinas,
): Promise<PropinaDeMesero[]> {
  const filas = await sql<FilaDeMesero>`
    select o.empleado_atiende_id as empleado_id,
           max(per.nombre)       as nombre,
           count(*)::text        as ventas,
           sum(t.propina)::text  as propina
      from ordenes o
      ${PROPINA_DE_LA_ORDEN}
      ${NOMBRE_DEL_MESERO}
     where ${condicionPendiente(filtro)} and t.propina > 0
     group by o.empleado_atiende_id
     order by sum(t.propina) desc
  `.execute(tx);

  return filas.rows.map(aMesero);
}

export interface VentaConPropina {
  readonly ordenId: string;
  readonly folio: string;
  readonly cerradaEn: string;
  readonly meseroId: string | null;
  readonly meseroNombre: string;
  /** La venta SIN propina (regla 1). */
  readonly totalCentavos: string;
  readonly propinaCentavos: string;
}

interface FilaDeVenta {
  readonly id: string;
  readonly serie: string;
  readonly folio: string | null;
  readonly total: string;
  readonly cerrada_en: Date;
  readonly empleado_id: string | null;
  readonly nombre: string | null;
  readonly propina: string;
}

/** El listado que dibuja el diálogo. Topado: es para mirar, no para sumar. */
export async function ventasConPropinaPendiente(
  tx: Transaccion,
  filtro: FiltroDePropinas,
  limite: number,
): Promise<VentaConPropina[]> {
  const filas = await sql<FilaDeVenta>`
    select o.id,
           o.serie,
           o.folio::text          as folio,
           o.total_centavos::text as total,
           coalesce(o.cerrada_en, o.created_at) as cerrada_en,
           o.empleado_atiende_id  as empleado_id,
           per.nombre             as nombre,
           t.propina::text        as propina
      from ordenes o
      ${PROPINA_DE_LA_ORDEN}
      ${NOMBRE_DEL_MESERO}
     where ${condicionPendiente(filtro)} and t.propina > 0
     order by coalesce(o.cerrada_en, o.created_at) desc
     limit ${limite}
  `.execute(tx);

  return filas.rows.map((fila) => ({
    ordenId: fila.id,
    folio: fila.folio === null ? '' : `${fila.serie}-${fila.folio.padStart(6, '0')}`,
    cerradaEn: fila.cerrada_en.toISOString(),
    meseroId: fila.empleado_id,
    meseroNombre: etiquetaDeMesero(fila.nombre),
    totalCentavos: fila.total,
    propinaCentavos: fila.propina,
  }));
}
