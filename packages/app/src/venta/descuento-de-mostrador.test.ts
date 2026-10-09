import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it, vi } from 'vitest';

import { firmarAutorizacion } from '../identidad/supervisor.ts';
import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import {
  ambitoDe,
  CARRITO_MOSTRADOR,
  EMPLEO,
  linea,
  ORG,
  ordenDeMostrador,
  PREDETERMINADOS,
} from '../restaurante/pruebas/sala.ts';

import { aplicarDescuento } from './descuento-de-mostrador.ts';

/**
 * F-205 · EL DESCUENTO DEL MOSTRADOR, con su tope y su supervisor (D-28 de la 2.4).
 *
 * Lo que se defiende: que lo que cabe en el tope de la cajera se aplica sin preguntar;
 * que lo que no cabe NO se aplica sin la autorización firmada de un supervisor cuyo tope
 * lo cubra; que la autorización es de ESTE negocio, para ESTA cajera y vigente; que
 * queda la fila de quién autorizó; y que el reparto entre líneas es exacto.
 */

const SECRETO = 'secreto_de_prueba_para_firmar_autorizaciones_2026';
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ SESSION_SECRET: SECRETO }),
}));

const AHORA = new Date('2026-10-09T16:00:00.000Z');
const GERENTE = 'e2222222-2222-4222-8222-222222222222';
const OTRA_CAJERA = 'e3333333-3333-4333-8333-333333333333';
const LINEA_2 = 'c2222222-2222-4222-8222-222222222222';

function topes(): Fila[] {
  return [
    { organizacion_id: ORG, rol: 'cajero', tope_centavos: 5_000n, tope_bp: 1_000 },
    { organizacion_id: ORG, rol: 'gerente', tope_centavos: 200_000n, tope_bp: 3_000 },
    // Un tope ALTO en un puesto que no autoriza: autorizar es del puesto, no del tope que
    // alguien le haya configurado al almacén.
    { organizacion_id: ORG, rol: 'almacen', tope_centavos: 100_000_000n, tope_bp: 10_000 },
  ];
}

function baseDe(
  lineas: readonly Fila[] = [linea({ orden_id: CARRITO_MOSTRADOR })],
  estado = 'borrador',
) {
  return crearBaseFalsa(
    {
      ordenes: [ordenDeMostrador(estado)],
      orden_lineas: [...lineas],
      topes_descuento: topes(),
      autorizaciones_descuento: [],
      configuracion: [],
    },
    { predeterminados: PREDETERMINADOS },
  );
}

function autorizacion(cambios: Partial<Parameters<typeof firmarAutorizacion>[0]> = {}): string {
  return firmarAutorizacion(
    {
      org: ORG,
      supervisor: GERENTE,
      rol: 'gerente',
      solicita: EMPLEO,
      exp: Math.floor(AHORA.getTime() / 1000) + 120,
      n: 'abcdef0123456789',
      ...cambios,
    },
    SECRETO,
  );
}

async function fallo(promesa: Promise<unknown>): Promise<string> {
  const error = await promesa.then(() => null).catch((e: unknown) => e);
  return esErrorDominio(error) ? error.codigo : String(error);
}

