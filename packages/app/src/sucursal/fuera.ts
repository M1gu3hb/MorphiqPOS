import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql, type RawBuilder } from 'kysely';

import type { FronteraDeSucursal } from '../puente/tipos.ts';
import { FRONTERA_DE_TABLAS, type TablaDeSucursal } from './frontera.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «Esta fila es de la sucursal», con `is not distinct from` para que un nulo sea un nulo. */
function dentro(columna: RawBuilder<unknown>, sucursalId: string | null, nula: boolean) {
  const suya = sql`${columna} is not distinct from ${sucursalId}::uuid`;
  return nula ? sql`(${columna} is null or ${suya})` : suya;
}

/**
 * De `ids`, los que existen en el negocio y son de OTRA sucursal (D-36).
 *
 * Lo que no existe no está «fuera»: no se toca, y el comando contesta lo que contesta a un
 * id al azar. Con `sucursalId` nulo —quien no consolida y no trae sucursal— toda fila que
 * sea de una sucursal está fuera; la que admite nulo y no tiene ninguna es del negocio.
 *
 * Una consulta por tabla, con la lista entera: un comando que recibe veinte renglones no
 * paga veinte viajes. El nombre de la tabla y sus columnas salen de `FRONTERA_DE_TABLAS`,
 * nunca de la entrada.
 */
export async function fueraDeLaSucursal(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string | null,
  tabla: TablaDeSucursal,
  ids: readonly string[],
): Promise<ReadonlySet<string>> {
  const validos = [...new Set(ids.filter((id) => UUID.test(id)))];
  if (validos.length === 0) return new Set();
  const frontera: Exclude<FronteraDeSucursal, { delNegocio: string }> = FRONTERA_DE_TABLAS[tabla];

  const consulta =
    'columna' in frontera
      ? sql<{ id: string }>`
          select t.id
            from ${sql.table(tabla)} t
           where t.organizacion_id = ${organizacionId}
             and t.id = any(${validos}::uuid[])
             and not ${dentro(sql.ref(`t.${frontera.columna}`), sucursalId, frontera.nulaEsDelNegocio === true)}`
      : sql<{ id: string }>`
          select t.id
            from ${sql.table(tabla)} t
            join ${sql.table(frontera.porPadre.tabla)} p
              on p.id = ${sql.ref(`t.${frontera.porPadre.columna}`)}
             and p.organizacion_id = t.organizacion_id
           where t.organizacion_id = ${organizacionId}
             and t.id = any(${validos}::uuid[])
             and not ${dentro(
               sql.ref(`p.${frontera.porPadre.columnaSucursal ?? 'sucursal_id'}`),
               sucursalId,
               frontera.porPadre.nulaEsDelNegocio === true,
             )}`;

  const { rows } = await consulta.execute(tx);
  return new Set(rows.map((fila) => fila.id));
}
