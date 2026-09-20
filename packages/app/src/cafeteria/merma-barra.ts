import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoCaja, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { aDiezmilesimas, deDiezmilesimas, porCantidad } from '@morphiqpos/domain/dinero';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { exigirMotivoDeMerma } from '../inventario/motivos.ts';

/**
 * `cafeteria.registrar_merma_barra` y `registrar_calibracion` — F-156.
 *
 * ── $700 al mes, invisibles ────────────────────────────────────────────────
 * La calibración del molino tira café todas las mañanas; el vapor, el derrame y
 * la bebida rehecha se llevan entre el 5 y el 15 % de la leche. Nada de eso se
 * registra, así que el inventario de café NUNCA cuadra y la dueña concluye que
 * «las recetas no sirven» — y deja de confiar en el único número que tenía.
 *
 * ── No hay tabla nueva, y es la decisión que importa ───────────────────────
 * La merma se escribe en `movimientos_stock` con su motivo tipado, que es donde
 * ya vive desde la 062. Una tabla paralela daría el mismo hecho en dos sitios, y
 * el día que uno se escriba y el otro no, el inventario y el reporte dirían
 * cosas distintas.
 *
 * ── Y la calibración tiene su propio atajo ────────────────────────────────
 * Porque ocurre a las 7:00 con la fila empezando, y un comando que pida elegir
 * insumo, unidad y cantidad no se usa: se usa el que pide «¿cuántos shots?».
 * Los gramos los pone el servidor desde `productos.gramaje_shot`.
 */

export const MOTIVOS_DE_BARRA = [
  'calibracion',
  'derrame',
  'bebida_rehecha',
  'vapor_leche',
] as const;

const CANTIDAD = /^\d+(\.\d{1,4})?$/;

export const entradaMermaBarra = z.object({
  motivo: z.enum(MOTIVOS_DE_BARRA),
  insumoId: z.uuid(),
  /** Texto: `numeric(14,4)` son diezmilésimas y 0.1 + 0.2 no es 0.3. */
  cantidad: z.string().regex(CANTIDAD, 'La cantidad va con hasta cuatro decimales.'),
  nota: z.string().trim().min(1).max(200).optional(),
});

export const entradaCalibracion = z.object({
  /** Cuántos shots se tiraron calibrando. Tres o cuatro es lo normal. */
  shots: z.number().int().min(1).max(20),
  /** El producto que define el gramaje. Si falta, se usa el grano del lote abierto. */
  productoId: z.uuid().optional(),
});

export interface ResultadoMerma {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly costoCentavos: string;
  readonly motivo: string;
}

const ROLES = ['cajero', 'cocina', 'gerente', 'administrador', 'dueno'] as const;

export const registrarMermaBarra = definirComando<
  Transaccion,
  typeof entradaMermaBarra,
  ResultadoMerma
>({
  nombre: 'cafeteria.registrar_merma_barra',
  entidad: 'movimiento_stock',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaMermaBarra,
  async ejecutar(ctx, entrada) {
    const escrito = await anotarMerma(ctx, {
      insumoId: entrada.insumoId,
      cantidad: entrada.cantidad,
      motivo: entrada.motivo,
    });

    ctx.auditar({
      entidadId: entrada.insumoId,
      payload: {
        motivo: entrada.motivo,
        cantidad: escrito.cantidad,
        costoCentavos: escrito.costoCentavos,
        nota: entrada.nota ?? null,
      },
    });
    return escrito;
  },
});

export const registrarCalibracion = definirComando<
  Transaccion,
  typeof entradaCalibracion,
  ResultadoMerma
>({
  nombre: 'cafeteria.registrar_calibracion',
  entidad: 'movimiento_stock',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaCalibracion,
  async ejecutar(ctx, entrada) {
    const grano = await ctx.paso('cargar_grano', () =>
      granoDeCalibracion(ctx.tx, ctx.ambito.organizacionId, entrada.productoId ?? null),
    );

    // LOS GRAMOS LOS PONE EL SERVIDOR. Si el barista tecleara la cantidad, el
    // atajo dejaría de ser un atajo y volvería a no usarse a las 7:00.
    const gramos = porShots(grano.gramajeShot, entrada.shots);

    const escrito = await anotarMerma(ctx, {
      insumoId: grano.insumoId,
      cantidad: gramos,
      motivo: 'calibracion',
    });

    ctx.auditar({
      entidadId: grano.insumoId,
      payload: { shots: entrada.shots, gramos, costoCentavos: escrito.costoCentavos },
    });
    return escrito;
  },
});

