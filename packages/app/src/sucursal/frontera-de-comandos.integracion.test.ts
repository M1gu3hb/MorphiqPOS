import { randomUUID } from 'node:crypto';

import type { Ambito, Resultado } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { hojaDelCorte } from '../caja/corte/documento.ts';
import { comando } from '../produccion.ts';
import { columnasDelEsquema, fallasDeFrontera } from '../pruebas/frontera-del-esquema.ts';
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
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { agregarLinea } from '../venta/carrito.ts';
import { estadoDeVenta } from '../venta/consultas.ts';
import { devolverVenta, ventaParaDevolver } from '../venta/devolucion-de-venta.ts';
import { FRONTERA_DE_TABLAS } from './frontera.ts';

/**
 * DOS SUCURSALES DE UN NEGOCIO, por los comandos de producción (D-36).
 *
 * El centro y el norte, cada uno con su caja abierta. Desde el norte se mandan ids del
 * centro —una orden abierta, una venta cobrada, su corte— a los comandos que cobran,
 * agregan, devuelven y leen, y la respuesta tiene que ser la MISMA que a un id que no
 * existe: mismo código, mismo mensaje. Y nada cambia en el centro.
 *
 * El dueño lee las dos; cuando escribe desde la terminal del norte, opera el norte.
 */

let negocio: NegocioReal;
let centro: SucursalReal;
let norte: SucursalReal;
let productoId: string;
let abiertaDelCentro: { ordenId: string; totalCentavos: number };
let cobradaDelCentro: string;
let sesionDelCentro: string;

function enLaCaja(sucursal: SucursalReal, cambios: Partial<Ambito> = {}): Ambito {
  return { ...ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null), ...cambios };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** La respuesta sin lo que cambia de una petición a otra: ids y correlación. */
function huella(resultado: Resultado<unknown>): string {
  const texto = JSON.stringify(resultado, (clave, valor: unknown) =>
    clave === 'correlationId' ? undefined : valor,
  );
  return texto.replace(UUID, '⟨id⟩');
}

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Abarrotes de Dos Sucursales', rol: 'cajero' });
  centro = await sembrarSucursal(negocio, { terminales: ['Caja Centro'] });
  norte = await sembrarSucursal(negocio, { terminales: ['Caja Norte'] });
  const refresco = await sembrarProducto(negocio, centro.almacenId, {
    nombre: 'Refresco de cola 600 ml',
    precioCentavos: 2_000n,
    existencia: '20',
  });
  productoId = refresco.productoId;
  await conTransaccion((tx) =>
    tx
      .insertInto('existencias')
      .values({
        organizacion_id: negocio.organizacionId,
        almacen_id: norte.almacenId,
        insumo_id: refresco.insumoId,
        cantidad: '20',
      })
      .execute(),
  );

  sesionDelCentro = await abrirCajaReal(enLaCaja(centro));
  await abrirCajaReal(enLaCaja(norte));

  const cobrada = await armarVenta(enLaCaja(centro), [{ productoId, cantidad: '2' }]);
  exigirOk(
    await cobrarEnEfectivo(enLaCaja(centro), cobrada.ordenId, cobrada.totalCentavos),
    'venta.cobrar en el centro',
  );
  cobradaDelCentro = cobrada.ordenId;
  abiertaDelCentro = await armarVenta(enLaCaja(centro), [{ productoId, cantidad: '1' }]);
});

