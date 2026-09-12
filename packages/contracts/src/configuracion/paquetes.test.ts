import { describe, expect, it } from 'vitest';

import { navegacionParaPaquete } from './index.ts';

describe('B-08 · capacidades visibles por paquete', () => {
  it('muestra inventario y recetas desde Operativo', () => {
    expect(navegacionParaPaquete('esencial').map((item) => item.href)).not.toContain('/recetas');
    expect(navegacionParaPaquete('esencial').map((item) => item.href)).not.toContain('/inventario');
    expect(navegacionParaPaquete('operativo').map((item) => item.href)).toContain('/recetas');
    expect(navegacionParaPaquete('restaurante_pro').map((item) => item.href)).toContain('/recetas');
  });

  it('conserva inicio, productos, accesos y configuración en los tres paquetes', () => {
    for (const paquete of ['esencial', 'operativo', 'restaurante_pro'] as const) {
      const rutas = navegacionParaPaquete(paquete).map((item) => item.href);
      expect(rutas).toEqual(
        expect.arrayContaining(['/inicio', '/productos', '/accesos', '/configuracion']),
      );
    }
  });
});
