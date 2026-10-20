import { randomUUID } from 'node:crypto';

import { DEMOS } from '@morphiqpos/contracts/negocios';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { hashearPin, verificarPin } from '../identidad/pin.ts';
import { comando } from '../produccion.ts';
import { ambitoDe, clave, exigirOk, type NegocioReal } from '../pruebas/negocio-real.ts';
import { resetearDemo } from './resetear.ts';

/**
 * EL RESETEO DE LA DEMO NO TOCA AL DUEÑO GENERAL (D-42, 20-10-2026) · contra Postgres.
 *
 * La cuenta con la que Miguel recorre los modelos vive en la demo del restaurante. El
 * reseteo reescribía la configuración —donde vive su concesión— y reponía el PIN publicado
 * de la demo a todos los dueños: tras un reseteo, la cuenta general entraba con el PIN que
 * todos conocen y ya no abría los demás modelos. Aquí corre el comando REAL sobre la demo
 * del restaurante (se crea si la base no la tiene, como la de CI) y se mira la base.
 *
 * Vista en ROJO sin el arreglo, de las dos maneras: sin conservar la concesión
 * (`configuracionRepuesta`) y reponiéndole el PIN al general (`reponerDueno`).
 */

const PIMIENTA = 'pimienta_de_integracion_del_dueno_general_2026';
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ PIN_PEPPER: PIMIENTA }),
}));

const DEMO = DEMOS.find((d) => d.slug === 'demo-acople-restaurante');
const PIN_DEL_GENERAL = '90909';

let quienResetea: NegocioReal;
let sucursalId = '';
let general = '';
let identidadDelGeneral = '';
const destinos = [{ empleoId: randomUUID(), organizacionId: randomUUID() }];

/** Una persona con su identidad y su empleo de dueño, con PIN si se le da. */
async function sembrarDueno(organizacionId: string, nombre: string, pin?: string) {
  const ids = { persona: randomUUID(), identidad: randomUUID(), empleo: randomUUID() };
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('personas')
      .values({ id: ids.persona, organizacion_id: organizacionId, nombre })
      .execute();
    await tx
      .insertInto('identidades')
      .values({ id: ids.identidad, persona_id: ids.persona })
      .execute();
    await tx
      .insertInto('empleos')
      .values({
        id: ids.empleo,
        persona_id: ids.persona,
        organizacion_id: organizacionId,
        rol: 'dueno',
      })
      .execute();
    if (pin !== undefined)
      await tx
        .insertInto('credenciales_pin')
        .values({ identidad_id: ids.identidad, pin_hash: await hashearPin(pin, PIMIENTA) })
        .execute();
  });
  return ids;
}

async function hashDe(identidadId: string): Promise<string | undefined> {
  const fila = await obtenerDb()
    .selectFrom('credenciales_pin')
    .select('pin_hash')
    .where('identidad_id', '=', identidadId)
    .executeTakeFirst();
  return fila?.pin_hash;
}

beforeAll(async () => {
  if (DEMO === undefined) throw new Error('La demo del restaurante no está en DEMOS.');
  const db = obtenerDb();
  const existe = await db
    .selectFrom('organizaciones')
    .select('id')
    .where('id', '=', DEMO.id)
    .executeTakeFirst();
  if (existe === undefined)
    await db
      .insertInto('organizaciones')
      .values({
        id: DEMO.id,
        nombre: DEMO.nombre,
        slug: DEMO.slug,
        giro: 'restaurante',
        paquete: 'restaurante',
      })
      .execute();
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

  const resetea = await sembrarDueno(DEMO.id, 'Quien resetea');
  quienResetea = {
    organizacionId: DEMO.id,
    identidadId: resetea.identidad,
    empleoId: resetea.empleo,
    rol: 'dueno',
  };
  const miguel = await sembrarDueno(DEMO.id, 'Miguel general', PIN_DEL_GENERAL);
  general = miguel.empleo;
  identidadDelGeneral = miguel.identidad;

  const concesion = JSON.stringify({
    presentacion_dueno_empleo: general,
    presentacion_destinos: destinos,
    apariencia: { estilo: 'bloque' },
  });
  const cfg = await db
    .selectFrom('configuracion')
    .select('id')
    .where('organizacion_id', '=', DEMO.id)
    .executeTakeFirst();
  if (cfg === undefined)
    await db
      .insertInto('configuracion')
      .values({ organizacion_id: DEMO.id, valores: concesion, version: 1 })
      .execute();
  else
    await db
      .updateTable('configuracion')
      .set({ valores: concesion })
      .where('id', '=', cfg.id)
      .execute();
});

describe('configuracion.resetear_demo · el dueño general', () => {
  it('conserva su concesión, su PIN y su empleo; a los demás dueños sí se les repone', async () => {
    const antes = await hashDe(identidadDelGeneral);
    expect(antes).toBeDefined();

    exigirOk(
      await comando(resetearDemo, {
        entrada: { confirmacion: 'RESETEAR' },
        ambito: ambitoDe(quienResetea, sucursalId, null),
        idempotencyKey: clave(),
      }),
      'El reseteo de la demo',
    );

    const db = obtenerDb();
    const cfg = await db
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', quienResetea.organizacionId)
      .executeTakeFirstOrThrow();
    expect(cfg.valores).toMatchObject({
      presentacion_dueno_empleo: general,
      presentacion_destinos: destinos,
    });
    // Lo demás sí se repuso: el estilo de prueba se fue.
    expect(cfg.valores).not.toMatchObject({ apariencia: { estilo: 'bloque' } });

    expect(await hashDe(identidadDelGeneral)).toBe(antes);
    const despues = await hashDe(identidadDelGeneral);
    expect(despues !== undefined && (await verificarPin(PIN_DEL_GENERAL, despues, PIMIENTA))).toBe(
      true,
    );
    const empleo = await db
      .selectFrom('empleos')
      .select('activo')
      .where('id', '=', general)
      .executeTakeFirstOrThrow();
    expect(empleo.activo).toBe(true);

    // Y la prueba no es vacía: al dueño que no es el general se le repuso el PIN publicado.
    expect(await hashDe(quienResetea.identidadId)).toBeDefined();
  });
});
