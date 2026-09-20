import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

/**
 * La SALA de la demostración del restaurante (E11-2).
 *
 * Un POS de restaurante sin mesas, sin estaciones y con un solo empleado no se
 * puede enseñar: Mesero sale vacío, Cocina sale vacía, y el mapa de mesas —que
 * es la pantalla que Miguel más quiere ver— no tiene nada que pintar.
 *
 * Esto siembra lo mínimo para que las pantallas del restaurante tengan algo
 * real: cinco zonas, dos estaciones además de la general y doce mesas repartidas.
 *
 * ── El EQUIPO ya no está aquí ──────────────────────────────────────────────
 * Tenía su propia lista de tres empleados con sus PIN, y `equipo.ts` tiene la de
 * los cinco modelos. Dos listas de las mismas personas es cómo se acaba con
 * Lupita entrando con un PIN distinto según qué función la sembró: `sembrarEquipo`
 * corre antes y ésta la saltaba por nombre, así que los PIN de aquí eran código
 * que no se ejecutaba y que decía otra cosa.
 */

/** Las estaciones que se ven en Cocina, además de la general obligatoria. */
const ESTACIONES = [
  { nombre: 'Cocina caliente', descripcion: 'Platos fuertes y guarniciones', color: '#dc2626' },
  { nombre: 'Barra', descripcion: 'Bebidas, cervezas y postres fríos', color: '#0891b2' },
] as const;

/**
 * Las doce mesas, con su zona, su forma y su sitio en el plano.
 *
 * Las posiciones no son aleatorias: forman dos filas en Interior, una en
 * Terraza y la barra pegada a la pared. Un mapa de mesas donde todo cae en la
 * misma coordenada no enseña nada, y es lo que sale si se siembran con el valor
 * por omisión (100, 100).
 */
const MESAS = [
  {
    numero: 1,
    zona: 'Interior',
    capacidad: 4,
    forma: 'cuadrada',
    tamano: 'mediana',
    x: 120,
    y: 120,
  },
  {
    numero: 2,
    zona: 'Interior',
    capacidad: 4,
    forma: 'cuadrada',
    tamano: 'mediana',
    x: 280,
    y: 120,
  },
  { numero: 3, zona: 'Interior', capacidad: 2, forma: 'redonda', tamano: 'chica', x: 440, y: 120 },
  {
    numero: 4,
    zona: 'Interior',
    capacidad: 6,
    forma: 'rectangular',
    tamano: 'grande',
    x: 120,
    y: 280,
  },
  {
    numero: 5,
    zona: 'Interior',
    capacidad: 4,
    forma: 'redonda',
    tamano: 'mediana',
    x: 300,
    y: 280,
  },
  { numero: 6, zona: 'Interior', capacidad: 2, forma: 'redonda', tamano: 'chica', x: 460, y: 280 },
  { numero: 7, zona: 'Terraza', capacidad: 4, forma: 'redonda', tamano: 'mediana', x: 140, y: 140 },
  { numero: 8, zona: 'Terraza', capacidad: 4, forma: 'redonda', tamano: 'mediana', x: 320, y: 140 },
  {
    numero: 9,
    zona: 'Terraza',
    capacidad: 8,
    forma: 'rectangular',
    tamano: 'grande',
    x: 200,
    y: 300,
  },
  { numero: 10, zona: 'Barra', capacidad: 1, forma: 'cuadrada', tamano: 'chica', x: 120, y: 100 },
  { numero: 11, zona: 'Barra', capacidad: 1, forma: 'cuadrada', tamano: 'chica', x: 220, y: 100 },
  { numero: 12, zona: 'Barra', capacidad: 1, forma: 'cuadrada', tamano: 'chica', x: 320, y: 100 },
] as const;

export interface ResumenSala {
  readonly zonas: number;
  readonly estaciones: number;
  readonly mesas: number;
}

export async function sembrarSala(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
): Promise<ResumenSala> {
  const zonas = await asegurarZonas(tx, organizacionId);
  const estaciones = await sembrarEstaciones(tx, organizacionId);
  const mesas = await sembrarMesas(tx, organizacionId, sucursalId, zonas);
  return { zonas: zonas.size, estaciones, mesas };
}

/**
 * Las cinco zonas. La migración 048 ya las siembra por giro, así que aquí sólo
 * se leen — y se crean las que falten, para que un negocio dado de alta antes
 * de esa migración no se quede sin ninguna.
 */
