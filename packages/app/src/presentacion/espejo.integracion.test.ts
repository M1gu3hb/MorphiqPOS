import { randomUUID } from 'node:crypto';

import { DEMOS } from '@morphiqpos/contracts/negocios';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { resetearDemo } from '../demostracion/resetear.ts';
import { entrarConPin } from '../identidad/entrar.ts';
import { hashearPin } from '../identidad/pin.ts';
import { comando } from '../produccion.ts';
import { resolverSesion } from '../sesion/resolver.ts';
import {
  asegurarEspejo,
  cambiarModoDePresentacion,
  estadoDePresentacion,
  prepararHistorial,
} from './espejo.ts';
import { sesionDePresentacion } from './entrada.ts';

/**
 * EL MODO PRESENTACIÓN DEL RESTAURANTE, contra Postgres (cierre del 21-10).
 *
 * Lo que Miguel pidió, de punta a punta: preparar la presentación con SU distribución y SU
 * configuración, encenderla, que la mesera entre con su PIN de siempre y caiga en la
 * presentación, apagarla y que todo vuelva a SUS datos exactamente como estaban, y volver a
 * encenderla sin sembrar otra.
 */

const PIMIENTA = 'pimienta_de_integracion_del_modo_presentacion';
const SECRETO = 'secreto_de_sesion_de_la_prueba_del_modo_presentacion_0123';
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ PIN_PEPPER: PIMIENTA }),
}));

const DEMO = DEMOS.find((d) => d.slug === 'demo-acople-restaurante');
const PIN_DEL_GENERAL = '80808';
const PIN_DE_LUPITA = '4567';

let real = '';
let general = '';
let generalIdentidad = '';
let lupita = '';

/** Una huella de lo que la presentación NO puede tocar del restaurante real. */
async function huellaDelReal(): Promise<Record<string, string>> {
  const tablas = [
    'mesas',
    'productos',
    'ordenes',
    'pagos',
    'movimientos_stock',
    'sesiones_caja',
    'comandas',
    'gastos',
    'compras',
  ];
  const huella: Record<string, string> = {};
  for (const tabla of tablas) {
    const fila = await sql<{ md5: string | null }>`
      select md5(string_agg(t::text, '|' order by t::text)) as md5
      from ${sql.table(tabla)} t where organizacion_id = ${real}
    `.execute(obtenerDb());
    huella[tabla] = fila.rows[0]?.md5 ?? 'vacía';
  }
  const cfg = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', real)
    .executeTakeFirstOrThrow();
  // Las dos llaves que el modo presentación SÍ escribe en el real (su espejo y la concesión).
  const resto = Object.fromEntries(
    Object.entries(cfg.valores as Record<string, unknown>).filter(
      ([llave]) => llave !== 'presentacion_modo' && llave !== 'presentacion_destinos',
    ),
  );
  huella['configuracion'] = JSON.stringify(resto);
  return huella;
}

async function entrarEnElReal(empleoId: string, pin: string) {
  const acceso = await entrarConPin({
    empleoId,
    pin,
    deviceToken: '',
    organizacionId: real,
    pimienta: PIMIENTA,
    secretoSesion: SECRETO,
  });
  if (!acceso.ok) throw new Error(`No entró: ${acceso.motivo}`);
  const enPresentacion = await sesionDePresentacion({
    organizacionId: real,
    empleoId,
    tokenReal: acceso.token,
    deviceToken: acceso.deviceToken ?? '',
    pimienta: PIMIENTA,
    secreto: SECRETO,
  });
  return { real: acceso.token, sesion: enPresentacion?.token ?? acceso.token, enPresentacion };
}

let huellaInicial: Record<string, string> = {};

