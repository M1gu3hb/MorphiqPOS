import { describe, expect, it } from 'vitest';

import { mesasElegibles, type MesaElegible } from './mesas-elegibles';

const mesa = (id: string, numero: number, extra: Partial<MesaElegible> = {}): MesaElegible => ({
  id,
  numero,
  estado: 'libre',
  zona: 'Salón',
  venta_activa_id: null,
  unida_a_mesa_id: null,
  ...extra,
});

describe('a qué mesas se lleva una cuenta', () => {
  it('libres y sin cuenta, por número; ni la propia ni las ocupadas', () => {
    const mesas = [
      mesa('c', 3),
      mesa('a', 1),
      mesa('propia', 2),
      mesa('ocupada', 4, { estado: 'ocupada', venta_activa_id: 'o' }),
    ];
    expect(mesasElegibles(mesas, 'propia').map((m) => m.numero)).toEqual([1, 3]);
  });

  it('una mesa oculta en una unión no recibe cuentas (DP-9.6)', () => {
    const mesas = [mesa('p', 4), mesa('absorbida', 5, { unida_a_mesa_id: 'p' })];
    expect(mesasElegibles(mesas, 'otra').map((m) => m.numero)).toEqual([4]);
  });
});
