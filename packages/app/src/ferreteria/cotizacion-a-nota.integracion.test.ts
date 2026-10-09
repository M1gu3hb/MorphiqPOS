import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  abrirCajaReal,
  ambitoDe,
  clave,
  cobrarEnEfectivo,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { crearCotizacion, registrarEnvio } from './cotizacion.ts';
import { convertirCotizacionEnNota } from './cotizacion-a-nota.ts';

/**
 * F-604 · LA COTIZACIÓN GANADA SE CONVIERTE EN VENTA, contra Postgres (bloque D de la 2.4).
 *
 * De punta a punta por los comandos de producción: se cotiza a un precio por debajo del
 * catálogo, se manda, se convierte en nota —al precio COTIZADO— y la caja la cobra. Contra
 * la base de verdad porque la cotización ganada tiene que caber en
 * `cotizacion_ganada_con_orden` (163) y la nota en los `check` de `ordenes` y
 * `notas_mostrador`; la base falsa no mira ninguno.
 */

let ambito: ReturnType<typeof ambitoDe>;
let productoId: string;

beforeAll(async () => {
  const negocio = await sembrarNegocio({
    nombre: 'Ferretería de la Cotización',
    rol: 'cajero',
    giro: 'ferreteria',
    paquete: 'ferreteria',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Mostrador'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ({ productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Brocha profesional 3 pulgadas',
    precioCentavos: 7_900n,
    existencia: '10',
  }));
  await abrirCajaReal(ambito);
});

describe('la cotización que se convierte en venta, en la base', () => {
  it('se cotiza a $75, se manda, se convierte en nota a $75 y la caja la cobra', async () => {
    const cotizacion = exigirOk(
      await comando(crearCotizacion, {
        entrada: {
          vigenciaDias: 15,
          nombreLibre: 'Ing. Loera',
          lineas: [
            {
              productoId,
              descripcion: 'Brocha profesional 3 pulgadas',
              cantidad: '2.0000',
              unidad: 'pieza',
              precioUnitarioCentavos: 7_500,
            },
          ],
        },
        ambito,
        idempotencyKey: clave(),
      }),
      'cotizacion.crear',
    );
    exigirOk(
      await comando(registrarEnvio, {
        entrada: { cotizacionId: cotizacion.cotizacionId, medio: 'whatsapp' },
        ambito,
        idempotencyKey: clave(),
      }),
      'cotizacion.registrar_envio',
    );

    const nota = exigirOk(
      await comando(convertirCotizacionEnNota, {
        entrada: { cotizacionId: cotizacion.cotizacionId },
        ambito,
        idempotencyKey: clave(),
      }),
      'cotizacion.convertir_en_nota',
    );
    expect(nota.folio).toMatch(/^N-\d+$/);
    expect(nota.totalCentavos).toBe('15000');

    const ganada = await obtenerDb()
      .selectFrom('cotizaciones')
      .select(['estado', 'orden_id', 'cerrada_en'])
      .where('id', '=', cotizacion.cotizacionId)
      .executeTakeFirstOrThrow();
    expect(ganada.estado).toBe('ganada');
    expect(ganada.orden_id).toBe(nota.ordenId);
    expect(ganada.cerrada_en).not.toBeNull();

    // La caja la cobra por el total cotizado, como cualquier nota.
    const cobro = exigirOk(await cobrarEnEfectivo(ambito, nota.ordenId, 15_000), 'venta.cobrar');
    expect(cobro.totalCentavos).toBe('15000');
  });
});