interface Merma {
  readonly insumoId: string;
  readonly cantidad: string;
  readonly motivo: string;
}

/**
 * Escribe la salida en el ledger, con su turno y su costo congelado.
 *
 * ── El costo se congela ────────────────────────────────────────────────────
 * Se toma del insumo DENTRO de la transacción. Leerlo al consultar valoraría la
 * merma de hace un mes con el precio del café de hoy, y el punto de F-156 es
 * precisamente poder decir cuánto costó aquella mañana.
 *
 * ── Una merma PUEDE dejar la existencia en negativo, y debe ───────────────
 * El café salió del bote: negarlo porque el sistema creía que había menos sería
 * mentir sobre un hecho físico. Y ese negativo es exactamente la señal de que el
 * conteo está mal, que es el segundo problema que F-156 destapa. El consumo
 * interno (F-261) sí lo prohíbe, porque allí la comida que no existe no se
 * sirvió: son dos hechos distintos y se tratan distinto.
 */
async function anotarMerma(
  ctx: ContextoComando<Transaccion>,
  merma: Merma,
): Promise<ResultadoMerma> {
  const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;

  if (sucursalId === null) {
    throw new ErrorDominio(
      'VENTA_SIN_TERMINAL',
      'Una merma sale de un almacén, y el almacén es de una sucursal.',
    );
  }

  const almacenId = await ctx.paso('almacen', () =>
    repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
  );
  if (almacenId === null) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'Esta sucursal no tiene almacén.');
  }

  const insumo = await ctx.paso('cargar_insumo', () =>
    ctx.tx
      .selectFrom('insumos')
      .select(['id', 'unidad_base as unidadBase', 'costo_unitario_centavos as costo'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', merma.insumoId)
      .executeTakeFirst(),
  );
  if (insumo === undefined) {
    throw new ErrorDominio('INVENTARIO_INVALIDO', 'Ese insumo no existe en este negocio.');
  }

  const existencia = await ctx.paso('cargar_existencia', () =>
    ctx.tx
      .selectFrom('existencias')
      .select(['cantidad'])
      .where('organizacion_id', '=', organizacionId)
      .where('almacen_id', '=', almacenId)
      .where('insumo_id', '=', merma.insumoId)
      .executeTakeFirst(),
  );
  if (existencia === undefined) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Ese insumo no tiene existencia en el almacén de esta sucursal.',
    );
  }

  const restante = deDiezmilesimas(
    aDiezmilesimas(existencia.cantidad) - aDiezmilesimas(merma.cantidad),
  );

  const bajada = await ctx.paso('descontar', () =>
    ctx.tx
      .updateTable('existencias')
      .set({ cantidad: restante })
      .where('organizacion_id', '=', organizacionId)
      .where('almacen_id', '=', almacenId)
      .where('insumo_id', '=', merma.insumoId)
      // COMPARA Y ESCRIBE: la existencia que se resta es la que se leyó. Dos
      // baristas registrando merma a la vez se serializan aquí, y el segundo
      // actualiza cero filas en vez de pisar el descuento del primero.
      .where('cantidad', '=', existencia.cantidad)
      .executeTakeFirst(),
  );

  if (Number(bajada.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Ese insumo cambió de existencia mientras se registraba la merma. Vuelve a intentarlo.',
    );
  }

  // El turno, para que el corte pueda decir «esta mañana se fueron 180 g».
  const sesion =
    terminalId === null
      ? null
      : await ctx.paso('cargar_turno', () =>
          repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
        );

  const costoCentavos = porCantidad(insumo.costo, merma.cantidad);

  /**
   * El motivo, comprobado contra la tabla ADEMÁS del `z.enum` de la entrada.
   *
   * Los cuatro de la barra están sembrados, así que esto no rechaza nada hoy. Se
   * comprueba igual porque la lista del `enum` vive en este archivo y la tabla en
   * la base: el día que alguien añada un motivo aquí sin su migración, esto lo
   * dice con el nombre dentro en vez de dejar que la foránea aborte la merma con
   * un `23503` que el barista lee como «algo falló de nuestro lado».
   */
  const motivo = await exigirMotivoDeMerma(ctx, merma.motivo);

  await ctx.paso('anotar_movimiento', () =>
    ctx.tx
      .insertInto('movimientos_stock')
      .values({
        organizacion_id: organizacionId,
        almacen_id: almacenId,
        insumo_id: merma.insumoId,
        tipo: 'merma',
        // NEGATIVA: el ledger guarda las salidas con signo, igual que la caja.
        cantidad: `-${merma.cantidad}`,
        unidad: insumo.unidadBase,
        costo_unitario_centavos: insumo.costo,
        referencia_tipo: 'merma_barra',
        motivo,
        empleado_id: empleoId,
        sesion_caja_id: sesion?.id ?? null,
        created_at: ctx.ahora,
      })
      .execute(),
  );

  return {
    insumoId: merma.insumoId,
    cantidad: merma.cantidad,
    unidad: insumo.unidadBase,
    costoCentavos: costoCentavos.toString(),
    motivo: merma.motivo,
  };
}

