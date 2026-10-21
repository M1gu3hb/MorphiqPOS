import type { Esquema, Transaccion } from '@morphiqpos/data';
import { deDiezmilesimas } from '@morphiqpos/domain/dinero';
import { sql, type InsertObject } from 'kysely';

import type { ContextoDeHistorial, EstadoDelDia, PlanDelDia } from './historial-tipos.ts';

/**
 * Lo que se escribe en la base por cada día, y lo que se lee antes de planearlo.
 *
 * ── Por qué por lotes ──────────────────────────────────────────────────────
 * Esto corre dentro de una función de Vercel contra Supabase, con unos 5 a 10 ms de ida y
 * vuelta. Un día son unas 700 filas; escribirlas una por una serían 700 viajes, o sea siete
 * segundos por día. Aquí cada TABLA es una sentencia (o unas pocas, si el lote excede los
 * parámetros que Postgres admite), y el día entero son unas 25 idas y vueltas.
 *
 * ── Y por qué el stock se escribe como el cobro lo escribe ─────────────────
 * Cada movimiento del ledger es una fila insertada, y la existencia sube o baja con
 * `cantidad + delta` en una sola sentencia por día: nunca se escribe un saldo absoluto
 * (R13). El saldo que queda es la suma del ledger, no una cifra puesta a mano.
 */

/** Postgres admite 65 535 parámetros por sentencia; se queda muy por debajo. */
const PARAMETROS_POR_SENTENCIA = 20_000;

export const SERIES_DE_FOLIO = { orden: 'A', caja: 'CC', turno: 'CT' } as const;

/** La acción con que cada día sembrado queda en la auditoría. */
export const ACCION_DE_AUDITORIA = 'presentacion.sembrar_historial';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T ata la tabla al tipo de su lote.
async function insertarPorLotes<T extends keyof Esquema>(
  tx: Transaccion,
  tabla: T,
  filas: readonly object[],
): Promise<void> {
  const primera = filas[0];
  if (primera === undefined) return;
  const columnas = Math.max(...filas.map((f) => Object.keys(f).length));
  const tamano = Math.max(1, Math.floor(PARAMETROS_POR_SENTENCIA / columnas));
  for (let desde = 0; desde < filas.length; desde += tamano) {
    const lote = filas.slice(desde, desde + tamano) as InsertObject<Esquema, T>[];
    await tx.insertInto(tabla).values(lote).execute();
  }
}

/** Los próximos folios, el saldo del ledger de cada insumo y lo que dejó la última caja cerrada. */
export async function leerEstadoDelDia(
  tx: Transaccion,
  ctx: ContextoDeHistorial,
  inicioDelDia: Date,
): Promise<EstadoDelDia> {
  const { organizacionId, sucursalId, almacenId, terminalId } = ctx;

  // Las tres series nacen en 1 si la sucursal nunca ha cobrado, y quedan BLOQUEADAS hasta
  // confirmar: un cobro real que llegue a la vez espera aquí y toma el folio siguiente.
  await sql`
    insert into folios (organizacion_id, sucursal_id, serie, siguiente)
    values (${organizacionId}, ${sucursalId}, ${SERIES_DE_FOLIO.orden}, 1),
           (${organizacionId}, ${sucursalId}, ${SERIES_DE_FOLIO.caja}, 1),
           (${organizacionId}, ${sucursalId}, ${SERIES_DE_FOLIO.turno}, 1)
    on conflict (organizacion_id, sucursal_id, serie) do nothing
  `.execute(tx);
  const folios = await tx
    .selectFrom('folios')
    .select(['serie', 'siguiente'])
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('serie', 'in', Object.values(SERIES_DE_FOLIO))
    .forUpdate()
    .execute();
  const siguienteDe = (serie: string): bigint => {
    const fila = folios.find((f) => f.serie === serie);
    if (fila === undefined) throw new Error(`No se pudo leer el folio de la serie ${serie}.`);
    return fila.siguiente;
  };

  // El saldo se toma del LEDGER hasta el inicio del día, no de la proyección. La diferencia es
  // lo que mantiene el kardex honesto: el inventario inicial de un espejo recién clonado se
  // anotó HOY, y el historial es de días pasados. Con la proyección, el primer día "vería"
  // existencia que en el ledger todavía no hay y el saldo corrido del kardex nacería negativo.
  const existencias = await tx
    .selectFrom('movimientos_stock')
    .select(['insumo_id', sql<string>`sum(cantidad)`.as('cantidad')])
    .where('organizacion_id', '=', organizacionId)
    .where('almacen_id', '=', almacenId)
    .where('created_at', '<', inicioDelDia)
    .groupBy('insumo_id')
    .execute();

  const ultimaCaja = await tx
    .selectFrom('sesiones_caja')
    .select(['efectivo_contado_centavos', 'efectivo_retirado_centavos'])
    .where('organizacion_id', '=', organizacionId)
    .where('terminal_id', '=', terminalId)
    .where('estado', '=', 'cerrada')
    .where('abierta_en', '<', inicioDelDia)
    .orderBy('cerrada_en', 'desc')
    .limit(1)
    .executeTakeFirst();
  const contado = ultimaCaja?.efectivo_contado_centavos ?? null;
  const retirado = ultimaCaja?.efectivo_retirado_centavos ?? null;

  return {
    folioOrden: siguienteDe(SERIES_DE_FOLIO.orden),
    folioCaja: siguienteDe(SERIES_DE_FOLIO.caja),
    folioTurno: siguienteDe(SERIES_DE_FOLIO.turno),
    existencias: new Map(
      existencias.map((e) => [e.insumo_id, enDiezmilesimas(e.cantidad)] as const),
    ),
    fondoDejadoCentavos: contado !== null && retirado !== null ? contado - retirado : null,
  };
}