async function asegurarZonas(
  tx: Transaccion,
  organizacionId: string,
): Promise<Map<string, string>> {
  const nombres = ['Interior', 'Exterior', 'Terraza', 'Barra', 'Otro'];
  const mapa = new Map<string, string>();
  for (const [orden, nombre] of nombres.entries()) {
    const existente = await tx
      .selectFrom('zonas')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('nombre', '=', nombre)
      .executeTakeFirst();
    if (existente !== undefined) {
      mapa.set(nombre, existente.id);
      continue;
    }
    const creada = await tx
      .insertInto('zonas')
      .values({ organizacion_id: organizacionId, nombre, orden })
      .returning('id')
      .executeTakeFirstOrThrow();
    mapa.set(nombre, creada.id);
  }
  return mapa;
}

async function sembrarEstaciones(tx: Transaccion, organizacionId: string): Promise<number> {
  let creadas = 0;

  /**
   * LA GENERAL PRIMERO, y esto es un arreglo.
   *
   * Aquí decía «`es_general` NO se toca: la general la impone un índice único
   * parcial y ya existe desde la semilla de la migración 045». Para las
   * organizaciones que existían entonces, sí. **Para una nueva, no existe
   * ninguna**, y la demostración de restaurante se creó después: tenía «Cocina
   * caliente» y «Barra» y ninguna general.
   *
   * Lo que eso rompe: `resolverEstacion` busca la estación de la categoría del
   * producto y, si no la encuentra, cae a la GENERAL; sin general **lanza**
   * `ESTACION_NO_ENCONTRADA`. Así que mandar un platillo a la cocina —el paso que
   * convierte una mesa en trabajo— fallaba en la demo con «No hay ninguna
   * estación de preparación activa. Crea la "Cocina general" en Configuración».
   *
   * El nombre, la descripción y el color son los mismos que usa
   * `mantenimiento.purgar` al resembrar los mínimos de un restaurante: una sola
   * forma de la estación general en todo el sistema.
   */
  const general = await tx
    .selectFrom('estaciones_preparacion')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('es_general', '=', true)
    .executeTakeFirst();
  if (general === undefined) {
    await tx
      .insertInto('estaciones_preparacion')
      .values({
        organizacion_id: organizacionId,
        nombre: 'Cocina general',
        descripcion: 'Estación por defecto',
        color: '#4A5568',
        orden: 0,
        es_general: true,
      })
      .execute();
    creadas += 1;
  }

  for (const [indice, estacion] of ESTACIONES.entries()) {
    const existente = await tx
      .selectFrom('estaciones_preparacion')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('nombre', '=', estacion.nombre)
      .executeTakeFirst();
    if (existente !== undefined) continue;
    await tx
      .insertInto('estaciones_preparacion')
      .values({
        organizacion_id: organizacionId,
        nombre: estacion.nombre,
        descripcion: estacion.descripcion,
        color: estacion.color,
        orden: indice + 1,
        // `es_general` NO se toca: la general la impone un índice único parcial
        // y ya existe desde la semilla de la migración 045.
        es_general: false,
      })
      .execute();
    creadas += 1;
  }
  return creadas;
}

async function sembrarMesas(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  zonas: Map<string, string>,
): Promise<number> {
  let creadas = 0;
  for (const [indice, mesa] of MESAS.entries()) {
    const existente = await tx
      .selectFrom('mesas')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('numero', '=', mesa.numero)
      .executeTakeFirst();
    if (existente !== undefined) continue;
    await tx
      .insertInto('mesas')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: sucursalId,
        zona_id: zonas.get(mesa.zona) ?? null,
        numero: mesa.numero,
        nombre: `Mesa ${String(mesa.numero)}`,
        capacidad: mesa.capacidad,
        forma: mesa.forma,
        tamano: mesa.tamano,
        posicion_x: mesa.x,
        posicion_y: mesa.y,
        orden: indice,
      })
      .execute();
    creadas += 1;
  }
  return creadas;
}

/**
 * Borra la sala. Va con `limpiar()` del reseteo, y en ESTE orden: las mesas
 * apuntan a órdenes y las órdenes a mesas, así que primero se suelta el lado
 * de la mesa o la clave foránea aborta la transacción entera.
 */
export async function limpiarSala(tx: Transaccion, organizacionId: string): Promise<void> {
  await sql`update mesas set orden_activa_id = null where organizacion_id = ${organizacionId}`.execute(
    tx,
  );
  await sql`delete from comanda_items where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from comandas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from solicitudes_qr where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from liquidaciones_propina where organizacion_id = ${organizacionId}`.execute(
    tx,
  );
  await sql`delete from cortes_turno where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from compra_lineas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from compras where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from gastos where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from mesas where organizacion_id = ${organizacionId}`.execute(tx);
}
