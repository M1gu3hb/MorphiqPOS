import { describe, expect, it } from 'vitest';

import { PACKAGE_MODULES, canAccessModule, getCurrentPackage } from './package-config.ts';

describe('T2 · paquetes visibles', () => {
  it.each([
    ['esencial', false, false],
    ['operativo', true, false],
    ['restaurante_pro', true, true],
  ] as const)('%s muestra exactamente su nivel acumulativo', (paquete, inventario, mesas) => {
    expect(canAccessModule('caja_directa', paquete)).toBe(true);
    expect(canAccessModule('inventario', paquete)).toBe(inventario);
    expect(canAccessModule('mesas', paquete)).toBe(mesas);
    expect(PACKAGE_MODULES[paquete].includes('escaner_codigo_barras')).toBe(
      paquete !== 'restaurante_pro',
    );
  });

  it('un valor desconocido cae al paquete más restrictivo', () => {
    expect(getCurrentPackage({ paquete_modo: 'desconocido' })).toBe('esencial');
    expect(canAccessModule('mesas', 'desconocido')).toBe(false);
    expect(canAccessModule('inventario', undefined)).toBe(false);
  });
});
