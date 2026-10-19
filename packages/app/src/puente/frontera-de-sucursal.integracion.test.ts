import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  cobrarEnEfectivo,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { consultar } from './consultar.ts';
import { MAPA, entidadMapeada } from './mapa.ts';

/**
 * DOS SUCURSALES DE UN MISMO NEGOCIO, contra Postgres (D-36).
 *
 * `frontera-de-sucursal.test.ts` afirma la FORMA de la consulta; esto, lo que devuelve. Un
 * negocio con el centro y el norte, una caja abierta y una venta cobrada en cada uno por los
 * comandos de producción, y el puente leído como lo leería cada rol:
 *
 *   · el gerente del centro ve su venta, sus renglones, su kárdex y su corte, y nada del
 *     norte —ni en la lista, ni pidiéndolo por su id, ni filtrando por él—;
 *   · el dueño y el administrador ven las dos;
 *   · el catálogo es del negocio y lo ven todos.
 *
 * Y el contrato con el esquema, contra la base migrada: cada entidad declara su frontera con
 * columnas que EXISTEN, y una tabla con `sucursal_id` no puede declararse del negocio entero
 * ni acotarse por un padre —tendría la respuesta en su propia fila y la ignoraría—.
 */

let negocio: NegocioReal;
let centro: SucursalReal;
let norte: SucursalReal;
let ventaCentro: string;
let ventaNorte: string;
let productoId: string;

async function venderUno(sucursal: SucursalReal): Promise<string> {
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  await abrirCajaReal(ambito);
  const { ordenId, totalCentavos } = await armarVenta(ambito, [{ productoId, cantidad: '1' }]);
  exigirOk(await cobrarEnEfectivo(ambito, ordenId, totalCentavos), 'venta.cobrar');
  return ordenId;
}

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Abarrotes de Dos Sucursales', rol: 'cajero' });
  centro = await sembrarSucursal(negocio, { terminales: ['Caja Centro'] });
  norte = await sembrarSucursal(negocio, { terminales: ['Caja Norte'] });
  const refresco = await sembrarProducto(negocio, centro.almacenId, {
    nombre: 'Refresco de cola 600 ml',
    precioCentavos: 2_000n,
    existencia: '10',
  });
  productoId = refresco.productoId;
  // El mismo producto, con existencia también en el almacén del norte.
  await conTransaccion((tx) =>
    tx
      .insertInto('existencias')
      .values({
        organizacion_id: negocio.organizacionId,
        almacen_id: norte.almacenId,
        insumo_id: refresco.insumoId,
        cantidad: '10',
      })
      .execute(),
  );
  ventaCentro = await venderUno(centro);
  ventaNorte = await venderUno(norte);
});

function lector(rol: string, sucursalId: string | null) {
  return { organizacionId: negocio.organizacionId, rol, empleoId: negocio.empleoId, sucursalId };
}

async function ids(
  ambito: ReturnType<typeof lector>,
  entidad: string,
  campo = 'id',
): Promise<unknown[]> {
  const filas = await consultar(ambito, { entidad, operacion: 'list', limite: 500 });
  return filas.map((f) => f[campo]);
}

