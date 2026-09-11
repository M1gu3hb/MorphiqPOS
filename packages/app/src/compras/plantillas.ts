import 'server-only';

import { ErrorDominio, PAQUETES } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { cantidad, cantidadATexto } from '@morphiqpos/domain/catalogo';
import { sql } from 'kysely';

import { definirComando } from '../definicion.ts';
import { equivalenciaDeLinea } from './costeo.ts';
import { entradaGuardarPlantillaCompra, type LineaDeCompra } from './esquemas.ts';
import {
  equivalenciaDeLineaGuardada,
  leerLineasGuardadas,
  type InsumoDePlantilla,
} from './plantilla-lineas.ts';

/**
 * Plantillas de compra: `plantillas_compra`, con `lineas` en `jsonb`.
 *
 * Es la excepción a normalizar los arreglos embebidos (F1-04 §27.1) y la
 * diferencia es real: la plantilla se lee ENTERA para precargar un formulario
 * (`RepetirCompraDialog.jsx:113-130`) y nunca se actualiza parcialmente.
 *
 * Las líneas se guardan con LAS CLAVES DE SU FRONTEND —`ingrediente_id`,
 * `ingrediente_nombre`, `cantidad`, `unidad_compra`, `costo_total`— para que el
 * diálogo siga leyéndolas sin cambiar una línea, y con los importes **como
 * texto**: `String(l.costo_total || '')` funciona igual sobre una cadena y así
 * el importe no pasa por punto flotante. Se añade `equivalencia`, que su
 * formato no tiene y sin la cual repetir una compra en cajas es adivinar.
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export const guardarPlantillaCompra = definirComando<
  Transaccion,
  typeof entradaGuardarPlantillaCompra,
  { readonly plantillaId: string }
>({
  nombre: 'compras.guardar_plantilla',
  entidad: 'plantilla_compra',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaGuardarPlantillaCompra,
  async ejecutar(ctx, entrada) {
    const organizacionId = ctx.ambito.organizacionId;
    const plantillaId = entrada.plantillaId;
    const insumos = await insumosDeLaOrganizacion(
      ctx.tx,
      organizacionId,
      entrada.lineas.map((linea) => linea.insumoId),
    );

    const lineas = entrada.lineas.map((linea) => {
      const insumo = insumos.get(linea.insumoId);
      if (insumo === undefined) {
        throw new ErrorDominio(
          'INVENTARIO_INVALIDO',
          'Una de las líneas de la plantilla apunta a un insumo que ya no existe.',
        );
      }
      // La equivalencia se comprueba al guardar y no sólo al comprar: una
      // plantilla con la conversión mal puesta repite el error cada mes.
      const equivalencia = equivalenciaDeLinea(
        linea.unidadCompra,
        insumo.unidadBase,
        cantidad(linea.equivalencia),
      );
      return {
        ingrediente_id: insumo.id,
        ingrediente_nombre: insumo.nombre,
        cantidad: cantidadATexto(cantidad(linea.cantidad)),
        unidad_compra: linea.unidadCompra,
        costo_total: linea.costoTotal,
        equivalencia: cantidadATexto(equivalencia),
      };
    });

    const valores = {
      nombre: entrada.nombre,
      proveedor_nombre: entrada.proveedorNombre ?? null,
      lineas: JSON.stringify(lineas),
      notas: entrada.notas ?? null,
      ...(entrada.activa === undefined ? {} : { activa: entrada.activa }),
    };

    if (plantillaId !== undefined) {
      const actualizada = await ctx.paso('actualizar_plantilla', () =>
        ctx.tx
          .updateTable('plantillas_compra')
          .set({ ...valores, updated_at: ctx.ahora })
          .where('id', '=', plantillaId)
          .where('organizacion_id', '=', organizacionId)
          .returning('id')
          .executeTakeFirst(),
      );
      if (actualizada === undefined) {
        throw new ErrorDominio('PLANTILLA_NO_ENCONTRADA', 'Esa plantilla de compra ya no existe.');
      }
      ctx.auditar({ entidadId: actualizada.id, payload: { lineas: lineas.length, alta: false } });
      return { plantillaId: actualizada.id };
    }

    const creada = await ctx.paso('crear_plantilla', () =>
      ctx.tx
        .insertInto('plantillas_compra')
        .values({ ...valores, organizacion_id: organizacionId })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    ctx.auditar({ entidadId: creada.id, payload: { lineas: lineas.length, alta: true } });
    return { plantillaId: creada.id };
  },
});

/**
 * Las líneas de una plantilla, ya listas para registrarse como compra.
 *
 * Toma la fila con `for update` porque el contador de uso se incrementa en esta
 * misma transacción.
 */
