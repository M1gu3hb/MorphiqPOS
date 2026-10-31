import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { ambitoDe, clave, sembrarNegocio, type NegocioReal } from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { escribirDatos } from '../puente/comandos.ts';

/**
 * DP-9.1 · EL PLATILLO NACE CON EL ÁREA DE SU CATEGORÍA, contra Postgres real.
 *
 * Por el mismo camino que usan Recetas y Platillos (`puente.escribir`). Un platillo creado sin
 * área nacía en `ninguno` —sin comanda— por el valor por omisión de la columna. Ahora el
 * servidor la aprende de su categoría o de su estación; si no hay de dónde, se niega y lo dice.
 * Y editar sin mandar el área no la toca.
 */

let negocio: NegocioReal;
const ids = {
  bebidas: randomUUID(),
  cocina: randomUUID(),
  cervezas: randomUUID(),
  nuevaDeBebidas: randomUUID(),
  tacos: randomUUID(),
  huerfana: randomUUID(),
  cerveza: randomUUID(),
  taco: randomUUID(),
};

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Barbacoa del área',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const org = negocio.organizacionId;
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('estaciones_preparacion')
      .values([
        { id: ids.bebidas, organizacion_id: org, nombre: 'Bebidas' },
        { id: ids.cocina, organizacion_id: org, nombre: 'Cocina', es_general: true },
      ])
      .execute();
    await tx
      .insertInto('categorias')
      .values([
        {
          id: ids.cervezas,
          organizacion_id: org,
          nombre: 'Cervezas',
          estacion_preparacion_id: ids.bebidas,
        },
        {
          id: ids.nuevaDeBebidas,
          organizacion_id: org,
          nombre: 'Pulques',
          estacion_preparacion_id: ids.bebidas,
        },
        {
          id: ids.tacos,
          organizacion_id: org,
          nombre: 'Tacos',
          estacion_preparacion_id: ids.cocina,
        },
        { id: ids.huerfana, organizacion_id: org, nombre: 'Sin estación' },
      ])
      .execute();
    await tx
      .insertInto('productos')
      .values([
        {
          id: ids.cerveza,
          organizacion_id: org,
          nombre: 'Victoria',
          precio_venta_centavos: 5_500n,
          categoria_id: ids.cervezas,
          area_preparacion: 'barra',
        },
        {
          id: ids.taco,
          organizacion_id: org,
          nombre: 'Taco de barbacoa',
          precio_venta_centavos: 3_500n,
          categoria_id: ids.tacos,
          area_preparacion: 'cocina',
        },
      ])
      .execute();
  });
});

function escribir(operacion: 'create' | 'update', datos: Record<string, unknown>, id?: string) {
  return comando(escribirDatos, {
    entrada: {
      entidad: 'ProductoTerminado',
      operacion,
      datos,
      ...(id === undefined ? {} : { id }),
    },
    ambito: ambitoDe(negocio, null, null),
    idempotencyKey: clave(),
  });
}

async function areaDe(nombre: string): Promise<string | undefined> {
  const fila = await obtenerDb()
    .selectFrom('productos')
    .select('area_preparacion')
    .where('organizacion_id', '=', negocio.organizacionId)
    .where('nombre', '=', nombre)
    .executeTakeFirst();
  return fila?.area_preparacion;
}

describe('un platillo creado sin área', () => {
  it('en una categoría de Bebidas nace en barra', async () => {
    const r = await escribir('create', {
      nombre: 'Indio',
      precio_venta: 55,
      categoria_id: ids.cervezas,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await areaDe('Indio')).toBe('barra');
  });

  it('en una categoría nueva, aprende de su estación', async () => {
    const r = await escribir('create', {
      nombre: 'Pulque de avena',
      precio_venta: 90,
      categoria_id: ids.nuevaDeBebidas,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await areaDe('Pulque de avena')).toBe('barra');
  });

  it('en una categoría de cocina nace en cocina', async () => {
    const r = await escribir('create', {
      nombre: 'Taco de panza',
      precio_venta: 35,
      categoria_id: ids.tacos,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await areaDe('Taco de panza')).toBe('cocina');
  });

  it('sin de dónde aprenderlo, no nace sin comanda: se niega y pide decidirlo', async () => {
    const r = await escribir('create', {
      nombre: 'Misterio',
      precio_venta: 10,
      categoria_id: ids.huerfana,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(r.error.datos?.['regla']).toBe('AREA_DE_PREPARACION_REQUERIDA');
    expect(r.error.mensaje).toContain('Elige el área de preparación');
    expect(await areaDe('Misterio')).toBeUndefined();
  });

  it('el área que alguien decide se respeta, «ninguno» incluido', async () => {
    const r = await escribir('create', {
      nombre: 'Agua de cortesía',
      precio_venta: 0,
      categoria_id: ids.cervezas,
      area_preparacion: 'ninguno',
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await areaDe('Agua de cortesía')).toBe('ninguno');
  });
});

describe('editar un platillo sin mandar el área', () => {
  it('no la toca: la cerveza sigue en barra', async () => {
    const r = await escribir('update', { nombre: 'Victoria', precio_venta: 60 }, ids.cerveza);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(await areaDe('Victoria')).toBe('barra');
  });
});
