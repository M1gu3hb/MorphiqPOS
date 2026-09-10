import 'server-only';

import { ErrorDominio, PAQUETES } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { desdeTexto, negar } from '@morphiqpos/domain/dinero';
import { sql } from 'kysely';

import { definirComando } from '../definicion.ts';
import { entradaGuardarPlantillaGasto, entradaRegistrarGasto } from './esquemas.ts';
import { reconocerNotasHeredadas } from './notas.ts';

/**
 * Gastos operativos: `gastos` (+ `movimientos_caja` si salió del cajón).
 *
 * Dos correcciones, las dos de F1-04 §25:
 *
 * · **§25.2 — un gasto en efectivo mueve la caja.** Hoy `Caja.jsx:189` suma los
 *   gastos del turno leyendo `GastoOperativo` y filtrando por fecha, mientras el
 *   efectivo esperado sale de otra fuente. Aquí el gasto en efectivo inserta
 *   además su `movimientos_caja` de tipo `gasto` con monto negativo, en la misma
 *   transacción, así que `total_gastos` y `efectivo_esperado` no pueden
 *   discrepar. Un gasto con tarjeta no lo genera: no salieron billetes.
 *
 * · **§25.1 — `es_recurrente` y `plantilla_gasto_id` son columnas.** Hoy viajan
 *   dentro del texto de `notas` y se pierden al editarla.
 */

const ROLES = ['dueno', 'administrador', 'gerente'] as const;

export interface ResultadoGasto {
  readonly gastoId: string;
  readonly montoCentavos: string;
  readonly sesionCajaId: string | null;
}

export const registrarGasto = definirComando<
  Transaccion,
  typeof entradaRegistrarGasto,
  ResultadoGasto
>({
  nombre: 'gastos.registrar',
  entidad: 'gasto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaRegistrarGasto,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;
    if (sucursalId === null) {
      throw new ErrorDominio(
        'GASTO_INVALIDO',
        'Registra el gasto desde una sucursal: es de dónde sale el dinero.',
      );
    }

    const monto = desdeTexto(entrada.monto);
    if (monto <= 0n) {
      throw new ErrorDominio('GASTO_INVALIDO', 'El monto del gasto tiene que ser mayor que cero.');
    }

    // Los prefijos heredados se reconocen y se convierten en las columnas que
    // les tocan, para no perder lo que ya escribió una pantalla sin portar.
    const heredado = reconocerNotasHeredadas(entrada.notas);
    const esRecurrente = entrada.esRecurrente === true || heredado.esRecurrente;

    const plantillaId = await resolverPlantilla(
      ctx.tx,
      organizacionId,
      entrada.plantillaGastoId,
      heredado.nombrePlantilla,
    );

    const enEfectivo = entrada.metodoPago === 'efectivo';
    const sesionCajaId = enEfectivo
      ? await ctx.paso('cargar_caja', () => sesionAbierta(ctx.tx, organizacionId, sucursalId))
      : null;

    const gasto = await ctx.paso('crear_gasto', () =>
      ctx.tx
        .insertInto('gastos')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          sesion_caja_id: sesionCajaId,
          plantilla_gasto_id: plantillaId,
          categoria: entrada.categoria,
          descripcion: entrada.descripcion,
          monto_centavos: monto,
          metodo_pago: entrada.metodoPago,
          es_recurrente: esRecurrente,
          empleado_id: empleoId,
          notas: heredado.notas,
          ...(entrada.fecha === undefined ? {} : { fecha: entrada.fecha }),
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    if (sesionCajaId !== null) {
      // Negativo: el signo lo pone el servidor a partir del tipo, y
      // `movimiento_signo_coherente` (003:319) rechaza un gasto positivo.
      await ctx.paso('registrar_salida_de_caja', () =>
        ctx.tx
          .insertInto('movimientos_caja')
          .values({
            organizacion_id: organizacionId,
            sesion_caja_id: sesionCajaId,
            tipo: 'gasto',
            monto_centavos: negar(monto),
            referencia_tipo: 'gasto',
            referencia_id: gasto.id,
            empleado_id: empleoId,
            motivo: entrada.descripcion,
          })
          .execute(),
      );
    }

    if (plantillaId !== null) {
      await ctx.paso('marcar_plantilla_usada', () =>
        marcarPlantillaGastoUsada(ctx.tx, organizacionId, plantillaId, ctx.ahora),
      );
    }

    ctx.auditar({
      entidadId: gasto.id,
      payload: {
        montoCentavos: monto.toString(),
        categoria: entrada.categoria,
        metodoPago: entrada.metodoPago,
        esRecurrente,
        plantillaGastoId: plantillaId,
        sesionCajaId,
      },
    });

    return { gastoId: gasto.id, montoCentavos: monto.toString(), sesionCajaId };
  },
});

export const guardarPlantillaGasto = definirComando<
  Transaccion,
  typeof entradaGuardarPlantillaGasto,
  { readonly plantillaId: string }