interface GranoDeCalibracion {
  readonly insumoId: string;
  readonly gramajeShot: string;
}

/**
 * Qué insumo y qué gramaje usa la calibración.
 *
 * Con producto, el suyo. Sin producto, el grano del lote ABIERTO: es lo que de
 * verdad está en la tolva y lo que el barista acaba de tirar. Si no hay lote
 * abierto FALLA en vez de adivinar un insumo — una merma cargada al café
 * equivocado ensucia dos inventarios en vez de uno.
 */
async function granoDeCalibracion(
  tx: Transaccion,
  organizacionId: string,
  productoId: string | null,
): Promise<GranoDeCalibracion> {
  if (productoId !== null) {
    const producto = await tx
      .selectFrom('productos')
      .select(['gramaje_shot as gramaje', 'insumo_base_id as insumoBaseId'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', '=', productoId)
      .executeTakeFirst();

    if (producto?.gramaje == null || producto.insumoBaseId === null) {
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        'Ese producto no declara gramaje por shot ni apunta a un grano: no se puede calibrar con él.',
        { productoId },
      );
    }
    return { insumoId: producto.insumoBaseId, gramajeShot: producto.gramaje };
  }

  const lote = await tx
    .selectFrom('lotes_grano')
    .select(['insumo_id as insumoId'])
    .where('organizacion_id', '=', organizacionId)
    .where('abierto_en', 'is not', null)
    .where('agotado_en', 'is', null)
    .executeTakeFirst();

  if (lote === undefined) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'No hay ningún lote de grano abierto: abre uno antes de calibrar.',
    );
  }

  // El gramaje sale del producto que se prepara con ESE grano. Si ninguno lo
  // declara, se falla: inventar «18 gramos porque suele ser eso» metería en el
  // inventario un número que nadie decidió.
  const producto = await tx
    .selectFrom('productos')
    .select(['gramaje_shot as gramaje'])
    .where('organizacion_id', '=', organizacionId)
    .where('insumo_base_id', '=', lote.insumoId)
    .where('gramaje_shot', 'is not', null)
    .executeTakeFirst();

  if (producto?.gramaje == null) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'Ningún producto declara gramaje por shot para ese grano: decláralo antes de calibrar.',
      { insumoId: lote.insumoId },
    );
  }

  return { insumoId: lote.insumoId, gramajeShot: producto.gramaje };
}

/** `18.0000` × 4 shots = `72.0000`, en enteros y sin coma flotante. */
export function porShots(gramaje: string, shots: number): string {
  return deDiezmilesimas(aDiezmilesimas(gramaje) * BigInt(shots));
}
