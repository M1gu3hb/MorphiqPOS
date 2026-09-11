import 'server-only';

import { ErrorDominio, PAQUETES } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoVentaCatalogo } from '@morphiqpos/data';
import { desdeTexto, sumar, type Centavos } from '@morphiqpos/domain/dinero';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { recalcularCostosRecetas } from '../inventario/recetas.ts';
import { entradaRegistrarCompra, entradaUsarPlantillaCompra } from './esquemas.ts';
import type { LineaDeCompra } from './esquemas.ts';
import { exigirUnidadesBaseDelGiro } from './insumos.ts';
import { escribirLinea, resolverProveedor, type CabeceraDeCompra } from './linea.ts';
import { lineasDePlantilla, marcarPlantillaUsada } from './plantillas.ts';

/**
 * `compras.registrar` — corrige D-12.
 *
 * UNA transacción escribe los cinco efectos: la cabecera, TODAS las líneas, los
 * movimientos de entrada del ledger, el incremento de existencias y el costo
 * promedio ponderado de cada insumo. Si falla la línea 3 de 5, no queda nada.
 *
 * Hoy `RegistrarCompraDialog.jsx:229` crea la cabecera con el total de las
 * cinco y el bucle de líneas va después (`:240-366`), con un `catch` que sólo
 * hace `toast.error` (`:391`). El resultado es una compra con el total correcto
 * y tres líneas: un asiento contable que no cuadra consigo mismo.
 *
 * El total lo suma el servidor. El endpoint no acepta importes de cabecera.
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export interface ResultadoCompra {
  readonly compraId: string;
  readonly totalCentavos: string;
  readonly lineas: number;
}

/**
 * El total de una compra: Σ de sus líneas.
 *
 * Se exporta porque es la regla que no se negocia —«el endpoint no acepta
 * importes del cliente»— y una regla que sólo vive dentro de un comando que
 * necesita Postgres para probarse es una regla sin prueba.
 */
export function totalDeLineas(lineas: readonly { readonly costoTotal: string }[]): Centavos {
  return sumar(...lineas.map((linea) => desdeTexto(linea.costoTotal)));
}

export const registrarCompra = definirComando<
  Transaccion,
  typeof entradaRegistrarCompra,
  ResultadoCompra
>({
  nombre: 'compras.registrar',
  entidad: 'compra',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaRegistrarCompra,
  ejecutar(ctx, entrada) {
    return escribirCompra(ctx, entrada, entrada.lineas, entrada.plantillaCompraId ?? null);
  },
});

/**
 * `compras.usar_plantilla` — repite una compra guardada y mueve sus contadores.
 *
 * §27.2: `veces_usada` se escribe una sola vez, en 1, al crear la plantilla
 * (`RegistrarCompraDialog.jsx:374`), y `RepetirCompraDialog.jsx:113-130` sólo
 * carga las líneas en memoria. Los contadores se quedan en 1 para siempre. Aquí
 * suben **en la misma transacción que registra la compra**: o hay compra y
 * contador, o no hay ninguna de las dos.
 */
export const usarPlantillaCompra = definirComando<
  Transaccion,
  typeof entradaUsarPlantillaCompra,
  ResultadoCompra
>({
  nombre: 'compras.usar_plantilla',
  entidad: 'compra',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaUsarPlantillaCompra,
  async ejecutar(ctx, entrada) {
    const lineas = await ctx.paso('leer_plantilla', () =>
      lineasDePlantilla(ctx.tx, ctx.ambito.organizacionId, entrada.plantillaId),
    );
    return escribirCompra(ctx, entrada, lineas, entrada.plantillaId);
  },
});

