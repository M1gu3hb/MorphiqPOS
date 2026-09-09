import 'server-only';

import type { Kysely } from 'kysely';

import type { Transaccion } from '../cliente.ts';
import type { Esquema } from '../esquema.ts';

/**
 * Sesión de caja y sus movimientos (F1.1-A-08).
 *
 * Corrige P2-10: en la fuente, `cortes_caja` guardaba `total_ventas`,
 * `total_efectivo` y `numero_ventas` como columnas, y nunca se actualizaban al
 * cobrar. El corte mostraba ceros con la caja llena.
 *
 * Aquí **no se guarda ningún total**. El saldo esperado es una suma sobre
 * `movimientos_caja`, y por eso no puede desincronizarse: no hay una segunda
 * copia que mantener.
 */

export interface SesionAbierta {
  readonly id: string;
  readonly sucursalId: string;
  readonly terminalId: string;
  readonly fondoInicialCentavos: bigint;
  readonly abiertaEn: Date;
}

export async function sesionAbiertaDeTerminal(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  terminalId: string,
): Promise<SesionAbierta | null> {
  const fila = await db
    .selectFrom('sesiones_caja')
    .select([
      'id',
      'sucursal_id as sucursalId',
      'terminal_id as terminalId',
      'fondo_inicial_centavos as fondoInicialCentavos',
      'abierta_en as abiertaEn',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('terminal_id', '=', terminalId)
    .where('estado', '=', 'abierta')
    .executeTakeFirst();

  return fila ?? null;
}

export async function abrirSesion(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly sucursalId: string;
    readonly terminalId: string;
    readonly empleadoAbreId: string;
    readonly fondoInicialCentavos: bigint;
  },
): Promise<string> {
  const fila = await tx
    .insertInto('sesiones_caja')
    .values({
      organizacion_id: datos.organizacionId,
      sucursal_id: datos.sucursalId,
      terminal_id: datos.terminalId,
      empleado_abre_id: datos.empleadoAbreId,
      fondo_inicial_centavos: datos.fondoInicialCentavos,
      estado: 'abierta',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return fila.id;
}

export interface NuevoMovimiento {
  readonly organizacionId: string;
  readonly sesionCajaId: string;
  readonly tipo: string;
  /** Con signo: entrada positiva, salida negativa. */
  readonly montoCentavos: bigint;
  readonly referenciaTipo: string | null;
  readonly referenciaId: string | null;
  readonly empleadoId: string | null;
  readonly motivo: string | null;
}

export async function registrarMovimiento(
  tx: Transaccion,
  movimiento: NuevoMovimiento,
): Promise<void> {
  await tx
    .insertInto('movimientos_caja')
    .values({
      organizacion_id: movimiento.organizacionId,
      sesion_caja_id: movimiento.sesionCajaId,
      tipo: movimiento.tipo,
      monto_centavos: movimiento.montoCentavos,
      referencia_tipo: movimiento.referenciaTipo,
      referencia_id: movimiento.referenciaId,
      empleado_id: movimiento.empleadoId,
      motivo: movimiento.motivo,
    })
    .execute();
}

export interface ArqueoDerivado {
  readonly fondoInicialCentavos: bigint;
  /** Suma de TODOS los movimientos, con su signo. Incluye la apertura. */
  readonly movimientosCentavos: bigint;
  /** Sólo lo cobrado en efectivo: es lo que debería estar en el cajón. */
  readonly efectivoEsperadoCentavos: bigint;
  readonly ventasCentavos: bigint;
  readonly numeroVentas: number;
}

/**
 * Deriva el arqueo de una sesión. Nada de esto se guarda.
 *
 * **El esperado es la suma de `movimientos_caja`, y sólo eso.** Ahí entran el
 * fondo (`apertura`), cada venta cobrada en efectivo (`venta`) y los gastos y
 * retiros con su signo negativo. Los pagos con tarjeta o transferencia no
 * generan movimiento: no hay billetes que contar por ellos, y sumarlos hace que
 * el corte le pida al cajero un efectivo que nunca entró.
 *
 * La tentación es `fondo + ventas en efectivo`, y está mal dos veces: cuenta el
 * fondo dos veces —ya viene como movimiento de apertura— y **no resta los
 * retiros**, así que el cajero que sacó dinero con permiso aparece con un
 * faltante por esa cantidad.
 *
 * El acoplamiento a cambio es explícito: `abrirCaja` DEBE registrar el fondo
 * como movimiento y `cobrarOrden` DEBE registrar el efectivo cobrado. Si uno de
 * los dos deja de hacerlo, el corte miente.
 */
export async function arqueoDeSesion(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<ArqueoDerivado> {
  const sesion = await db
    .selectFrom('sesiones_caja')
    .select(['fondo_inicial_centavos as fondoInicialCentavos'])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', sesionCajaId)
    .executeTakeFirstOrThrow();

  const movimientos = await db
    .selectFrom('movimientos_caja')
    .select((eb) => [eb.fn.sum<string>('monto_centavos').as('suma')])
    .where('organizacion_id', '=', organizacionId)
    .where('sesion_caja_id', '=', sesionCajaId)
    .executeTakeFirst();

  const pagos = await db
    .selectFrom('pagos')
    .select((eb) => [
      eb.fn.sum<string>('monto_centavos').as('total'),
      // `count(distinct orden_id)` y no `count(id)`: un pago mixto son varias
      // filas y contarlas convertiría una venta en tres.
      eb.fn.count<string>('orden_id').distinct().as('cuantas'),
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('sesion_caja_id', '=', sesionCajaId)
    .where('estado', '=', 'confirmado')
    .executeTakeFirst();

  return {
    fondoInicialCentavos: sesion.fondoInicialCentavos,
    movimientosCentavos: aBigint(movimientos?.suma),
    efectivoEsperadoCentavos: aBigint(movimientos?.suma),
    ventasCentavos: aBigint(pagos?.total),
    numeroVentas: Number(pagos?.cuantas ?? '0'),
  };
}

export async function cerrarSesion(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly sesionCajaId: string;
    readonly empleadoCierraId: string;
    readonly efectivoContadoCentavos: bigint;
    readonly notasCierre: string | null;
    readonly ahora: Date;
  },
): Promise<number> {
  const resultado = await tx
    .updateTable('sesiones_caja')
    .set({
      estado: 'cerrada',
      cerrada_en: datos.ahora,
      empleado_cierra_id: datos.empleadoCierraId,
      efectivo_contado_centavos: datos.efectivoContadoCentavos,
      notas_cierre: datos.notasCierre,
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.sesionCajaId)
    // Cerrar una sesión ya cerrada no debe sobrescribir el arqueo original.
    .where('estado', '=', 'abierta')
    .executeTakeFirst();

  return Number(resultado.numUpdatedRows);
}

/**
 * `SUM` de Postgres devuelve `numeric`, y el parser de `cliente.ts` lo entrega
 * como cadena para no perder precisión. Una suma vacía devuelve null.
 */
function aBigint(valor: string | null | undefined): bigint {
  if (valor === null || valor === undefined || valor === '') return 0n;
  return BigInt(valor.split('.')[0] ?? '0');
}

export interface MovimientoDeCorte {
  readonly tipo: string;
  readonly montoCentavos: bigint;
  readonly motivo: string | null;
  readonly registradoEn: Date;
}

/**
 * Los movimientos manuales de la sesión: gastos, retiros, depósitos, ajustes.
 *
 * **Las ventas se excluyen a propósito.** Son cientos en un turno y no aportan
 * nada al corte una por una: para eso está el total. Lo que el cajero necesita
 * revisar renglón a renglón es lo que él mismo metió o sacó del cajón.
 */
export async function movimientosDeCorte(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  sesionCajaId: string,
): Promise<readonly MovimientoDeCorte[]> {
  return db
    .selectFrom('movimientos_caja')
    .select(['tipo', 'monto_centavos as montoCentavos', 'motivo', 'created_at as registradoEn'])
    .where('organizacion_id', '=', organizacionId)
    .where('sesion_caja_id', '=', sesionCajaId)
    .where('tipo', '!=', 'venta')
    .orderBy('created_at')
    .limit(200)
    .execute();
}
