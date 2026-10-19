import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';

import type { FronteraDeSucursal } from '../puente/tipos.ts';

/**
 * LA FRONTERA POR SUCURSAL CONTRA EL ESQUEMA MIGRADO (D-36), para las pruebas de integración
 * del puente y de los comandos: las dos declaran fronteras sobre tablas, y las dos tienen
 * que nombrar columnas que existen.
 */

/** Las columnas de cada tabla y vista de la base migrada, con si admiten nulo. */
export async function columnasDelEsquema(): Promise<
  ReadonlyMap<string, ReadonlyMap<string, boolean>>
> {
  const filas = await sql<{ tabla: string; columna: string; nulable: string }>`
    select table_name as tabla, column_name as columna, is_nullable as nulable
      from information_schema.columns
     where table_schema = 'public'`.execute(obtenerDb());
  const columnas = new Map<string, Map<string, boolean>>();
  for (const { tabla, columna, nulable } of filas.rows) {
    const de = columnas.get(tabla) ?? new Map<string, boolean>();
    de.set(columna, nulable === 'YES');
    columnas.set(tabla, de);
  }
  return columnas;
}

/**
 * Lo que está mal en la frontera de `tabla`, contra el esquema. Vacío si nada.
 *
 * Una fila con `sucursal_id` tiene la respuesta en sí misma: declararla del negocio o
 * acotarla por un padre sería ignorarla. Y una columna que admite nulo se lee con su
 * `coalesce`: con la igualdad sola, la fila sin sucursal desaparece para todos menos el
 * dueño (`DE_SU_SUCURSAL_O_DEL_NEGOCIO`).
 */
export function fallasDeFrontera(
  nombre: string,
  tabla: string,
  frontera: FronteraDeSucursal,
  columnas: ReadonlyMap<string, ReadonlyMap<string, boolean>>,
): string[] {
  const suyas = columnas.get(tabla);
  if (suyas === undefined) return [`${nombre}: «${tabla}» no existe`];
  const fallas: string[] = [];
  if (!suyas.has('organizacion_id')) fallas.push(`${nombre}: sin organizacion_id`);
  if (suyas.has('sucursal_id') && !('columna' in frontera && frontera.columna === 'sucursal_id')) {
    fallas.push(`${nombre}: su fila tiene sucursal_id y la frontera no la usa`);
  }
  if ('columna' in frontera) {
    const nulable = suyas.get(frontera.columna);
    if (nulable === undefined) fallas.push(`${nombre}: no tiene «${frontera.columna}»`);
    if (nulable === true && frontera.nulaEsDelNegocio !== true) {
      fallas.push(`${nombre}: «${frontera.columna}» admite nulo y la frontera no lo dice`);
    }
  }
  if ('porPadre' in frontera) {
    const { columna, tabla: delPadre, columnaSucursal, nulaEsDelNegocio } = frontera.porPadre;
    const padre = columnas.get(delPadre);
    if (!suyas.has(columna)) fallas.push(`${nombre}: no tiene «${columna}»`);
    if (padre?.has('organizacion_id') !== true) {
      fallas.push(`${nombre}: el padre «${delPadre}» no tiene organizacion_id`);
    }
    const nulable = padre?.get(columnaSucursal ?? 'sucursal_id');
    if (nulable === undefined) fallas.push(`${nombre}: el padre «${delPadre}» no dice su sucursal`);
    if (nulable === true && nulaEsDelNegocio !== true) {
      fallas.push(`${nombre}: la sucursal de «${delPadre}» admite nulo y la frontera no lo dice`);
    }
  }
  return fallas;
}
