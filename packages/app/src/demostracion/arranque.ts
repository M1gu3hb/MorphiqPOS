import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import type { SemillaDemo } from './datos.ts';

/**
 * LOS DATOS DE ARRANQUE: el proveedor y la caja abierta con su fondo.
 *
 * ── Por qué sin esto una demo no se puede enseñar ──────────────────────────
 * **Sin caja abierta no se puede cobrar.** `abrirCaja` es el primer paso de
 * cualquier venta, y una demostración que empieza pidiendo «abre la caja» antes
 * de poder tocar nada no enseña el producto: enseña un trámite. Las cinco demos
 * tenían cero sesiones de caja.
 *
 * **Sin proveedor no se puede registrar una entrada de mercancía.** El comando
 * lo pide, y las pantallas de Compras y Entradas abren vacías. En una ferretería
 * eso es media operación.
 *
 * ── El fondo va DESGLOSADO, y no es un capricho ────────────────────────────
 * F-984: «$1,500» no dice si se puede dar cambio. Un fondo entero en billetes de
 * 500 es un fondo con el que la primera venta de $37 no se puede cobrar, y ése es
 * el problema que la pantalla de apertura existe para evitar. La semilla de cada
 * giro trae su desglose: una ferretería abre con más grandes porque sus tickets
 * son grandes; una cafetería con más monedas.
 */

export interface ResumenArranque {
  readonly proveedor: string;
  /**
   * En TEXTO, no en `bigint`.
   *
   * El resultado de un comando se serializa a JSON —viaja al navegador y se
   * guarda con la clave de idempotencia— y `JSON.stringify` lanza `TypeError`
   * ante un BigInt. Devolverlo como número perdería precisión por encima de los
   * nueve billones de centavos; como texto no se pierde nada y quien lo lee ya
   * sabe que son centavos.
   */
  readonly fondoCentavos: string;
  readonly terminal: string;
}

export async function sembrarArranque(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  semilla: SemillaDemo,
  empleoQueAbre: string,
): Promise<ResumenArranque> {
  const proveedor = await tx
    .insertInto('proveedores')
    .values({
      organizacion_id: organizacionId,
      nombre: semilla.proveedor.nombre,
      contacto: semilla.proveedor.contacto,
      telefono: semilla.proveedor.telefono,
      dia_visita: [...semilla.proveedor.diasVisita],
      dias_credito: semilla.proveedor.diasCredito,
      frecuencia: semilla.proveedor.diasVisita.length > 1 ? 'semanal' : 'quincenal',
    })
    .returning('nombre')
    .executeTakeFirstOrThrow();

  const terminal = await asegurarTerminal(tx, organizacionId, sucursalId);

  await tx
    .insertInto('sesiones_caja')
    .values({
      organizacion_id: organizacionId,
      sucursal_id: sucursalId,
      terminal_id: terminal.id,
      empleado_abre_id: empleoQueAbre,
      estado: 'abierta',
      fondo_inicial_centavos: semilla.fondoCajaCentavos,
      fondo_esperado_centavos: semilla.fondoCajaCentavos,
      fondo_monedas_centavos: semilla.fondoMonedasCentavos,
      fondo_chicos_centavos: semilla.fondoChicosCentavos,
      fondo_grandes_centavos: semilla.fondoGrandesCentavos,
      notas_apertura: 'Fondo de la demostración, sembrado con el catálogo.',
    })
    .execute();

  return {
    proveedor: proveedor.nombre,
    fondoCentavos: String(semilla.fondoCajaCentavos),
    terminal: terminal.nombre,
  };
}

/**
 * La terminal en la que abre la caja.
 *
 * Se reutiliza la primera que ya exista. Las demos acumulan terminales —cada
 * corrida de Playwright con una cookie de dispositivo nueva crea una— y crear
 * otra en cada reseteo dejaría una lista que crece sola y una pantalla de
 * configuración que no se puede leer.
 */
async function asegurarTerminal(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<{ id: string; nombre: string }> {
  const existente = await tx
    .selectFrom('terminales')
    .select(['id', 'nombre'])
    .where('organizacion_id', '=', organizacionId)
    .where('sucursal_id', '=', sucursalId)
    .where('activa', '=', true)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (existente !== undefined) return existente;

  return await tx
    .insertInto('terminales')
    .values({
      organizacion_id: organizacionId,
      sucursal_id: sucursalId,
      nombre: 'Caja 1',
    })
    .returning(['id', 'nombre'])
    .executeTakeFirstOrThrow();
}

/**
 * Borra lo que siembra este módulo.
 *
 * Las terminales NO se borran: una terminal enrolada es un dispositivo de
 * verdad, y un reseteo de demostración no tiene por qué desenrolar la tablet de
 * nadie. Las sesiones de caja sí, y las borra `limpiar()` del reseteo antes de
 * llegar aquí.
 */
export async function limpiarArranque(tx: Transaccion, organizacionId: string): Promise<void> {
  await sql`delete from proveedores where organizacion_id = ${organizacionId}`.execute(tx);
}
