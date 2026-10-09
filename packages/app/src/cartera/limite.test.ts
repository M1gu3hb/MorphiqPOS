import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { entradaFijarLimite, fijarLimiteDeCredito } from './limite.ts';

/**
 * `credito.fijar_limite` · el límite que nadie escribía (C.10 de la 2.4).
 *
 * Defienden: que se escriba, que quede el anterior y el motivo en la bitácora, que
 * sólo lo fije quien responde por el dinero y que el cliente de otro negocio no
 * exista para éste.
 */

const AHORA = new Date('2026-09-25T12:00:00.000Z');
const CLIENTE = 'c7000000-0000-4000-8000-000000000001';

function baseDe() {
  return crearBaseFalsa({
    clientes: [
      {
        id: CLIENTE,
        organizacion_id: ORG,
        nombre: 'Construcciones del Valle',
        limite_credito_centavos: 0n,
      },
    ],
  });
}

const fijar = (cambios: Record<string, unknown> = {}) =>
  entradaFijarLimite.parse({
    clienteId: CLIENTE,
    limiteCentavos: 8_000_000,
    motivo: 'Paga cada quincena desde hace un año',
    ...cambios,
  });

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('credito.fijar_limite', () => {
  it('ESCRIBE el límite y deja el de antes y el motivo en la bitácora', async () => {
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await fijarLimiteDeCredito.ejecutar(ctx, fijar());

    expect(base.campo('clientes', 'limite_credito_centavos')).toBe(8_000_000n);
    expect(salida).toEqual({
      clienteId: CLIENTE,
      anteriorCentavos: '0',
      limiteCentavos: '8000000',
    });
    expect(auditorias[0]?.payload).toMatchObject({
      anteriorCentavos: '0',
      limiteCentavos: '8000000',
      motivo: 'Paga cada quincena desde hace un año',
    });
  });

  it('LO FIJA QUIEN RESPONDE POR EL DINERO: el cajero no se sube el límite a nadie', () => {
    expect(fijarLimiteDeCredito.roles).not.toContain('cajero');
    expect(fijarLimiteDeCredito.roles).not.toContain('gerente');
    expect([...fijarLimiteDeCredito.roles].sort()).toEqual(['administrador', 'dueno']);
  });

  it('sin motivo no se fija', () => {
    expect(
      entradaFijarLimite.safeParse({ clienteId: CLIENTE, limiteCentavos: 1, motivo: 'ok' }).success,
    ).toBe(false);
  });

  it('un cliente de otro negocio no existe', async () => {
    const base = crearBaseFalsa({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    expect(await codigoDe(() => fijarLimiteDeCredito.ejecutar(ctx, fijar()))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});
