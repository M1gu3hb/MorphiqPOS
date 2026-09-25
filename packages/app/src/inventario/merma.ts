import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { planearMerma, type MotivoDeMerma } from '@morphiqpos/domain/inventario';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-109 · La merma con motivo, que es estrategia y no tronco.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 * La 062 sembraba seis motivos de merma del tronco y **ningún comando los
 * leía**. Se registraba merma —cuando se registraba— como un ajuste con texto
 * libre, así que «caducó» y «se lo llevaron» acababan en el mismo número y el
 * número no servía para nada.
 *
 * ── La estrategia la elige QUIEN LLAMA, no un `if` por giro ────────────────
 * El encargo lo dice con estas palabras: *«si el tronco tiene un `if` que
 * pregunta por el giro, está mal hecho»*. Aquí el giro no aparece: la pantalla
 * de una cafetería manda `insumo`, la de un abarrote manda `presentacion` y la
 * de una ferretería manda `retazo`. Un giro nuevo trae su estrategia, no un
 * `case` más en este archivo.
 */

const ROLES = ['gerente', 'administrador', 'dueno', 'almacen'] as const;

export const entradaRegistrarMerma = z.object({
  almacenId: z.uuid(),
  insumoId: z.uuid(),
  estrategia: z.enum(['insumo', 'presentacion', 'retazo']),
  cantidad: z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/, 'Usa hasta cuatro decimales.'),
  unidad: z.string().trim().min(1).max(20),
  /** Cuántas unidades base vale una de lo tecleado. `'1'` si ya es la base. */
  factorABase: z
    .string()
    .regex(/^\d{1,10}(?:\.\d{1,4})?$/)
    .default('1'),
  motivoClave: z.string().trim().min(2).max(40),
  nota: z.string().trim().max(200).optional(),
  /** Sólo en `retazo`: por debajo de esto el sobrante no sirve. */
  minimoUtilBase: z
    .string()
    .regex(/^\d{1,10}(?:\.\d{1,4})?$/)
    .optional(),
});

export interface ResultadoMerma {
  readonly movimientoId: string | null;
  readonly deltaBase: string;
  readonly recuperadoBase: string;
  readonly motivo: string;
  /** `true` cuando el motivo apunta a un responsable: dispara una revisión. */
  readonly imputable: boolean;
  /** `true` cuando el sobrante alcanzó el mínimo útil y NO hubo merma. */
  readonly seRecupera: boolean;
}

export const registrarMerma = definirComando<
  Transaccion,
  typeof entradaRegistrarMerma,
  ResultadoMerma
>({
  nombre: 'inventario.registrar_merma',
  entidad: 'movimiento_stock',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  modulo: 'movimientos_inventario',
  entrada: entradaRegistrarMerma,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const motivo = await cargarMotivo(ctx, entrada.motivoClave);

    const plan = planearMerma({
      estrategia: entrada.estrategia,
      cantidad: entrada.cantidad,
      factorABase: entrada.factorABase,
      motivo,
      ...(entrada.minimoUtilBase === undefined ? {} : { minimoUtilBase: entrada.minimoUtilBase }),
    });

    // El retazo que SÍ sirve no genera movimiento de salida: no se perdió nada.
    // Devolverlo aquí, en vez de escribir una merma de cero, es lo que impide
    // que el inventario de una ferretería reste cable que sigue en el estante.
    if (plan.seRecupera) {
      ctx.auditar({
        entidadId: null,
        payload: {
          insumoId: entrada.insumoId,
          recuperadoBase: plan.recuperadoBase,
          motivo: plan.motivo,
        },
      });
      return {
        movimientoId: null,
        deltaBase: plan.deltaBase,
        recuperadoBase: plan.recuperadoBase,
        motivo: plan.motivo,
        imputable: plan.imputable,
        seRecupera: true,
      };
    }

    await descontarExistencia(ctx, entrada.almacenId, entrada.insumoId, plan.deltaBase);

    const movimiento = await ctx.paso('anotar_merma', () =>
      ctx.tx
        .insertInto('movimientos_stock')
        .values({
          organizacion_id: organizacionId,
          almacen_id: entrada.almacenId,
          insumo_id: entrada.insumoId,
          tipo: 'merma',
          cantidad: plan.deltaBase,
          unidad: entrada.unidad,
          // La CLAVE del motivo, no la etiqueta. La etiqueta se puede cambiar
          // sin migración; la clave es lo que agrupa el reporte de seis meses.
          referencia_tipo: 'merma',
          // La CLAVE sola. Pegarle la nota con dos puntos la convertía en un
          // valor que `motivos_merma` no tiene, y la base rechazaba la merma
          // entera: declarar una merma con nota era imposible.
          motivo: plan.motivo,
          nota: entrada.nota ?? null,
          empleado_id: empleoId,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: movimiento.id,
      payload: {
        insumoId: entrada.insumoId,
        estrategia: entrada.estrategia,
        deltaBase: plan.deltaBase,
        motivo: plan.motivo,
        imputable: plan.imputable,
      },
    });

    return {
      movimientoId: movimiento.id,
      deltaBase: plan.deltaBase,
      recuperadoBase: plan.recuperadoBase,
      motivo: plan.motivo,
      imputable: plan.imputable,
      seRecupera: false,
    };
  },
});

/** El motivo tiene que existir y estar activo. Texto libre no es un motivo. */
async function cargarMotivo(
  ctx: ContextoComando<Transaccion>,
  clave: string,
): Promise<MotivoDeMerma> {
  const fila = await ctx.paso('cargar_motivo', () =>
    ctx.tx
      .selectFrom('motivos_merma')
      .select(['clave', 'etiqueta', 'giro', 'imputable', 'activo'])
      .where('clave', '=', clave)
      .executeTakeFirst(),
  );

  if (fila === undefined) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      `«${clave}» no es un motivo de merma. Sin motivo, la merma y el robo son el mismo número.`,
    );
  }

  return {
    clave: fila.clave,
    etiqueta: fila.etiqueta,
    giro: fila.giro,
    imputable: fila.imputable,
    activo: fila.activo,
  };
}

/** Descuenta con guarda atómica. `delta` viene NEGATIVO del dominio. */
/** Baja la existencia sin dejarla negativa: lo que no hay no se merma ni se devuelve. */
export async function descontarExistencia(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  insumoId: string,
  delta: string,
): Promise<void> {
  const resultado = await ctx.paso('descontar_existencia', () =>
    sql<{ cantidad: string }>`
      update existencias
         set cantidad = cantidad + ${delta}, actualizado_en = now()
       where organizacion_id = ${ctx.ambito.organizacionId}
         and almacen_id = ${almacenId}
         and insumo_id = ${insumoId}
         and cantidad + ${delta} >= 0
      returning cantidad
    `.execute(ctx.tx),
  );

  if (resultado.rows.length !== 1) {
    throw new ErrorDominio(
      'STOCK_INSUFICIENTE',
      'No puedes mermar más de lo que hay: revisa la cantidad o cuenta primero.',
      { insumoId },
    );
  }
}