export async function lineasDePlantilla(
  tx: Transaccion,
  organizacionId: string,
  plantillaId: string,
): Promise<readonly LineaDeCompra[]> {
  const fila = await tx
    .selectFrom('plantillas_compra')
    .select(['id', 'nombre', 'lineas', 'activa'])
    .where('id', '=', plantillaId)
    .where('organizacion_id', '=', organizacionId)
    .forUpdate()
    .executeTakeFirst();

  if (fila?.activa !== true) {
    throw new ErrorDominio('PLANTILLA_NO_ENCONTRADA', 'Esa plantilla de compra ya no existe.');
  }

  // Acotadas al mismo tope que `entradaRegistrarCompra.lineas`: es lo que
  // impide que el `jsonb` —escribible directo por el puente— sirva de rodeo.
  const guardadas = leerLineasGuardadas(fila.lineas, fila.nombre);

  const insumos = await insumosDeLaOrganizacion(
    tx,
    organizacionId,
    guardadas.map((linea) => linea.ingrediente_id),
  );

  return guardadas.map((linea) => ({
    insumoId: linea.ingrediente_id,
    cantidadCapturada: linea.cantidad,
    unidadCapturada: linea.unidad_compra,
    equivalencia: equivalenciaDeLineaGuardada(
      linea,
      insumos.get(linea.ingrediente_id),
      fila.nombre,
    ),
    costoTotal: linea.costo_total,
  }));
}

/**
 * Sube `veces_usada` y `ultimo_uso_en`. Corrige los contadores congelados de §27.2.
 *
 * Exige `activa` por coherencia con `lineasDePlantilla`, que ya la exigía: sin
 * este filtro, `compras.registrar` aceptaba un `plantillaCompraId` de una
 * plantilla dada de baja y le seguía subiendo el contador, así que el ranking
 * de «plantillas más usadas» contaba una plantilla que ya nadie ve. Por el
 * camino `usar_plantilla` era imposible; por el gemelo, no. Un tope o un estado
 * que sólo se comprueba en una de las dos puertas no se está comprobando.
 */
export async function marcarPlantillaUsada(
  tx: Transaccion,
  organizacionId: string,
  plantillaId: string,
  ahora: Date,
): Promise<void> {
  const fila = await tx
    .updateTable('plantillas_compra')
    .set({
      // Incremento en la base, no `leer + 1` en memoria: dos usos simultáneos
      // de la misma plantilla contarían uno.
      veces_usada: sql<number>`veces_usada + 1`,
      ultimo_uso_en: ahora,
      updated_at: ahora,
    })
    .where('id', '=', plantillaId)
    .where('organizacion_id', '=', organizacionId)
    .where('activa', '=', true)
    .returning('id')
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio(
      'PLANTILLA_NO_ENCONTRADA',
      'Esa plantilla de compra ya no existe o está dada de baja. Reactívala, o registra ' +
        'la compra sin vincularla a una plantilla.',
    );
  }
}

/**
 * Los insumos de las líneas, con lo justo para leerlas.
 *
 * **No se lee `cantidad_por_compra_default`.** Esa columna es la que el módulo
 * documenta como corrompida por la pantalla vieja —le escribe la cantidad
 * comprada, no la equivalencia— y usarla de respaldo era el defecto bloqueante:
 * repetir «3 cajas de jitomate» guardaba 9 g en vez de 36 000 y propagaba el
 * costo envenenado a toda la carta. No leerla es lo que impide reintroducirlo.
 */
async function insumosDeLaOrganizacion(
  tx: Transaccion,
  organizacionId: string,
  ids: readonly string[],
): Promise<ReadonlyMap<string, InsumoDePlantilla>> {
  const filas = await tx
    .selectFrom('insumos')
    .select(['id', 'nombre', 'unidad_base'])
    .where('organizacion_id', '=', organizacionId)
    .where('id', 'in', [...new Set(ids)])
    .execute();

  return new Map(
    filas.map((fila) => [
      fila.id,
      { id: fila.id, nombre: fila.nombre, unidadBase: fila.unidad_base },
    ]),
  );
}
