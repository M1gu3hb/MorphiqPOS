import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG } from '../restaurante/pruebas/sala.ts';
import { autorizarDescuento } from './descuento.ts';

/**
 * F-205 · La autorización de descuento, con su bitácora.
 *
 * ── Lo que esta prueba defiende ────────────────────────────────────────────
 * Que quede FILA. «El gerente lo autorizó» sin fila es una frase, y lo que hace
 * falta al revisar el corte es quién, cuándo y sobre qué venta. Y que nadie se
 * autorice a sí mismo: eso no es una autorización, es un tope que se levanta
 * solo.
 */

const ORDEN = 'd1111111-1111-4111-8111-111111111111';
const CAJERO = 'e1111111-1111-4111-8111-111111111111';
const AJENO = 'e9999999-9999-4999-8999-999999999999';
const AHORA = new Date('2026-09-15T22:00:00.000Z');

function topes(): Fila[] {
  return [
    { organizacion_id: ORG, rol: 'cajero', tope_centavos: 5000n, tope_bp: 1000 },
    { organizacion_id: ORG, rol: 'gerente', tope_centavos: 200_000n, tope_bp: 3000 },
    { organizacion_id: ORG, rol: 'dueno', tope_centavos: 100_000_000n, tope_bp: 10_000 },
  ];
}

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      ordenes: [
        { id: ORDEN, organizacion_id: ORG, estado: 'borrador', subtotal_centavos: 200_000n },
      ],
      empleos: [
        { id: CAJERO, organizacion_id: ORG, rol: 'cajero' },
        { id: EMPLEO, organizacion_id: ORG, rol: 'gerente' },
        { id: AJENO, organizacion_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', rol: 'cajero' },
      ],
      topes_descuento: topes(),
      autorizaciones_descuento: [],
      ...extra,
    },
    { predeterminados: { autorizaciones_descuento: { sucursal_id: null, orden_id: null } } },
  );
}

describe('F-205 · autorizar', () => {
  it('deja fila con quién pidió, quién autorizó y por qué', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    await autorizarDescuento.ejecutar(ctx, {
      ordenId: ORDEN,
      solicitaEmpleoId: CAJERO,
      descuentoCentavos: 10_000,
      motivo: 'Se le cayó el pastel al llevarlo a la mesa',
    });

    expect(base.campo('autorizaciones_descuento', 'solicita_empleo_id')).toBe(CAJERO);
    expect(base.campo('autorizaciones_descuento', 'autoriza_empleo_id')).toBe(EMPLEO);
    expect(base.campo('autorizaciones_descuento', 'autoriza_rol')).toBe('gerente');
    expect(base.campo('autorizaciones_descuento', 'motivo')).toBe(
      'Se le cayó el pastel al llevarlo a la mesa',
    );
    // El tope del solicitante queda congelado en la fila: si mañana se le sube,
    // la autorización de hoy sigue explicando por qué hizo falta.
    expect(base.campo('autorizaciones_descuento', 'tope_centavos')).toBe(5000n);
  });

  it('NADIE se autoriza a sí mismo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: EMPLEO,
        descuentoCentavos: 10_000,
        motivo: 'porque sí',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('rechaza autorizar lo que ya cabía en el tope de quien lo pide', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: CAJERO,
        // $30 sobre $2 000: cabe en los $50 y en el 10 % del cajero.
        descuentoCentavos: 3000,
        motivo: 'no hacía falta',
      })
      .catch((e: unknown) => e);

    // Una fila de autorización sobre algo que no la necesitaba es ruido, y el
    // día que alguien audite va a buscar un permiso que nunca hizo falta.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('el gerente NO puede autorizar por encima de su propio tope', async () => {
    const base = baseDe({
      ordenes: [
        { id: ORDEN, organizacion_id: ORG, estado: 'borrador', subtotal_centavos: 1_000_000n },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: CAJERO,
        // $5 000 de descuento, y el gerente tiene tope de $2 000.
        descuentoCentavos: 500_000,
        motivo: 'el cliente es amigo del dueño',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('tampoco puede si el PORCENTAJE se le pasa, aunque el importe quepa', async () => {
    const base = baseDe({
      ordenes: [
        { id: ORDEN, organizacion_id: ORG, estado: 'borrador', subtotal_centavos: 200_000n },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: CAJERO,
        // $1 500 sobre $2 000 es el 75 %, y el gerente llega al 30 %.
        descuentoCentavos: 150_000,
        motivo: 'liquidación de temporada',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('no autoriza sobre una venta ya cobrada', async () => {
    const base = baseDe({
      ordenes: [{ id: ORDEN, organizacion_id: ORG, estado: 'pagada', subtotal_centavos: 200_000n }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: CAJERO,
        descuentoCentavos: 10_000,
        motivo: 'se me olvidó antes',
      })
      .catch((e: unknown) => e);

    // Sería una fila de autorización sin efecto: el descuento no se aplica a
    // nada y quien audite va a buscar un descuento que no existe.
    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('no autoriza a alguien de otra organización', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: AJENO,
        descuentoCentavos: 10_000,
        motivo: 'un conocido de otro negocio',
      })
      .catch((e: unknown) => e);

    expect(esErrorDominio(fallo)).toBe(true);
  });

  it('sin fila de tope, el puesto no puede descontar nada: falla CERRADO', async () => {
    const base = baseDe({ topes_descuento: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const fallo = await autorizarDescuento
      .ejecutar(ctx, {
        ordenId: ORDEN,
        solicitaEmpleoId: CAJERO,
        descuentoCentavos: 10_000,
        motivo: 'sin topes configurados',
      })
      .catch((e: unknown) => e);

    // Sin topes configurados, el gerente tampoco puede autorizar: una
    // organización sin topes no es una sin límite, es una de la que no sabemos
    // qué límite tiene.
    expect(esErrorDominio(fallo)).toBe(true);
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('el cajero no autoriza descuentos: para eso existe el tope', () => {
    expect([...autorizarDescuento.roles]).not.toContain('cajero');
    expect([...autorizarDescuento.roles]).not.toContain('mesero');
  });
});
