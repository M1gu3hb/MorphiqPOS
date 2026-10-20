import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import {
  aDiezmilesimas,
  deDiezmilesimas,
  repartirPorPesos,
  ESCALA_CANTIDAD,
  type Centavos,
} from '@morphiqpos/domain/dinero';

/**
 * PARTIR UNA LÍNEA entre las cuentas de una división (F-321, día completo del restaurante, 2.4).
 *
 * Aparte de `division-escrituras.ts` para que allí se lea el orden de la división —las hijas,
 * a qué cuenta va cada línea, la madre sellada— y aquí la aritmética de partir una fila: las
 * cantidades en diezmilésimas, los importes con los pesos de las unidades y el vínculo con
 * cocina, que sigue a cada trozo.
 */

export interface DatosDeLaPartida {
  readonly organizacionId: string;
  readonly lineaId: string;
  readonly unidades: readonly number[];
  /** Las hijas, en el orden de las partes. */
  readonly ordenes: readonly string[];
  readonly ahora: Date;
}

/** `numeric(14,4)` repartido por unidades en diezmilésimas, sin perder ninguna. `null` queda `null`. */
function repartirCantidad(
  valor: string | null,
  unidades: readonly number[],
): readonly (string | null)[] {
  if (valor === null) return unidades.map(() => null);
  return repartirPorPesos(aDiezmilesimas(valor) as Centavos, unidades).map((trozo) =>
    deDiezmilesimas(trozo),
  );
}

/** Los centavos de una columna de dinero, repartidos con los pesos de las unidades. */
export function repartirDinero(valor: bigint, unidades: readonly number[]): readonly bigint[] {
  return repartirPorPesos(valor as Centavos, unidades);
}

/** Lo que la base rellena sola: no se copia a la fila hermana. */
const GENERADAS = new Set(['id', 'created_at', 'updated_at']);

function sinLoGenerado<T extends object>(fila: T): Omit<T, 'id' | 'created_at' | 'updated_at'> {
  return Object.fromEntries(
    Object.entries(fila).filter(([columna]) => !GENERADAS.has(columna)),
  ) as Omit<T, 'id' | 'created_at' | 'updated_at'>;
}

/**
 * Parte UNA línea entre las cuentas que se llevan unidades de ella.
 *
 * La fila original se queda con la primera cuenta y cada una de las demás recibe una fila
 * hermana, copia de la original con SU cantidad y SU cuota de los tres importes. El vínculo
 * con cocina sigue a cada fila: se parte también el `comanda_items` de la línea, con la misma
 * proporción, porque «esta línea ya salió» se lee ahí y una fila sin item se mandaría otra
 * vez a la plancha al cobrar (`comandar-pendientes.ts`).
 */
