import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb, type Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { cargarContexto, candadoDelHistorial } from './historial-contexto.ts';
import { escribirPlan, leerEstadoDelDia } from './historial-escritura.ts';
import {
  ZONA_DEL_HISTORIAL,
  diaDeInstante,
  esDiaValido,
  exigirDia,
  instanteLocal,
  ventanaDeDias,
} from './historial-fechas.ts';
import { planearDia } from './historial-plan.ts';
import type { ContextoDeHistorial } from './historial-tipos.ts';

/**
 * EL HISTORIAL DE LA PRESENTACIÓN: treinta días de restaurante, coherentes de punta a punta.
 *
 * ── Para qué ───────────────────────────────────────────────────────────────
 * El «Modo presentación al cliente» opera en una organización ESPEJO: un clon del catálogo, las
 * mesas y la configuración del restaurante real. Un espejo recién clonado tiene el catálogo y
 * nada más: el Dashboard está en ceros, las gráficas vacías, Ventas y Registros sin un renglón.
 * Esto le escribe los últimos días de operación para que se vea el negocio que es.
 *
 * ── La guarda, que es lo primero ───────────────────────────────────────────
 * Solo escribe en una organización que declara ser el espejo de otra
 * (`configuracion.valores.presentacion_espejo_de`). En el negocio real —o en cualquier otro—
 * se niega ANTES de leer nada más: el historial inventa ventas, y una venta inventada en el
 * restaurante de verdad es un fraude con buena intención.
 *
 * ── Qué garantiza ──────────────────────────────────────────────────────────
 * · IDEMPOTENCIA. Cada día sembrado se anota en `configuracion.valores.presentacion_historial`
 *   en la MISMA transacción que lo siembra, bajo un candado por organización; un día anotado no
 *   se vuelve a sembrar y dos llamadas simultáneas —dos dispositivos— no lo duplican.
 * · UNA TRANSACCIÓN POR DÍA: o está el día entero, con su caja cerrada y su inventario al
 *   corriente, o no está. Una llamada interrumpida deja los días que alcanzó y el resto queda
 *   `pendiente` para la siguiente.
 * · COHERENCIA POR CONSTRUCCIÓN: ventas, pagos, propinas, caja, comandas, inventario, compras y
 *   gastos salen de UN plan que usa las mismas funciones puras que el cobro (ver
 *   `historial-plan.ts`). Nada se cuadra después: se escribe ya cuadrado.
 */

const LLAVE_DEL_ESPEJO = 'presentacion_espejo_de';
const LLAVE_DEL_HISTORIAL = 'presentacion_historial';
const MAXIMO_DE_DIAS = 120;
const SEMILLA_POR_OMISION = 2026;
const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OpcionesDeHistorial {
  /** La organización ESPEJO. */
  readonly organizacionId: string;
  /** El último día a sembrar, `YYYY-MM-DD` en America/Mexico_City. Normalmente ayer; nunca hoy. */
  readonly hastaDia: string;
  /** Cuántos días hacia atrás, contando `hastaDia`. */
  readonly dias: number;
  /** Cuántos días sembrar como mucho en esta llamada; los que falten quedan `pendientes`. */
  readonly maxDiasPorLlamada?: number;
  /** Mismo valor, mismos tickets. */
  readonly semilla?: number;
  /** El reloj, para las pruebas: decide qué es «hoy». */
  readonly ahora?: Date;
}

export interface ResultadoDeHistorial {
  /** Los días que ESTA llamada sembró, del más viejo al más reciente. */
  readonly sembrados: string[];
  /** Los días de la ventana que ya estaban sembrados. */
  readonly yaExistian: string[];
  /** Los días de la ventana que siguen sin sembrar. */
  readonly pendientes: string[];
}

function rechazo(motivo: string, mensaje: string, detalles: Record<string, string | number> = {}) {
  return new ErrorDominio('CONFIGURACION_INVALIDA', mensaje, { motivo, ...detalles });
}

function exigirOpciones(opciones: OpcionesDeHistorial): void {
  exigirDia(opciones.hastaDia, 'hastaDia');
  if (!Number.isInteger(opciones.dias) || opciones.dias < 1 || opciones.dias > MAXIMO_DE_DIAS) {
    throw rechazo('dias_invalidos', `«dias» debe ser un entero de 1 a ${String(MAXIMO_DE_DIAS)}.`, {
      recibido: String(opciones.dias),
    });
  }
  const tope = opciones.maxDiasPorLlamada;
  if (tope !== undefined && (!Number.isInteger(tope) || tope < 1)) {
    throw rechazo('tope_invalido', '«maxDiasPorLlamada» debe ser un entero positivo.');
  }
  const hoy = diaDeInstante(opciones.ahora ?? new Date(), ZONA_DEL_HISTORIAL);
  if (opciones.hastaDia >= hoy) {
    throw rechazo(
      'dia_no_pasado',
      'El historial termina AYER como mucho: hoy se está operando y no se inventa.',
      { hastaDia: opciones.hastaDia, hoy },
    );
  }
}

