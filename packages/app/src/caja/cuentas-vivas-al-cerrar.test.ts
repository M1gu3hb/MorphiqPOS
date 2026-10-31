import { ErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { decidirElCierre, lasMesas } from './cuentas-vivas-al-cerrar.ts';

/** DP-10.2 · qué hace el cierre con las cuentas vivas, sin base. */

describe('decidirElCierre', () => {
  it('sin cuentas vivas cierra sin aviso, sea o no la última', () => {
    expect(decidirElCierre({ cuentas: 0, mesas: [] }, 0)).toBeNull();
    expect(decidirElCierre({ cuentas: 0, mesas: [] }, 2)).toBeNull();
  });

  it('la última caja con cuentas vivas no cierra, y dice cuáles mesas', () => {
    let error: unknown = null;
    try {
      decidirElCierre({ cuentas: 2, mesas: [1, 2] }, 0);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorDominio);
    expect(error).toMatchObject({
      codigo: 'TRANSICION_INVALIDA',
      detalles: { cuentasVivas: 2, mesas: '1, 2' },
    });
    expect((error as Error).message).toMatch(/las mesas 1 y 2/);
  });

  it('con otra caja abierta, cierra y avisa', () => {
    expect(decidirElCierre({ cuentas: 1, mesas: [3] }, 1)).toEqual({
      cuentasVivas: 1,
      mesas: [3],
      otrasCajasAbiertas: 1,
      mensaje: 'Quedan cuentas sin cobrar en la mesa 3: las cobrará la otra caja abierta.',
    });
  });
});

describe('lasMesas', () => {
  it('nombra una, dos o varias', () => {
    expect(lasMesas([3])).toBe('la mesa 3');
    expect(lasMesas([1, 2])).toBe('las mesas 1 y 2');
    expect(lasMesas([1, 2, 5])).toBe('las mesas 1, 2 y 5');
    expect(lasMesas([])).toBe('cuentas sin mesa');
  });
});
