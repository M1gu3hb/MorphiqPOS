import { randomUUID } from 'node:crypto';

import type { Rol } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { establecerPin } from './comandos.ts';

/**
 * PONERLE EL PIN A ALGUIEN ES PODER ENTRAR COMO ÉL · contra Postgres (cierre del 21-10).
 *
 * `identidad.establecer_pin` buscaba al empleado sin mirar su puesto: un administrador le
 * ponía un PIN al dueño, entraba por la pantalla de PIN como dueño y tenía todo lo del dueño.
 * `guardar_empleado` ya cerraba esa escalada con `PUEDE_OTORGAR`; ésta era la otra puerta.
 * Aquí se mira la credencial PERSISTIDA después de cada intento.
 */

const PIMIENTA = 'pimienta_de_integracion_del_pin_2026';
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ PIN_PEPPER: PIMIENTA }),
}));

let administrador: NegocioReal;
let dueno: { empleoId: string; identidadId: string };
let mesero: { empleoId: string; identidadId: string };

/** Una persona del negocio con su identidad y su empleo: lo que `establecer_pin` busca. */
async function sembrarPersona(organizacionId: string, nombre: string, rol: Rol) {
  const ids = { persona: randomUUID(), identidadId: randomUUID(), empleoId: randomUUID() };
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('personas')
      .values({ id: ids.persona, organizacion_id: organizacionId, nombre })
      .execute();
    await tx
      .insertInto('identidades')
      .values({ id: ids.identidadId, persona_id: ids.persona })
      .execute();
    await tx
      .insertInto('empleos')
      .values({ id: ids.empleoId, persona_id: ids.persona, organizacion_id: organizacionId, rol })
      .execute();
  });
  return { empleoId: ids.empleoId, identidadId: ids.identidadId };
}

async function hashDe(identidadId: string): Promise<string | undefined> {
  const fila = await obtenerDb()
    .selectFrom('credenciales_pin')
    .select('pin_hash')
    .where('identidad_id', '=', identidadId)
    .executeTakeFirst();
  return fila?.pin_hash;
}

function ponerPin(quien: NegocioReal, empleado: string, pin: string) {
  return comando(establecerPin, {
    entrada: { empleado, pin },
    ambito: ambitoDe(quien, null, null),
    idempotencyKey: clave(),
  });
}

beforeAll(async () => {
  administrador = await sembrarNegocio({ nombre: 'Negocio del PIN ajeno', rol: 'administrador' });
  dueno = await sembrarPersona(administrador.organizacionId, 'La dueña', 'dueno');
  mesero = await sembrarPersona(administrador.organizacionId, 'El mesero', 'mesero');
});

describe('identidad.establecer_pin · nadie se pone en los zapatos de quien está arriba', () => {
  it('el administrador NO le pone el PIN a la dueña, y su credencial no se crea', async () => {
    const salida = await ponerPin(administrador, dueno.empleoId, '24680');

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.datos?.['regla']).toBe('PUESTO_NO_OTORGABLE');
    expect(await hashDe(dueno.identidadId)).toBeUndefined();
  });

  it('el administrador SÍ le pone el PIN al mesero y se cambia el suyo', async () => {
    exigirOk(await ponerPin(administrador, mesero.empleoId, '13579'), 'PIN del mesero');
    expect(await hashDe(mesero.identidadId)).toBeDefined();

    exigirOk(await ponerPin(administrador, administrador.empleoId, '97531'), 'PIN propio');
    expect(await hashDe(administrador.identidadId)).toBeDefined();
  });

  it('la dueña SÍ le pone el PIN al administrador', async () => {
    const comoDueno: NegocioReal = { ...administrador, ...dueno, rol: 'dueno' };
    const antes = await hashDe(administrador.identidadId);

    exigirOk(await ponerPin(comoDueno, administrador.empleoId, '11223'), 'PIN del administrador');

    const despues = await hashDe(administrador.identidadId);
    expect(despues).toBeDefined();
    expect(despues).not.toBe(antes);
  });
});
