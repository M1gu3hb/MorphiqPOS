import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { anotarEnEspera } from './espera.ts';

/**
 * F-409 · LA LISTA DE ESPERA ANOTA SÓLO LO DE SU NEGOCIO, contra Postgres (R16).
 *
 * `lista_espera_citas.anotar` insertaba la clienta, el servicio y la profesional que le
 * mandaran: la llave foránea no mira el negocio, así que la clienta de OTRO negocio entraba
 * como referencia, y una que no existe reventaba como error interno (23503). La prueba de
 * aislamiento de la CI lo veía sólo a veces: sus dos marcas de «ahora» caían a veces en
 * milisegundos distintos y la ventana dejaba de estar vacía.
 */

let negocio: NegocioReal;
let otro: NegocioReal;
let sucursalId: string;
let clienta = '';
let clientaAjena = '';
let servicioAjeno = '';

async function sembrarClienta(organizacionId: string, nombre: string): Promise<string> {
  const id = randomUUID();
  await conTransaccion((tx) =>
    tx.insertInto('clientes').values({ id, organizacion_id: organizacionId, nombre }).execute(),
  );
  return id;
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Salón de la Espera',
    rol: 'cajero',
    giro: 'estetica',
    paquete: 'estetica',
  });
  otro = await sembrarNegocio({
    nombre: 'Salón de enfrente',
    rol: 'cajero',
    giro: 'estetica',
    paquete: 'estetica',
  });
  ({ sucursalId } = await sembrarSucursal(negocio, { terminales: ['Recepción'] }));
  clienta = await sembrarClienta(negocio.organizacionId, 'Clienta de aquí');
  clientaAjena = await sembrarClienta(otro.organizacionId, 'Clienta de enfrente');
  servicioAjeno = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('productos')
      .values({
        id: servicioAjeno,
        organizacion_id: otro.organizacionId,
        nombre: 'Corte de enfrente',
        precio_venta_centavos: 25_000n,
        tipo_venta: 'servicio',
        estrategia_consumo: 'ninguno',
      })
      .execute();
    await tx
      .insertInto('servicios')
      .values({
        producto_id: servicioAjeno,
        organizacion_id: otro.organizacionId,
        duracion_activa_1_min: 30,
      })
      .execute();
  });
});

function anotar(datos: { clienteId: string; servicioId?: string | null }) {
  return comando(anotarEnEspera, {
    entrada: {
      ...datos,
      desde: '2026-11-20T16:00:00.000Z',
      hasta: '2026-11-20T18:00:00.000Z',
    },
    ambito: ambitoDe(negocio, sucursalId, null),
    idempotencyKey: clave(),
  });
}

async function esperasDe(organizacionId: string): Promise<number> {
  const filas = await obtenerDb()
    .selectFrom('lista_espera_citas')
    .select('id')
    .where('organizacion_id', '=', organizacionId)
    .execute();
  return filas.length;
}

describe('la lista de espera sólo anota lo de su negocio', () => {
  it('una clienta de aquí se anota', async () => {
    exigirOk(await anotar({ clienteId: clienta }), 'lista_espera_citas.anotar');
    expect(await esperasDe(negocio.organizacionId)).toBe(1);
  });

  it('la clienta de otro negocio no entra: «no existe en este negocio»', async () => {
    const r = await anotar({ clienteId: clientaAjena });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.datos?.['regla']).toBe('PUENTE_NO_ENCONTRADO');
    expect(await esperasDe(negocio.organizacionId)).toBe(1);
  });

  it('una clienta que no existe dice eso, no un error interno', async () => {
    const r = await anotar({ clienteId: randomUUID() });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.datos?.['regla']).toBe('PUENTE_NO_ENCONTRADO');
  });

  it('el servicio de otro negocio tampoco entra', async () => {
    const r = await anotar({ clienteId: clienta, servicioId: servicioAjeno });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.datos?.['regla']).toBe('PUENTE_NO_ENCONTRADO');
    expect(await esperasDe(negocio.organizacionId)).toBe(1);
  });
});
