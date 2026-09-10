import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { centavos, type Centavos } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';

import type { LineaDeCompra } from './esquemas.ts';

/**
 * A qué insumo entra una línea de compra.
 *
 * Es la mitad de servidor del anti-duplicado que hoy vive en el navegador:
 * `RegistrarCompraDialog.jsx:255-296` descarga la lista de ingredientes,
 * normaliza nombres con `normalizarNombreIngrediente()` y decide ahí si crea
 * uno nuevo. Entre esa lectura y la escritura cabe otra caja y otra pestaña.
 * Aquí lo decide `insumos_nombre_unico` (`046:124`), que compara con
 * `clave_texto()` —sin acentos, sin mayúsculas— dentro de la transacción.
 *
 * La fila se toma con `for update`: el costo promedio ponderado se lee y se
 * escribe sobre ella, y dos compras simultáneas del mismo insumo se pisarían
 * el promedio igual que dos cajas se pisaban el stock (D-06).
 */

export interface InsumoDeCompra {
  readonly id: string;
  readonly nombre: string;
  readonly unidadBase: string;
  readonly costoUnitarioCentavos: Centavos;
}

interface FilaInsumo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  readonly costo_unitario_centavos: bigint;
  readonly activo: boolean;
}

export async function resolverInsumoDeLinea(
  tx: Transaccion,
  organizacionId: string,
  linea: LineaDeCompra,
): Promise<InsumoDeCompra> {
  if (linea.insumoId !== undefined) {
    const fila = await bloquearPorId(tx, organizacionId, linea.insumoId);
    if (fila === undefined) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Uno de los insumos de la compra ya no existe. Actualiza la pantalla y vuelve a intentarlo.',
      );
    }
    return exigirActivo(fila);
  }

  const nuevo = linea.nuevo;
  if (nuevo === undefined) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      'Cada línea de la compra tiene que decir a qué insumo entra.',
    );
  }

  const existente = await bloquearPorNombre(tx, organizacionId, nuevo.nombre);
  if (existente !== undefined) return exigirActivo(existente);

  const creado = await tx
    .insertInto('insumos')
    .values({
      organizacion_id: organizacionId,
      nombre: nuevo.nombre,
      unidad_base: nuevo.unidadBase,
      // El costo nace en cero y lo fija el promedio ponderado de esta misma
      // compra: ponerle el de la línea aquí sería contarlo dos veces.
      costo_unitario_centavos: 0n,
      ...(nuevo.stockMinimo === undefined
        ? {}
        : { stock_minimo: cantidadATexto(cantidad(nuevo.stockMinimo)) }),
      ...(nuevo.stockCritico === undefined
        ? {}
        : { stock_critico: cantidadATexto(cantidad(nuevo.stockCritico)) }),
    })
    .returning(['id', 'nombre', 'unidad_base', 'costo_unitario_centavos'])
    .executeTakeFirstOrThrow();

  return {
    id: creado.id,
    nombre: creado.nombre,
    unidadBase: creado.unidad_base,
    costoUnitarioCentavos: centavos(creado.costo_unitario_centavos),
  };
}

/**
 * Un insumo desactivado NO se reactiva al comprarlo.
 *
 * Es la misma decisión que ya toma su diálogo (`RegistrarCompraDialog.jsx:200-210`,
 * que aborta la compra entera y pide reactivarlo desde Inventario) y la que
 * explica `046:117-122`: el nombre sigue ocupado a propósito, y reactivar es
 * una acción con su propio botón. Comprar de refilón lo que alguien dio de baja
 * deshace una decisión sin dejar rastro de quién la deshizo.
 */
function exigirActivo(fila: FilaInsumo): InsumoDeCompra {
  if (!fila.activo) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      `«${fila.nombre}» está desactivado. Reactívalo desde Inventario antes de comprarlo.`,
    );
  }
  return {
    id: fila.id,
    nombre: fila.nombre,
    unidadBase: fila.unidad_base,
    costoUnitarioCentavos: centavos(fila.costo_unitario_centavos),
  };
}

function bloquearPorId(
  tx: Transaccion,
  organizacionId: string,
  insumoId: string,
): Promise<FilaInsumo | undefined> {
  return tx
    .selectFrom('insumos')
    .select(['id', 'nombre', 'unidad_base', 'costo_unitario_centavos', 'activo'])
    .where('id', '=', insumoId)
    .where('organizacion_id', '=', organizacionId)
    .forUpdate()
    .executeTakeFirst();
}

function bloquearPorNombre(
  tx: Transaccion,
  organizacionId: string,
  nombre: string,
): Promise<FilaInsumo | undefined> {
  return tx
    .selectFrom('insumos')
    .select(['id', 'nombre', 'unidad_base', 'costo_unitario_centavos', 'activo'])
    .where('organizacion_id', '=', organizacionId)
    .where(sql<boolean>`clave_texto(nombre) = clave_texto(${nombre})`)
    .forUpdate()
    .executeTakeFirst();
}
