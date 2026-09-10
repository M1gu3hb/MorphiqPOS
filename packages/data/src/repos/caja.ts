import 'server-only';

import { sql, type Kysely } from 'kysely';

import type { Transaccion } from '../cliente.ts';
import type { Esquema } from '../esquema.ts';
import { tomarFolio } from './folios.ts';

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
  /** La serie del corte. La base la trae con `default 'CC'` (045 §167). */
  readonly serie: string;
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
      'serie',
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

/**
 * Cierra la caja Y LE PONE FOLIO.
 *
 * ── Sin el folio, NINGUNA caja se podía cerrar ─────────────────────────────
 * `045_restaurante.sql:182` añadió `check (estado <> 'cerrada' or folio is not
 * null)`: un corte cerrado sin folio no se puede reclamar ni auditar, así que
 * la base lo prohíbe. Pero este `update` marcaba `estado = 'cerrada'` y dejaba
 * el folio en nulo, de modo que TODO cierre abortaba con 23514 y el cajero veía
 * «Algo falló de nuestro lado».
 *
 * Es el mismo defecto que el `cerrada_en` que faltaba en `marcarPagada`, y se
 * escapó por lo mismo: los dobles en memoria de las pruebas no modelan `check`,
 * así que la suite entera pasaba con la caja incerrable. Apareció al cerrar una
 * caja de verdad contra Postgres.
 *
 * El folio se toma DENTRO de esta transacción, con el mismo `tomarFolio` del
 * cobro. Si el `update` no encuentra fila —alguien la cerró antes—, el comando
 * lanza y la transacción revierte: el folio consumido se devuelve con ella, y
 * no queda un hueco en la numeración del corte.
 */
