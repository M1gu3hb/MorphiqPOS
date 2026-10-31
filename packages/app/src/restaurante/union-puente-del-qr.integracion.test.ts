import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { ejecutarComandoPublico } from '../portal/comando-publico.ts';
import { payloadDelPortal } from '../portal/consulta.ts';
import { abrirMesaDesdeQR } from '../portal/mesa.ts';
import { enviarPedidoDesdeQR } from '../portal/pedido.ts';
import { crearSolicitudQR } from '../portal/solicitudes.ts';
import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { abrirMesa } from './mesas.ts';
import { enviarPedido } from './pedido.ts';
import { rotarQr } from './qr.ts';
import { separarMesasComando, unirMesasComando } from './union-de-mesas.ts';

/**
 * DP-10.3 · EL PUENTE DE LAS MESAS UNIDAS HASTA LA MUDANZA (contra Postgres real).
 *
 * En `main` la unión es la vieja (F-302): la 5 se une a la 4, su cuenta se absorbe y la 5 se
 * queda sin cuenta propia. Pero su QR seguía siendo de la 5: el comensal veía «Mesa 5», y pedir
 * o llamar desde ahí caía en una mesa sin cuenta. Ahora el QR de una mesa que es miembro de una
 * unión ABIERTA usa la principal: «Esta mesa está unida a la mesa 4», y lo que se pide o se
 * pide al mesero cae en la 4. Nunca se abre una cuenta aparte en la 5.
 *
 * Y D-3: lo que cocina tiene en marcha para la 5 pasa a la cuenta del grupo al unir, así que
 * «Marcar entregado» en la 4 lo alcanza.
 */

const PIMIENTA = 'pimienta-de-la-prueba-del-puente-de-uniones-01';

async function salonConQr() {
  const negocio = await sembrarNegocio({
    nombre: 'Barbacoa del puente',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  const { productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Taco de barbacoa',
    precioCentavos: 3_500n,
    existencia: '100',
  });
  const mesas = { cuatro: randomUUID(), cinco: randomUUID() };
  await conTransaccion(async (tx) => {
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: true, area_preparacion: 'cocina' })
      .where('organizacion_id', '=', negocio.organizacionId)
      .execute();
    await tx
      .insertInto('estaciones_preparacion')
      .values({ organizacion_id: negocio.organizacionId, nombre: 'Cocina', es_general: true })
      .execute();
    const banderas = {
      portal_qr_activo: true,
      portal_qr_permitir_pedidos_cliente: true,
      portal_qr_permitir_ayuda: true,
      asignacion_mesas_activa: false,
    };
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify(banderas)}::jsonb)
      on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
    await tx
      .insertInto('mesas')
      .values([
        {
          id: mesas.cuatro,
          organizacion_id: negocio.organizacionId,
          sucursal_id: sucursal.sucursalId,
          numero: 4,
        },
        {
          id: mesas.cinco,
          organizacion_id: negocio.organizacionId,
          sucursal_id: sucursal.sucursalId,
          numero: 5,
        },
      ])
      .execute();
  });
  const qr = async (mesaId: string) =>
    exigirOk(
      await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
      'restaurante.rotar_qr',
    ).qrToken;
  const sentarYPedir = async (mesaId: string) => {
    const { ordenId } = exigirOk(
      await comando(abrirMesa, {
        entrada: { mesaId, personas: 2 },
        ambito,
        idempotencyKey: clave(),
      }),
      'restaurante.abrir_mesa',
    );
    exigirOk(
      await comando(enviarPedido, {
        entrada: { ordenId, lineas: [{ productoId, cantidad: '1' }] },
        ambito,
        idempotencyKey: clave(),
      }),
      'restaurante.enviar_pedido',
    );
    return ordenId;
  };
  return {
    negocio,
    ambito,
    productoId,
    mesas,
    tokenDeLaCinco: await qr(mesas.cinco),
    sentarYPedir,
  };
}

type Salon = Awaited<ReturnType<typeof salonConQr>>;

function delComensal(salon: Salon, entrada: unknown) {
  return {
    token: salon.tokenDeLaCinco,
    organizacionId: salon.negocio.organizacionId,
    entrada,
    idempotencyKey: clave(),
    pimienta: PIMIENTA,
  };
}

/** Las cuentas vivas que cuelgan de la mesa. */
async function cuentasDe(mesaId: string): Promise<readonly string[]> {
  const filas = await obtenerDb()
    .selectFrom('ordenes')
    .select('id')
    .where('mesa_id', '=', mesaId)
    .where('estado', 'not in', ['absorbida', 'cancelada', 'pagada', 'cerrada'])
    .execute();
  return filas.map((f) => f.id);
}

async function unirLaCincoALaCuatro(salon: Salon) {
  return exigirOk(
    await comando(unirMesasComando, {
      entrada: { mesaPrincipalId: salon.mesas.cuatro, mesaIds: [salon.mesas.cinco] },
      ambito: salon.ambito,
      idempotencyKey: clave(),
    }),
    'restaurante.unir_mesas',
  );
}

