import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoTraspasos, type Transaccion } from '@morphiqpos/data';
import { deEscalaCompleta, enEscalaCompleta } from '@morphiqpos/domain/inventario';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-105 · Traspaso entre almacenes, con sus DOS mitades.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 * `packages/data/src/repos/traspasos.ts` existía, con su SQL correcto y sus dos
 * `check` bien atendidos, **sin una sola prueba y sin ningún comando que lo
 * llamara**. Un repositorio que nadie invoca no es inventario construido: es
 * SQL guardado.
 *
 * ── Por qué son dos comandos y no uno ──────────────────────────────────────
 * Porque entre enviar y recibir pasa el camión. Un solo comando obligaría a
 * registrar el traspaso cuando ya llegó, y entonces el producto que está en
 * tránsito no existe en ningún almacén durante horas: ni en el que salió ni en
 * el que todavía no lo recibe. Eso es lo que hace que un traspaso cuadre en el
 * papel y no en el estante.
 *
 * ── Y por qué el stock se mueve en las DOS ─────────────────────────────────
 * Enviar DESCUENTA del origen. Recibir SUMA al destino, y suma **lo que de
 * verdad llegó**, que puede ser menos. La diferencia se registra con su motivo:
 * sin ella, el faltante se descubre en el conteo del mes siguiente, cuando ya
 * nadie recuerda de qué traspaso salió.
 */

const ROLES = ['gerente', 'administrador', 'dueno', 'almacen'] as const;

const CANTIDAD = z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/, 'Usa hasta cuatro decimales.');

export const entradaEnviarTraspaso = z.object({
  almacenOrigen: z.uuid(),
  almacenDestino: z.uuid(),
  motivo: z.string().trim().min(3).max(200).optional(),
  lineas: z
    .array(
      z.object({
        insumoId: z.uuid(),
        cantidad: CANTIDAD,
        unidad: z.string().trim().min(1).max(20),
      }),
    )
    .min(1)
    .max(200),
});

export interface ResultadoEnvio {
  readonly traspasoId: string;
  readonly lineas: number;
  readonly movimientos: readonly string[];
}

export const enviarTraspaso = definirComando<
  Transaccion,
  typeof entradaEnviarTraspaso,
  ResultadoEnvio
>({
  nombre: 'inventario.enviar_traspaso',
  entidad: 'traspaso',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  modulo: 'movimientos_inventario',
  entrada: entradaEnviarTraspaso,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    await comprobarAlmacenes(ctx, [entrada.almacenOrigen, entrada.almacenDestino]);

    const insumos = new Set(entrada.lineas.map((l) => l.insumoId));
    if (insumos.size !== entrada.lineas.length) {
      // La tabla tiene `unique (traspaso_id, insumo_id)`: dos renglones del
      // mismo insumo reventarían con un 23505 después de haber descontado el
      // primero. Se rechaza antes de tocar el stock.
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Hay dos renglones del mismo artículo: júntalos en uno.',
      );
    }

    const creado = await ctx.paso('crear_traspaso', () =>
      repoTraspasos.enviarTraspaso(ctx.tx, {
        organizacionId,
        almacenOrigen: entrada.almacenOrigen,
        almacenDestino: entrada.almacenDestino,
        empleadoId: empleoId,
        motivo: entrada.motivo ?? null,
        lineas: entrada.lineas.map((l) => ({
          insumoId: l.insumoId,
          cantidad: l.cantidad,
          unidad: l.unidad,
        })),
        ahora: ctx.ahora,
      }),
    );

    const movimientos: string[] = [];
    for (const linea of entrada.lineas) {
      const salida = enEscalaCompleta(-deEscalaCompleta(linea.cantidad));
      await moverExistencia(ctx, entrada.almacenOrigen, linea.insumoId, salida);

      const movimiento = await ctx.paso('anotar_salida', () =>
        ctx.tx
          .insertInto('movimientos_stock')
          .values({
            organizacion_id: organizacionId,
            almacen_id: entrada.almacenOrigen,
            insumo_id: linea.insumoId,
            tipo: 'traspaso_salida',
            cantidad: salida,
            unidad: linea.unidad,
            referencia_tipo: 'traspaso',
            referencia_id: creado.traspasoId,
            empleado_id: empleoId,
            motivo: entrada.motivo ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );
      movimientos.push(movimiento.id);
    }

    ctx.auditar({
      entidadId: creado.traspasoId,
      payload: {
        origen: entrada.almacenOrigen,
        destino: entrada.almacenDestino,
        lineas: creado.lineas,
      },
    });

    return { traspasoId: creado.traspasoId, lineas: creado.lineas, movimientos };
  },
});

export const entradaRecibirTraspaso = z.object({
  traspasoId: z.uuid(),
  recibido: z
    .array(z.object({ insumoId: z.uuid(), cantidad: CANTIDAD, unidad: z.string().trim().min(1) }))
    .min(1)
    .max(200),
  motivoDiferencia: z.string().trim().min(3).max(200).optional(),
});

