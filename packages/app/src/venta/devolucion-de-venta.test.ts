import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  CARRITO_MOSTRADOR,
  linea,
  ORG,
  ordenDeMostrador,
  PREDETERMINADOS,
  SESION_CAJA,
  sesionCajaAbierta,
} from '../restaurante/pruebas/sala.ts';

import { devolverVenta } from './devolucion-de-venta.ts';

/**
 * D-29 · LA DEVOLUCIÓN DE VENTA, total y parcial.
 *
 * Lo que se defiende: que se devuelve lo COBRADO de cada línea y nada más, que devolver a
 * pedazos suma exacto, que el efectivo sale del cajón de esta terminal y del método con
 * que se pagó, que la venta queda «parcialmente reembolsada» o «reembolsada», y que lo
 * que no se puede hacer no escribe nada.
 */

const AHORA = new Date('2026-10-09T18:00:00.000Z');
const LINEA_ACEITE = 'c1111111-1111-4111-8111-111111111111';
const LINEA_ARROZ = 'c2222222-2222-4222-8222-222222222222';

/** Tres aceites por $100.00 y un arroz por $50.00: $150.00, $100 en efectivo y $50 con tarjeta. */
function baseDe(cambios: { estado?: string; sucursal?: string; caja?: boolean } = {}) {
  const lineas: Fila[] = [
    linea({
      id: LINEA_ACEITE,
      orden_id: CARRITO_MOSTRADOR,
      producto_nombre: 'Aceite 1 L',
      cantidad: '3.0000',
      subtotal_centavos: 10_000n,
      total_centavos: 10_000n,
      anulada_en: null,
    }),
    linea({
      id: LINEA_ARROZ,
      orden_id: CARRITO_MOSTRADOR,
      producto_nombre: 'Arroz 1 kg',
      cantidad: '1.0000',
      subtotal_centavos: 5_000n,
      total_centavos: 5_000n,
      orden_visual: 2,
      anulada_en: null,
    }),
  ];
  return crearBaseFalsa(
    {
      ordenes: [
        {
          ...ordenDeMostrador(cambios.estado ?? 'pagada'),
          total_centavos: 15_000n,
          ...(cambios.sucursal === undefined ? {} : { sucursal_id: cambios.sucursal }),
        },
      ],
      orden_lineas: lineas,
      pagos: [
        {
          id: 'p1',
          organizacion_id: ORG,
          orden_id: CARRITO_MOSTRADOR,
          metodo: 'efectivo',
          monto_centavos: 10_000n,
          estado: 'confirmado',
        },
        {
          id: 'p2',
          organizacion_id: ORG,
          orden_id: CARRITO_MOSTRADOR,
          metodo: 'tarjeta',
          monto_centavos: 5_000n,
          estado: 'confirmado',
        },
      ],
      sesiones_caja: cambios.caja === false ? [] : [sesionCajaAbierta()],
      movimientos_caja: [],
      devoluciones: [],
      devoluciones_lineas: [],
      almacenes: [],
    },
    { predeterminados: PREDETERMINADOS },
  );
}

async function fallo(promesa: Promise<unknown>): Promise<string> {
  const error = await promesa.then(() => null).catch((e: unknown) => e);
  return esErrorDominio(error) ? error.codigo : String(error);
}

const devolver = (
  ctx: Parameters<typeof devolverVenta.ejecutar>[0],
  lineas: { ordenLineaId: string; cantidad: string }[],
  metodo: 'efectivo' | 'tarjeta' | 'transferencia' = 'efectivo',
) =>
  devolverVenta.ejecutar(ctx, {
    ordenId: CARRITO_MOSTRADOR,
    lineas,
    metodo,
    motivo: 'venía abierto',
    regresaAlInventario: true,
  });

