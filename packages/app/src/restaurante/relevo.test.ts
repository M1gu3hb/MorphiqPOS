import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type TablasFalsas } from './pruebas/base-falsa.ts';
import { relevarResponsable } from './relevo.ts';
import {
  ambitoDe,
  CUENTA,
  EMPLEO,
  mesa,
  ordenDeMesa,
  ORG,
  PREDETERMINADOS,
  SUCURSAL,
} from './pruebas/sala.ts';

/**
 * F-325 · Las 17:00, y el mesero de mediodía se va con mesas vivas.
 *
 * Hoy o se cierra la mesa antes de tiempo —y el comensal se queda sin cuenta— o
 * la propina de la noche se le acredita a quien ya se fue. Lo que estas pruebas
 * vigilan es el corte: que quede escrito dónde terminó uno y empezó el otro, y
 * con cuánto consumo, porque sin eso la propina de esa mesa no se puede
 * repartir.
 */

const NOCHE = '55555555-5555-4555-8555-555555555556';
const OTRA_CUENTA = '77777777-7777-4777-8777-77777777777a';
const RELEVO = new Date('2026-09-14T17:00:00.000Z');

function turno(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    ordenes: [
      ordenDeMesa('confirmada', { total_centavos: 30_000n, empleado_atiende_id: EMPLEO }),
      ordenDeMesa('confirmada', {
        id: OTRA_CUENTA,
        mesa_id: null,
        total_centavos: 12_000n,
        empleado_atiende_id: EMPLEO,
      }),
    ],
    mesas: [mesa('ocupada', { empleado_atiende_id: EMPLEO })],
    empleos: [
      { id: EMPLEO, organizacion_id: ORG, sucursal_id: SUCURSAL, rol: 'mesero', activo: true },
      { id: NOCHE, organizacion_id: ORG, sucursal_id: SUCURSAL, rol: 'mesero', activo: true },
    ],
    relevos_atencion: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(turno(extra), { predeterminados: PREDETERMINADOS });

const CAMBIO = { empleadoSaleId: EMPLEO, empleadoEntraId: NOCHE };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-325 · el relevo del turno', () => {
  it('releva TODAS las cuentas vivas del que se va', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    const salida = await relevarResponsable.ejecutar(ctx, CAMBIO);

    expect(salida.cuentas).toHaveLength(2);
    const ordenes = base.filas('ordenes');
    expect(ordenes.every((o) => o['empleado_atiende_id'] === NOCHE)).toBe(true);
  });

  it('ESCRIBE LOS DOS TRAMOS: dónde terminó uno y empezó el otro', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    await relevarResponsable.ejecutar(ctx, CAMBIO);

    const tramos = base.filas('relevos_atencion').filter((t) => t['orden_id'] === CUENTA);
    expect(tramos).toHaveLength(2);

    const sale = tramos.find((t) => t['empleado_id'] === EMPLEO);
    expect(sale?.['hasta']).toEqual(RELEVO);
    expect(sale?.['consumo_inicio_centavos']).toBe(0n);
    expect(sale?.['consumo_fin_centavos']).toBe(30_000n);

    const entra = tramos.find((t) => t['empleado_id'] === NOCHE);
    expect(entra?.['hasta']).toBeNull();
    // EL QUE ENTRA ARRANCA DESDE LO QUE ENCONTRÓ: lo de antes no lo levantó él.
    expect(entra?.['consumo_inicio_centavos']).toBe(30_000n);
  });

  it('un SEGUNDO relevo cierra el tramo abierto en vez de crear otro suelto', async () => {
    const base = baseDe();
    const uno = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);
    await relevarResponsable.ejecutar(uno.ctx, CAMBIO);

    const MADRUGADA = new Date('2026-09-14T23:00:00.000Z');
    const dos = contextoFalso(base.tx, ambitoDe('gerente'), MADRUGADA);
    await relevarResponsable.ejecutar(dos.ctx, { empleadoSaleId: NOCHE, empleadoEntraId: EMPLEO });

    const tramos = base.filas('relevos_atencion').filter((t) => t['orden_id'] === CUENTA);
    expect(tramos).toHaveLength(3);
    const abiertos = tramos.filter((t) => t['hasta'] === null);
    // Una cuenta tiene UN tramo abierto: dos serían dos responsables a la vez.
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.['empleado_id']).toBe(EMPLEO);
  });

  it('EL TRAMO ABIERTO SE BUSCA POR SU HUECO, no por ser el último', async () => {
    // Postgres no promete orden en un `select` sin `order by`, así que el
    // tramo cerrado puede llegar después del abierto. Sin filtrar por
    // `hasta is null`, el comando cerraría el que ya estaba cerrado y dejaría
    // DOS tramos abiertos: dos responsables a la vez sobre la misma cuenta.
    const base = baseDe({
      relevos_atencion: [
        {
          id: 'tramo-abierto',
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          orden_id: CUENTA,
          empleado_id: EMPLEO,
          desde: new Date('2026-09-14T13:00:00.000Z'),
          hasta: null,
          consumo_inicio_centavos: 0n,
          consumo_fin_centavos: null,
          empleado_releva_id: null,
        },
        {
          id: 'tramo-cerrado',
          organizacion_id: ORG,
          sucursal_id: SUCURSAL,
          orden_id: CUENTA,
          empleado_id: NOCHE,
          desde: new Date('2026-09-14T12:00:00.000Z'),
          hasta: new Date('2026-09-14T13:00:00.000Z'),
          consumo_inicio_centavos: 0n,
          consumo_fin_centavos: 0n,
          empleado_releva_id: EMPLEO,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    await relevarResponsable.ejecutar(ctx, CAMBIO);

    const abiertos = base
      .filas('relevos_atencion')
      .filter((t) => t['orden_id'] === CUENTA && t['hasta'] === null);
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]?.['empleado_id']).toBe(NOCHE);
  });

  it('LA MESA TAMBIÉN REAPUNTA, o el mapa seguiría enseñando al que se fue', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    await relevarResponsable.ejecutar(ctx, CAMBIO);

    expect(base.campo('mesas', 'empleado_atiende_id')).toBe(NOCHE);
  });

  it('una cuenta YA COBRADA no se releva: su propina ya es de quien la atendió', async () => {
    const base = baseDe({
      ordenes: [
        ordenDeMesa('pagada', { total_centavos: 30_000n, empleado_atiende_id: EMPLEO }),
        ordenDeMesa('confirmada', {
          id: OTRA_CUENTA,
          mesa_id: null,
          total_centavos: 12_000n,
          empleado_atiende_id: EMPLEO,
        }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    const salida = await relevarResponsable.ejecutar(ctx, CAMBIO);

    expect(salida.cuentas).toHaveLength(1);
    expect(salida.cuentas[0]?.ordenId).toBe(OTRA_CUENTA);
    const pagada = base.filas('ordenes').find((o) => o['id'] === CUENTA);
    expect(pagada?.['empleado_atiende_id']).toBe(EMPLEO);
  });

  it('un mesero SIN mesas abiertas no es un error: es lo normal entre semana', async () => {
    const base = baseDe({ ordenes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    const salida = await relevarResponsable.ejecutar(ctx, CAMBIO);

    expect(salida.cuentas).toEqual([]);
    expect(base.filas('relevos_atencion')).toEqual([]);
  });

  it('RELEVAR HACIA UNA BAJA deja las mesas sin dueño real', async () => {
    const base = baseDe({
      empleos: [
        { id: EMPLEO, organizacion_id: ORG, sucursal_id: SUCURSAL, rol: 'mesero', activo: true },
        { id: NOCHE, organizacion_id: ORG, sucursal_id: SUCURSAL, rol: 'mesero', activo: false },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    expect(await codigoDe(() => relevarResponsable.ejecutar(ctx, CAMBIO))).toBe(
      'ACCESO_NO_ENCONTRADO',
    );
    expect(base.filas('relevos_atencion')).toEqual([]);
  });

  it('hacia alguien de OTRO negocio, igual', async () => {
    const base = baseDe({
      empleos: [
        { id: EMPLEO, organizacion_id: ORG, sucursal_id: SUCURSAL, rol: 'mesero', activo: true },
        {
          id: NOCHE,
          organizacion_id: '00000000-0000-4000-8000-000000000000',
          sucursal_id: SUCURSAL,
          rol: 'mesero',
          activo: true,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    expect(await codigoDe(() => relevarResponsable.ejecutar(ctx, CAMBIO))).toBe(
      'ACCESO_NO_ENCONTRADO',
    );
  });

  it('nadie se releva a sí mismo', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    expect(
      await codigoDe(() =>
        relevarResponsable.ejecutar(ctx, { empleadoSaleId: EMPLEO, empleadoEntraId: EMPLEO }),
      ),
    ).toBe('ACCESO_NO_ENCONTRADO');
  });

  it('EL MESERO NO SE RELEVA SOLO: lo decide quien cierra el turno', () => {
    expect(relevarResponsable.roles).not.toContain('mesero');
    expect(relevarResponsable.roles).toContain('gerente');
  });

  it('audita cuánto consumo cambió de manos', async () => {
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('gerente'), RELEVO);

    await relevarResponsable.ejecutar(ctx, CAMBIO);

    expect(auditorias[0]?.payload['cuentas']).toBe(2);
    expect(auditorias[0]?.payload['consumoRelevadoCentavos']).toBe('42000');
  });
});