export interface ResultadoRecepcion {
  readonly traspasoId: string;
  /** Los insumos donde lo recibido no coincide con lo enviado. */
  readonly diferencias: readonly string[];
  readonly movimientos: readonly string[];
}

export const recibirTraspaso = definirComando<
  Transaccion,
  typeof entradaRecibirTraspaso,
  ResultadoRecepcion
>({
  nombre: 'inventario.recibir_traspaso',
  entidad: 'traspaso',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  modulo: 'movimientos_inventario',
  entrada: entradaRecibirTraspaso,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const traspaso = await ctx.paso('cargar_traspaso', () =>
      ctx.tx
        .selectFrom('traspasos')
        .select(['id', 'almacen_destino', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.traspasoId)
        .executeTakeFirst(),
    );
    if (traspaso === undefined) {
      throw new ErrorDominio('INVENTARIO_INVALIDO', 'Ese traspaso no existe en este negocio.');
    }

    const recibido = await ctx.paso('marcar_recibido', () =>
      repoTraspasos.recibirTraspaso(ctx.tx, {
        organizacionId,
        traspasoId: entrada.traspasoId,
        empleadoId: empleoId,
        recibido: entrada.recibido.map((r) => ({ insumoId: r.insumoId, cantidad: r.cantidad })),
        ahora: ctx.ahora,
      }),
    );

    const movimientos: string[] = [];
    for (const linea of entrada.recibido) {
      const cantidad = deEscalaCompleta(linea.cantidad);
      // Un renglón que llegó en cero no genera movimiento: un movimiento de
      // cero es un renglón del kardex que no dice nada. Lo que SÍ dice algo es
      // la diferencia, y ésa ya la devuelve el repositorio.
      if (cantidad === 0n) continue;

      const entradaTexto = enEscalaCompleta(cantidad);
      await moverExistencia(ctx, traspaso.almacen_destino, linea.insumoId, entradaTexto);

      const movimiento = await ctx.paso('anotar_entrada', () =>
        ctx.tx
          .insertInto('movimientos_stock')
          .values({
            organizacion_id: organizacionId,
            almacen_id: traspaso.almacen_destino,
            insumo_id: linea.insumoId,
            tipo: 'traspaso_entrada',
            cantidad: entradaTexto,
            unidad: linea.unidad,
            referencia_tipo: 'traspaso',
            referencia_id: entrada.traspasoId,
            empleado_id: empleoId,
            motivo: entrada.motivoDiferencia ?? null,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );
      movimientos.push(movimiento.id);
    }

    ctx.auditar({
      entidadId: entrada.traspasoId,
      payload: {
        diferencias: recibido.diferencias.length,
        motivo: entrada.motivoDiferencia ?? null,
      },
    });

    return {
      traspasoId: entrada.traspasoId,
      diferencias: recibido.diferencias,
      movimientos,
    };
  },
});

/** Los dos almacenes tienen que ser de ESTA organización. Es la guarda de R16. */
async function comprobarAlmacenes(
  ctx: ContextoComando<Transaccion>,
  ids: readonly string[],
): Promise<void> {
  const filas = await ctx.paso('cargar_almacenes', () =>
    ctx.tx
      .selectFrom('almacenes')
      .select(['id'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('activo', '=', true)
      .where('id', 'in', [...ids])
      .execute(),
  );
  if (filas.length !== new Set(ids).size) {
    throw new ErrorDominio(
      'INVENTARIO_INVALIDO',
      'Alguno de los dos almacenes no existe o no está activo en este negocio.',
    );
  }
}

/**
 * Mueve la existencia con guarda atómica, igual que el conteo.
 *
 * `delta` viene firmado. La guarda `cantidad + delta >= 0` está en el mismo
 * `update` a propósito: leer primero y decidir después deja una ventana en la
 * que otra venta se lleva lo que se iba a traspasar.
 */
async function moverExistencia(
  ctx: ContextoComando<Transaccion>,
  almacenId: string,
  insumoId: string,
  delta: string,
): Promise<void> {
  const resultado = await ctx.paso('mover_existencia', () =>
    sql<{ cantidad: string }>`
      insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
      values (${ctx.ambito.organizacionId}, ${almacenId}, ${insumoId}, 0)
      on conflict (almacen_id, insumo_id) do nothing
    `
      .execute(ctx.tx)
      .then(() =>
        sql<{ cantidad: string }>`
          update existencias
             set cantidad = cantidad + ${delta}, actualizado_en = now()
           where organizacion_id = ${ctx.ambito.organizacionId}
             and almacen_id = ${almacenId}
             and insumo_id = ${insumoId}
             and cantidad + ${delta} >= 0
          returning cantidad
        `.execute(ctx.tx),
      ),
  );

  if (resultado.rows.length !== 1) {
    throw new ErrorDominio(
      'STOCK_INSUFICIENTE',
      'No hay suficiente en el almacén de origen para traspasar eso.',
      { insumoId },
    );
  }
}