>({
  nombre: 'gastos.guardar_plantilla',
  entidad: 'plantilla_gasto',
  escribe: true,
  roles: ROLES,
  paquetes: PAQUETES,
  entrada: entradaGuardarPlantillaGasto,
  async ejecutar(ctx, entrada) {
    const organizacionId = ctx.ambito.organizacionId;
    const plantillaId = entrada.plantillaId;

    const valores = {
      nombre: entrada.nombre,
      categoria: entrada.categoria,
      monto_sugerido_centavos: desdeTexto(entrada.montoSugerido),
      metodo_pago: entrada.metodoPago,
      periodicidad: entrada.periodicidad,
      dia_pago_sugerido: entrada.diaPagoSugerido ?? null,
      notas: entrada.notas ?? null,
      // `activa` sólo se toca si viene: `PlantillaGastoDialog.jsx:93` la escribe
      // en `true` siempre, así que editar una plantilla eliminada la resucitaba
      // sin avisar. Reactivar es una acción propia.
      ...(entrada.activa === undefined ? {} : { activa: entrada.activa }),
    };

    if (plantillaId !== undefined) {
      const actualizada = await ctx.paso('actualizar_plantilla', () =>
        ctx.tx
          .updateTable('plantillas_gasto')
          .set({ ...valores, updated_at: ctx.ahora })
          .where('id', '=', plantillaId)
          .where('organizacion_id', '=', organizacionId)
          .returning('id')
          .executeTakeFirst(),
      );
      if (actualizada === undefined) {
        throw new ErrorDominio('PLANTILLA_NO_ENCONTRADA', 'Esa plantilla de gasto ya no existe.');
      }
      ctx.auditar({ entidadId: actualizada.id, payload: { nombre: entrada.nombre, alta: false } });
      return { plantillaId: actualizada.id };
    }

    const creada = await ctx.paso('crear_plantilla', () =>
      ctx.tx
        .insertInto('plantillas_gasto')
        .values({ ...valores, organizacion_id: organizacionId })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    ctx.auditar({ entidadId: creada.id, payload: { nombre: entrada.nombre, alta: true } });
    return { plantillaId: creada.id };
  },
});

/**
 * La caja abierta de la sucursal.
 *
 * Es una sola: lo impone `sesiones_caja_una_abierta_por_sucursal` (046:85), y
 * por eso no hace falta la terminal. Si no hay ninguna, el gasto en efectivo no
 * se registra: sin sesión, el dinero sale del cajón sin quedar en ningún arqueo
 * y el corte del día nace con un faltante que nadie sabe explicar.
 */
async function sesionAbierta(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<string> {
  const fila = await tx
    .selectFrom('sesiones_caja')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('estado', '=', 'abierta')
    .executeTakeFirst();

  if (fila === undefined) {
    throw new ErrorDominio(
      'CAJA_CERRADA',
      'No hay una caja abierta. Ábrela antes de pagar este gasto en efectivo, ' +
        'o regístralo con tarjeta o transferencia si no salió del cajón.',
    );
  }
  return fila.id;
}

/**
 * Qué plantilla generó el gasto.
 *
 * Se acepta el id y, si no viene, el nombre que traía «[Desde plantilla: X]»
 * dentro de las notas. Un nombre que ya no existe **no es un error**: el gasto
 * se registra igual, sin vínculo, porque perder el gasto por no encontrar su
 * plantilla sería peor que perder el vínculo.
 */
async function resolverPlantilla(
  tx: Transaccion,
  organizacionId: string,
  plantillaGastoId: string | undefined,
  nombreHeredado: string | null,
): Promise<string | null> {
  if (plantillaGastoId !== undefined) {
    const fila = await tx
      .selectFrom('plantillas_gasto')
      .select('id')
      .where('id', '=', plantillaGastoId)
      .where('organizacion_id', '=', organizacionId)
      .executeTakeFirst();
    if (fila === undefined) {
      throw new ErrorDominio('PLANTILLA_NO_ENCONTRADA', 'Esa plantilla de gasto ya no existe.');
    }
    return fila.id;
  }

  if (nombreHeredado === null) return null;

  const fila = await tx
    .selectFrom('plantillas_gasto')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where(sql<boolean>`clave_texto(nombre) = clave_texto(${nombreHeredado})`)
    .executeTakeFirst();

  return fila?.id ?? null;
}

/** Sube `veces_usada` y `ultimo_uso_en` en la MISMA transacción que el gasto. */
async function marcarPlantillaGastoUsada(
  tx: Transaccion,
  organizacionId: string,
  plantillaId: string,
  ahora: Date,
): Promise<void> {
  await tx
    .updateTable('plantillas_gasto')
    .set({
      veces_usada: sql<number>`veces_usada + 1`,
      ultimo_uso_en: ahora,
      updated_at: ahora,
    })
    .where('id', '=', plantillaId)
    .where('organizacion_id', '=', organizacionId)
    .execute();
}
