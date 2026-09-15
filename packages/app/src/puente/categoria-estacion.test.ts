import { describe, expect, it } from 'vitest';

import { entidadMapeada } from './mapa.ts';

describe('CategoriaProducto · estación de preparación', () => {
  it('escribe sólo la clave foránea y deriva el nombre y el color', () => {
    const categoria = entidadMapeada('CategoriaProducto');
    expect(categoria).not.toBeNull();
    if (categoria === null) return;

    expect(categoria.campos['estacion_preparacion_id']).toMatchObject({
      columna: 'estacion_preparacion_id',
      conversion: 'texto',
    });
    expect(categoria.derivados?.['estacion_preparacion_nombre']).toMatchObject({
      tabla: 'estaciones_preparacion',
      porColumna: 'estacion_preparacion_id',
      columna: 'nombre',
    });
    expect(categoria.derivados?.['estacion_preparacion_color']).toMatchObject({
      tabla: 'estaciones_preparacion',
      porColumna: 'estacion_preparacion_id',
      columna: 'color',
    });
  });
});
