import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa } from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  CUENTA,
  linea,
  ORG,
  ordenDeMesa,
  PREDETERMINADOS,
  sesionCajaAbierta,
} from '../restaurante/pruebas/sala.ts';
import { cobrarOrden } from './cobrar.ts';

/**
 * UNA NOTA QUE SALIÓ FIRMADA A CRÉDITO NO SE COBRA OTRA VEZ EN CAJA (auditoría 2.4).
 *
 * La remisión sube el saldo del cliente por esa entrega. `venta.cobrar` no miraba las
 * remisiones: la misma nota se podía cobrar además en efectivo y el material entraba
 * dos veces en el dinero —una como deuda, otra como venta de contado—.
 */

const AHORA = new Date('2026-09-26T18:00:00.000Z');

function baseDe(remisiones: readonly Record<string, unknown>[]) {
  return crearBaseFalsa(
    {
      ordenes: [ordenDeMesa('confirmada', { cliente_id: null })],
      orden_lineas: [linea()],
      sesiones_caja: [sesionCajaAbierta()],
      almacenes: [],
      configuracion: [],
      remisiones: [...remisiones],
    },
    { predeterminados: PREDETERMINADOS, filasCrudas: [{ siguiente: 1n }] },
  );
}

describe('el cobro de una nota remitida', () => {
  it('se niega, dice con qué remisión salió y no escribe un pago', async () => {
    const base = baseDe([
      {
        id: 'r1111111-1111-4111-8111-111111111111',
        organizacion_id: ORG,
        orden_id: CUENTA,
        folio: 'REM-7',
      },
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await cobrarOrden
      .ejecutar(ctx, {
        ordenId: CUENTA,
        pagos: [{ metodo: 'efectivo', montoCentavos: 10_000, recibidoCentavos: 10_000 }],
      })
      .then(() => null)
      .catch((error: unknown) => error);

    expect(esErrorDominio(fallo) ? fallo.codigo : String(fallo)).toBe('ORDEN_NO_EDITABLE');
    expect(esErrorDominio(fallo) ? fallo.message : '').toContain('REM-7');
    expect(base.filas('pagos')).toHaveLength(0);
    expect(base.campo('ordenes', 'estado')).toBe('confirmada');
  });

  it('sin remisión se cobra como siempre', async () => {
    const base = baseDe([]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await cobrarOrden.ejecutar(ctx, {
      ordenId: CUENTA,
      pagos: [{ metodo: 'efectivo', montoCentavos: 10_000, recibidoCentavos: 10_000 }],
    });

    expect(base.campo('ordenes', 'estado')).toBe('pagada');
  });
});
