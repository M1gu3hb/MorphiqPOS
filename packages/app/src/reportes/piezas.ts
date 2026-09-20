import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import type { LimitesDelDia } from './dia.ts';

/**
 * LAS PIEZAS QUE COMPARTEN LOS TABLEROS DE LOS CINCO MODELOS.
 *
 * ── Por qué compartidas y no una copia por modelo ─────────────────────────
 * Porque «la venta de hoy contra el mismo día de la semana pasada» y «el margen del
 * periodo» son la MISMA aritmética en una tiendita y en una ferretería, y dos copias
 * de una aritmética de dinero es cómo una de las dos se queda atrás: el día que
 * alguien corrija el costo congelado en una, la otra seguirá mintiendo. Lo que cambia
 * entre modelos es QUÉ indicadores hay y cómo se leen, no cuánto se vendió.
 *
 * Lo que NO se comparte es el tablero: cada modelo tiene el suyo, con sus
 * indicadores y sus prohibiciones, porque cada uno mira otra cosa a otras horas.
 */

/** Cualquier importe que venga de Postgres: texto, número o nulo. */
export const centavosDe = (valor: unknown): bigint => BigInt(Math.trunc(Number(valor ?? 0)));

/** Puntos base con una división que no revienta: 0 cuando no hay base. */
export function puntosBase(parte: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((parte * 10_000n) / total);
}

export interface VentaDelDia {
  readonly hoyCentavos: string;
  /** El mismo día de la semana pasada: la única comparación con sentido. */
  readonly referenciaCentavos: string;
  readonly tickets: number;
}

/**
 * La venta de hoy y la del MISMO DÍA de la semana pasada.
 *
 * Contra «ayer» no sirve: un martes no es un lunes. Y el número solo tampoco dice
 * nada —«$6,400»—; con su comparación sí: «$6,400, −18 % contra el martes pasado».
 */
export async function leerVentaDelDia(
  tx: Transaccion,
  organizacionId: string,
  dia: LimitesDelDia,
): Promise<VentaDelDia> {
  const filas = await sql<{ hoy: string; referencia: string; tickets: string }>`
    select coalesce(sum(case when o.created_at >= ${dia.desde} and o.created_at < ${dia.hasta}
                             then o.total_centavos end), 0)                      as hoy,
           coalesce(sum(case when o.created_at >= ${dia.haceUnaSemana}
                              and o.created_at < ${dia.finHaceUnaSemana}
                             then o.total_centavos end), 0)                      as referencia,
           count(case when o.created_at >= ${dia.desde} and o.created_at < ${dia.hasta}
                      then 1 end)                                               as tickets
      from ordenes o
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${dia.haceUnaSemana}
       and o.created_at < ${dia.hasta}
  `.execute(tx);
  const fila = filas.rows[0];
  return {
    hoyCentavos: centavosDe(fila?.hoy).toString(),
    referenciaCentavos: centavosDe(fila?.referencia).toString(),
    tickets: Number(fila?.tickets ?? 0),
  };
}

/**
 * La venta y el MARGEN de un periodo, de las líneas.
 *
 * El costo sale de `orden_lineas.costo_unitario_centavos`, que es el costo CONGELADO
 * al cobrar: recalcularlo con el costo de hoy haría que el margen de la semana pasada
 * cambiara cada vez que entra una compra.
 */
export async function leerMargen(
  tx: Transaccion,
  organizacionId: string,
  desde: Date,
  hasta: Date,
): Promise<{ readonly venta: bigint; readonly margen: bigint }> {
  const filas = await sql<{ venta: string; costo: string }>`
    select coalesce(sum(l.total_centavos), 0)                                        as venta,
           coalesce(sum(round(l.costo_unitario_centavos * l.cantidad::numeric)), 0)  as costo
      from orden_lineas l
      join ordenes o on o.id = l.orden_id
     where o.organizacion_id = ${organizacionId}
       and o.estado = 'pagada'
       and o.created_at >= ${desde}
       and o.created_at < ${hasta}
  `.execute(tx);
  const fila = filas.rows[0];
  const venta = centavosDe(fila?.venta);
  return { venta, margen: venta - centavosDe(fila?.costo) };
}

