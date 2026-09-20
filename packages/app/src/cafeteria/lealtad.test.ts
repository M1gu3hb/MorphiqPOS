import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { ajustarSellos, canjearPremio, otorgarSellos, pasivoDeSellos } from './lealtad.ts';

/**
 * F-930, F-934 y F-936 · Los sellos, contra la base.
 *
 * ── Lo que esta prueba defiende ────────────────────────────────────────────
 * Que el SERVIDOR decida cuántos sellos da cada producto. Si viniera del
 * cliente, el programa de lealtad se podría regalar entero desde la consola del
 * navegador — y en este giro la recurrencia ES el negocio.
 */

const CLIENTA = 'c1111111-1111-4111-8111-111111111111';
const AJENA = 'c9999999-9999-4999-8999-999999999999';
const ORDEN = 'd1111111-1111-4111-8111-111111111111';
const LATTE = 'p1111111-1111-4111-8111-111111111111';
const BOLSA = 'p2222222-2222-4222-8222-222222222222';
const AHORA = new Date('2026-09-16T15:00:00.000Z');

function linea(cambios: Partial<Fila> = {}): Fila {
  return {
    organizacion_id: ORG,
    orden_id: ORDEN,
    producto_id: LATTE,
    cantidad: '1',
    tipo_linea: 'venta',
    anulada_en: null,
    // La base falsa resuelve sobre UNA tabla: las columnas del `join` se
    // siembran en la misma fila. Está documentado en `constructor-falso.ts`.
    sellos_otorga: 1,
    ...cambios,
  };
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      clientes: [{ id: CLIENTA, organizacion_id: ORG, nombre: 'Ana' }],
      orden_lineas: [linea()],
      lealtad_movimientos: [],
      productos: [
        { id: LATTE, organizacion_id: ORG, costo_unitario_centavos: 1800n },
        { id: BOLSA, organizacion_id: ORG, costo_unitario_centavos: 12_000n },
      ],
      configuracion: [{ organizacion_id: ORG, valores: { sellos_por_premio: 5 } }],
      ...extra,
    },
    {
      predeterminados: {
        lealtad_movimientos: {
          sucursal_id: null,
          orden_id: null,
          producto_id: null,
          costo_centavos: null,
          motivo: null,
        },
      },
    },
  );
}

function movimiento(sellos: number, cambios: Partial<Fila> = {}): Fila {
  return {
    id: `m${String(sellos)}`,
    organizacion_id: ORG,
    cliente_id: CLIENTA,
    tipo: sellos > 0 ? 'otorga' : 'canje',
    sellos,
    ...cambios,
  };
}

