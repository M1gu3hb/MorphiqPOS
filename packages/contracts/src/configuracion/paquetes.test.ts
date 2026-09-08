import { describe, expect, it } from 'vitest';

import { navegacionParaPaquete } from './index';

describe('B-08 · capacidades visibles por paquete', () => {
  it('muestra recetas únicamente en cafetería y restaurante', () => {
    expect(navegacionParaPaquete('tienda').map((item) => item.href)).not.toContain('/recetas');
    expect(navegacionParaPaquete('ferreteria').map((item) => item.href)).not.toContain('/recetas');
    expect(navegacionParaPaquete('farmacia').map((item) => item.href)).not.toContain('/recetas');
    expect(navegacionParaPaquete('cafeteria').map((item) => item.href)).toContain('/recetas');
    expect(navegacionParaPaquete('restaurante').map((item) => item.href)).toContain('/recetas');
  });

  it('conserva inicio, productos, inventario y configuración en los cinco paquetes', () => {
    for (const paquete of [
      'tienda',
      'ferreteria',
      'farmacia',
      'cafeteria',
      'restaurante',
    ] as const) {
      const rutas = navegacionParaPaquete(paquete).map((item) => item.href);
      expect(rutas).toEqual(
        expect.arrayContaining(['/inicio', '/productos', '/inventario', '/configuracion']),
      );
    }
  });
});
