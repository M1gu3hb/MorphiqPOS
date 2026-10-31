import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { sembrarCompanero, sembrarNegocio, type NegocioReal } from '../pruebas/negocio-real.ts';
import { leerEstacionDeLaSesion } from './estacion-de-la-sesion.ts';

/**
 * DP-10.1 · LA ESTACIÓN DE LA SESIÓN, leída de la base (contra Postgres real).
 *
 * El PIN y `/api/catalogo/sesion` contestan con esto: la estación del EMPLEO y si ve todas. La
 * estación tiene que ser del mismo negocio y estar encendida; si se apagó, el cocinero se queda
 * sin estación y la pantalla se lo dice.
 */

interface Cocina {
  readonly negocio: NegocioReal;
  readonly cocina: string;
  readonly bebidas: string;
  readonly apagada: string;
}

async function estacion(org: string, nombre: string, color: string, activa = true) {
  return (
    await obtenerDb()
      .insertInto('estaciones_preparacion')
      .values({ organizacion_id: org, nombre, color, activa, es_general: nombre === 'Cocina' })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
}

async function cocinero(
  caso: Cocina,
  nombre: string,
  datos: { readonly estacion?: string; readonly veTodas?: boolean },
) {
  const empleoId = await sembrarCompanero(caso.negocio, { nombre, rol: 'cocina' });
  await obtenerDb()
    .updateTable('empleos')
    .set({
      estacion_preparacion_id: datos.estacion ?? null,
      ve_todas_las_estaciones: datos.veTodas ?? false,
    })
    .where('id', '=', empleoId)
    .execute();
  return empleoId;
}

describe('leerEstacionDeLaSesion', () => {
  let caso: Cocina;
  beforeAll(async () => {
    const negocio = await sembrarNegocio({
      nombre: 'Barbacoa de las estaciones',
      rol: 'dueno',
      giro: 'restaurante',
      paquete: 'restaurante',
    });
    const org = negocio.organizacionId;
    caso = {
      negocio,
      cocina: await estacion(org, 'Cocina', '#83653f'),
      bebidas: await estacion(org, 'Bebidas', '#0891b2'),
      apagada: await estacion(org, 'Postres', '#db2777', false),
    };
  });

  const leer = (empleoId: string, rol: string) =>
    leerEstacionDeLaSesion(caso.negocio.organizacionId, empleoId, rol);

  it('Cocina trae la suya y Bebidas la suya, con nombre y color', async () => {
    const deCocina = await cocinero(caso, 'Cocina', { estacion: caso.cocina });
    const deBebidas = await cocinero(caso, 'Bebidas', { estacion: caso.bebidas });
    expect(await leer(deCocina, 'cocina')).toEqual({
      estacion_preparacion_id: caso.cocina,
      estacion_preparacion_nombre: 'Cocina',
      estacion_preparacion_color: '#83653f',
      puede_ver_todas_estaciones: false,
    });
    expect(await leer(deBebidas, 'cocina')).toEqual({
      estacion_preparacion_id: caso.bebidas,
      estacion_preparacion_nombre: 'Bebidas',
      estacion_preparacion_color: '#0891b2',
      puede_ver_todas_estaciones: false,
    });
  });

  it('el cocinero «ve todas» ve todas', async () => {
    const todas = await cocinero(caso, 'Jefe de cocina', { veTodas: true });
    expect((await leer(todas, 'cocina')).puede_ver_todas_estaciones).toBe(true);
  });

  it('sin estación, o con su estación apagada, se queda sin ninguna', async () => {
    const sin = await cocinero(caso, 'Ayudante', {});
    const conApagada = await cocinero(caso, 'Repostero', { estacion: caso.apagada });
    for (const empleoId of [sin, conApagada]) {
      expect(await leer(empleoId, 'cocina')).toEqual({
        estacion_preparacion_id: null,
        estacion_preparacion_nombre: null,
        estacion_preparacion_color: null,
        puede_ver_todas_estaciones: false,
      });
    }
  });

  it('el dueño ve todas, y un empleo de OTRO negocio no trae nada de éste', async () => {
    expect((await leer(caso.negocio.empleoId, 'dueno')).puede_ver_todas_estaciones).toBe(true);
    const otro = await sembrarNegocio({
      nombre: 'Otra fonda',
      rol: 'cocina',
      giro: 'restaurante',
      paquete: 'restaurante',
    });
    const suya = await estacion(otro.organizacionId, 'Cocina', '#111111');
    await obtenerDb()
      .updateTable('empleos')
      .set({ estacion_preparacion_id: suya })
      .where('id', '=', otro.empleoId)
      .execute();
    const ajeno = await leerEstacionDeLaSesion(
      caso.negocio.organizacionId,
      otro.empleoId,
      'cocina',
    );
    expect(ajeno.estacion_preparacion_id).toBeNull();
    const enSuNegocio = await leerEstacionDeLaSesion(otro.organizacionId, otro.empleoId, 'cocina');
    expect(enSuNegocio.estacion_preparacion_id).toBe(suya);
  });
});