describe('un id del centro, mandado desde el norte (D-36)', () => {
  it('la cajera del norte no cobra una orden del centro: contesta como a una que no existe', async () => {
    const estadoDe = async () =>
      (
        await obtenerDb()
          .selectFrom('ordenes')
          .select('estado')
          .where('id', '=', abiertaDelCentro.ordenId)
          .executeTakeFirstOrThrow()
      ).estado;
    const antes = await estadoDe();
    const ajena = await cobrarEnEfectivo(
      enLaCaja(norte),
      abiertaDelCentro.ordenId,
      abiertaDelCentro.totalCentavos,
    );
    const ninguna = await cobrarEnEfectivo(
      enLaCaja(norte),
      randomUUID(),
      abiertaDelCentro.totalCentavos,
    );
    expect(ajena.ok).toBe(false);
    expect(huella(ajena)).toBe(huella(ninguna));

    expect(await estadoDe()).toBe(antes);
    const pagos = await obtenerDb()
      .selectFrom('pagos')
      .select('id')
      .where('orden_id', '=', abiertaDelCentro.ordenId)
      .execute();
    expect(pagos).toEqual([]);
  });

  it('ni le agrega un renglón', async () => {
    const pedir = (ordenId: string) =>
      comando(agregarLinea, {
        entrada: { ordenId, productoId, cantidad: '1' },
        ambito: enLaCaja(norte),
        idempotencyKey: clave(),
      });
    const ajena = await pedir(abiertaDelCentro.ordenId);
    expect(ajena.ok).toBe(false);
    expect(huella(ajena)).toBe(huella(await pedir(randomUUID())));
    const lineas = await obtenerDb()
      .selectFrom('orden_lineas')
      .select('id')
      .where('orden_id', '=', abiertaDelCentro.ordenId)
      .execute();
    expect(lineas).toHaveLength(1);
  });

  it('ni devuelve una venta cobrada en el centro, ni la encuentra para devolverla', async () => {
    const gerente = enLaCaja(norte, { rol: 'gerente' });
    const linea = await obtenerDb()
      .selectFrom('orden_lineas')
      .select('id')
      .where('orden_id', '=', cobradaDelCentro)
      .executeTakeFirstOrThrow();
    const devolver = (ordenId: string, ordenLineaId: string) =>
      comando(devolverVenta, {
        entrada: {
          ordenId,
          lineas: [{ ordenLineaId, cantidad: '1' }],
          metodo: 'efectivo',
          motivo: 'Prueba de frontera',
        },
        ambito: gerente,
        idempotencyKey: clave(),
      });
    const ajena = await devolver(cobradaDelCentro, linea.id);
    expect(ajena.ok).toBe(false);
    expect(huella(ajena)).toBe(huella(await devolver(randomUUID(), randomUUID())));
    const devoluciones = await obtenerDb()
      .selectFrom('devoluciones')
      .select('id')
      .where('orden_id', '=', cobradaDelCentro)
      .execute();
    expect(devoluciones).toEqual([]);

    const buscar = (ordenId: string) =>
      comando(ventaParaDevolver, { entrada: { ordenId }, ambito: gerente });
    const vista = await buscar(cobradaDelCentro);
    expect(vista.ok).toBe(false);
    expect(huella(vista)).toBe(huella(await buscar(randomUUID())));
  });

  it('ni lee su estado, ni su corte', async () => {
    const estado = (ordenId: string) =>
      comando(estadoDeVenta, { entrada: { ordenId }, ambito: enLaCaja(norte) });
    expect(huella(await estado(abiertaDelCentro.ordenId))).toBe(huella(await estado(randomUUID())));

    const corte = (sesionCajaId: string) =>
      comando(hojaDelCorte, {
        entrada: { sesionCajaId },
        ambito: enLaCaja(norte, { rol: 'gerente' }),
      });
    const ajeno = await corte(sesionDelCentro);
    expect(ajeno.ok).toBe(false);
    expect(huella(ajeno)).toBe(huella(await corte(randomUUID())));
  });

  it('en su propia sucursal, todo eso funciona: la frontera no estorba a nadie', async () => {
    expect(
      (
        await comando(estadoDeVenta, {
          entrada: { ordenId: abiertaDelCentro.ordenId },
          ambito: enLaCaja(centro),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await comando(hojaDelCorte, {
          entrada: { sesionCajaId: sesionDelCentro },
          ambito: enLaCaja(centro, { rol: 'gerente' }),
        })
      ).ok,
    ).toBe(true);
  });
});

describe('el dueño (D-36)', () => {
  it('lee el corte del centro desde la terminal del norte y desde su teléfono', async () => {
    for (const ambito of [
      enLaCaja(norte, { rol: 'dueno' }),
      enLaCaja(norte, { rol: 'dueno', sucursalId: null, terminalId: null }),
    ]) {
      const hoja = await comando(hojaDelCorte, {
        entrada: { sesionCajaId: sesionDelCentro },
        ambito,
      });
      expect(hoja.ok).toBe(true);
    }
  });

  it('pero desde la terminal del norte no cobra una orden del centro en la caja del norte', async () => {
    const ajena = await cobrarEnEfectivo(
      enLaCaja(norte, { rol: 'dueno' }),
      abiertaDelCentro.ordenId,
      abiertaDelCentro.totalCentavos,
    );
    expect(ajena.ok).toBe(false);
    expect(huella(ajena)).toBe(
      huella(
        await cobrarEnEfectivo(
          enLaCaja(norte, { rol: 'dueno' }),
          randomUUID(),
          abiertaDelCentro.totalCentavos,
        ),
      ),
    );
  });
});

describe('cada tabla de la frontera de los comandos, contra el esquema migrado', () => {
  it('nombra columnas que existen, y lee con su coalesce la sucursal que admite nulo', async () => {
    const columnas = await columnasDelEsquema();
    const fallas = Object.entries(FRONTERA_DE_TABLAS).flatMap(([tabla, frontera]) =>
      fallasDeFrontera(tabla, tabla, frontera, columnas),
    );
    expect(fallas).toEqual([]);
  });
});
