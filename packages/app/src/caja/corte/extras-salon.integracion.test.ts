import { randomUUID } from 'node:crypto';

import { conTransaccion } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { sembrarNegocio, sembrarSucursal, type NegocioReal } from '../../pruebas/negocio-real.ts';
import { liquidacionPorProfesional } from './extras-salon.ts';

/**
 * LO QUE EL SALÓN LE DEBE DE PROPINA A CADA QUIEN, contra Postgres (D.1 de la 2.4).
 *
 * El renglón «propina pendiente» del corte del salón sale de `movimientos_propina`, que es
 * un ledger FIRMADO (139): lo recibido suma y lo entregado resta, y la 139 obliga a que lo
 * entregado ya llegue negativo. La consulta le volvía a dar la vuelta al signo de lo
 * entregado, así que la propina a la mano —recibida y entregada en el mismo acto, saldo
 * cero— aparecía DOS veces como deuda del salón. La base falsa no corre el SQL crudo de la
 * hoja: esto sólo se puede ver contra una base de verdad.
 */

let negocio: NegocioReal;
let sucursalId: string;
const KARLA = randomUUID();
const ABIERTA = new Date('2026-10-08T15:00:00Z');
const CERRADA = new Date('2026-10-09T03:00:00Z');
const EN_EL_TURNO = new Date('2026-10-08T18:05:00Z');

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Estética de la propina',
    rol: 'gerente',
    giro: 'estetica',
    paquete: 'estetica',
  });
  sucursalId = (await sembrarSucursal(negocio, { terminales: ['Recepción'] })).sucursalId;

  await conTransaccion(async (tx) => {
    await tx
      .insertInto('profesionales')
      .values({
        id: KARLA,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursalId,
        empleo_id: negocio.empleoId,
        nombre_completo: 'Karla Domínguez',
        nombre_corto: 'Karla',
        tipo_relacion: 'empleado_comision',
        color_agenda: '#7c3aed',
      })
      .execute();

    const propina = {
      organizacion_id: negocio.organizacionId,
      sucursal_id: sucursalId,
      profesional_id: KARLA,
      created_at: EN_EL_TURNO,
    };
    await tx
      .insertInto('movimientos_propina')
      .values([
        // $100 a la mano: recibida y entregada en el mismo acto, como la anota el cobro.
        {
          ...propina,
          tipo: 'recibida',
          monto_centavos: 10_000n,
          medio: 'efectivo',
          nota: 'a la mano',
        },
        {
          ...propina,
          tipo: 'entregada',
          monto_centavos: -10_000n,
          medio: 'efectivo',
          entregada_en: EN_EL_TURNO,
          entregada_por: negocio.empleoId,
          nota: 'a la mano, al cobrar',
        },
        // $54 por la terminal: ésos sí se le deben.
        { ...propina, tipo: 'recibida', monto_centavos: 5_400n, medio: 'tarjeta' },
      ])
      .execute();
  });
});

describe('la propina pendiente del corte del salón', () => {
  it('es la SUMA del ledger firmado: la de la mano no se le debe, la de la terminal sí', async () => {
    const filas = await conTransaccion((tx) =>
      liquidacionPorProfesional(tx, negocio.organizacionId, {
        sucursalId,
        abiertaEn: ABIERTA,
        cerradaEn: CERRADA,
      }),
    );
    const karla = filas.find((f) => f.profesional === 'Karla');

    expect(karla?.propinaPendienteCentavos).toBe('5400');
    // Lo recibido y lo entregado siguen a la vista, cada uno con su signo.
    expect(karla?.propinaRecibidaCentavos).toBe('15400');
    expect(karla?.propinaEntregadaCentavos).toBe('-10000');
  });
});