export async function partirLinea(
  tx: Transaccion,
  datos: DatosDeLaPartida,
): Promise<readonly bigint[]> {
  const { organizacionId, unidades } = datos;
  const original = await tx
    .selectFrom('orden_lineas')
    .selectAll()
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', datos.lineaId)
    .executeTakeFirstOrThrow();

  if (aDiezmilesimas(original.cantidad) % ESCALA_CANTIDAD !== 0n) {
    // La pantalla ya no deja repartir unidades de una línea que no las tiene enteras; esto
    // es para quien llame al comando sin ella.
    throw new ErrorDominio(
      'DIVISION_NO_CUADRA',
      `«${original.producto_nombre}» no se reparte por unidades: va entero a una cuenta.`,
      { lineaId: datos.lineaId },
    );
  }

  const subtotal = repartirDinero(original.subtotal_centavos, unidades);
  const descuento = repartirDinero(original.descuento_centavos, unidades);
  // El total de cada trozo es SU subtotal menos SU descuento, no un tercer reparto (cierre del
  // 21-10): repartidos por separado, el centavo sobrante de cada columna caía en trozos
  // distintos, y la parte de una cuenta con descuento enseñaba un total y se cobraba otro
  // —`cotizar` lo calcula como subtotal − descuento—, con lo que ninguna parte se cobraba.
  const total =
    original.total_centavos === original.subtotal_centavos - original.descuento_centavos
      ? subtotal.map((parte, i) => parte - (descuento[i] ?? 0n))
      : repartirDinero(original.total_centavos, unidades);
  const utilidad = repartirDinero(original.utilidad_centavos, unidades);
  const material = repartirDinero(original.material_centavos, unidades);
  const variable = repartirCantidad(original.cantidad_variable, unidades);
  const porciones = repartirCantidad(original.cantidad_porciones, unidades);
  const consumoBase = repartirCantidad(original.cantidad_base_consumo, unidades);

  const cuotaDe = (i: number) => ({
    cantidad: deDiezmilesimas(BigInt(unidades[i] ?? 0) * ESCALA_CANTIDAD),
    subtotal_centavos: subtotal[i] ?? 0n,
    descuento_centavos: descuento[i] ?? 0n,
    total_centavos: total[i] ?? 0n,
    utilidad_centavos: utilidad[i] ?? 0n,
    material_centavos: material[i] ?? 0n,
    cantidad_variable: variable[i] ?? null,
    cantidad_porciones: porciones[i] ?? null,
    cantidad_base_consumo: consumoBase[i] ?? null,
  });

  const items = await tx
    .selectFrom('comanda_items')
    .selectAll()
    .where('organizacion_id', '=', organizacionId)
    .where('orden_linea_id', '=', datos.lineaId)
    .execute();

  // La fila de cada cuenta que se lleva unidades. La primera ES la original.
  const filaDeCadaParte = new Map<number, string>();

  for (const [i, enParte] of unidades.entries()) {
    if (enParte <= 0) continue;
    const orden = datos.ordenes[i];
    if (orden === undefined) continue;

    if (filaDeCadaParte.size === 0) {
      await tx
        .updateTable('orden_lineas')
        .set({ ...cuotaDe(i), orden_id: orden, updated_at: datos.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', datos.lineaId)
        .execute();
      filaDeCadaParte.set(i, datos.lineaId);
      continue;
    }

    const hermana = await tx
      .insertInto('orden_lineas')
      .values({ ...sinLoGenerado(original), ...cuotaDe(i), orden_id: orden })
      .returning('id')
      .executeTakeFirstOrThrow();
    filaDeCadaParte.set(i, hermana.id);
  }

  for (const item of items) {
    const cantidades = repartirCantidad(item.cantidad, unidades);
    const variableDelItem = repartirCantidad(item.cantidad_variable, unidades);
    const porcionesDelItem = repartirCantidad(item.cantidad_porciones, unidades);
    // Un item que no alcanza a darle algo a cada cuenta (comandado por menos que la línea)
    // se reparte por unidades: `cantidad > 0` es un `check` de la tabla.
    const alcanza = unidades.every((u, i) => u === 0 || aDiezmilesimas(cantidades[i] ?? '0') > 0n);
    const cuotaDelItem = (i: number) => ({
      cantidad: alcanza
        ? (cantidades[i] ?? item.cantidad)
        : deDiezmilesimas(BigInt(unidades[i] ?? 0) * ESCALA_CANTIDAD),
      cantidad_variable: variableDelItem[i] ?? null,
      cantidad_porciones: porcionesDelItem[i] ?? null,
    });

    let primero = true;
    for (const [i, fila] of filaDeCadaParte) {
      if (primero) {
        primero = false;
        await tx
          .updateTable('comanda_items')
          .set({ ...cuotaDelItem(i), updated_at: datos.ahora })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', item.id)
          .execute();
        continue;
      }
      await tx
        .insertInto('comanda_items')
        .values({ ...sinLoGenerado(item), ...cuotaDelItem(i), orden_linea_id: fila })
        .execute();
    }
  }

  // Lo que se llevó cada parte, tal como quedó escrito: lo registra el movimiento de la división.
  return unidades.map((u, i) => (u > 0 ? (total[i] ?? 0n) : 0n));
}
