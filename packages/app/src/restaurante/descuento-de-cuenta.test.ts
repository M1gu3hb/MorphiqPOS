import { describe, expect, it } from 'vitest';

import { descontarCuenta, motivoParaNoDescontar } from './descuento-de-cuenta.ts';

/**
 * Día completo del restaurante (2.4) · EL DESCUENTO DE LA CUENTA DE UNA MESA. El restaurante
 * no tenía ninguno: el del mostrador exige un borrador y la cuenta de una mesa llega a caja
 * ya pedida. La guarda de aquí es OTRA y es la que decide qué se puede descontar.
 */

const MESA = '11111111-1111-4111-8111-111111111111';
const MADRE = '22222222-2222-4222-8222-222222222222';

describe('qué cuenta se puede descontar', () => {
  it('la de una mesa que pidió la cuenta, y la parte de una cuenta dividida', () => {
    expect(
      motivoParaNoDescontar({ estado: 'cuenta_solicitada', mesaId: MESA, padreId: null }),
    ).toBeNull();
    expect(
      motivoParaNoDescontar({ estado: 'confirmada', mesaId: null, padreId: MADRE }),
    ).toBeNull();
  });

  it('NO una venta de mostrador: su descuento es el del cobro donde se armó', () => {
    expect(motivoParaNoDescontar({ estado: 'borrador', mesaId: null, padreId: null })).toMatch(
      /no es la cuenta de una mesa/,
    );
  });

  it('NO una cuenta cobrada, cancelada o ya dividida', () => {
    expect(motivoParaNoDescontar({ estado: 'pagada', mesaId: MESA, padreId: null })).toMatch(
      /devolución/,
    );
    for (const estado of ['cancelada', 'dividida']) {
      expect(motivoParaNoDescontar({ estado, mesaId: MESA, padreId: null })).toMatch(
        /ya no está viva/,
      );
    }
  });

  it('es de caja y de quien dirige: el mesero NO descuenta (02-DINERO-Y-CAJA §3)', () => {
    expect([...descontarCuenta.roles].sort()).toEqual([
      'administrador',
      'cajero',
      'dueno',
      'gerente',
    ]);
    expect(descontarCuenta.paquetes).toEqual(['restaurante']);
  });
});
