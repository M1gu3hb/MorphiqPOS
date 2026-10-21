import { describe, expect, it } from 'vitest';

import { hasPermission } from '../../heredado/lib/permissions.js';
import { rutaPermitidaParaElPuesto } from './package-config.ts';

/**
 * LA PANTALLA DE OTRO PUESTO NO SE PINTA, tampoco tecleando la ruta (cierre del 21-10).
 *
 * `AppLayout` sólo miraba las doce rutas del menú heredado: la mesera abría el mostrador
 * (`/pos`) y la cocina el cobro y las recetas del restaurante (`/restaurante/...`). Aquí se
 * pregunta lo mismo que pregunta `AppLayout`, puesto por puesto, en el restaurante.
 */

const VISTAS_DEL_RESTAURANTE = [
  '/restaurante/mapa-de-mesas',
  '/restaurante/mesa-activa',
  '/restaurante/precuenta',
  '/restaurante/cocina',
  '/restaurante/cobro',
  '/restaurante/caja',
  '/restaurante/cierre-diario-y-arqueo',
  '/restaurante/productos',
  '/restaurante/recetas',
  '/restaurante/inventario',
  '/restaurante/registros',
];

// El módulo es JavaScript sin tipos: `=== true` hace del resultado un booleano de verdad.
const puede = (ruta: string, rol: string): boolean =>
  rutaPermitidaParaElPuesto(ruta, rol, 'restaurante', hasPermission) === true;

describe('rutas del restaurante por puesto', () => {
  it.each(['dueno', 'administrador'])('%s abre todas las vistas del restaurante', (rol) => {
    for (const ruta of VISTAS_DEL_RESTAURANTE) expect(puede(ruta, rol), ruta).toBe(true);
  });

  // D-52 (21-10): ya no hay menú de «vistas adicionales»; cada vista pide el permiso de su
  // puesto. La mesera abre la mesa activa (dividir, unir, cambiar, separar) desde sus mesas.
  it.each([
    [
      'mesero',
      ['/restaurante/mapa-de-mesas', '/restaurante/mesa-activa', '/restaurante/precuenta'],
    ],
    ['cocina', ['/restaurante/cocina']],
    ['caja', ['/restaurante/cobro', '/restaurante/caja', '/restaurante/cierre-diario-y-arqueo']],
    ['almacen', ['/restaurante/productos', '/restaurante/recetas', '/restaurante/inventario']],
  ] as const)('%s abre sólo las vistas de su puesto', (rol, suyas) => {
    for (const ruta of VISTAS_DEL_RESTAURANTE)
      expect(puede(ruta, rol), ruta).toBe((suyas as readonly string[]).includes(ruta));
  });

  it('el mostrador (/pos) es de la caja y de dirección: ni la mesera ni la cocina', () => {
    expect(puede('/pos', 'caja')).toBe(true);
    expect(puede('/pos', 'dueno')).toBe(true);
    expect(puede('/pos', 'mesero')).toBe(false);
    expect(puede('/pos', 'cocina')).toBe(false);
    expect(puede('/pos', 'almacen')).toBe(false);
  });

  it('cada quien su pantalla de trabajo, y las ajenas no', () => {
    expect(puede('/mesero', 'mesero')).toBe(true);
    expect(puede('/cocina', 'cocina')).toBe(true);
    expect(puede('/caja', 'caja')).toBe(true);
    expect(puede('/caja', 'mesero')).toBe(false);
    expect(puede('/caja', 'cocina')).toBe(false);
    expect(puede('/recetas', 'cocina')).toBe(false);
    expect(puede('/configuracion', 'caja')).toBe(false);
    expect(puede('/', 'mesero')).toBe(false);
  });

  it('lo que se abre SIN sesión no se toca: el PIN y el portal del comensal', () => {
    expect(puede('/restaurante/acceso-por-pin', 'mesero')).toBe(true);
    expect(puede('/restaurante/portal-del-comensal', 'cocina')).toBe(true);
  });
});
