import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { recibirNota } from './recibir-nota.ts';

/**
 * D-32 · EL PRIMER PROVEEDOR QUE LO TRAE queda como su proveedor, contra Postgres.
 *
 * Un producto dado de alta en el mostrador no era de NADIE: el sugerido de pedido y el
 * canje listan «lo que se le compra a este proveedor» y no lo veían nunca. Recibir la nota
 * del repartidor lo liga ahora a quien lo trajo (`ligar_al_proveedor`), pero SÓLO si no
 * tenía proveedor: cambiarlo es una decisión del dueño, no un efecto de recibir una nota.
 *
 * Lo recibe el ALMACÉN, que es su trabajo y que el comando rechazaba a media nota
 * («Tu puesto no tiene permiso») hasta el bloque D de la 2.4.
 */

let negocio: NegocioReal;
let ambito: ReturnType<typeof ambitoDe>;
let bimbo: string;
let marinela: string;
let sinProveedor: string;
let deMarinela: string;

async function sembrarProveedor(nombre: string): Promise<string> {
  const id = randomUUID();
  await conTransaccion((tx) =>
    tx
      .insertInto('proveedores')
      .values({ id, organizacion_id: negocio.organizacionId, nombre })
      .execute(),
  );
  return id;
}

async function proveedorDe(insumoId: string): Promise<string | null> {
  const fila = await obtenerDb()
    .selectFrom('insumos')
    .select('proveedor_id')
    .where('id', '=', insumoId)
    .executeTakeFirstOrThrow();
  return fila.proveedor_id;
}

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Abarrotes de la Nota', rol: 'almacen' });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Bodega'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  bimbo = await sembrarProveedor('Bimbo');
  marinela = await sembrarProveedor('Marinela');
  // Dado de alta en el mostrador: de nadie.
  ({ insumoId: sinProveedor } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Pan blanco grande',
    precioCentavos: 5_200n,
    existencia: '0',
  }));
  // Y uno que ya tiene dueño.
  ({ insumoId: deMarinela } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Gansito',
    precioCentavos: 1_800n,
    existencia: '0',
  }));
  await conTransaccion((tx) =>
    tx
      .updateTable('insumos')
      .set({ proveedor_id: marinela })
      .where('id', '=', deMarinela)
      .execute(),
  );
});

describe('D-32 · recibir la nota liga lo que no tenía proveedor', () => {
  it('lo que era de nadie queda de Bimbo; lo que ya era de Marinela no se toca', async () => {
    const recibida = exigirOk(
      await comando(recibirNota, {
        entrada: {
          proveedorId: bimbo,
          lineas: [
            {
              insumoId: sinProveedor,
              cantidadCapturada: '12',
              unidadCapturada: 'pieza',
              equivalencia: '1',
              costoTotal: '480',
            },
            {
              insumoId: deMarinela,
              cantidadCapturada: '6',
              unidadCapturada: 'pieza',
              equivalencia: '1',
              costoTotal: '84',
            },
          ],
        },
        ambito,
        idempotencyKey: clave(),
      }),
      'compras.recibir_nota',
    );
    expect(recibida.lineas).toBe(2);

    expect(await proveedorDe(sinProveedor)).toBe(bimbo);
    expect(await proveedorDe(deMarinela)).toBe(marinela);

    // Y la mercancía entró: lo recibido está en el anaquel.
    const existencias = await obtenerDb()
      .selectFrom('existencias')
      .select(['insumo_id', 'cantidad'])
      .where('insumo_id', 'in', [sinProveedor, deMarinela])
      .orderBy('cantidad', 'desc')
      .execute();
    expect(existencias).toEqual([
      { insumo_id: sinProveedor, cantidad: '12.0000' },
      { insumo_id: deMarinela, cantidad: '6.0000' },
    ]);
  });
});