export async function cerrarSesion(
  tx: Transaccion,
  datos: {
    readonly organizacionId: string;
    readonly sucursalId: string;
    readonly sesionCajaId: string;
    readonly serie: string;
    readonly empleadoCierraId: string;
    readonly efectivoContadoCentavos: bigint;
    readonly notasCierre: string | null;
    readonly ahora: Date;
  },
): Promise<number> {
  const { folio } = await tomarFolio(tx, datos.organizacionId, datos.sucursalId, datos.serie);

  const resultado = await tx
    .updateTable('sesiones_caja')
    .set({
      estado: 'cerrada',
      cerrada_en: datos.ahora,
      folio,
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

// ───────────────────────────────────────────────────────────────────────────
// Eliminar un corte cerrado (F1-02 · `Registros.jsx:89`)
//
// Su pantalla borra con `api.entidades.CorteCaja.delete(c.id)` detrás de un
// `if (!isAdmin) return`, y `isAdmin` es una variable del NAVEGADOR. Lo que
// falta aquí abajo no es el borrado —eso es una línea— sino las tres lecturas
// que deciden si borrar está permitido, y que tienen que ocurrir DENTRO de la
// misma transacción que borra.
// ───────────────────────────────────────────────────────────────────────────

/** Un corte tal como está guardado. No deriva nada: es lo que se va a perder. */
export interface CorteGuardado {
  readonly id: string;
  readonly sucursalId: string;
  readonly terminalId: string;
  readonly estado: string;
  readonly serie: string;
  readonly folio: bigint | null;
  readonly abiertaEn: Date;
  readonly cerradaEn: Date | null;
  readonly fondoInicialCentavos: bigint;
  readonly efectivoContadoCentavos: bigint | null;
  readonly efectivoRetiradoCentavos: bigint | null;
}

/**
 * Un corte de ESTA organización, por id.
 *
 * Acotado por `organizacion_id` y no sólo por `id`: un corte de otro negocio
 * tiene que verse igual que uno que no existe. Decir «existe, pero no es tuyo»
 * convierte el endpoint en un detector de identificadores ajenos.
 */
export async function corteDeOrganizacion(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  corteId: string,
): Promise<CorteGuardado | null> {
  const fila = await db
    .selectFrom('sesiones_caja')
    .select([
      'id',
      'sucursal_id as sucursalId',
      'terminal_id as terminalId',
      'estado',
      'serie',
      'folio',
      'abierta_en as abiertaEn',
      'cerrada_en as cerradaEn',
      'fondo_inicial_centavos as fondoInicialCentavos',
      'efectivo_contado_centavos as efectivoContadoCentavos',
      'efectivo_retirado_centavos as efectivoRetiradoCentavos',
    ])
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', corteId)
    .executeTakeFirst();

  return fila ?? null;
}

/** Lo que apunta a un corte. Cero en las seis = se puede borrar. */
export interface ReferenciasDelCorte {
  /** `ordenes.sesion_caja_id`. Las ventas que se cobraron en ese turno. */
  readonly ventas: number;
  /** `pagos.sesion_caja_id`. Puede haber pago sin orden viva: se cuenta aparte. */
  readonly pagos: number;
  /** `movimientos_caja.sesion_caja_id`, SIN contar la apertura. Ver abajo. */
  readonly movimientos: number;
  /** `gastos.sesion_caja_id`. Lo que salió del cajón con comprobante. */
  readonly gastos: number;
  /** `cortes_turno.sesion_caja_id`. Arqueos intermedios que alguien firmó. */
  readonly cortesTurno: number;
  /** Liquidaciones de propina que se llevaron ventas de ese turno. */
  readonly liquidaciones: number;
}

interface FilaDeConteos {
  readonly ventas: number;
  readonly pagos: number;
  readonly movimientos: number;
  readonly gastos: number;
  readonly cortes_turno: number;
  readonly liquidaciones: number;
}

/**
 * Cuenta, en UNA sola consulta, todo lo que impide borrar el corte.
 *
 * ── Por qué se cuenta en vez de intentar el `delete` y ver qué pasa ─────────
 * Las llaves foráneas a `sesiones_caja` son `on delete restrict`
 * (`003_venta_caja_inventario.sql:111,255,301` y `045_restaurante.sql:562,706`).
 * Sin este conteo, borrar un corte con ventas aborta con un `23503`, y lo que
 * llega a la pantalla del dueño es «update or delete on table "sesiones_caja"
 * violates foreign key constraint». Eso no dice cuántas ventas hay ni qué
 * hacer. El conteo convierte la misma negativa en una frase con números.
 *
 * ── La apertura no cuenta, y es deliberado ─────────────────────────────────
 * `caja.abrir` escribe el fondo inicial como un movimiento de tipo `apertura`
 * para que el esperado sea una SUMA de movimientos y no una fórmula con ramas
 * (ver `arqueoDeSesion`, arriba). Ese renglón no es actividad del turno: es el
 * propio corte contado otra vez. Si contara, TODO corte tendría al menos una
 * referencia y este comando no podría borrar nunca nada — sería una función que
 * siempre falla, que es peor que no tenerla.
 *
 * ── Las liquidaciones se cuentan por `ordenes` ─────────────────────────────
 * `liquidaciones_propina` no tiene `sesion_caja_id`: el vínculo va al revés,
 * por `ordenes.propina_liquidacion_id` (`045_restaurante.sql:38`, y el
 * `comment on table` lo dice: «venta_ids no se guardan: se derivan»). Se cuenta
 * aunque quede subsumido por `ventas`, porque el número que el dueño necesita
 * leer es «esto ya se repartió entre los meseros», y eso pesa más que «hay
 * ventas».
 */
export async function referenciasDelCorte(
  db: Kysely<Esquema> | Transaccion,
  organizacionId: string,
  corteId: string,
): Promise<ReferenciasDelCorte> {
  const resultado = await sql<FilaDeConteos>`
    select
      (select count(*)::int from ordenes
        where organizacion_id = ${organizacionId} and sesion_caja_id = ${corteId}) as ventas,
      (select count(*)::int from pagos
        where organizacion_id = ${organizacionId} and sesion_caja_id = ${corteId}) as pagos,
      (select count(*)::int from movimientos_caja
        where organizacion_id = ${organizacionId} and sesion_caja_id = ${corteId}
          and tipo <> 'apertura') as movimientos,
      (select count(*)::int from gastos
        where organizacion_id = ${organizacionId} and sesion_caja_id = ${corteId}) as gastos,
      (select count(*)::int from cortes_turno
        where organizacion_id = ${organizacionId} and sesion_caja_id = ${corteId}) as cortes_turno,
      (select count(distinct propina_liquidacion_id)::int from ordenes
        where organizacion_id = ${organizacionId} and sesion_caja_id = ${corteId}
          and propina_liquidacion_id is not null) as liquidaciones
  `.execute(db);

  const fila = resultado.rows[0];
  // Seis subconsultas escalares devuelven siempre una fila. Si no la hay, la
  // consulta no es la que se escribió: se falla en vez de suponer que hay cero
  // referencias, porque suponer cero aquí AUTORIZA un borrado.
  if (fila === undefined) {
    throw new Error(
      'El conteo de referencias del corte no devolvió ninguna fila. ' +
        'Sin ese número no se puede decidir si el corte se puede borrar.',
    );
  }

  return {
    ventas: fila.ventas,
    pagos: fila.pagos,
    movimientos: fila.movimientos,
    gastos: fila.gastos,
    cortesTurno: fila.cortes_turno,
    liquidaciones: fila.liquidaciones,
  };
}

/**
 * Borra los movimientos de apertura del corte. Devuelve cuántos.
 *
 * Va antes que el corte porque la llave foránea es `restrict`: los hijos
 * primero, igual que el orden de `TABLAS_POR_SECCION` en el mantenimiento.
 * Alcanza sólo a `apertura` a propósito: cualquier otro tipo ya bloqueó la
 * operación en `referenciasDelCorte`, así que este `delete` no puede llevarse
 * un movimiento que describa dinero que entró o salió de verdad.
 */
export async function borrarMovimientosDeApertura(
  tx: Transaccion,
  organizacionId: string,
  corteId: string,
): Promise<number> {
  const resultado = await tx
    .deleteFrom('movimientos_caja')
    .where('organizacion_id', '=', organizacionId)
    .where('sesion_caja_id', '=', corteId)
    .where('tipo', '=', 'apertura')
    .executeTakeFirst();

  return Number(resultado.numDeletedRows);
}

/**
 * Borra el corte, y sólo si sigue cerrado. Devuelve cuántas filas se fueron.
 *
 * El `where estado = 'cerrada'` repite en el `delete` la comprobación que el
 * comando ya hizo al leer, y no sobra: entre la lectura y el borrado cabe otra
 * transacción. Cero filas significa que el mundo cambió mientras tanto, y el
 * comando lo traduce; sin esta cláusula borraría algo que ya no es lo que leyó.
 */
export async function borrarCorteCerrado(
  tx: Transaccion,
  organizacionId: string,
  corteId: string,
): Promise<number> {
  const resultado = await tx
    .deleteFrom('sesiones_caja')
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', corteId)
    .where('estado', '=', 'cerrada')
    .executeTakeFirst();

  return Number(resultado.numDeletedRows);
}
