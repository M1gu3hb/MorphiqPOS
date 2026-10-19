import { describe, expect, it } from 'vitest';

import { montoConSigno } from './caja.ts';

/**
 * El signo de un movimiento de caja lo pone su tipo (auditoría de la 2.4): dos comandos
 * grababan un `retiro` positivo y Postgres lo rechaza (`movimiento_signo_coherente`).
 */
describe('el signo de un movimiento de caja', () => {
  it('lo que SALE del cajón es negativo, venga como venga', () => {
    for (const tipo of ['retiro', 'gasto', 'devolucion']) {
      expect(montoConSigno(tipo, 500n)).toBe(-500n);
      expect(montoConSigno(tipo, -500n)).toBe(-500n);
    }
  });

  it('lo que ENTRA es positivo', () => {
    for (const tipo of ['apertura', 'venta', 'deposito', 'propina']) {
      expect(montoConSigno(tipo, -500n)).toBe(500n);
      expect(montoConSigno(tipo, 500n)).toBe(500n);
    }
  });

  it('el ajuste y los tipos nuevos conservan el signo que traen', () => {
    expect(montoConSigno('ajuste', -300n)).toBe(-300n);
    expect(montoConSigno('ajuste', 300n)).toBe(300n);
    expect(montoConSigno('liquidacion', -900n)).toBe(-900n);
  });
});