/** Los días ya sembrados, tal como los guarda `configuracion`. */
function diasAnotados(valores: unknown): string[] {
  if (typeof valores !== 'object' || valores === null) return [];
  const historial = (valores as Record<string, unknown>)[LLAVE_DEL_HISTORIAL];
  if (typeof historial !== 'object' || historial === null) return [];
  const dias = (historial as Record<string, unknown>)['dias'];
  return Array.isArray(dias)
    ? dias.filter((d): d is string => typeof d === 'string' && esDiaValido(d))
    : [];
}

/**
 * La guarda: ¿esta organización es un espejo? Devuelve los días ya sembrados.
 * Lee `configuracion.valores` y nada más, así que un negocio normal se rechaza sin que se
 * lea una sola fila de su operación.
 */
async function exigirEspejo(organizacionId: string): Promise<string[]> {
  const fila = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  const valores = fila?.valores;
  const real =
    typeof valores === 'object' && valores !== null
      ? (valores as Record<string, unknown>)[LLAVE_DEL_ESPEJO]
      : undefined;
  if (
    typeof real !== 'string' ||
    !FORMA_DE_UUID.test(real) ||
    real.toLowerCase() === organizacionId
  ) {
    throw rechazo(
      'no_es_espejo',
      'Esta organización no es un espejo de presentación: el historial solo se siembra en uno.',
    );
  }
  return diasAnotados(valores);
}

/** Anota el día en la configuración, de forma atómica: no lee el documento para reescribirlo. */
async function anotarDia(tx: Transaccion, organizacionId: string, dia: string): Promise<void> {
  await sql`
    update configuracion
       set valores = jsonb_set(
             valores,
             ${`{${LLAVE_DEL_HISTORIAL}}`}::text[],
             jsonb_build_object(
               'dias',
               coalesce(valores -> ${LLAVE_DEL_HISTORIAL} -> 'dias', '[]'::jsonb) || to_jsonb(${dia}::text)
             ),
             true
           ),
           version = version + 1,
           updated_at = now()
     where organizacion_id = ${organizacionId}
  `.execute(tx);
}

type Resultado = 'sembrado' | 'existia';

/** UN día: el candado, la relectura de lo sembrado, el plan, la escritura y el asiento. */
async function sembrarUnDia(ctx: ContextoDeHistorial, dia: string): Promise<Resultado> {
  return conTransaccion(async (tx) => {
    await candadoDelHistorial(tx, ctx.organizacionId);

    // Ya con el candado: lo que otra llamada acabó de sembrar se ve aquí y no se repite.
    const fila = await tx
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', ctx.organizacionId)
      .executeTakeFirst();
    if (diasAnotados(fila?.valores).includes(dia)) return 'existia';

    const estado = await leerEstadoDelDia(tx, ctx, instanteLocal(dia, 0, ctx.zona));
    await escribirPlan(tx, ctx, planearDia(ctx, estado, dia));
    await anotarDia(tx, ctx.organizacionId, dia);
    return 'sembrado';
  });
}

export async function sembrarHistorialDePresentacion(
  opciones: OpcionesDeHistorial,
): Promise<ResultadoDeHistorial> {
  exigirOpciones(opciones);
  const anotados = await exigirEspejo(opciones.organizacionId);

  const ventana = ventanaDeDias(opciones.hastaDia, opciones.dias);
  const yaExistian = new Set(ventana.filter((d) => anotados.includes(d)));
  const porSembrar = ventana.filter((d) => !yaExistian.has(d));
  if (porSembrar.length === 0)
    return { sembrados: [], yaExistian: [...yaExistian], pendientes: [] };

  const ctx = await cargarContexto(
    obtenerDb(),
    opciones.organizacionId,
    opciones.semilla ?? SEMILLA_POR_OMISION,
  );

  const sembrados: string[] = [];
  const pendientes: string[] = [];
  const tope = opciones.maxDiasPorLlamada ?? Number.POSITIVE_INFINITY;
  for (const dia of porSembrar) {
    if (sembrados.length >= tope) {
      pendientes.push(dia);
      continue;
    }
    // Del más viejo al más reciente: los folios, el fondo de la caja y el inventario siguen el
    // orden del calendario. Un día sembrado por otra llamada mientras tanto cuenta como existente.
    const resultado = await sembrarUnDia(ctx, dia);
    if (resultado === 'sembrado') sembrados.push(dia);
    else yaExistian.add(dia);
  }

  return {
    sembrados,
    yaExistian: ventana.filter((d) => yaExistian.has(d)),
    pendientes,
  };
}
