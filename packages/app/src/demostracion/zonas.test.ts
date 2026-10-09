import { describe, expect, it } from 'vitest';

import { crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { ORG, SUCURSAL } from '../restaurante/pruebas/sala.ts';
import { sembrarZonasDeTienda } from './zonas.ts';

/** La tienda de demostración nace con el anaquel en zonas (D-33 de la 2.4). */

describe('las zonas del anaquel de la tienda de demostración', () => {
  it('cada producto queda en su zona por su nombre, y lo que no casa va a Abarrotes', async () => {
    const insumo = (id: string, nombre: string) => ({
      id,
      organizacion_id: ORG,
      nombre,
      activo: true,
      zona_id: null,
    });
    const base = crearBaseFalsa({
      zonas_anaquel: [],
      insumos: [
        insumo('a1000000-0000-4000-8000-000000000001', 'Leche entera 1 L'),
        insumo('a1000000-0000-4000-8000-000000000002', 'Cerveza clara 355 ml'),
        insumo('a1000000-0000-4000-8000-000000000003', 'Detergente en polvo 1 kg'),
        insumo('a1000000-0000-4000-8000-000000000004', 'Frijol pinto 1 kg'),
      ],
    });

    const resumen = await sembrarZonasDeTienda(base.tx, ORG, SUCURSAL);

    expect(resumen).toEqual({ zonas: 4, productosEnZona: 4 });
    const zonaDe = (nombre: string) => {
      const zonaId = base.filas('insumos').find((i) => i['nombre'] === nombre)?.['zona_id'];
      return base.filas('zonas_anaquel').find((z) => z['id'] === zonaId)?.['nombre'];
    };
    expect(zonaDe('Leche entera 1 L')).toBe('Refrigerador');
    expect(zonaDe('Cerveza clara 355 ml')).toBe('Bebidas');
    expect(zonaDe('Detergente en polvo 1 kg')).toBe('Limpieza');
    expect(zonaDe('Frijol pinto 1 kg')).toBe('Abarrotes');
    expect(base.filas('zonas_anaquel').every((z) => z['sucursal_id'] === SUCURSAL)).toBe(true);
  });
});
