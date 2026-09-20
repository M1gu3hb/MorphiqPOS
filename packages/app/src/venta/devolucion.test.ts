import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type OpcionesBase,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  comanda,
  CUENTA,
  ordenDeMesa,
  ORG,
  PREDETERMINADOS,
  SESION_CAJA,
  sesionCajaAbierta,
} from '../restaurante/pruebas/sala.ts';
import { devolverPedido } from './devolucion.ts';

/**
 * F-262 · Devolverle el dinero de un pedido que nadie recogió.
 *
 * ── Qué defienden estas pruebas ──────────────────────────────────────────
 * Que el efectivo salga del cajón CON SIGNO NEGATIVO. El arqueo es la suma de
 * `movimientos_caja`: un movimiento positivo le pediría al cajero un efectivo de
 * más justo cuando acaba de sacar el billete.
 *
 * Que los pagos queden en `reembolsado`, porque el corte suma los CONFIRMADOS y
 * sin eso el turno cerraría contando un café que se devolvió.
 *
 * Que el SEGUNDO TOQUE no saque dinero otra vez. Es un botón en un diálogo que se
 * recarga, y esto es dinero.
 *
 * Que una tarjeta NO genere movimiento de efectivo —no hay billetes que sacar— y
 * se informe por método para que quien cierra sepa qué reversar en la terminal.
 *
 * Y que sin caja abierta no se escriba nada: un billete fuera del cajón sin
 * renglón es el faltante de quien abra mañana.
 */

const PEDIDO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PAGO = 'f1111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-19T21:05:00.000Z');

const pago = (cambios: Fila = {}): Fila => ({
  id: PAGO,
  organizacion_id: ORG,
  orden_id: CUENTA,
  sesion_caja_id: SESION_CAJA,
  metodo: 'efectivo',
  monto_centavos: 4500n,
  estado: 'confirmado',
  ...cambios,
});

function cafeteriaConPedido(datos: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    comandas: [comanda('listo')],
    ordenes: [ordenDeMesa('pagada')],
    pagos: [pago()],
    sesiones_caja: [sesionCajaAbierta()],
    movimientos_caja: [],
    ...datos,
  };
}

const baseDe = (datos: Partial<TablasFalsas> = {}, opciones: OpcionesBase = {}) =>
  crearBaseFalsa(cafeteriaConPedido(datos), {
    predeterminados: {
      ...PREDETERMINADOS,
      movimientos_caja: {
        referencia_tipo: null,
        referencia_id: null,
        empleado_id: null,
        motivo: null,
      },
    },
    ...opciones,
  });

describe('venta.devolver', () => {
  it('EL EFECTIVO SALE DEL CAJÓN con signo negativo, y la venta deja de ser venta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const devuelta = await devolverPedido.ejecutar(ctx, { pedidoId: PEDIDO });

    expect(devuelta.efectivoDevueltoCentavos).toBe('4500');
    expect(devuelta.yaEstaba).toBe(false);
    expect(devuelta.porReversar).toEqual([]);

    // NEGATIVO: el arqueo es la suma de los movimientos.
    expect(base.filas('movimientos_caja')).toHaveLength(1);
    expect(base.campo('movimientos_caja', 'tipo')).toBe('devolucion');
    expect(base.campo('movimientos_caja', 'monto_centavos')).toBe(-4500n);
    expect(base.campo('movimientos_caja', 'referencia_id')).toBe(CUENTA);

    // Y el pago deja de contar en el corte.
    expect(base.campo('pagos', 'estado')).toBe('reembolsado');
    expect(base.campo('ordenes', 'estado')).toBe('reembolsada');
    // `cancelado` y no `no_recogido`: no recogido es «el negocio se queda el
    // dinero», y esto es lo contrario.
    expect(base.campo('comandas', 'estado')).toBe('cancelado');
  });

  it('EL SEGUNDO TOQUE no saca el dinero otra vez', async () => {
    const base = baseDe({
      ordenes: [ordenDeMesa('reembolsada')],
      pagos: [pago({ estado: 'reembolsado' })],
      comandas: [comanda('cancelado')],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const devuelta = await devolverPedido.ejecutar(ctx, { pedidoId: PEDIDO });

    expect(devuelta.yaEstaba).toBe(true);
    expect(devuelta.efectivoDevueltoCentavos).toBe('4500');
    // Lo que importa: NO hay un segundo movimiento de caja.
    expect(base.filas('movimientos_caja')).toEqual([]);
  });

  it('UNA TARJETA no saca billetes, y se dice qué hay que reversar', async () => {
    const base = baseDe({ pagos: [pago({ metodo: 'tarjeta' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const devuelta = await devolverPedido.ejecutar(ctx, { pedidoId: PEDIDO });

    expect(devuelta.efectivoDevueltoCentavos).toBe('0');
    expect(devuelta.totalDevueltoCentavos).toBe('4500');
    expect(devuelta.porReversar).toEqual([{ metodo: 'tarjeta', montoCentavos: '4500' }]);
    // Ningún movimiento de efectivo: fingirlo le pediría al cajero un faltante
    // que nunca existió.
    expect(base.filas('movimientos_caja')).toEqual([]);
    expect(base.campo('ordenes', 'estado')).toBe('reembolsada');
  });

  it('UNA VENTA NO COBRADA no tiene nada que devolver', async () => {
    const base = baseDe({ ordenes: [ordenDeMesa('confirmada')], pagos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await devolverPedido.ejecutar(ctx, { pedidoId: PEDIDO }).catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('TRANSICION_INVALIDA');
    expect(base.filas('movimientos_caja')).toEqual([]);
    expect(base.campo('ordenes', 'estado')).toBe('confirmada');
  });

  it('SIN CAJA ABIERTA no sale el billete ni se marca nada', async () => {
    const base = baseDe({ sesiones_caja: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await devolverPedido.ejecutar(ctx, { pedidoId: PEDIDO }).catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('CAJA_CERRADA');
    expect(base.filas('movimientos_caja')).toEqual([]);
    // Y la venta sigue siendo una venta cobrada: nada quedó a medias.
    expect(base.campo('ordenes', 'estado')).toBe('pagada');
    expect(base.campo('pagos', 'estado')).toBe('confirmado');
  });

  it('UN PEDIDO QUE YA SALIÓ DE LA FILA no se devuelve por aquí', async () => {
    const base = baseDe({ comandas: [comanda('entregado')] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await devolverPedido.ejecutar(ctx, { pedidoId: PEDIDO }).catch((e: unknown) => e);

    expect(esErrorDominio(fallo) && fallo.codigo).toBe('TRANSICION_INVALIDA');
    expect(base.filas('movimientos_caja')).toEqual([]);
  });
});
