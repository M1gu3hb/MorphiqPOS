import { obtenerDb } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { ambitoDe, clave, sembrarNegocio, sembrarSucursal } from '../pruebas/negocio-real.ts';
import { marcarEstacionGeneral } from './estacion-general.ts';

/**
 * DP-10.1 · «HACER GENERAL» UNA ESTACIÓN QUE YA EXISTE (contra Postgres real).
 *
 * La general es el respaldo de la regla 10: a ella va la comanda cuyo platillo no tiene estación
 * por su categoría. En Don Poncho se crearon «Cocina» y «Bebidas» y ninguna quedó general, así
 * que un platillo nuevo sin estación haría fallar el envío del mesero. Sólo había cómo CREAR una
 * general (`restaurante.crear_estacion`), no cómo nombrar una existente.
 */

async function negocioConEstaciones() {
  const negocio = await sembrarNegocio({
    nombre: 'Barbacoa sin general',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const { sucursalId } = await sembrarSucursal(negocio, { terminales: [] });
  const db = obtenerDb();
  const estacion = async (nombre: string, activa = true) =>
    (
      await db
        .insertInto('estaciones_preparacion')
        .values({ organizacion_id: negocio.organizacionId, nombre, activa })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  return {
    negocio,
    ambito: ambitoDe(negocio, sucursalId, null),
    cocina: await estacion('Cocina'),
    bebidas: await estacion('Bebidas'),
    apagada: await estacion('Postres', false),
  };
}

async function generales(organizacionId: string): Promise<readonly string[]> {
  const filas = await obtenerDb()
    .selectFrom('estaciones_preparacion')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .where('es_general', '=', true)
    .execute();
  return filas.map((f) => f.id);
}

describe('restaurante.marcar_estacion_general', () => {
  it('nombra general a «Cocina», lo audita, y repetirlo no cambia nada', async () => {
    const caso = await negocioConEstaciones();
    const primera = await comando(marcarEstacionGeneral, {
      entrada: { estacionId: caso.cocina },
      ambito: caso.ambito,
      idempotencyKey: clave(),
    });
    expect(primera).toMatchObject({ ok: true, datos: { estacionId: caso.cocina, cambio: true } });
    const otraVez = await comando(marcarEstacionGeneral, {
      entrada: { estacionId: caso.cocina },
      ambito: caso.ambito,
      idempotencyKey: clave(),
    });
    expect(otraVez).toMatchObject({ ok: true, datos: { cambio: false } });
    expect(await generales(caso.negocio.organizacionId)).toEqual([caso.cocina]);
    const rastro = await obtenerDb()
      .selectFrom('auditoria')
      .select('accion')
      .where('organizacion_id', '=', caso.negocio.organizacionId)
      .where('entidad_id', '=', caso.cocina)
      .execute();
    expect(rastro.map((r) => r.accion)).toContain('restaurante.marcar_estacion_general');
  });

  it('si ya hay otra general no la cambia de mano: lo dice', async () => {
    const caso = await negocioConEstaciones();
    await comando(marcarEstacionGeneral, {
      entrada: { estacionId: caso.cocina },
      ambito: caso.ambito,
      idempotencyKey: clave(),
    });
    const r = await comando(marcarEstacionGeneral, {
      entrada: { estacionId: caso.bebidas },
      ambito: caso.ambito,
      idempotencyKey: clave(),
    });
    expect(r).toMatchObject({
      ok: false,
      error: { codigo: 'REGLA_DE_NEGOCIO', datos: { regla: 'ESTACION_YA_EXISTE' } },
    });
    expect(await generales(caso.negocio.organizacionId)).toEqual([caso.cocina]);
  });

  it('una estación apagada no puede ser el respaldo', async () => {
    const caso = await negocioConEstaciones();
    const r = await comando(marcarEstacionGeneral, {
      entrada: { estacionId: caso.apagada },
      ambito: caso.ambito,
      idempotencyKey: clave(),
    });
    expect(r).toMatchObject({
      ok: false,
      error: { codigo: 'REGLA_DE_NEGOCIO', datos: { regla: 'ESTACION_NO_ENCONTRADA' } },
    });
    expect(await generales(caso.negocio.organizacionId)).toEqual([]);
  });

  it('el mesero y la cocina no pueden', async () => {
    const caso = await negocioConEstaciones();
    for (const rol of ['mesero', 'cocina'] as const) {
      const r = await comando(marcarEstacionGeneral, {
        entrada: { estacionId: caso.cocina },
        ambito: { ...caso.ambito, rol },
        idempotencyKey: clave(),
      });
      expect(r).toMatchObject({ ok: false, error: { codigo: 'SIN_PERMISO' } });
    }
    expect(await generales(caso.negocio.organizacionId)).toEqual([]);
  });

  it('una estación de otro negocio no se encuentra', async () => {
    const caso = await negocioConEstaciones();
    const otro = await negocioConEstaciones();
    const r = await comando(marcarEstacionGeneral, {
      entrada: { estacionId: otro.cocina },
      ambito: caso.ambito,
      idempotencyKey: clave(),
    });
    expect(r).toMatchObject({
      ok: false,
      error: { codigo: 'REGLA_DE_NEGOCIO', datos: { regla: 'ESTACION_NO_ENCONTRADA' } },
    });
    expect(await generales(otro.negocio.organizacionId)).toEqual([]);
  });
});
