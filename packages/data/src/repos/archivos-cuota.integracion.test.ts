import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cerrarDb, obtenerDb } from '../cliente.ts';
import { construirReservaCuotaArchivo } from './archivos.ts';

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const MIB = 1024 * 1024;

beforeAll(async () => {
  await sql`
    create table if not exists cuotas_archivos (
      organizacion_id uuid primary key,
      bytes_usados bigint not null,
      updated_at timestamptz not null default now()
    )
  `.execute(obtenerDb());
});

beforeEach(async () => {
  await obtenerDb().deleteFrom('cuotas_archivos').execute();
});

afterAll(async () => {
  await sql`drop table if exists cuotas_archivos`.execute(obtenerDb());
  await cerrarDb();
});

describe('O-4 · cuota inicial contra Postgres', () => {
  it('rechaza una primera subida de 1 GiB cuando el límite es 500 MiB', async () => {
    const fila = await construirReservaCuotaArchivo(obtenerDb(), {
      organizacionId: ORGANIZACION,
      bytesNuevos: 1024 * MIB,
      limiteBytes: 500 * MIB,
      bytesObservados: 0,
    }).executeTakeFirst();

    expect(fila).toBeUndefined();

    const conteo = await obtenerDb()
      .selectFrom('cuotas_archivos')
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    expect(Number(conteo.total)).toBe(0);
  });
});
