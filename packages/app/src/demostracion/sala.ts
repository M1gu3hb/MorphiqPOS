import 'server-only';

import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';

import { hashearPin } from '../identidad/pin.ts';

/**
 * La SALA de la demostración del restaurante (E11-2).
 *
 * Un POS de restaurante sin mesas, sin estaciones y con un solo empleado no se
 * puede enseñar: Mesero sale vacío, Cocina sale vacía, y el mapa de mesas —que
 * es la pantalla que Miguel más quiere ver— no tiene nada que pintar.
 *
 * Esto siembra lo mínimo para que las nueve pantallas del restaurante tengan
 * algo real: cinco zonas, dos estaciones además de la general, doce mesas
 * repartidas, y tres empleados con los tres roles que operan de verdad.
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
  { numero: 1, zona: 'Interior', capacidad: 4, forma: 'cuadrada', tamano: 'mediana', x: 120, y: 120 },
  { numero: 2, zona: 'Interior', capacidad: 4, forma: 'cuadrada', tamano: 'mediana', x: 280, y: 120 },
  { numero: 3, zona: 'Interior', capacidad: 2, forma: 'redonda', tamano: 'chica', x: 440, y: 120 },
  { numero: 4, zona: 'Interior', capacidad: 6, forma: 'rectangular', tamano: 'grande', x: 120, y: 280 },
  { numero: 5, zona: 'Interior', capacidad: 4, forma: 'redonda', tamano: 'mediana', x: 300, y: 280 },
  { numero: 6, zona: 'Interior', capacidad: 2, forma: 'redonda', tamano: 'chica', x: 460, y: 280 },
  { numero: 7, zona: 'Terraza', capacidad: 4, forma: 'redonda', tamano: 'mediana', x: 140, y: 140 },
  { numero: 8, zona: 'Terraza', capacidad: 4, forma: 'redonda', tamano: 'mediana', x: 320, y: 140 },
  { numero: 9, zona: 'Terraza', capacidad: 8, forma: 'rectangular', tamano: 'grande', x: 200, y: 300 },
  { numero: 10, zona: 'Barra', capacidad: 1, forma: 'cuadrada', tamano: 'chica', x: 120, y: 100 },
  { numero: 11, zona: 'Barra', capacidad: 1, forma: 'cuadrada', tamano: 'chica', x: 220, y: 100 },
  { numero: 12, zona: 'Barra', capacidad: 1, forma: 'cuadrada', tamano: 'chica', x: 320, y: 100 },
] as const;

/**
 * Los tres roles que operan de verdad en un restaurante.
 *
 * Los PIN son de DEMOSTRACIÓN y se hashean con Argon2id y pimienta, igual que
 * cualquier otro: no hay un camino distinto para sembrar. Nunca se guarda el
 * PIN en claro, ni siquiera aquí — precisamente porque «es sólo la demo» es
 * como acaban los PIN en claro en producción.
 */
const EMPLEADOS = [
  { nombre: 'Lupita', apellidos: 'Ramírez', rol: 'mesero', pin: '1111', color: '#7c3aed' },
  { nombre: 'Toño', apellidos: 'Barrera', rol: 'cocina', pin: '2222', color: '#d97706' },
  { nombre: 'Rosa', apellidos: 'Miranda', rol: 'cajero', pin: '3333', color: '#16a34a' },
] as const;

export interface ResumenSala {
  readonly zonas: number;
  readonly estaciones: number;
  readonly mesas: number;
  readonly empleados: number;
}

export async function sembrarSala(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  pimienta: string,
): Promise<ResumenSala> {
  const zonas = await asegurarZonas(tx, organizacionId);
  const estaciones = await sembrarEstaciones(tx, organizacionId);
  const mesas = await sembrarMesas(tx, organizacionId, sucursalId, zonas);
  const empleados = await sembrarEmpleados(tx, organizacionId, sucursalId, pimienta);
  return { zonas: zonas.size, estaciones, mesas, empleados };
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
 * Los tres empleados, con su persona, su identidad, su empleo y su PIN.
 *
 * Son cuatro tablas porque una persona puede tener varios empleos y una
 * identidad puede entrar por más de un camino. Aquí se siembra el caso simple.
 */
async function sembrarEmpleados(
  tx: Transaccion,
  organizacionId: string,
  sucursalId: string,
  pimienta: string,
): Promise<number> {
  let creados = 0;
  for (const empleado of EMPLEADOS) {
    const yaEsta = await tx
      .selectFrom('personas')
      .select('id')
      .where('organizacion_id', '=', organizacionId)
      .where('nombre', '=', empleado.nombre)
      .executeTakeFirst();
    if (yaEsta !== undefined) continue;

    const persona = await tx
      .insertInto('personas')
      .values({
        organizacion_id: organizacionId,
        nombre: empleado.nombre,
        apellidos: empleado.apellidos,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // `identidades` y `credenciales_pin` NO llevan `organizacion_id`: cuelgan de
    // la persona, que sí lo lleva. El ámbito viaja por la relación, no repetido.
    const identidad = await tx
      .insertInto('identidades')
      .values({ persona_id: persona.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    await tx
      .insertInto('empleos')
      .values({
        organizacion_id: organizacionId,
        persona_id: persona.id,
        sucursal_id: sucursalId,
        rol: empleado.rol,
        color: empleado.color,
        // La cocina ve TODAS las estaciones: en un restaurante de doce mesas
        // no hay un cocinero por estación, y filtrarle la mitad de las comandas
        // sería enseñar una pantalla que miente sobre lo que falta por salir.
        ve_todas_las_estaciones: empleado.rol === 'cocina',
      })
      .execute();

    await tx
      .insertInto('credenciales_pin')
      .values({
        identidad_id: identidad.id,
        pin_hash: await hashearPin(empleado.pin, pimienta),
      })
      .execute();

    creados += 1;
  }
  return creados;
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
