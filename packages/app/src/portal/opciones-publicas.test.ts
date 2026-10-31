import { describe, expect, it } from 'vitest';

import { gruposPorProducto, type FilaDeOpcion } from './opciones-publicas.ts';

/**
 * LAS OPCIONES DE UN PLATILLO, EN EL MENÚ PÚBLICO (DP-5, portal QR).
 *
 * `ProductoQRDialog` sabe pintar los grupos de opciones —el sabor del pulque, el relleno de la
 * quesadilla— y el carrito los pliega en la nota del pedido, pero el menú público no los mandaba:
 * desde el QR no se podía elegir el sabor. Salen con su NOMBRE y nada más: en el restaurante una
 * opción no cobra (DP-D12), así que no hay precio que publicar.
 */
const fila = (cambios: Partial<FilaDeOpcion>): FilaDeOpcion => ({
  producto_id: 'pulque',
  grupo_id: 'g-sabor',
  grupo: 'Sabor (básico)',
  obligatorio: true,
  tipo: 'unica',
  opcion_id: 'o-1',
  opcion: 'Avena',
  ...cambios,
});

describe('gruposPorProducto', () => {
  it('junta las opciones de cada grupo de cada producto, en el orden en que llegan', () => {
    const grupos = gruposPorProducto([
      fila({ opcion_id: 'o-1', opcion: 'Avena' }),
      fila({ opcion_id: 'o-2', opcion: 'Fresa' }),
      fila({
        producto_id: 'quesadilla',
        grupo_id: 'g-relleno',
        grupo: 'Relleno',
        opcion_id: 'o-3',
        opcion: 'Queso',
      }),
    ]);
    expect(grupos.get('pulque')).toEqual([
      {
        nombre: 'Sabor (básico)',
        obligatorio: true,
        tipo: 'unica',
        opciones: [
          { id: 'o-1', nombre: 'Avena' },
          { id: 'o-2', nombre: 'Fresa' },
        ],
      },
    ]);
    expect(grupos.get('quesadilla')?.[0]?.opciones).toEqual([{ id: 'o-3', nombre: 'Queso' }]);
  });

  it('dos grupos del mismo producto quedan separados', () => {
    const grupos = gruposPorProducto([
      fila({ grupo_id: 'g-1', grupo: 'Sabor' }),
      fila({
        grupo_id: 'g-2',
        grupo: 'Tamaño',
        obligatorio: false,
        tipo: 'multiple',
        opcion_id: 'o-9',
        opcion: 'Grande',
      }),
    ]);
    expect(grupos.get('pulque')?.map((g) => [g.nombre, g.obligatorio, g.tipo])).toEqual([
      ['Sabor', true, 'unica'],
      ['Tamaño', false, 'multiple'],
    ]);
  });

  it('un tipo desconocido se publica como «unica», que es lo que el diálogo entiende', () => {
    const grupos = gruposPorProducto([fila({ tipo: 'raro' })]);
    expect(grupos.get('pulque')?.[0]?.tipo).toBe('unica');
  });

  it('sin filas, nada', () => {
    expect(gruposPorProducto([]).size).toBe(0);
  });
});
