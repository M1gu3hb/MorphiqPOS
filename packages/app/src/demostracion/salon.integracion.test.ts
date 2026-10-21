import { randomUUID } from 'node:crypto';

import { DEMOS } from '@morphiqpos/contracts/negocios';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { comando } from '../produccion.ts';
import { ambitoDe, clave, exigirOk, type NegocioReal } from '../pruebas/negocio-real.ts';
import { resetearDemo } from './resetear.ts';

/**
 * EL SALÓN DE LA DEMO ABRE HOY, EN EL RELOJ DEL NEGOCIO · contra Postgres (cierre del 21-10).
 *
 * La siembra fechaba el horario de las estilistas con `current_date` y la regla de comisión
 * con `toISOString()`: el día en UTC. De las 18:00 a la medianoche de México eso ya es
 * mañana, y la demo reseteada a esa hora salía cerrada el resto del día —sin columnas ni
 * huecos— y lo cobrado no comisionaba. La galería lo vio al correr a las 18:23.
 *
 * Para que la prueba muerda a cualquier hora, el negocio se pone en una zona donde HOY es
 * otro día que en UTC: doce horas atrás si en UTC es antes del mediodía, catorce adelante si
 * no. Vista en ROJO con `current_date`.
 */

// El reseteo repone los PIN del equipo, y para eso lee la pimienta del entorno.
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ PIN_PEPPER: 'pimienta_de_integracion_del_salon_2026' }),
}));

const DEMO = DEMOS.find((d) => d.slug === 'demo-acople-estetica');

let quienResetea: NegocioReal;
let sucursalId = '';
let zonaOriginal = 'America/Mexico_City';

beforeAll(async () => {
  if (DEMO === undefined) throw new Error('La demo de la estética no está en DEMOS.');
  const db = obtenerDb();
  const existe = await db
    .selectFrom('organizaciones')
    .select('zona_horaria')
    .where('id', '=', DEMO.id)
    .executeTakeFirst();
  if (existe === undefined)
    await db
      .insertInto('organizaciones')
      .values({
        id: DEMO.id,
        nombre: DEMO.nombre,
        slug: DEMO.slug,
        giro: 'estetica',
        paquete: 'estetica',
      })
      .execute();
  else zonaOriginal = existe.zona_horaria;

  const sucursal = await db
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', DEMO.id)
    .executeTakeFirst();
  sucursalId =
    sucursal?.id ??
    (
      await db
        .insertInto('sucursales')
        .values({ organizacion_id: DEMO.id, nombre: 'Centro' })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  const ids = { persona: randomUUID(), identidad: randomUUID(), empleo: randomUUID() };
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('personas')
      .values({ id: ids.persona, organizacion_id: DEMO.id, nombre: 'Quien resetea el salón' })
      .execute();
    await tx
      .insertInto('identidades')
      .values({ id: ids.identidad, persona_id: ids.persona })
      .execute();
    await tx
      .insertInto('empleos')
      .values({ id: ids.empleo, persona_id: ids.persona, organizacion_id: DEMO.id, rol: 'dueno' })
      .execute();
  });
  quienResetea = {
    organizacionId: DEMO.id,
    identidadId: ids.identidad,
    empleoId: ids.empleo,
    rol: 'dueno',
  };
});

afterAll(async () => {
  if (DEMO === undefined) return;
  await obtenerDb()
    .updateTable('organizaciones')
    .set({ zona_horaria: zonaOriginal })
    .where('id', '=', DEMO.id)
    .execute();
});

describe('la demo del salón · el horario y la comisión rigen desde HOY del negocio', () => {
  it('reseteada cuando en UTC ya es otro día, abre hoy y comisiona hoy', async () => {
    if (DEMO === undefined) throw new Error('La demo de la estética no está en DEMOS.');
    const db = obtenerDb();
    const { rows } = await sql<{ hora: number }>`
      select extract(hour from now() at time zone 'UTC')::int as hora
    `.execute(db);
    const zona = (rows[0]?.hora ?? 0) < 12 ? 'Etc/GMT+12' : 'Etc/GMT-14';
    await db
      .updateTable('organizaciones')
      .set({ zona_horaria: zona })
      .where('id', '=', DEMO.id)
      .execute();

    exigirOk(
      await comando(resetearDemo, {
        entrada: { confirmacion: 'RESETEAR' },
        ambito: ambitoDe(quienResetea, sucursalId, null),
        idempotencyKey: clave(),
      }),
      'El reseteo de la demo del salón',
    );

    const dias = await sql<{ negocio: string; utc: string }>`
      select to_char((now() at time zone ${zona})::date, 'YYYY-MM-DD') as negocio,
             to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD') as utc
    `.execute(db);
    const { negocio, utc } = dias.rows[0] ?? { negocio: '', utc: '' };
    // Si fueran el mismo día la prueba no distinguiría nada.
    expect(negocio).not.toBe(utc);

    const horarios = await sql<{ desde: string }>`
      select distinct to_char(h.vigente_desde, 'YYYY-MM-DD') as desde
        from horarios_profesional h
       where h.organizacion_id = ${DEMO.id}
    `.execute(db);
    expect(horarios.rows.map((h) => h.desde)).toEqual([negocio]);

    const reglas = await sql<{ desde: string }>`
      select to_char(r.vigente_desde, 'YYYY-MM-DD') as desde
        from reglas_comision r
       where r.organizacion_id = ${DEMO.id}
    `.execute(db);
    expect(reglas.rows.map((r) => r.desde)).toEqual([negocio]);
  });
});
