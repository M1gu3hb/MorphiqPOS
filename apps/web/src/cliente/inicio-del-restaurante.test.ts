import { describe, expect, it } from 'vitest';
import { hasPermission } from '../../heredado/lib/permissions.js';
import { inicioDeLaSesion, navegacionParaRolYPlantilla } from './package-config.ts';

describe('restaurante: entrada y menú de cada puesto', () => {
  it.each(['administrador', 'dueno'])(
    'el %s entra al dashboard y alcanza las dos familias de pantallas',
    (rol) => {
      expect(inicioDeLaSesion(rol, 'restaurante', hasPermission)).toBe('/');
      const rutas = navegacionParaRolYPlantilla(rol, 'restaurante', hasPermission).map(
        (n: { ruta: string }) => n.ruta,
      );
      for (const ruta of [
        '/',
        '/mesero',
        '/cocina',
        '/caja',
        '/ventas',
        '/configuracion',
        '/inventario',
        '/restaurante/cierre-diario-y-arqueo',
      ])
        expect(rutas).toContain(ruta);
      expect(new Set(rutas).size).toBe(rutas.length);
    },
  );
  it.each([
    ['mesero', '/mesero'],
    ['cocina', '/cocina'],
    ['caja', '/caja'],
  ])('%s abre su operación original: %s', (rol, ruta) => {
    expect(inicioDeLaSesion(rol, 'restaurante', hasPermission)).toBe(ruta);
    const menu = navegacionParaRolYPlantilla(rol, 'restaurante', hasPermission).map(
      (n: { ruta: string }) => n.ruta,
    );
    expect(menu).not.toContain('/');
    expect(menu).not.toContain('/configuracion');
    if (rol === 'mesero') expect(menu).toEqual(['/mesero']);
  });
});
