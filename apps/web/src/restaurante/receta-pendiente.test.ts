import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ETIQUETA_RECETA_PENDIENTE,
  avisoDeRecetasPendientes,
  costoVisible,
  margenVisible,
  recetasPendientes,
  tieneRecetaPendiente,
} from './receta-pendiente';

/**
 * RECETA PENDIENTE (DP-5): derivada de la estrategia del producto y de sus líneas activas, sin
 * columna nueva, y se borra sola cuando la receta tiene su primer ingrediente.
 */

const BARBACOA = { id: 'p-barbacoa', estrategia_consumo: 'receta' };
const CONSOME = { id: 'p-consome', estrategia_consumo: 'receta' };
const CERVEZA = { id: 'p-cerveza', estrategia_consumo: 'sku' };

describe('tieneRecetaPendiente', () => {
  it('un platillo por receta sin una sola línea está pendiente', () => {
    expect(tieneRecetaPendiente(BARBACOA, [])).toBe(true);
  });

  it('en cuanto se captura el primer ingrediente deja de estarlo, solo', () => {
    expect(tieneRecetaPendiente(BARBACOA, [{ producto_id: BARBACOA.id }])).toBe(false);
    expect(tieneRecetaPendiente(BARBACOA, [{ producto_id: BARBACOA.id, activo: true }])).toBe(
      false,
    );
  });

  it('una receta con todas sus líneas dadas de baja vuelve a estar pendiente', () => {
    expect(tieneRecetaPendiente(BARBACOA, [{ producto_id: BARBACOA.id, activo: false }])).toBe(
      true,
    );
  });

  it('lo que se revende tal cual no tiene receta que capturar', () => {
    expect(tieneRecetaPendiente(CERVEZA, [])).toBe(false);
    expect(tieneRecetaPendiente({ id: 'x' }, [])).toBe(false);
    expect(tieneRecetaPendiente({ id: 'x', estrategia_consumo: null }, [])).toBe(false);
  });
});

describe('recetasPendientes', () => {
  it('cuenta los pendientes de un menú entero, de una pasada', () => {
    const lineas = [
      { producto_id: CONSOME.id },
      { producto_id: CONSOME.id, activo: false },
      { producto_id: 'de-otro-producto' },
    ];
    expect([...recetasPendientes([BARBACOA, CONSOME, CERVEZA], lineas)]).toEqual([BARBACOA.id]);
  });

  it('sin una sola receta capturada, todo el menú por receta está pendiente', () => {
    expect(recetasPendientes([BARBACOA, CONSOME, CERVEZA], []).size).toBe(2);
  });
});

describe('el costo y el margen que se enseñan', () => {
  it('con la receta pendiente el costo es desconocido, nunca el cero guardado', () => {
    expect(costoVisible(true, 0)).toBeNull();
    expect(costoVisible(false, 0)).toBe(0);
    expect(costoVisible(false, 12_345)).toBe(12_345);
  });

  it('con la receta pendiente no hay margen: el 100 % guardado no se enseña', () => {
    expect(margenVisible(true, 100)).toBeNull();
    expect(margenVisible(false, 62.5)).toBe(62.5);
  });
});

describe('el aviso del tablero', () => {
  it.each([
    [0, null],
    [1, '1 platillo sin receta'],
    [107, '107 platillos sin receta'],
  ])('%i → %s', (cuantos, aviso) => {
    expect(avisoDeRecetasPendientes(cuantos)).toBe(aviso);
  });
});

describe('las pantallas lo usan (contrato contra los archivos)', () => {
  const leer = (archivo: string) => readFileSync(join(__dirname, archivo), 'utf8');

  it.each(['Recetas.tsx', 'Productos.tsx', 'RecetasPendientes.tsx'])(
    '%s deriva la receta pendiente de `receta-pendiente.ts`',
    (archivo) => {
      expect(leer(archivo)).toMatch(/from '\.\/receta-pendiente'/);
    },
  );

  it.each(['Recetas.tsx', 'Productos.tsx'])('%s enseña el costo por `costoVisible`', (archivo) => {
    expect(leer(archivo)).toMatch(/costoVisible\(/);
    expect(leer(archivo)).toMatch(/margenVisible\(/);
  });

  it('el rótulo es «Receta pendiente»', () => {
    expect(ETIQUETA_RECETA_PENDIENTE).toBe('Receta pendiente');
  });
});