describe('el QR de una mesa unida usa la cuenta de la principal', () => {
  it('escanear la 5 unida a la 4 dice «Mesa 4» y que está unida; pedir y llamar caen en la 4', async () => {
    const salon = await salonConQr();
    const ordenDeLaCuatro = await salon.sentarYPedir(salon.mesas.cuatro);
    await unirLaCincoALaCuatro(salon);

    const portal = await payloadDelPortal(
      salon.negocio.organizacionId,
      salon.tokenDeLaCinco,
      PIMIENTA,
    );
    expect(portal.mesa).toMatchObject({
      id: salon.mesas.cuatro,
      numero: 4,
      unida_a_la_mesa: 4,
      venta_activa_id: ordenDeLaCuatro,
    });

    // Abrir desde la 5 no abre nada: ya hay cuenta, la de la 4.
    await ejecutarComandoPublico(abrirMesaDesdeQR, delComensal(salon, { personas: 2 }));
    exigirOk(
      await ejecutarComandoPublico(
        enviarPedidoDesdeQR,
        delComensal(salon, { items: [{ productoId: salon.productoId, cantidad: '2' }] }),
      ),
      'portal.enviar_pedido desde la 5',
    );
    exigirOk(
      await ejecutarComandoPublico(crearSolicitudQR, delComensal(salon, { tipo: 'ayuda' })),
      'portal.crear_solicitud desde la 5',
    );

    const lineas = await obtenerDb()
      .selectFrom('orden_lineas')
      .select('cantidad')
      .where('orden_id', '=', ordenDeLaCuatro)
      .execute();
    expect(lineas.map((l) => Number(l.cantidad))).toContain(2);
    expect(await cuentasDe(salon.mesas.cinco), 'La 5 abrió una cuenta propia.').toEqual([]);
    const solicitud = await obtenerDb()
      .selectFrom('solicitudes_qr')
      .select('mesa_id')
      .where('organizacion_id', '=', salon.negocio.organizacionId)
      .executeTakeFirstOrThrow();
    expect(solicitud.mesa_id).toBe(salon.mesas.cuatro);
  });

  it('separadas, el QR de la 5 vuelve a ser de la 5', async () => {
    const salon = await salonConQr();
    await salon.sentarYPedir(salon.mesas.cuatro);
    const { unionId } = await unirLaCincoALaCuatro(salon);
    exigirOk(
      await comando(separarMesasComando, {
        entrada: { unionId },
        ambito: salon.ambito,
        idempotencyKey: clave(),
      }),
      'restaurante.separar_mesas',
    );
    const portal = await payloadDelPortal(
      salon.negocio.organizacionId,
      salon.tokenDeLaCinco,
      PIMIENTA,
    );
    expect(portal.mesa).toMatchObject({ id: salon.mesas.cinco, numero: 5, unida_a_la_mesa: null });
  });

  it('el QR apagado de la 5 no sirve aunque la 4 tenga el suyo encendido', async () => {
    const salon = await salonConQr();
    await salon.sentarYPedir(salon.mesas.cuatro);
    await unirLaCincoALaCuatro(salon);
    await obtenerDb()
      .updateTable('mesas')
      .set({ qr_activa: false })
      .where('id', '=', salon.mesas.cinco)
      .execute();
    await expect(
      payloadDelPortal(salon.negocio.organizacionId, salon.tokenDeLaCinco, PIMIENTA),
    ).rejects.toMatchObject({ codigo: 'QR_TOKEN_INVALIDO' });
  });

  it('sin unión, el QR de la 5 es de la 5', async () => {
    const salon = await salonConQr();
    const portal = await payloadDelPortal(
      salon.negocio.organizacionId,
      salon.tokenDeLaCinco,
      PIMIENTA,
    );
    expect(portal.mesa).toMatchObject({ numero: 5, unida_a_la_mesa: null });
  });
});

describe('D-3 · lo que cocina tiene de la unida pasa a la cuenta del grupo', () => {
  it('al unir, las comandas de la 5 cuelgan de la cuenta de la 4', async () => {
    const salon = await salonConQr();
    const ordenDeLaCuatro = await salon.sentarYPedir(salon.mesas.cuatro);
    const ordenDeLaCinco = await salon.sentarYPedir(salon.mesas.cinco);
    await unirLaCincoALaCuatro(salon);
    const deLaCinco = await obtenerDb()
      .selectFrom('comandas')
      .select('orden_id')
      .where('mesa_id', '=', salon.mesas.cinco)
      .execute();
    expect(deLaCinco.length).toBeGreaterThan(0);
    expect(deLaCinco.every((c) => c.orden_id === ordenDeLaCuatro)).toBe(true);
    expect(ordenDeLaCinco).not.toBe(ordenDeLaCuatro);
  });
});