beforeAll(async () => {
  if (DEMO === undefined) throw new Error('La demo del restaurante no está en DEMOS.');
  real = DEMO.id;
  const db = obtenerDb();
  const existe = await db
    .selectFrom('organizaciones')
    .select('id')
    .where('id', '=', real)
    .executeTakeFirst();
  if (existe === undefined)
    await db
      .insertInto('organizaciones')
      .values({
        id: real,
        nombre: DEMO.nombre,
        slug: DEMO.slug,
        giro: 'restaurante',
        paquete: 'restaurante',
      })
      .execute();
  const sucursal =
    (
      await db
        .selectFrom('sucursales')
        .select('id')
        .where('organizacion_id', '=', real)
        .executeTakeFirst()
    )?.id ??
    (
      await db
        .insertInto('sucursales')
        .values({ organizacion_id: real, nombre: 'Centro' })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  // El dueño general, con su PIN, como en producción.
  const ids = { persona: randomUUID(), identidad: randomUUID(), empleo: randomUUID() };
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('personas')
      .values({ id: ids.persona, organizacion_id: real, nombre: 'Miguel' })
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
        organizacion_id: real,
        sucursal_id: sucursal,
        rol: 'dueno',
      })
      .execute();
    await tx
      .insertInto('credenciales_pin')
      .values({
        identidad_id: ids.identidad,
        pin_hash: await hashearPin(PIN_DEL_GENERAL, PIMIENTA),
      })
      .execute();
    await sql`
      insert into configuracion (organizacion_id, valores, version)
      values (${real}, ${JSON.stringify({
        presentacion_dueno_empleo: ids.empleo,
        presentacion_destinos: [{ empleoId: ids.empleo, organizacionId: real }],
      })}::jsonb, 1)
      on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
  });
  general = ids.empleo;
  generalIdentidad = ids.identidad;

  // El restaurante sembrado como la demo, y después cambiado por Miguel: su estilo y una mesa
  // movida, que la presentación tiene que respetar.
  const siembra = await comando(resetearDemo, {
    entrada: { confirmacion: 'RESETEAR' },
    ambito: {
      organizacionId: real,
      sucursalId: sucursal,
      terminalId: null,
      identidadId: generalIdentidad,
      empleoId: general,
      rol: 'dueno',
    },
    idempotencyKey: randomUUID(),
  });
  if (!siembra.ok) throw new Error(siembra.error.mensaje);
  await conTransaccion(async (tx) => {
    await tx
      .updateTable('mesas')
      .set({ posicion_x: 489, posicion_y: 95, nombre: 'Ventana' })
      .where('organizacion_id', '=', real)
      .where('numero', '=', 3)
      .execute();
    await sql`update configuracion set valores = valores || ${JSON.stringify({
      apariencia: { estilo: 'morphiq', densidad: 'normal' },
    })}::jsonb where organizacion_id = ${real}`.execute(tx);
  });
  const mesera = await db
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .select('empleos.id')
    .where('empleos.organizacion_id', '=', real)
    .where('personas.nombre', '=', 'Lupita')
    .where('empleos.activo', '=', true)
    .executeTakeFirstOrThrow();
  lupita = mesera.id;
  huellaInicial = await huellaDelReal();
}, 120_000);

describe('el modo presentación del restaurante', () => {
  let espejo = '';

  it('se prepara con la distribución, el estilo y la carta del restaurante real', async () => {
    const preparado = await asegurarEspejo(real, general);
    espejo = preparado.espejoId;
    expect(preparado.creado).toBe(true);
    const db = obtenerDb();
    const cfg = await db
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', espejo)
      .executeTakeFirstOrThrow();
    const valores = cfg.valores as Record<string, unknown>;
    expect(valores['presentacion_espejo_de']).toBe(real);
    expect(valores['presentacion_preparado']).toBe(true);
    expect(valores['apariencia']).toMatchObject({ estilo: 'morphiq' });
    const mesa3 = await db
      .selectFrom('mesas')
      .select(['posicion_x', 'posicion_y', 'nombre', 'qr_token'])
      .where('organizacion_id', '=', espejo)
      .where('numero', '=', 3)
      .executeTakeFirstOrThrow();
    expect(mesa3).toMatchObject({ posicion_x: 489, posicion_y: 95, nombre: 'Ventana' });
    const tokenReal = await db
      .selectFrom('mesas')
      .select('qr_token')
      .where('organizacion_id', '=', real)
      .where('numero', '=', 3)
      .executeTakeFirstOrThrow();
    expect(mesa3.qr_token).not.toBe(tokenReal.qr_token);
    const productos = async (org: string) =>
      (
        await db
          .selectFrom('productos')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('organizacion_id', '=', org)
          .executeTakeFirstOrThrow()
      ).n;
    expect(await productos(espejo)).toBe(await productos(real));
  }, 120_000);

  it('el historial se siembra por tramos en la presentación, no en el real', async () => {
    const primero = await prepararHistorial(real, 4);
    expect(primero).toEqual({ sembrados: 4, pendientes: 26 });
    const otraVez = await prepararHistorial(real, 4);
    expect(otraVez).toEqual({ sembrados: 8, pendientes: 22 });
    const ventas = await sql<{ n: string }>`
      select count(*)::text as n from ordenes where organizacion_id = ${espejo} and estado = 'pagada'
    `.execute(obtenerDb());
    expect(Number(ventas.rows[0]?.n)).toBeGreaterThan(0);
    expect((await estadoDePresentacion(real)).historial).toHaveLength(8);
  }, 300_000);

  it('preparar otra vez no crea otro contexto', async () => {
    const otra = await asegurarEspejo(real, general);
    expect(otra).toEqual({ espejoId: espejo, creado: false });
    const espejos = await sql<{ n: string }>`
      select count(*)::text as n from configuracion
      where valores->>'presentacion_espejo_de' = ${real}
    `.execute(obtenerDb());
    expect(espejos.rows[0]?.n).toBe('1');
  });

  it('encendida, la mesera entra con su PIN de siempre y cae en la presentación', async () => {
    const antes = await entrarEnElReal(lupita, PIN_DE_LUPITA);
    expect(antes.enPresentacion).toBeNull();

    await cambiarModoDePresentacion(real, true);
    expect((await estadoDePresentacion(real)).modo.activo).toBe(true);

    // Su sesión del real, de antes de encender, ya no vale: vuelve a entrar.
    const vieja = await resolverSesion({ token: antes.sesion, secreto: SECRETO });
    expect(vieja).toEqual({ ok: false, motivo: 'presentacion' });

    const ahora = await entrarEnElReal(lupita, PIN_DE_LUPITA);
    const sesion = await resolverSesion({ token: ahora.sesion, secreto: SECRETO });
    expect(sesion.ok).toBe(true);
    if (!sesion.ok) return;
    expect(sesion.sesion.organizacionId).toBe(espejo);
    expect(sesion.sesion.rol).toBe('mesero');
    expect(sesion.sesion.nombrePersona).toBe('Lupita');
    expect(sesion.sesion.enPresentacion).toBe(true);
    // Y la sesión del real que el PIN abrió por debajo quedó cerrada.
    expect(await resolverSesion({ token: ahora.real, secreto: SECRETO })).toEqual({
      ok: false,
      motivo: 'revocada',
    });
  });

  it('el dueño general entra delegado: su sesión real sigue siendo la raíz', async () => {
    const miguel = await entrarEnElReal(general, PIN_DEL_GENERAL);
    const sesion = await resolverSesion({ token: miguel.sesion, secreto: SECRETO });
    expect(sesion.ok && sesion.sesion.organizacionId).toBe(espejo);
    expect(sesion.ok && sesion.sesion.presentador?.empleoId).toBe(general);
    const raiz = await resolverSesion({ token: miguel.real, secreto: SECRETO });
    expect(raiz.ok && raiz.sesion.organizacionId).toBe(real);
  });

  it('apagada, la sesión de la presentación deja de valer y se entra al real', async () => {
    const enPresentacion = await entrarEnElReal(lupita, PIN_DE_LUPITA);
    await cambiarModoDePresentacion(real, false);
    expect(await resolverSesion({ token: enPresentacion.sesion, secreto: SECRETO })).toEqual({
      ok: false,
      motivo: 'presentacion',
    });
    const despues = await entrarEnElReal(lupita, PIN_DE_LUPITA);
    expect(despues.enPresentacion).toBeNull();
    const sesion = await resolverSesion({ token: despues.sesion, secreto: SECRETO });
    expect(sesion.ok && sesion.sesion.organizacionId).toBe(real);
  });

  it('volver a encender usa la misma presentación', async () => {
    await asegurarEspejo(real, general);
    await cambiarModoDePresentacion(real, true);
    const otraVez = await entrarEnElReal(lupita, PIN_DE_LUPITA);
    expect(otraVez.enPresentacion?.organizacionId).toBe(espejo);
    await cambiarModoDePresentacion(real, false);
  });

  it('los datos del restaurante real quedan exactamente como estaban', async () => {
    expect(await huellaDelReal()).toEqual(huellaInicial);
  });
});

describe('la presentación que prepara otro dueño y enciende el dueño general', () => {
  it('el general entra delegado aunque no la haya preparado él', async () => {
    // Un restaurante aparte, con dos dueños: «Demo», que prepara, y el general con su PIN.
    const org = randomUUID();
    const sucursal = randomUUID();
    const demo = { persona: randomUUID(), identidad: randomUUID(), empleo: randomUUID() };
    const gral = { persona: randomUUID(), identidad: randomUUID(), empleo: randomUUID() };
    await conTransaccion(async (tx) => {
      await tx
        .insertInto('organizaciones')
        .values({
          id: org,
          nombre: 'Restaurante de la prueba',
          slug: `prueba-presentacion-${org.slice(0, 8)}`,
          giro: 'restaurante',
          paquete: 'restaurante',
        })
        .execute();
      await tx
        .insertInto('sucursales')
        .values({ id: sucursal, organizacion_id: org, nombre: 'Centro' })
        .execute();
      for (const [ids, nombre] of [
        [demo, 'Demo'],
        [gral, 'Miguel'],
      ] as const) {
        await tx
          .insertInto('personas')
          .values({ id: ids.persona, organizacion_id: org, nombre })
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
            organizacion_id: org,
            sucursal_id: sucursal,
            rol: 'dueno',
          })
          .execute();
      }
      await tx
        .insertInto('credenciales_pin')
        .values({ identidad_id: gral.identidad, pin_hash: await hashearPin('70707', PIMIENTA) })
        .execute();
      await sql`
        insert into configuracion (organizacion_id, valores, version)
        values (${org}, ${JSON.stringify({
          presentacion_dueno_empleo: gral.empleo,
          presentacion_destinos: [{ empleoId: gral.empleo, organizacionId: org }],
        })}::jsonb, 1)
      `.execute(tx);
    });

    const { espejoId } = await asegurarEspejo(org, demo.empleo);
    await cambiarModoDePresentacion(org, true);
    const acceso = await entrarConPin({
      empleoId: gral.empleo,
      pin: '70707',
      deviceToken: '',
      organizacionId: org,
      pimienta: PIMIENTA,
      secretoSesion: SECRETO,
    });
    if (!acceso.ok) throw new Error(acceso.motivo);
    const enEspejo = await sesionDePresentacion({
      organizacionId: org,
      empleoId: gral.empleo,
      tokenReal: acceso.token,
      deviceToken: acceso.deviceToken ?? '',
      pimienta: PIMIENTA,
      secreto: SECRETO,
    });
    const sesion = await resolverSesion({ token: enEspejo?.token, secreto: SECRETO });
    expect(sesion.ok && sesion.sesion.organizacionId).toBe(espejoId);
    expect(sesion.ok && sesion.sesion.presentador?.empleoId).toBe(gral.empleo);
    await cambiarModoDePresentacion(org, false);
  }, 120_000);
});
