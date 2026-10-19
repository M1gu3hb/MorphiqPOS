import { randomUUID } from 'node:crypto';

import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ambitoDe,
  clave,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { capturarListaTrabajo } from './listas.ts';
import { crearNotaMostrador } from './nota-de-mostrador.ts';

/**
 * LO QUE NO EXISTE SE CONTESTA, NO REVIENTA (contra Postgres, con sus llaves).
 *
 * La nota de mostrador y la lista de trabajo guardaban el cliente, la obra y el material tal
 * como llegaban, y lo que no existía lo paraba la LLAVE FORÁNEA: `23503` y un 500 «No fue
 * posible completar la operación». Lo destapó el aislamiento mandando ids al azar a cada ruta.
 * Aquí, con las llaves de verdad: la respuesta es la regla del negocio, y no queda escrita ni
 * una orden, ni una nota, ni una lista, ni un folio.
 */

let negocio: NegocioReal;
let ambito: ReturnType<typeof ambitoDe>;
let productoId: string;

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Ferretería de lo que no existe',
    rol: 'cajero',
    giro: 'ferreteria',
    paquete: 'ferreteria',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Mostrador'] });
  ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  ({ productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Varilla de 3/8',
    precioCentavos: 18_500n,
    existencia: '50',
  }));
});

async function cuantas(tabla: 'ordenes' | 'notas_mostrador' | 'listas_trabajo'): Promise<number> {
  const fila = await obtenerDb()
    .selectFrom(tabla)
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('organizacion_id', '=', negocio.organizacionId)
    .executeTakeFirstOrThrow();
  return Number(fila.n);
}

function reglaDe(resultado: { ok: boolean; error?: { codigo: string; datos?: unknown } }): string {
  if (resultado.ok) return 'ok';
  const regla = (resultado.error?.datos as { regla?: string } | undefined)?.regla;
  return `${resultado.error?.codigo ?? '?'}${regla === undefined ? '' : ` · ${regla}`}`;
}

describe('la nota de mostrador con un cliente o una obra que no existen', () => {
  it('se contesta «ese cliente no existe», sin orden ni nota', async () => {
    const antes = { ordenes: await cuantas('ordenes'), notas: await cuantas('notas_mostrador') };

    const resultado = await comando(crearNotaMostrador, {
      entrada: { clienteId: randomUUID(), partidas: [{ productoId, cantidad: 2 }] },
      ambito,
      idempotencyKey: clave(),
    });

    expect(reglaDe(resultado)).toBe('REGLA_DE_NEGOCIO · PUENTE_NO_ENCONTRADO');
    expect(await cuantas('ordenes')).toBe(antes.ordenes);
    expect(await cuantas('notas_mostrador')).toBe(antes.notas);
  });

  it('una obra que no existe tampoco revienta', async () => {
    const resultado = await comando(crearNotaMostrador, {
      entrada: {
        clienteId: null,
        obraId: randomUUID(),
        nombreLibre: 'Don Beto',
        partidas: [{ productoId, cantidad: 1 }],
      },
      ambito,
      idempotencyKey: clave(),
    });

    expect(reglaDe(resultado)).toBe('REGLA_DE_NEGOCIO · PUENTE_NO_ENCONTRADO');
  });
});

describe('la lista de trabajo con lo que no existe', () => {
  it('un cliente al azar se contesta y no se escribe la lista', async () => {
    const antes = await cuantas('listas_trabajo');

    const resultado = await comando(capturarListaTrabajo, {
      entrada: {
        titulo: 'Losa del 3er piso',
        clienteId: randomUUID(),
        renglones: [{ textoPedido: 'varilla del 3' }],
      },
      ambito,
      idempotencyKey: clave(),
    });

    expect(reglaDe(resultado)).toBe('REGLA_DE_NEGOCIO · PUENTE_NO_ENCONTRADO');
    expect(await cuantas('listas_trabajo')).toBe(antes);
  });

  it('un material al azar se contesta y no se escribe la lista', async () => {
    const antes = await cuantas('listas_trabajo');

    const resultado = await comando(capturarListaTrabajo, {
      entrada: {
        titulo: 'Losa del 3er piso',
        nombreLibre: 'Don Beto',
        renglones: [
          {
            textoPedido: 'varilla del 3',
            productoId: randomUUID(),
            cantidad: '4',
            unidad: 'pieza',
          },
        ],
      },
      ambito,
      idempotencyKey: clave(),
    });

    expect(reglaDe(resultado)).toBe('REGLA_DE_NEGOCIO · PRODUCTO_NO_ENCONTRADO');
    expect(await cuantas('listas_trabajo')).toBe(antes);
  });

  it('con lo que sí existe, la lista se guarda (la comprobación no estorba)', async () => {
    const resultado = await comando(capturarListaTrabajo, {
      entrada: {
        titulo: 'Losa del 3er piso',
        nombreLibre: 'Don Beto',
        renglones: [{ textoPedido: 'varilla del 3', productoId, cantidad: '4', unidad: 'pieza' }],
      },
      ambito,
      idempotencyKey: clave(),
    });

    expect(reglaDe(resultado)).toBe('ok');
  });
});
