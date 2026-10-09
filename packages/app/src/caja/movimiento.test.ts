import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, PREDETERMINADOS, sesionCajaAbierta } from '../restaurante/pruebas/sala.ts';
import { registrarMovimientoCaja } from './sesion.ts';

/**
 * `caja.movimiento` · el signo de lo que entra y sale del cajón a mano (auditoría 2.4).
 *
 * El esquema acepta un AJUSTE negativo —«un ajuste a la baja lo es»— y el comando le
 * quitaba el signo con `Math.abs`: todo ajuste sumaba al cajón.
 */

const AHORA = new Date('2026-09-26T20:00:00.000Z');

function baseDe() {
  return crearBaseFalsa(
    { sesiones_caja: [sesionCajaAbierta()], movimientos_caja: [] },
    { predeterminados: PREDETERMINADOS },
  );
}

async function registrar(tipo: 'gasto' | 'retiro' | 'deposito' | 'ajuste', monto: number) {
  const base = baseDe();
  const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
  await registrarMovimientoCaja.ejecutar(ctx, { tipo, montoCentavos: monto, motivo: 'prueba' });
  return base.campo('movimientos_caja', 'monto_centavos');
}

describe('caja.movimiento', () => {
  it('el AJUSTE a la baja resta; el ajuste al alza suma', async () => {
    expect(await registrar('ajuste', -2_500)).toBe(-2_500n);
    expect(await registrar('ajuste', 2_500)).toBe(2_500n);
  });

  it('gasto y retiro salen; depósito entra, venga el signo como venga', async () => {
    expect(await registrar('gasto', 1_000)).toBe(-1_000n);
    expect(await registrar('retiro', -1_000)).toBe(-1_000n);
    expect(await registrar('deposito', -1_000)).toBe(1_000n);
  });
});
