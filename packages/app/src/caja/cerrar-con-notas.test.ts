import type { Ambito } from '@morphiqpos/contracts';
import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { cerrarCaja } from './sesion.ts';

/**
 * `ferreteria/02-DINERO-Y-CAJA §8.5.1` · NO SE CIERRA LA CAJA CON NOTAS SIN RESOLVER
 * (bloque D de la 2.4).
 *
 * En el modo B el mostrador manda la nota a caja y la caja la cobra. Una nota mandada y no
 * cobrada es material comprometido que nadie pagó: «o se cobra, o se cancela y el material
 * vuelve a estar disponible». El cierre la dejaba pasar, y el patio amanecía con material
 * apartado para un cliente que ningún corte nombraba.
 */

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const OTRA_SUCURSAL = '22222222-2222-4222-8222-999999999999';
const TERMINAL = '33333333-3333-4333-8333-333333333333';
const SESION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDEN = 'o1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-10-09T02:00:00.000Z');

const AMBITO: Ambito = {
  organizacionId: ORGANIZACION,
  sucursalId: SUCURSAL,
  terminalId: TERMINAL,
  identidadId: '44444444-4444-4444-8444-444444444444',
  empleoId: '55555555-5555-4555-8555-555555555555',
  rol: 'gerente',
};

function nota(cambios: Fila = {}): Fila {
  return {
    id: 'n1111111-1111-4111-8111-111111111111',
    organizacion_id: ORGANIZACION,
    sucursal_id: SUCURSAL,
    orden_id: ORDEN,
    folio: 'N-12',
    estado: 'por_cobrar',
    ...cambios,
  };
}

function baseCon(notas: readonly Fila[], estadoDeLaOrden: string) {
  return crearBaseFalsa(
    {
      sesiones_caja: [
        {
          id: SESION,
          organizacion_id: ORGANIZACION,
          sucursal_id: SUCURSAL,
          terminal_id: TERMINAL,
          estado: 'abierta',
          serie: 'CC',
          folio: null,
          abierta_en: new Date('2026-10-08T13:30:00.000Z'),
          fondo_inicial_centavos: 250_000n,
        },
      ],
      notas_mostrador: notas,
      ordenes: [{ id: ORDEN, organizacion_id: ORGANIZACION, estado: estadoDeLaOrden }],
    },
    // `arqueoDeSesion` y `tomarFolio` van en SQL crudo.
    { filasCrudas: [{ siguiente: 7, fondo: '250000', esperado: '250000', ventas: '0' }] },
  );
}

async function cerrar(base: ReturnType<typeof baseCon>): Promise<string> {
  const { ctx } = contextoFalso(base.tx, AMBITO, AHORA);
  try {
    await cerrarCaja.ejecutar(ctx, { efectivoContadoCentavos: 250_000 });
    return 'CERRÓ';
  } catch (error) {
    if (!esErrorDominio(error)) throw error;
    return `${error.codigo}: ${error.message}`;
  }
}

describe('caja.cerrar · las notas mandadas a caja', () => {
  it('una nota mandada a caja y sin cobrar NO deja cerrar, y se dice cuál', async () => {
    const base = baseCon([nota()], 'confirmada');

    const salida = await cerrar(base);

    expect(salida).toMatch(/^TRANSICION_INVALIDA: /);
    expect(salida).toContain('N-12');
    expect(salida).toContain('cóbralas o cancélalas');
    expect(base.campo('sesiones_caja', 'estado')).toBe('abierta');
  });

  it('cobrada —o firmada a crédito, que ya es venta—, aunque el material siga en el patio, sí cierra', async () => {
    expect(await cerrar(baseCon([nota()], 'pagada'))).toBe('CERRÓ');
  });

  it('cancelada, sí cierra', async () => {
    expect(await cerrar(baseCon([nota({ estado: 'cancelada' })], 'cancelada'))).toBe('CERRÓ');
  });

  it('la nota de OTRA sucursal no detiene esta caja', async () => {
    expect(await cerrar(baseCon([nota({ sucursal_id: OTRA_SUCURSAL })], 'confirmada'))).toBe(
      'CERRÓ',
    );
  });
});
