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
      // Sin «vistas adicionales» (D-52): del juego nuevo sólo el cierre del día va al menú.
      expect(rutas.filter((r: string) => r.startsWith('/restaurante/'))).toEqual([
        '/restaurante/cierre-diario-y-arqueo',
      ]);
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
        etiquetaDeNavegacion(
          {
            label: entrada?.etiqueta,
            entidad: entrada?.entidad,
            pluralPropio: entrada?.pluralPropio,
          },
          vocabulario,
        ),
      ).toBe(etiqueta);
    }
  });
  it('con la plantilla del restaurante, otro giro nombra esas entradas con su diccionario', () => {
    // Café Jacaranda: giro cafetería con la plantilla del restaurante. Su mesero es
    // «barista» y su cocina, «barra»; el menú lo dice así, no «Mesas y pedidos».
    const menu = navegacionParaRolYPlantilla('administrador', 'restaurante', hasPermission);
    const cafeteria = {
      plural: (entidad: string) => (entidad === 'responsable' ? 'baristas' : 'barras'),
    };
    for (const [ruta, etiqueta] of [
      ['/mesero', 'Baristas'],
      ['/cocina', 'Barras'],
    ]) {
      const entrada = menu.find((n: { ruta: string }) => n.ruta === ruta);
      expect(
        etiquetaDeNavegacion(
          {
            label: entrada?.etiqueta,
            entidad: entrada?.entidad,
            pluralPropio: entrada?.pluralPropio,
          },
          cafeteria,
        ),
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
