import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { guardarConfiguracionParcial } from '../puente/configuracion.ts';
import { rotarQr } from '../restaurante/qr.ts';
import { payloadDelPortal } from './consulta.ts';

/**
 * DP-9.7 · LOS BOTONES DEL MENÚ QR Y EL ASPECTO DEL PORTAL, contra Postgres real.
 *
 * Se guardan por el camino de siempre (la configuración, validada), y el portal publica sobre
 * cada página sólo lo que se vende: un botón de un platillo escondido del menú digital no sale.
 * Sin poder pedir, la página es sólo imagen. El aspecto viaja con el menú.
 */

const PIMIENTA = 'pimienta-de-la-prueba-de-los-botones-0123456789';

let negocio: NegocioReal;
let token = '';
let pagina = '';
let taco = '';
let oculto = '';

async function guardar(parche: Record<string, unknown>) {
  await conTransaccion((tx) => guardarConfiguracionParcial(tx, negocio.organizacionId, parche));
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Fonda de la carta',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  taco = (
    await sembrarProducto(negocio, sucursal.almacenId, {
      nombre: 'Taco',
      precioCentavos: 3_500n,
      existencia: '50',
    })
  ).productoId;
  oculto = (
    await sembrarProducto(negocio, sucursal.almacenId, {
      nombre: 'Secreto',
      precioCentavos: 9_900n,
      existencia: '50',
    })
  ).productoId;
  const mesaId = randomUUID();
  pagina = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: true, area_preparacion: 'cocina' })
      .where('id', '=', taco)
      .execute();
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: false })
      .where('id', '=', oculto)
      .execute();
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify({
        portal_qr_activo: true,
        portal_qr_modo_menu: 'menu_subido',
        portal_qr_permitir_pedidos_cliente: true,
      })}::jsonb)
      on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
    await tx
      .insertInto('menu_qr_secciones')
      .values({
        id: pagina,
        organizacion_id: negocio.organizacionId,
        nombre: 'La carta',
        imagen_url: 'https://ejemplo.test/carta.webp',
        orden: 1,
        activa: true,
      })
      .execute();
    await tx
      .insertInto('mesas')
      .values({
        id: mesaId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursal.sucursalId,
        numero: 3,
      })
      .execute();
  });
  token = exigirOk(
    await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
    'restaurante.rotar_qr',
  ).qrToken;
});

const boton = (id: string, productoId: string) => ({
  id,
  tipo: 'platillo',
  x: 10,
  y: 20,
  ancho: 80,
  alto: 3,
  productoId,
  mostrarPrecio: true,
});

describe('los botones de la carta', () => {
  it('se guardan validados y el portal publica sólo los de lo que se vende', async () => {
    await guardar({ portal_qr_botones: { [pagina]: [boton('t', taco), boton('s', oculto)] } });
    const payload = await payloadDelPortal(negocio.organizacionId, token, PIMIENTA);
    const [seccion] = payload.secciones;
    expect(seccion?.botones.map((b) => [b.id, b.productoIds])).toEqual([['t', [taco]]]);
  });

  it('un botón sin forma no se guarda', async () => {
    await expect(
      guardar({ portal_qr_botones: { [pagina]: [{ ...boton('t', taco), x: 90, ancho: 50 }] } }),
    ).rejects.toMatchObject({ codigo: 'PUENTE_CAMPO_INVALIDO' });
  });

  it('sin poder pedir, la página es sólo imagen (también en modo mixto, donde el menú sí viaja)', async () => {
    await guardar({ portal_qr_permitir_pedidos_cliente: false, portal_qr_modo_menu: 'mixto' });
    try {
      const payload = await payloadDelPortal(negocio.organizacionId, token, PIMIENTA);
      expect(payload.productos.length, 'En modo mixto el menú viaja.').toBeGreaterThan(0);
      expect(payload.secciones[0]?.botones).toEqual([]);
    } finally {
      await guardar({
        portal_qr_permitir_pedidos_cliente: true,
        portal_qr_modo_menu: 'menu_subido',
      });
    }
  });
});

describe('el aspecto del portal', () => {
  it('sin guardar, el de siempre; guardado, el elegido; sin forma, no se guarda', async () => {
    expect((await payloadDelPortal(negocio.organizacionId, token, PIMIENTA)).tema).toEqual({
      estilo: null,
      tipografia: 'sistema',
      fondo: 'marca',
    });
    const elegido = { estilo: 'papel', tipografia: 'clasica', fondo: 'liso' };
    await guardar({ portal_qr_tema: elegido });
    expect((await payloadDelPortal(negocio.organizacionId, token, PIMIENTA)).tema).toEqual(elegido);
    await expect(
      guardar({ portal_qr_tema: { ...elegido, estilo: 'inventado' } }),
    ).rejects.toMatchObject({ codigo: 'PUENTE_CAMPO_INVALIDO' });
    const guardado = await obtenerDb()
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', negocio.organizacionId)
      .executeTakeFirstOrThrow();
    expect(guardado.valores).toMatchObject({ portal_qr_tema: elegido });
  });
});
