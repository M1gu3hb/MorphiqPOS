import { describe, expect, it } from 'vitest';
import { etiquetaDeNavegacion, hasPermission } from '../../heredado/lib/permissions.js';
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
  it('las entradas de operación conservan nombres de pantallas, no plurales de puestos', () => {
    const menu = navegacionParaRolYPlantilla('administrador', 'restaurante', hasPermission);
    const vocabulario = {
      plural: (entidad: string) => (entidad === 'responsable' ? 'meseros' : 'cocinas'),
    };
    for (const [ruta, etiqueta] of [
      ['/mesero', 'Mesas y pedidos'],
      ['/cocina', 'Cocina'],
    ]) {
      const entrada = menu.find((n: { ruta: string }) => n.ruta === ruta);
      expect(entrada).toBeDefined();
      expect(
        etiquetaDeNavegacion({ label: entrada?.etiqueta, entidad: entrada?.entidad }, vocabulario),
      ).toBe(etiqueta);
    }
  });
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