describe('dos sucursales de un negocio, por el puente (D-36)', () => {
  it('el gerente del centro ve SU venta y ninguna del norte', async () => {
    const gerente = lector('gerente', centro.sucursalId);
    expect(await ids(gerente, 'Venta')).toEqual([ventaCentro]);
    // Ni pidiéndola por su id, ni filtrando por él: la del norte, para él, no existe.
    expect(
      await consultar(gerente, { entidad: 'Venta', operacion: 'get', id: ventaNorte }),
    ).toEqual([]);
    expect(
      await consultar(gerente, {
        entidad: 'Venta',
        operacion: 'filter',
        filtro: { id: ventaNorte },
      }),
    ).toEqual([]);
  });

  it('y lo que cuelga de una venta, un almacén o una caja se acota por su padre', async () => {
    const gerente = lector('gerente', centro.sucursalId);
    const renglones = await ids(gerente, 'DetalleVenta', 'venta_id');
    expect(renglones.length).toBeGreaterThan(0);
    expect(new Set(renglones)).toEqual(new Set([ventaCentro]));

    const kardex = await ids(gerente, 'MovimientoInventario', 'almacen_id');
    expect(kardex.length).toBeGreaterThan(0);
    expect(new Set(kardex)).toEqual(new Set([centro.almacenId]));

    const cortes = await consultar(gerente, { entidad: 'CorteCaja', operacion: 'list' });
    expect(cortes).toHaveLength(1);
    const sesionCentro = cortes[0]?.['id'];
    const movimientos = await ids(gerente, 'MovimientoCaja', 'sesion_caja_id');
    for (const sesion of movimientos) expect(sesion).toBe(sesionCentro);
  });

  it('la cajera del norte, igual pero al revés', async () => {
    const cajera = lector('cajero', norte.sucursalId);
    expect(await ids(cajera, 'Venta')).toEqual([ventaNorte]);
    expect(await ids(cajera, 'CorteCaja')).toHaveLength(1);
  });

  it.each(['dueno', 'administrador'])(
    '%s ve las dos sucursales, con o sin terminal',
    async (rol) => {
      for (const sucursalId of [null, centro.sucursalId]) {
        expect(new Set(await ids(lector(rol, sucursalId), 'Venta'))).toEqual(
          new Set([ventaCentro, ventaNorte]),
        );
        expect(await ids(lector(rol, sucursalId), 'CorteCaja')).toHaveLength(2);
      }
    },
  );

  it('quien no consolida y llega sin sucursal no ve ninguna', async () => {
    expect(await ids(lector('gerente', null), 'Venta')).toEqual([]);
    expect(await ids(lector('gerente', null), 'DetalleVenta')).toEqual([]);
  });

  it('el catálogo es del negocio: lo ven las dos', async () => {
    for (const sucursal of [centro, norte]) {
      expect(await ids(lector('cajero', sucursal.sucursalId), 'ProductoTerminado')).toContain(
        productoId,
      );
    }
  });
});

describe('cada frontera del puente, contra el esquema migrado', () => {
  it('declara columnas que existen, y no ignora una sucursal que su fila tiene', async () => {
    const filas = await sql<{ tabla: string; columna: string }>`
      select table_name as tabla, column_name as columna
        from information_schema.columns
       where table_schema = 'public'`.execute(obtenerDb());
    const columnas = new Map<string, Set<string>>();
    for (const { tabla, columna } of filas.rows) {
      const de = columnas.get(tabla) ?? new Set<string>();
      de.add(columna);
      columnas.set(tabla, de);
    }

    const fallas: string[] = [];
    for (const nombre of [...Object.keys(MAPA), 'DescuentoInventarioVenta']) {
      const entidad = entidadMapeada(nombre);
      if (entidad === null) continue;
      const suyas = columnas.get(entidad.tabla);
      const frontera = entidad.sucursal;
      if (suyas === undefined) {
        fallas.push(`${nombre}: «${entidad.tabla}» no existe`);
        continue;
      }
      if (!suyas.has('organizacion_id')) fallas.push(`${nombre}: sin organizacion_id`);
      if (
        suyas.has('sucursal_id') &&
        !('columna' in frontera && frontera.columna === 'sucursal_id')
      ) {
        fallas.push(`${nombre}: su fila tiene sucursal_id y la frontera no la usa`);
      }
      if ('columna' in frontera && !suyas.has(frontera.columna)) {
        fallas.push(`${nombre}: no tiene «${frontera.columna}»`);
      }
      if ('porPadre' in frontera) {
        const padre = columnas.get(frontera.porPadre.tabla);
        if (!suyas.has(frontera.porPadre.columna)) {
          fallas.push(`${nombre}: no tiene «${frontera.porPadre.columna}»`);
        }
        if (padre?.has('organizacion_id') !== true) {
          fallas.push(`${nombre}: el padre «${frontera.porPadre.tabla}» no tiene organizacion_id`);
        }
        if (padre?.has(frontera.porPadre.columnaSucursal ?? 'sucursal_id') !== true) {
          fallas.push(`${nombre}: el padre «${frontera.porPadre.tabla}» no dice su sucursal`);
        }
      }
    }
    expect(fallas).toEqual([]);
  });
});
