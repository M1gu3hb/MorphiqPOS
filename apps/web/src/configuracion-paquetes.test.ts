import { describe, expect, it } from 'vitest';

import { PAQUETES_NEGOCIO } from '../app/(gestion)/configuracion/paquetes';

describe('B-07 · selector de paquete', () => {
  it('expone los cinco giros con una explicación comercial', () => {
    expect(PAQUETES_NEGOCIO.map(({ id }) => id)).toEqual([
      'tienda',
      'ferreteria',
      'farmacia',
      'cafeteria',
      'restaurante',
    ]);
    expect(PAQUETES_NEGOCIO.every(({ descripcion }) => descripcion.length >= 20)).toBe(true);
  });
});
