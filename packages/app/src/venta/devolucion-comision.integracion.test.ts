import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  clave,
  cobrarEnEfectivo,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { devolverVenta } from './devolucion-de-venta.ts';

/**
 * §7.3 del salón · LA CONTRAPARTIDA DE LA COMISIÓN, contra Postgres (D.1 de la 2.4).
 *
 * `devolucion-de-venta.test.ts` prueba la cuenta sobre la base falsa. Lo que la base falsa
 * NO puede decir es si la fila que se escribe la ACEPTA la 134: una contrapartida tiene que
 * llevar a quién corrige y su motivo (`comision_contrapartida_explicada`), ir en negativo
 * (`comision_contrapartida_negativa`) y apuntar a una regla que exista. Si no, la devolución
 * entera se cae al cobrar en una base de verdad, que es justo donde la falsa da verde.
 */

const PRECIO = 25_000n;

let ambito: ReturnType<typeof ambitoDe>;
let ordenId: string;
let lineaId: string;
let causadaId: string;

beforeAll(async () => {
  const negocio = await sembrarNegocio({ nombre: 'Salón de la devolución', rol: 'gerente' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Recepción'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);

  const champu = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Shampoo sin sulfatos 300 ml',
    precioCentavos: PRECIO,
    existencia: '10',
  });
  await abrirCajaReal(ambito);
  const venta = await armarVenta(ambito, [{ productoId: champu.productoId, cantidad: '1' }]);
  ordenId = venta.ordenId;
  exigirOk(await cobrarEnEfectivo(ambito, ordenId, venta.totalCentavos), 'venta.cobrar');
  lineaId = (
    await obtenerDb()
      .selectFrom('orden_lineas')
      .select('id')
      .where('orden_id', '=', ordenId)
      .executeTakeFirstOrThrow()
  ).id;

  // La comisión de producto que el salón le causó a quien lo vendió: 10 % sin IVA.
  causadaId = randomUUID();
  await conTransaccion(async (tx) => {
    const regla = await tx
      .insertInto('reglas_comision')
      .values({
        organizacion_id: negocio.organizacionId,
        nombre: 'Estilistas · 40 % de servicio',
        esquema: 'porcentaje_fijo',
        tasa_servicio_bp: 4_000,
        tasa_producto_bp: 1_000,
        vigente_desde: '2026-10-01',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const karla = await tx
      .insertInto('profesionales')
      .values({
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursal.sucursalId,
        empleo_id: negocio.empleoId,
        nombre_completo: 'Karla Domínguez',
        nombre_corto: 'Karla',
        tipo_relacion: 'empleado_comision',
        color_agenda: '#7c3aed',
        regla_comision_id: regla.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await tx
      .insertInto('comisiones_causadas')
      .values({
        id: causadaId,
        organizacion_id: negocio.organizacionId,
        orden_linea_id: lineaId,
        profesional_id: karla.id,
        regla_id: regla.id,
        regla_version: 1,
        tipo: 'producto',
        base_centavos: 21_552n,
        tasa_bp: 1_000,
        monto_centavos: 2_155n,
      })
      .execute();
  });
});

describe('§7.3 · la comisión de lo devuelto, contra Postgres', () => {
  it('la devolución escribe su contrapartida y la base la acepta', async () => {
    exigirOk(
      await comando(devolverVenta, {
        entrada: {
          ordenId,
          lineas: [{ ordenLineaId: lineaId, cantidad: '1' }],
          metodo: 'efectivo',
          motivo: 'Venía abierto',
        },
        ambito,
        idempotencyKey: clave(),
      }),
      'venta.devolver_venta',
    );

    const contrapartidas = await obtenerDb()
      .selectFrom('comisiones_causadas')
      .select(['tipo', 'monto_centavos', 'base_centavos', 'contrapartida_de_id', 'motivo'])
      .where('orden_linea_id', '=', lineaId)
      .where('tipo', '=', 'contrapartida')
      .execute();

    expect(contrapartidas).toEqual([
      {
        tipo: 'contrapartida',
        monto_centavos: -2_155n,
        base_centavos: -21_552n,
        contrapartida_de_id: causadaId,
        motivo: 'devolución: Venía abierto',
      },
    ]);
  });
});