async function escribirCompra(
  ctx: ContextoComando<Transaccion>,
  cabecera: CabeceraDeCompra,
  lineas: readonly LineaDeCompra[],
  plantillaId: string | null,
): Promise<ResultadoCompra> {
  const { organizacionId, sucursalId, empleoId } = ctx.ambito;
  if (sucursalId === null) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      'Registra la compra desde una sucursal: la mercancía entra a un almacén concreto.',
    );
  }

  // Antes de escribir NADA: si la tercera línea crea un insumo en `kg` y la
  // organización es un restaurante, el trigger de la 046 la va a rechazar. Que
  // lo diga aquí, con la regla en la mano, y no un `check_violation` crudo
  // después de haber insertado cabecera y dos líneas.
  await exigirUnidadesBaseDelGiro(ctx.tx, organizacionId, lineas);

  const almacenId = await repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId);
  if (almacenId === null) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Esta sucursal no tiene un almacén donde recibir la compra.',
    );
  }

  const proveedor = await resolverProveedor(ctx.tx, organizacionId, cabecera);

  // El total se suma antes de escribir nada, para que la cabecera nazca con el
  // importe que de verdad se va a guardar.
  const total = totalDeLineas(lineas);

  const compra = await ctx.paso('crear_compra', () =>
    ctx.tx
      .insertInto('compras')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        proveedor_id: proveedor.id,
        proveedor_nombre: proveedor.nombre,
        total_centavos: total,
        metodo_pago: cabecera.metodoPago ?? null,
        factura_folio: cabecera.facturaFolio ?? null,
        notas: cabecera.notas ?? null,
        empleado_id: empleoId,
        ...(cabecera.fecha === undefined ? {} : { fecha: cabecera.fecha }),
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  // Cada línea es su propio paso NUMERADO: es lo que permite a la prueba de
  // inyección interrumpir `registrar_linea_3` —el escenario exacto de D-12— y
  // comprobar que no queda ni la cabecera.
  const insumosTocados: string[] = [];
  for (const [indice, linea] of lineas.entries()) {
    insumosTocados.push(
      await ctx.paso(`registrar_linea_${indice + 1}`, () =>
        escribirLinea(ctx, { almacenId, compraId: compra.id, linea }),
      ),
    );
  }

  // El costo de los insumos acaba de moverse: los productos que los usan tienen
  // el margen obsoleto hasta que se recalculan. Es D-09, y no recalcular aquí
  // lo deja exactamente igual de roto que hoy. Sólo los que los usan.
  await ctx.paso('recalcular_costos', () =>
    recalcularCostosDeLosInsumos(ctx.tx, organizacionId, insumosTocados),
  );

  if (plantillaId !== null) {
    await ctx.paso('marcar_plantilla_usada', () =>
      marcarPlantillaUsada(ctx.tx, organizacionId, plantillaId, ctx.ahora),
    );
  }

  ctx.auditar({
    entidadId: compra.id,
    payload: {
      totalCentavos: total.toString(),
      lineas: lineas.length,
      proveedor: proveedor.nombre,
      plantillaCompraId: plantillaId,
    },
  });

  return { compraId: compra.id, totalCentavos: total.toString(), lineas: lineas.length };
}

/**
 * Ids sin repetir y en un orden que no depende del planificador.
 *
 * El orden es la mitad importante: dos compras simultáneas que acaben tocando
 * filas comunes de `productos` las toman en la MISMA secuencia, así que una
 * espera a la otra en vez de cruzarse. Si cada transacción las tomara en el
 * orden que le diera el plan de la consulta, Postgres cortaría una con un
 * deadlock y el usuario perdería la captura entera de su compra con un error
 * interno que no explica nada.
 *
 * Se exporta por lo mismo que `totalDeLineas`: es una regla, y una regla que
 * sólo se puede mirar desde dentro de un comando que necesita Postgres es una
 * regla sin prueba. No sale al índice del módulo: la usa su prueba y nadie más.
 */
export function ordenDeBloqueo(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)].sort();
}

/**
 * Recalcula el costo de los productos que usan los insumos que ESTA compra movió.
 *
 * Antes se recalculaba la organización entera en cada compra: dos gerentes
 * registrando a la vez compras de insumos distintos reescribían las mismas
 * filas de `productos` y se bloqueaban mutuamente durante toda la transacción,
 * con `for update` sobre `insumos` ya tomado. El comando hermano de recetas
 * (`inventario/recetas.ts`) ya pasa `productoId` por esta razón.
 *
 * Se recalcula producto por producto reutilizando `recalcularCostosRecetas`, en
 * vez de repetir aquí su fórmula: el costeo copiado en tres sitios es el defecto
 * D-13 y no se va a introducir un cuarto. Acotar el recálculo a un solo
 * enunciado exigiría que esa función aceptara una lista de productos, y vive en
 * otro módulo.
 */
async function recalcularCostosDeLosInsumos(
  tx: Transaccion,
  organizacionId: string,
  insumoIds: readonly string[],
): Promise<number> {
  const insumos = ordenDeBloqueo(insumoIds);
  if (insumos.length === 0) return 0;

  const filas = await tx
    .selectFrom('recetas')
    .select('producto_id')
    .distinct()
    .where('organizacion_id', '=', organizacionId)
    .where('insumo_id', 'in', insumos)
    .execute();

  let recalculados = 0;
  for (const productoId of ordenDeBloqueo(filas.map((fila) => fila.producto_id))) {
    recalculados += await recalcularCostosRecetas(tx, organizacionId, productoId);
  }
  return recalculados;
}