/** `numeric(14,4)` llega como texto: '280.5000' → 2805000n. */
function enDiezmilesimas(texto: string): bigint {
  const negativa = texto.startsWith('-');
  const [enteros = '0', decimales = ''] = (negativa ? texto.slice(1) : texto).split('.');
  const valor = BigInt(enteros) * 10_000n + BigInt(decimales.padEnd(4, '0').slice(0, 4));
  return negativa ? -valor : valor;
}

/** Escribe el plan del día, en el orden que piden las llaves foráneas. */
export async function escribirPlan(
  tx: Transaccion,
  ctx: ContextoDeHistorial,
  plan: PlanDelDia,
): Promise<void> {
  // La caja primero: sus filas cuelgan de ella. Cerrada desde su nacimiento, así que el
  // disparador de "no se cierra con pedidos en la fila" —que vigila el UPDATE a 'cerrada'— no
  // tiene nada que vigilar: todas las comandas del plan nacen entregadas.
  await insertarPorLotes(tx, 'sesiones_caja', [plan.sesion]);
  await insertarPorLotes(tx, 'ordenes', plan.ordenes);
  await insertarPorLotes(tx, 'orden_lineas', plan.lineas);
  await insertarPorLotes(tx, 'autorizaciones_descuento', plan.autorizaciones);
  await insertarPorLotes(tx, 'pagos', plan.pagos);
  await insertarPorLotes(tx, 'movimientos_caja', plan.movimientosCaja);
  await insertarPorLotes(tx, 'comandas', plan.comandas);
  await insertarPorLotes(tx, 'comanda_items', plan.comandaItems);
  await insertarPorLotes(tx, 'compras', plan.compras);
  await insertarPorLotes(tx, 'compra_lineas', plan.compraLineas);
  await insertarPorLotes(tx, 'gastos', plan.gastos);
  await insertarPorLotes(tx, 'movimientos_stock', plan.movimientosStock);
  await insertarPorLotes(tx, 'cortes_turno', plan.cortesTurno);
  await insertarPorLotes(tx, 'conteos_denominacion', plan.conteos);
  await aplicarExistencias(tx, ctx, plan);
  await avanzarFolios(tx, ctx, plan);
  await anotarEnLaAuditoria(tx, ctx, plan);
}

/**
 * El rastro de que este día NO ocurrió: lo sembró el historial de presentación.
 *
 * La auditoría es de solo agregar y sobrevive al reseteo de una demostración; una fila por día
 * sembrado deja dicho, para quien mire después, que esas ventas son de mentira y de dónde salen.
 */
async function anotarEnLaAuditoria(
  tx: Transaccion,
  ctx: ContextoDeHistorial,
  plan: PlanDelDia,
): Promise<void> {
  await tx
    .insertInto('auditoria')
    .values({
      organizacion_id: ctx.organizacionId,
      accion: ACCION_DE_AUDITORIA,
      entidad: 'sesion_caja',
      entidad_id: plan.sesion.id,
      payload: JSON.stringify({
        v: 1,
        comando: ACCION_DE_AUDITORIA,
        sintetico: true,
        dia: plan.dia,
        semilla: ctx.semilla,
        tickets: plan.resumen.tickets,
        ventasCentavos: plan.resumen.ventasCentavos.toString(),
        propinasCentavos: plan.resumen.propinasCentavos.toString(),
        compras: plan.resumen.compras,
        gastos: plan.resumen.gastos,
      }),
    })
    .execute();
}

/** La existencia sigue al ledger: `cantidad + delta`, nunca un saldo absoluto. */
async function aplicarExistencias(
  tx: Transaccion,
  ctx: ContextoDeHistorial,
  plan: PlanDelDia,
): Promise<void> {
  if (plan.deltasDeExistencia.length === 0) return;
  const valores = plan.deltasDeExistencia.map(
    (d) =>
      sql`(${ctx.organizacionId}::uuid, ${ctx.almacenId}::uuid, ${d.insumoId}::uuid, ${deDiezmilesimas(d.cantidad)}::numeric)`,
  );
  await sql`
    insert into existencias (organizacion_id, almacen_id, insumo_id, cantidad)
    values ${sql.join(valores)}
    on conflict (almacen_id, insumo_id) do update
      set cantidad = existencias.cantidad + excluded.cantidad,
          actualizado_en = now()
  `.execute(tx);
}

async function avanzarFolios(
  tx: Transaccion,
  ctx: ContextoDeHistorial,
  plan: PlanDelDia,
): Promise<void> {
  const { orden, caja, turno } = plan.foliosConsumidos;
  await sql`
    update folios
       set siguiente = siguiente + case serie
             when ${SERIES_DE_FOLIO.orden} then ${orden.toString()}::bigint
             when ${SERIES_DE_FOLIO.caja} then ${caja.toString()}::bigint
             else ${turno.toString()}::bigint
           end
     where organizacion_id = ${ctx.organizacionId}
       and sucursal_id = ${ctx.sucursalId}
       and serie in (${SERIES_DE_FOLIO.orden}, ${SERIES_DE_FOLIO.caja}, ${SERIES_DE_FOLIO.turno})
  `.execute(tx);
}