describe('F-205 · el descuento que cabe en el tope de quien cobra', () => {
  it('se aplica sin preguntar, baja el total y no deja autorización', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await aplicarDescuento.ejecutar(ctx, {
      ordenId: CARRITO_MOSTRADOR,
      descuentoCentavos: 500,
      motivo: 'cliente frecuente',
    });

    expect(salida).toEqual({
      descuentoCentavos: '500',
      totalCentavos: '9500',
      autorizadoPor: null,
    });
    expect(base.campo('orden_lineas', 'descuento_centavos')).toBe(500n);
    expect(base.campo('orden_lineas', 'total_centavos')).toBe(9_500n);
    expect(base.campo('ordenes', 'total_centavos')).toBe(9_500n);
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('se reparte EXACTO entre las líneas, en proporción a su importe', async () => {
    const base = baseDe([
      linea({ orden_id: CARRITO_MOSTRADOR }),
      linea({
        id: LINEA_2,
        orden_id: CARRITO_MOSTRADOR,
        subtotal_centavos: 5_000n,
        total_centavos: 5_000n,
        precio_unitario_centavos: 5_000n,
      }),
    ]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await aplicarDescuento.ejecutar(ctx, {
      ordenId: CARRITO_MOSTRADOR,
      descuentoCentavos: 1_000,
      motivo: 'cliente frecuente',
    });

    const descuentos = base.filas('orden_lineas').map((f) => f['descuento_centavos'] as bigint);
    expect(descuentos.reduce((a, b) => a + b, 0n)).toBe(1_000n);
    expect(descuentos).toEqual([667n, 333n]);
  });
});

describe('F-205 · el descuento que pasa del tope', () => {
  it('sin autorización NO se aplica y dice que hace falta el PIN de un supervisor', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await fallo(
      aplicarDescuento.ejecutar(ctx, {
        ordenId: CARRITO_MOSTRADOR,
        descuentoCentavos: 2_000,
        motivo: 'producto golpeado',
      }),
    );

    expect(codigo).toBe('PUESTO_NO_OTORGABLE');
    expect(base.campo('orden_lineas', 'descuento_centavos')).toBe(0n);
  });

  it('con la autorización firmada del gerente se aplica y deja quién la dio', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await aplicarDescuento.ejecutar(ctx, {
      ordenId: CARRITO_MOSTRADOR,
      descuentoCentavos: 2_000,
      motivo: 'producto golpeado',
      autorizacion: autorizacion(),
    });

    expect(salida.autorizadoPor).toBe(GERENTE);
    expect(base.campo('ordenes', 'total_centavos')).toBe(8_000n);
    const [fila] = base.filas('autorizaciones_descuento');
    expect(fila).toMatchObject({
      solicita_empleo_id: EMPLEO,
      autoriza_empleo_id: GERENTE,
      autoriza_rol: 'gerente',
      descuento_centavos: 2_000n,
      tope_centavos: 5_000n,
      base_centavos: 10_000n,
      tope_bp: 1_000,
      motivo: 'producto golpeado',
      orden_id: CARRITO_MOSTRADOR,
    });
    // $20 sobre $100 pasa el tope de la cajera por PORCENTAJE (20 % > 10 %) y NO por
    // importe ($20 < $50). La 078 sólo aceptaba la rama del importe y Postgres rechazaba
    // esta misma fila con 23514; la base falsa no hace cumplir `check`, así que aquí se
    // afirma la regla de la 180 tal cual está escrita en SQL.
    const descuento = fila?.['descuento_centavos'] as bigint;
    const cumpleLa180 =
      descuento > (fila?.['tope_centavos'] as bigint) ||
      descuento * 10_000n >
        (fila?.['base_centavos'] as bigint) * BigInt(fila?.['tope_bp'] as number);
    expect(cumpleLa180).toBe(true);
  });

  it('una autorización de otra cajera, vencida, de otro negocio o alterada no vale', async () => {
    for (const mala of [
      autorizacion({ solicita: OTRA_CAJERA }),
      autorizacion({ exp: Math.floor(AHORA.getTime() / 1000) - 1 }),
      autorizacion({ org: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }),
      autorizacion({ rol: 'cajero' }),
      autorizacion({ rol: 'almacen' }),
      `${autorizacion().slice(0, -3)}AAA`,
    ]) {
      const base = baseDe();
      const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
      expect(
        await fallo(
          aplicarDescuento.ejecutar(ctx, {
            ordenId: CARRITO_MOSTRADOR,
            descuentoCentavos: 2_000,
            motivo: 'producto golpeado',
            autorizacion: mala,
          }),
        ),
      ).toBe('PUESTO_NO_OTORGABLE');
      expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
    }
  });

  it('si pasa también del tope de quien autoriza, no se aplica', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await fallo(
        aplicarDescuento.ejecutar(ctx, {
          ordenId: CARRITO_MOSTRADOR,
          descuentoCentavos: 4_000,
          motivo: 'producto golpeado',
          autorizacion: autorizacion(),
        }),
      ),
    ).toBe('PUESTO_NO_OTORGABLE');
  });
});

describe('F-205 · lo que no es un descuento', () => {
  it('llevarse la venta entera no es un descuento', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(
      await fallo(
        aplicarDescuento.ejecutar(ctx, {
          ordenId: CARRITO_MOSTRADOR,
          descuentoCentavos: 10_000,
          motivo: 'cortesía',
          autorizacion: autorizacion(),
        }),
      ),
    ).toBe('CONFIGURACION_INVALIDA');
  });

  it('una venta ya cobrada no se descuenta', async () => {
    const base = baseDe([linea({ orden_id: CARRITO_MOSTRADOR })], 'pagada');
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    expect(
      await fallo(
        aplicarDescuento.ejecutar(ctx, {
          ordenId: CARRITO_MOSTRADOR,
          descuentoCentavos: 500,
          motivo: 'cliente frecuente',
        }),
      ),
    ).toBe('ORDEN_NO_EDITABLE');
  });
});
