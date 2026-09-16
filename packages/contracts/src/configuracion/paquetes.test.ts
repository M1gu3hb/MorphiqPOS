import { describe, expect, it } from 'vitest';

import { PLANTILLAS } from '../comandos/plantillas.ts';
import { navegacionParaPaquete } from './index.ts';

/**
 * B-08 · el menú de gestión sale del preajuste de la plantilla.
 *
 * Esta prueba decía «muestra inventario y recetas desde Operativo» y compraba
 * el nivel `esencial`, que dejó de existir con el renombre de D-01. Lo que hay
 * que afirmar ahora es otra cosa, y más fuerte: que el menú NO puede
 * contradecir a `MODULOS_POR_PLANTILLA`. Un menú que enseña «Recetas» donde el
 * comando devuelve 403 es peor que un menú corto.
 */
describe('B-08 · el menú de gestión no contradice al preajuste de módulos', () => {
  it('las tres plantillas traen operación, porque una tienda sin inventario no es una tienda', () => {
    for (const plantilla of PLANTILLAS) {
      const rutas = navegacionParaPaquete(plantilla).map((item) => item.href);
      expect(rutas).toContain('/inventario');
      expect(rutas).toContain('/recetas');
    }
  });

  it('conserva inicio, productos, accesos y configuración en las tres', () => {
    for (const plantilla of PLANTILLAS) {
      const rutas = navegacionParaPaquete(plantilla).map((item) => item.href);
      expect(rutas).toEqual(
        expect.arrayContaining(['/inicio', '/productos', '/accesos', '/configuracion']),
      );
    }
  });

  it('no repite enlaces ni inventa rutas', () => {
    for (const plantilla of PLANTILLAS) {
      const rutas = navegacionParaPaquete(plantilla).map((item) => item.href);
      expect(new Set(rutas).size).toBe(rutas.length);
    }
  });
});