describe('D-29 · devolver una parte', () => {
  it('saca del cajón lo cobrado de esa parte, y la venta queda parcialmente reembolsada', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await devolver(ctx, [{ ordenLineaId: LINEA_ACEITE, cantidad: '1' }]);

    expect(salida.montoCentavos).toBe('3333');
    expect(salida.estado).toBe('parcialmente_reembolsada');
    expect(base.filas('devoluciones')).toHaveLength(1);
    expect(base.filas('devoluciones')[0]).toMatchObject({
      metodo: 'efectivo',
      monto_centavos: 3_333n,
      sesion_caja_id: SESION_CAJA,
    });
    const [movimiento] = base.filas('movimientos_caja');
    expect(movimiento).toMatchObject({ tipo: 'devolucion', referencia_tipo: 'devolucion' });
    expect(movimiento?.['monto_centavos']).toBe(-3_333n);
    expect(base.campo('ordenes', 'estado')).toBe('parcialmente_reembolsada');
  });

  it('devolver a pedazos suma EXACTO lo cobrado de la línea', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const montos: string[] = [];
    for (let i = 0; i < 3; i++) {
      montos.push(
        (await devolver(ctx, [{ ordenLineaId: LINEA_ACEITE, cantidad: '1' }])).montoCentavos,
      );
    }

    expect(montos).toEqual(['3333', '3334', '3333']);
    expect(montos.reduce((s, m) => s + Number(m), 0)).toBe(10_000);
  });
});

describe('D-29 · devolver todo', () => {
  it('la venta queda reembolsada, y por el método con que se pagó cada parte', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await devolver(ctx, [{ ordenLineaId: LINEA_ACEITE, cantidad: '3' }]);
    const final = await devolver(ctx, [{ ordenLineaId: LINEA_ARROZ, cantidad: '1' }], 'tarjeta');

    expect(final.estado).toBe('reembolsada');
    expect(final.montoCentavos).toBe('5000');
    // Con tarjeta el cajón no se toca: sólo el efectivo dejó movimiento.
    expect(base.filas('movimientos_caja')).toHaveLength(1);
    expect(base.filas('devoluciones')[1]).toMatchObject({
      metodo: 'tarjeta',
      sesion_caja_id: null,
    });
  });

  it('una venta ya devuelta entera no se devuelve otra vez', async () => {
    const base = baseDe({ estado: 'reembolsada' });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    expect(await fallo(devolver(ctx, [{ ordenLineaId: LINEA_ARROZ, cantidad: '1' }]))).toBe(
      'TRANSICION_INVALIDA',
    );
  });
});

describe('D-29 · lo que no se puede', () => {
  it('no se devuelve más de lo vendido de una línea', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    await devolver(ctx, [{ ordenLineaId: LINEA_ACEITE, cantidad: '2' }]);
    expect(await fallo(devolver(ctx, [{ ordenLineaId: LINEA_ACEITE, cantidad: '2' }]))).toBe(
      'CANTIDAD_INVALIDA',
    );
    expect(base.filas('devoluciones')).toHaveLength(1);
  });

  it('no se devuelve por un método que no pagó, ni más de lo que entró por él', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    expect(
      await fallo(devolver(ctx, [{ ordenLineaId: LINEA_ARROZ, cantidad: '1' }], 'transferencia')),
    ).toBe('PAGO_NO_CUADRA');
    // Los tres aceites ($100.00) no caben en los $50.00 que entraron con tarjeta.
    expect(
      await fallo(devolver(ctx, [{ ordenLineaId: LINEA_ACEITE, cantidad: '3' }], 'tarjeta')),
    ).toBe('PAGO_NO_CUADRA');
    expect(base.filas('devoluciones')).toHaveLength(0);
  });

  it('sin caja abierta no sale efectivo, y no se escribe nada', async () => {
    const base = baseDe({ caja: false });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    expect(await fallo(devolver(ctx, [{ ordenLineaId: LINEA_ARROZ, cantidad: '1' }]))).toBe(
      'CAJA_CERRADA',
    );
    expect(base.filas('devoluciones')).toHaveLength(0);
    expect(base.campo('ordenes', 'estado')).toBe('pagada');
  });

  it('una venta de otra sucursal no existe, y una sin cobrar no tiene dinero que devolver', async () => {
    const ajena = baseDe({ sucursal: 'ffffffff-ffff-4fff-8fff-ffffffffffff' });
    const { ctx: ctxAjeno } = contextoFalso(ajena.tx, ambitoDe('gerente'), AHORA);
    expect(await fallo(devolver(ctxAjeno, [{ ordenLineaId: LINEA_ARROZ, cantidad: '1' }]))).toBe(
      'ORDEN_NO_ENCONTRADA',
    );

    const borrador = baseDe({ estado: 'borrador' });
    const { ctx } = contextoFalso(borrador.tx, ambitoDe('gerente'), AHORA);
    expect(await fallo(devolver(ctx, [{ ordenLineaId: LINEA_ARROZ, cantidad: '1' }]))).toBe(
      'TRANSICION_INVALIDA',
    );
  });
});
