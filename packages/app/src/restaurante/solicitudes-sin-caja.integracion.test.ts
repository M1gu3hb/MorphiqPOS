import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import { ejecutarComandoPublico } from '../portal/comando-publico.ts';
import { crearSolicitudQR } from '../portal/solicitudes.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarCompanero,
  sembrarNegocio,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { consultar } from '../puente/consultar.ts';
import { rotarQr } from './qr.ts';
import { atenderSolicitud, limpiarSolicitudes } from './solicitudes.ts';

/**
 * DP-9.3 · LAS SOLICITUDES DEL COMENSAL SON DE LA SALA, NO DE LA CAJA, contra Postgres real.
 *
 * La vista «Solicitudes» la ven mesero, gerente y dueño. La caja no: ni la pantalla ni el
 * servidor. Esconder la vista no basta; la caja tampoco lee los avisos por el puente ni los
 * atiende o limpia por comando.
 */

const PIMIENTA = 'pimienta-de-la-prueba-solicitudes-sin-caja-0123';

let caso: Awaited<ReturnType<typeof sembrar>>;

async function sembrar() {
  const negocio = await sembrarNegocio({
    nombre: 'Fonda de la sala',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  const mesaId = randomUUID();
  await conTransaccion(async (tx) => {
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify({ portal_qr_activo: true, portal_qr_permitir_ayuda: true })}::jsonb)
      on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
    await tx
      .insertInto('mesas')
      .values({
        id: mesaId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursal.sucursalId,
        numero: 4,
        nombre: 'Mesa 4',
      })
      .execute();
  });
  const { qrToken } = exigirOk(
    await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
    'restaurante.rotar_qr',
  );
  exigirOk(
    await ejecutarComandoPublico(crearSolicitudQR, {
      token: qrToken,
      organizacionId: negocio.organizacionId,
      entrada: { tipo: 'ayuda' },
      idempotencyKey: clave(),
      pimienta: PIMIENTA,
    }),
    'portal.crear_solicitud',
  );
  const { id: solicitudId } = await obtenerDb()
    .selectFrom('solicitudes_qr')
    .select('id')
    .where('mesa_id', '=', mesaId)
    .executeTakeFirstOrThrow();
  const quien = async (rol: 'cajero' | 'mesero' | 'gerente') => ({
    ...ambito,
    rol,
    empleoId: await sembrarCompanero(negocio, { nombre: `Persona ${rol}`, rol }),
  });
  return { ambito, solicitudId, quien };
}

beforeAll(async () => {
  caso = await sembrar();
});

describe('la caja', () => {
  it('no lee las solicitudes por el puente', async () => {
    const cajera = await caso.quien('cajero');
    await expect(
      consultar(cajera, { entidad: 'SolicitudQR', operacion: 'list', limite: 50 }),
    ).rejects.toMatchObject({ codigo: 'PUENTE_SIN_PERMISO' });
  });

  it('no atiende una solicitud', async () => {
    const r = await comando(atenderSolicitud, {
      entrada: { solicitudId: caso.solicitudId, estado: 'atendida' },
      ambito: await caso.quien('cajero'),
      idempotencyKey: clave(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('SIN_PERMISO');
  });

  it('no limpia las solicitudes', async () => {
    const r = await comando(limpiarSolicitudes, {
      entrada: {},
      ambito: await caso.quien('cajero'),
      idempotencyKey: clave(),
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('la sala', () => {
  it('el mesero y la gerente leen la solicitud pendiente', async () => {
    for (const rol of ['mesero', 'gerente'] as const) {
      const filas = await consultar(await caso.quien(rol), {
        entidad: 'SolicitudQR',
        operacion: 'list',
        limite: 50,
      });
      expect(filas.map((f) => f['id'])).toContain(caso.solicitudId);
    }
  });

  it('el mesero la atiende', async () => {
    exigirOk(
      await comando(atenderSolicitud, {
        entrada: { solicitudId: caso.solicitudId, estado: 'atendida' },
        ambito: await caso.quien('mesero'),
        idempotencyKey: clave(),
      }),
      'restaurante.atender_solicitud',
    );
  });
});
