import { describe, expect, it } from 'vitest';

import { estacionDeLaSesion } from './estacion-de-la-sesion.ts';

/**
 * DP-10.1 · LO QUE LA SESIÓN DICE DE LA COCINA: qué estación ve quien entró.
 *
 * La pantalla de Cocina filtra con esto. Si la sesión no lo trae, el cocinero con estación
 * fija ve la pantalla vacía y sin aviso: es lo que pasaba en producción el 27-10.
 */

const COCINA = { id: 'e-cocina', nombre: 'Cocina', color: '#83653f' };

describe('estacionDeLaSesion', () => {
  it('el cocinero con estación ve SÓLO la suya, con su nombre y su color', () => {
    expect(estacionDeLaSesion('cocina', { veTodas: false, estacion: COCINA })).toEqual({
      estacion_preparacion_id: 'e-cocina',
      estacion_preparacion_nombre: 'Cocina',
      estacion_preparacion_color: '#83653f',
      puede_ver_todas_estaciones: false,
    });
  });

  it('el cocinero marcado «ve todas» las ve todas, aunque tenga una estación anotada', () => {
    expect(estacionDeLaSesion('cocina', { veTodas: true, estacion: COCINA })).toEqual({
      estacion_preparacion_id: null,
      estacion_preparacion_nombre: null,
      estacion_preparacion_color: null,
      puede_ver_todas_estaciones: true,
    });
  });

  it('el cocinero sin estación (o con una apagada) no ve ninguna: la pantalla avisa', () => {
    expect(estacionDeLaSesion('cocina', { veTodas: false, estacion: null })).toEqual({
      estacion_preparacion_id: null,
      estacion_preparacion_nombre: null,
      estacion_preparacion_color: null,
      puede_ver_todas_estaciones: false,
    });
  });

  it.each(['dueno', 'administrador', 'gerente'])(
    '«%s» ve todas sin que nadie se lo marque',
    (rol) => {
      expect(estacionDeLaSesion(rol, { veTodas: false, estacion: COCINA })).toEqual({
        estacion_preparacion_id: null,
        estacion_preparacion_nombre: null,
        estacion_preparacion_color: null,
        puede_ver_todas_estaciones: true,
      });
    },
  );

  it('el mesero y la caja no tienen estación ni ven todas por la sesión', () => {
    for (const rol of ['mesero', 'cajero', 'almacen']) {
      expect(estacionDeLaSesion(rol, { veTodas: false, estacion: COCINA })).toEqual({
        estacion_preparacion_id: null,
        estacion_preparacion_nombre: null,
        estacion_preparacion_color: null,
        puede_ver_todas_estaciones: false,
      });
    }
  });

  it('sin fila del empleo (se dio de baja a media lectura) no ve ninguna', () => {
    expect(estacionDeLaSesion('cocina', null).puede_ver_todas_estaciones).toBe(false);
    expect(estacionDeLaSesion('cocina', null).estacion_preparacion_id).toBeNull();
  });
});
