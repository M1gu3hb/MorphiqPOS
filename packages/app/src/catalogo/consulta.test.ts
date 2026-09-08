import type { Transaccion } from '@morphiqpos/data';
import { repoCatalogo } from '@morphiqpos/data';
import { describe, expect, it, vi } from 'vitest';

import { entradaBuscarProductos, listarProductos } from './consulta';

vi.mock('@morphiqpos/data', async () => {
  const original = await vi.importActual<typeof import('@morphiqpos/data')>('@morphiqpos/data');
  return {
    ...original,
    repoCatalogo: { buscarProductos: vi.fn() },
  };
});

describe('B-06 · consulta de catálogo para la pantalla', () => {
  it('valida filtros y serializa bigint y fechas para cruzar HTTP', async () => {
    vi.mocked(repoCatalogo.buscarProductos).mockResolvedValueOnce({
      productos: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          categoria_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          nombre: 'Taladro percutor 1/2 pulgada',
          descripcion: 'Velocidad variable y reversa',
          imagen_url: null,
          sku: 'TAL-PER-012',
          codigo_barras: '7501234567890',
          marca: 'Truper',
          precio_venta_centavos: 1_649_90n,
          costo_unitario_centavos: 1_180_25n,
          precio_mayoreo_centavos: 1_529_00n,
          cantidad_minima_mayoreo: '3.0000',
          tipo_venta: 'precio_fijo',
          unidad_venta: 'pieza',
          permite_venta_sin_stock: false,
          stock_minimo: '2.0000',
          visible_en_pos: true,
          updated_at: new Date('2026-09-07T20:15:00.000Z'),
          categoria_nombre: 'Herramienta eléctrica',
        },
      ],
      siguienteCursor: {
        updatedAt: new Date('2026-09-07T20:15:00.000Z'),
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    });

    const salida = await listarProductos(
      {} as Transaccion,
      '11111111-1111-4111-8111-111111111111',
      entradaBuscarProductos.parse({ busqueda: 'taladro', limite: 24 }),
    );

    expect(salida.productos[0]).toMatchObject({
      precioVentaCentavos: '164990',
      costoUnitarioCentavos: '118025',
      precioMayoreoCentavos: '152900',
      updatedAt: '2026-09-07T20:15:00.000Z',
    });
    expect(salida.siguienteCursor?.updatedAt).toBe('2026-09-07T20:15:00.000Z');
  });

  it('rechaza límites que permitirían descargar el catálogo completo', () => {
    expect(entradaBuscarProductos.safeParse({ limite: 51 }).success).toBe(false);
  });
});