describe('F-930 · otorgar', () => {
  it('escribe el ledger con el signo positivo y ata la orden', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await otorgarSellos.ejecutar(ctx, { clienteId: CLIENTA, ordenId: ORDEN });

    expect(base.campo('lealtad_movimientos', 'tipo')).toBe('otorga');
    expect(base.campo('lealtad_movimientos', 'sellos')).toBe(1);
    expect(base.campo('lealtad_movimientos', 'orden_id')).toBe(ORDEN);
    expect(salida.saldo).toBe(1);
  });

  it('cuenta por unidad: tres cafés son tres sellos', async () => {
    const base = baseDe({ orden_lineas: [linea({ cantidad: '3' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await otorgarSellos.ejecutar(ctx, { clienteId: CLIENTA, ordenId: ORDEN });

    expect(salida.sellosOtorgados).toBe(3);
  });

  it('una venta de pura bolsa de grano NO escribe movimiento', async () => {
    const base = baseDe({
      orden_lineas: [linea({ producto_id: BOLSA, sellos_otorga: 0, cantidad: '2' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await otorgarSellos.ejecutar(ctx, { clienteId: CLIENTA, ordenId: ORDEN });

    // No es un error: es una decisión de margen. Un movimiento de cero sólo
    // ensuciaría el ledger.
    expect(salida.sellosOtorgados).toBe(0);
    expect(base.filas('lealtad_movimientos')).toHaveLength(0);
  });

  it('avisa cuando el saldo YA alcanza para un premio', async () => {
    const base = baseDe({
      lealtad_movimientos: [movimiento(4)],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await otorgarSellos.ejecutar(ctx, { clienteId: CLIENTA, ordenId: ORDEN });

    // Es lo que la pantalla grita: si nadie lo dice, la clienta se va con cinco
    // sellos y un café que pudo ser gratis.
    expect(salida.saldo).toBe(5);
    expect(salida.yaAlcanza).toBe(true);
  });

  it('no otorga a un cliente de otra organización', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await otorgarSellos
      .ejecutar(ctx, { clienteId: AJENA, ordenId: ORDEN })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('lealtad_movimientos')).toHaveLength(0);
  });

  it('las líneas ANULADAS no dan sellos', async () => {
    const base = baseDe({ orden_lineas: [linea({ anulada_en: AHORA })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await otorgarSellos
      .ejecutar(ctx, { clienteId: CLIENTA, ordenId: ORDEN })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });
});

describe('F-934 · canjear', () => {
  it('resta los sellos y congela el COSTO del premio', async () => {
    const base = baseDe({ lealtad_movimientos: [movimiento(5)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await canjearPremio.ejecutar(ctx, { clienteId: CLIENTA, productoId: LATTE });

    const filas = base.filas('lealtad_movimientos');
    expect(filas).toHaveLength(2);
    expect(filas[1]?.['tipo']).toBe('canje');
    // NEGATIVO: el saldo es la suma del ledger.
    expect(filas[1]?.['sellos']).toBe(-5);
    // El premio de hace un año se valuó con el costo de hace un año.
    expect(filas[1]?.['costo_centavos']).toBe(1800n);
    expect(salida.saldo).toBe(0);
  });

  it('no canjea sin saldo, y dice cuántos faltan', async () => {
    const base = baseDe({ lealtad_movimientos: [movimiento(3)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await canjearPremio
      .ejecutar(ctx, { clienteId: CLIENTA, productoId: LATTE })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('lealtad_movimientos')).toHaveLength(1);
  });

  it('el saldo sale del LEDGER, no de la caché', async () => {
    // El saldo real es 5 − 5 = 0, aunque la tabla de caché dijera otra cosa.
    const base = baseDe({
      lealtad_movimientos: [movimiento(5), movimiento(-5, { id: 'm-canje' })],
      lealtad_saldos: [{ organizacion_id: ORG, cliente_id: CLIENTA, sellos: 99 }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await canjearPremio
      .ejecutar(ctx, { clienteId: CLIENTA, productoId: LATTE })
      .catch((e: unknown) => e);

    // Un saldo escribible es un saldo que alguien va a «arreglar». Si el comando
    // leyera la caché, ese arreglo sería un premio regalado.
    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('rechaza un premio que no existe en este negocio', async () => {
    const base = baseDe({ lealtad_movimientos: [movimiento(5)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const fallo = await canjearPremio
      .ejecutar(ctx, { clienteId: CLIENTA, productoId: 'p9999999-9999-4999-8999-999999999999' })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });
});

describe('F-930 · ajustar', () => {
  it('escribe el ajuste con su motivo obligatorio', async () => {
    const base = baseDe({ lealtad_movimientos: [movimiento(2)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await ajustarSellos.ejecutar(ctx, {
      clienteId: CLIENTA,
      sellos: 3,
      motivo: 'Se le olvidó identificarse el martes y trajo el ticket',
    });

    const filas = base.filas('lealtad_movimientos');
    expect(filas[1]?.['tipo']).toBe('ajuste');
    expect(filas[1]?.['motivo']).toBe('Se le olvidó identificarse el martes y trajo el ticket');
  });

  it('NO deja el saldo en negativo', async () => {
    const base = baseDe({ lealtad_movimientos: [movimiento(2)] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await ajustarSellos
      .ejecutar(ctx, { clienteId: CLIENTA, sellos: -5, motivo: 'corrección' })
      .catch((e: unknown) => e);

    // El saldo es lo único que el cliente lleva contado en la cabeza: un −3 se
    // descubre cuando dice «pero si yo tenía dos».
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('lealtad_movimientos')).toHaveLength(1);
  });

  it('el cajero NO ajusta sellos: eso es dinero regalado', () => {
    expect([...ajustarSellos.roles]).not.toContain('cajero');
    expect([...otorgarSellos.roles]).toContain('cajero');
  });
});

describe('F-936 · el pasivo', () => {
  it('lee la vista y valúa sólo los premios completos', async () => {
    const base = baseDe({
      lealtad_pasivo: [
        {
          organizacion_id: ORG,
          sellos_vivos: 13n,
          clientes_con_saldo: 4,
          costo_premio_centavos: 1800n,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await pasivoDeSellos.ejecutar(ctx, {});

    expect(salida.sellosVivos).toBe(13);
    expect(salida.pasivoCentavos).toBe('3600');
  });

  it('sin saldos vivos devuelve cero en vez de fallar', async () => {
    const base = baseDe({ lealtad_pasivo: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    expect((await pasivoDeSellos.ejecutar(ctx, {})).pasivoCentavos).toBe('0');
  });

  it('no escribe nada: es una lectura', () => {
    expect(pasivoDeSellos.escribe).toBe(false);
  });
});