/** Lo que hay que pedirle a UN proveedor, con el día en que pasa. */
export interface PorPedirDeProveedor {
  readonly proveedorId: string | null;
  readonly proveedor: string;
  /** 1 = lunes … 7 = domingo. Vacío cuando el proveedor no tiene ruta. */
  readonly diasDeVisita: readonly number[];
  /** `true` si pasa MAÑANA: es el que hay que pedir hoy. */
  readonly pasaManana: boolean;
  readonly claves: number;
  readonly importeCentavos: string;
}

/**
 * Qué pedir, agrupado por PROVEEDOR y con el de mañana primero.
 *
 * ── Por qué por proveedor y no una lista de claves ────────────────────────
 * Porque la decisión es «¿qué le pido al que viene mañana?», no «¿qué está bajo
 * mínimo?». La carpeta de `abarrotes` lo dice: **no es «63 productos bajo mínimo»**,
 * es «mañana viene Coca: pídele 6 cajas de 600 ml». El detalle renglón por renglón
 * vive en la pantalla de Entradas, que es donde se captura el pedido.
 *
 * `sóloConRotacion` es la diferencia de la ferretería: allí el catálogo tiene miles
 * de claves de las que muchas no se mueven en meses, y pedir todo lo que está bajo
 * mínimo sería comprar dinero dormido. Se piden las que SE VENDEN.
 */
export async function leerPorPedir(
  tx: Transaccion,
  organizacionId: string,
  diaDeManana: number,
  opciones: { readonly soloConRotacion?: boolean } = {},
): Promise<readonly PorPedirDeProveedor[]> {
  const conRotacion = opciones.soloConRotacion === true;
  const filas = await sql<{
    proveedor_id: string | null;
    proveedor: string | null;
    dia_visita: number[] | null;
    claves: string;
    importe: string;
  }>`
    with existencia as (
      select e.insumo_id, sum(e.cantidad::numeric) as cantidad
        from existencias e
       where e.organizacion_id = ${organizacionId}
       group by e.insumo_id
    ),
    movido as (
      select m.insumo_id, sum(abs(m.cantidad::numeric)) as salido
        from movimientos_stock m
       where m.organizacion_id = ${organizacionId}
         and m.tipo = 'salida_venta'
         and m.created_at >= now() - interval '90 days'
       group by m.insumo_id
    )
    select p.id                                                             as proveedor_id,
           p.nombre                                                         as proveedor,
           p.dia_visita                                                     as dia_visita,
           count(*)                                                         as claves,
           coalesce(sum(round(
             (i.stock_minimo::numeric - coalesce(x.cantidad, 0)) * i.costo_unitario_centavos
           )), 0)                                                           as importe
      from insumos i
      left join existencia x on x.insumo_id = i.id
      left join movido v on v.insumo_id = i.id
      left join proveedores p
             on p.id = i.proveedor_id
            and p.organizacion_id = i.organizacion_id
     where i.organizacion_id = ${organizacionId}
       and i.activo
       and i.stock_minimo::numeric > 0
       and coalesce(x.cantidad, 0) < i.stock_minimo::numeric
       and (${conRotacion} = false or coalesce(v.salido, 0) > 0)
     group by p.id, p.nombre, p.dia_visita
     order by importe desc
     limit 8
  `.execute(tx);

  return filas.rows
    .map((fila) => {
      const dias = fila.dia_visita ?? [];
      return {
        proveedorId: fila.proveedor_id,
        // Sin proveedor asignado el renglón sigue siendo dinero que falta: se
        // nombra en vez de esconderse, porque asignarle proveedor es la acción.
        proveedor: fila.proveedor ?? 'Sin proveedor asignado',
        diasDeVisita: dias,
        pasaManana: dias.includes(diaDeManana),
        claves: Number(fila.claves),
        importeCentavos: centavosDe(fila.importe).toString(),
      };
    })
    .sort((a, b) => Number(b.pasaManana) - Number(a.pasaManana));
}
