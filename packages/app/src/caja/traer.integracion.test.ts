import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarCompanero,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { estadoDeCaja } from './consulta.ts';
import { abrirCaja, cerrarCaja } from './sesion.ts';
import { traerCaja } from './traer.ts';

/**
 * LA CAJA ABIERTA EN OTRA TERMINAL, contra Postgres (restaurante, 21-10-2026).
 *
 * El caso de producción: el dueño abrió la caja en la computadora («Caja 20») y entró
 * desde el teléfono, que es otra terminal. Desde ahí no podía cobrar ni abrir —el cupo de
 * la sucursal es uno— y parecía que la caja se había cerrado sola. Aquí se prueba que
 * `caja.estado` le dice dónde está, que `caja.traer` la mueve a su terminal con su arqueo
 * intacto y que desde ahí la cierra; y que una cajera no se lleva la caja de otra.
 */

let negocio: NegocioReal;

beforeAll(async () => {
  negocio = await sembrarNegocio({ nombre: 'Restaurante de la Caja Viajera', rol: 'dueno' });
});

const comoDueno = (sucursalId: string, terminalId: string) =>
  ambitoDe(negocio, sucursalId, terminalId);

async function terminalDeLaSesion(sesionCajaId: string): Promise<string> {
  const fila = await obtenerDb()
    .selectFrom('sesiones_caja')
    .select('terminal_id')
    .where('id', '=', sesionCajaId)
    .executeTakeFirstOrThrow();
  return fila.terminal_id;
}

describe('la caja abierta en otra terminal', () => {
  it('el estado la nombra, se trae al dispositivo y desde ahí se corta', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Caja 20', 'Caja 26'],
    });
    const [computadora, telefono] = terminales as [string, string];

    const { sesionCajaId } = exigirOk(
      await comando(abrirCaja, {
        entrada: { fondoInicialCentavos: 50_000 },
        ambito: comoDueno(sucursalId, computadora),
        idempotencyKey: clave(),
      }),
      'abrir en la computadora',
    );

    // Desde el teléfono: no hay caja AQUÍ, pero la sucursal tiene una, y abrir no cabe.
    const estado = exigirOk(
      await comando(estadoDeCaja, {
        entrada: {},
        ambito: comoDueno(sucursalId, telefono),
        idempotencyKey: clave(),
      }),
      'estado desde el teléfono',
    );
    expect(estado.abierta).toBe(false);
    expect(estado.puedoAbrir).toBe(false);
    expect(estado.enOtraTerminal).toMatchObject({
      sesionCajaId,
      terminalNombre: 'Caja 20',
      puedoTraerla: true,
    });

    const traida = exigirOk(
      await comando(traerCaja, {
        entrada: { sesionCajaId },
        ambito: comoDueno(sucursalId, telefono),
        idempotencyKey: clave(),
      }),
      'traer al teléfono',
    );
    expect(traida).toEqual({ sesionCajaId, deTerminalId: computadora });
    expect(await terminalDeLaSesion(sesionCajaId)).toBe(telefono);

    // Traerla otra vez no hace nada: ya está aquí.
    const otraVez = exigirOk(
      await comando(traerCaja, {
        entrada: { sesionCajaId },
        ambito: comoDueno(sucursalId, telefono),
        idempotencyKey: clave(),
      }),
      'traer de nuevo',
    );
    expect(otraVez.deTerminalId).toBe(telefono);

    // Y es la misma caja, con su fondo: el corte se hace desde el teléfono.
    const corte = exigirOk(
      await comando(cerrarCaja, {
        entrada: { efectivoContadoCentavos: 50_000 },
        ambito: comoDueno(sucursalId, telefono),
        idempotencyKey: clave(),
      }),
      'cortar desde el teléfono',
    );
    expect(corte.sesionCajaId).toBe(sesionCajaId);
    expect(corte.fondoInicialCentavos).toBe('50000');
    expect(corte.diferenciaCentavos).toBe('0');

    // La computadora ya no tiene caja que cortar.
    const desdeLaComputadora = await comando(cerrarCaja, {
      entrada: { efectivoContadoCentavos: 0 },
      ambito: comoDueno(sucursalId, computadora),
      idempotencyKey: clave(),
    });
    expect(desdeLaComputadora.ok).toBe(false);
  });

  it('una cajera no se lleva la caja que abrió otra persona; la gerencia sí', async () => {
    const { sucursalId, terminales } = await sembrarSucursal(negocio, {
      terminales: ['Caja A', 'Caja B'],
    });
    const [cajaA, cajaB] = terminales as [string, string];
    const cajeraId = await sembrarCompanero(negocio, { nombre: 'Rosa', rol: 'cajero' });
    const comoCajera = (terminalId: string) => ({
      ...ambitoDe(negocio, sucursalId, terminalId),
      empleoId: cajeraId,
      rol: 'cajero' as const,
    });

    const { sesionCajaId } = exigirOk(
      await comando(abrirCaja, {
        entrada: { fondoInicialCentavos: 0 },
        ambito: comoDueno(sucursalId, cajaA),
        idempotencyKey: clave(),
      }),
      'abrir como dueño',
    );

    const estado = exigirOk(
      await comando(estadoDeCaja, {
        entrada: {},
        ambito: comoCajera(cajaB),
        idempotencyKey: clave(),
      }),
      'estado de la cajera',
    );
    expect(estado.enOtraTerminal?.puedoTraerla).toBe(false);

    const intento = await comando(traerCaja, {
      entrada: { sesionCajaId },
      ambito: comoCajera(cajaB),
      idempotencyKey: clave(),
    });
    expect(intento.ok).toBe(false);
    expect(await terminalDeLaSesion(sesionCajaId)).toBe(cajaA);

    // La caja que la cajera abre ella misma sí la sigue a su otro dispositivo.
    exigirOk(
      await comando(cerrarCaja, {
        entrada: { efectivoContadoCentavos: 0 },
        ambito: comoDueno(sucursalId, cajaA),
        idempotencyKey: clave(),
      }),
      'cortar la del dueño',
    );
    const suya = exigirOk(
      await comando(abrirCaja, {
        entrada: { fondoInicialCentavos: 0 },
        ambito: comoCajera(cajaA),
        idempotencyKey: clave(),
      }),
      'abrir como cajera',
    );
    exigirOk(
      await comando(traerCaja, {
        entrada: { sesionCajaId: suya.sesionCajaId },
        ambito: comoCajera(cajaB),
        idempotencyKey: clave(),
      }),
      'la cajera trae la suya',
    );
    expect(await terminalDeLaSesion(suya.sesionCajaId)).toBe(cajaB);
  });
});
