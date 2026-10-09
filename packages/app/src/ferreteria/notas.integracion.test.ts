import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import { cerrarCaja } from '../caja/sesion.ts';
import {
  abrirCajaReal,
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { crearNotaMostrador } from './nota-de-mostrador.ts';
import { cancelarNota } from './notas.ts';

/**
 * `02-DINERO-Y-CAJA §8.5.1`, contra Postgres (bloque D de la 2.4): la caja NO cierra con
 * una nota mandada y sin cobrar, y la nota se CANCELA con su motivo para poder cerrar.
 *
 * Contra la base de verdad porque la cancelación tiene que caber en tres `check`:
 * `orden_cancelada_con_motivo` (003), `orden_cerrada_con_fecha` (045) y
 * `nota_estado_valido` (116). La base falsa no mira ninguno.
 */

const FONDO = 50_000;

let ambito: ReturnType<typeof ambitoDe>;
let productoId: string;

beforeAll(async () => {
  const negocio = await sembrarNegocio({
    nombre: 'Ferretería de la Nota',
    rol: 'cajero',
    giro: 'ferreteria',
    paquete: 'ferreteria',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Mostrador'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ({ productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Llave ajustable 10 pulgadas',
    precioCentavos: 17_500n,
    existencia: '4',
  }));
  await abrirCajaReal(ambito, FONDO);
});

describe('la nota mandada a caja y el cierre, en la base', () => {
  it('no se cierra con la nota sin cobrar; cancelada con su motivo, sí', async () => {
    const nota = exigirOk(
      await comando(crearNotaMostrador, {
        entrada: { partidas: [{ productoId, cantidad: 1 }] },
        ambito,
        idempotencyKey: clave(),
      }),
      'ferreteria.crear_nota_mostrador',
    );

    const conLaNota = await comando(cerrarCaja, {
      entrada: { efectivoContadoCentavos: FONDO },
      ambito,
      idempotencyKey: clave(),
    });
    expect(conLaNota.ok).toBe(false);
    expect(conLaNota.ok ? '' : conLaNota.error.mensaje).toContain(nota.folio);

    exigirOk(
      await comando(cancelarNota, {
        entrada: { notaId: nota.notaId, motivo: 'el cliente se fue sin pagar' },
        ambito,
        idempotencyKey: clave(),
      }),
      'nota_mostrador.cancelar',
    );
    const orden = await obtenerDb()
      .selectFrom('ordenes')
      .select(['estado', 'motivo_cancelacion', 'cerrada_en'])
      .where('id', '=', nota.ordenId)
      .executeTakeFirstOrThrow();
    expect(orden.estado).toBe('cancelada');
    expect(orden.motivo_cancelacion).toBe('el cliente se fue sin pagar');
    expect(orden.cerrada_en).not.toBeNull();
    // Y la caja ya no la lista: la vista deja fuera lo cancelado.
    // La vista no está en el esquema de Kysely: se lee con SQL.
    const enLaCaja = await sql<{
      id: string;
    }>`select id from notas_de_caja where id = ${nota.ordenId}`.execute(obtenerDb());
    expect(enLaCaja.rows).toEqual([]);

    exigirOk(
      await comando(cerrarCaja, {
        entrada: { efectivoContadoCentavos: FONDO },
        ambito,
        idempotencyKey: clave(),
      }),
      'caja.cerrar',
    );
  });
});
