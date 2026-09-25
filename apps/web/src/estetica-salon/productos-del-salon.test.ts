import { describe, expect, it } from 'vitest';

import { sinServicios } from './productos-del-salon.ts';

describe('los productos del salón', () => {
  it('no son los servicios: el corte no está en el anaquel', () => {
    const filas: readonly {
      readonly id: string;
      readonly duracion_activa_1_min?: number | null;
    }[] = [
      { id: 'shampoo', duracion_activa_1_min: null },
      { id: 'corte', duracion_activa_1_min: 40 },
      { id: 'tinte-6' },
      { id: 'balayage', duracion_activa_1_min: 0 },
    ];
    expect(sinServicios(filas).map((f) => f.id)).toEqual(['shampoo', 'tinte-6']);
  });
});
