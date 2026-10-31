import { describe, expect, it } from 'vitest';

import { alcanceDeLaCocina, comandasDelAlcance, mismaCocina } from './alcance-de-la-cocina';

/**
 * DP-10.1 · QUÉ VE CADA QUIEN EN LA PANTALLA DE COCINA.
 *
 * El rol llega en el vocabulario de la pantalla (`administrador` es dueño, gerente o
 * administrador); la estación, de la sesión del SERVIDOR.
 */

const COCINA = {
  rol: 'cocina',
  estacion_preparacion_id: 'e-cocina',
  estacion_preparacion_nombre: 'Cocina',
  estacion_preparacion_color: '#83653f',
  puede_ver_todas_estaciones: false,
};

describe('alcanceDeLaCocina', () => {
  it('con las estaciones apagadas, todos ven todo', () => {
    expect(alcanceDeLaCocina(COCINA, false)).toEqual({ mode: 'all', label: null });
  });

  it('el cocinero con estación ve la suya, con su nombre y color', () => {
    expect(alcanceDeLaCocina(COCINA, true)).toEqual({
      mode: 'station',
      stationId: 'e-cocina',
      label: 'Cocina',
      color: '#83653f',
    });
  });

  it('el cocinero «ve todas» ve todas', () => {
    expect(
      alcanceDeLaCocina(
        { ...COCINA, estacion_preparacion_id: null, puede_ver_todas_estaciones: true },
        true,
      ),
    ).toEqual({ mode: 'all', label: 'Todas las estaciones' });
  });

  it('el cocinero sin estación no ve nada: la pantalla avisa', () => {
    expect(alcanceDeLaCocina({ rol: 'cocina' }, true)).toEqual({ mode: 'unassigned', label: null });
  });

  it('el dueño, el gerente y el administrador ven todo', () => {
    expect(alcanceDeLaCocina({ rol: 'administrador' }, true)).toEqual({
      mode: 'all',
      label: 'Vista general',
    });
  });

  it('un mesero que entra a Cocina ve todo, como siempre', () => {
    expect(alcanceDeLaCocina({ rol: 'mesero' }, true)).toEqual({ mode: 'all', label: null });
  });
});

describe('comandasDelAlcance', () => {
  const comandas = [
    { id: 'taco', estacion_preparacion_id: 'e-cocina' },
    { id: 'agua', estacion_preparacion_id: 'e-bebidas' },
    { id: 'vieja', estacion_preparacion_id: null },
  ];
  const estacion = (id: string) => ({
    mode: 'station' as const,
    stationId: id,
    label: '',
    color: '',
  });

  it('la estación ve sólo lo suyo; lo que nació sin estación, sólo la general', () => {
    expect(comandasDelAlcance(comandas, estacion('e-cocina'), true).map((c) => c.id)).toEqual([
      'taco',
      'vieja',
    ]);
    expect(comandasDelAlcance(comandas, estacion('e-bebidas'), false).map((c) => c.id)).toEqual([
      'agua',
    ]);
  });

  it('todas ve todas; sin estación, ninguna', () => {
    expect(comandasDelAlcance(comandas, { mode: 'all', label: null }, false)).toHaveLength(3);
    expect(comandasDelAlcance(comandas, { mode: 'unassigned', label: null }, true)).toEqual([]);
  });
});

describe('mismaCocina', () => {
  it('compara la estación y el «ve todas» de dos sesiones', () => {
    expect(mismaCocina(COCINA, { ...COCINA })).toBe(true);
    expect(mismaCocina(COCINA, { ...COCINA, estacion_preparacion_id: 'e-bebidas' })).toBe(false);
    expect(mismaCocina(COCINA, { ...COCINA, puede_ver_todas_estaciones: true })).toBe(false);
    expect(mismaCocina(COCINA, { ...COCINA, estacion_preparacion_color: '#000000' })).toBe(false);
    expect(mismaCocina(null, COCINA)).toBe(false);
  });
});
