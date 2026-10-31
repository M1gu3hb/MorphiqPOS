import { randomUUID } from 'node:crypto';

import { obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { ejecutarComandoPublico } from '../portal/comando-publico.ts';
import { abrirMesaDesdeQR } from '../portal/mesa.ts';
import { enviarPedidoDesdeQR } from '../portal/pedido.ts';
import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
} from '../pruebas/negocio-real.ts';
import { abrirMesa } from './mesas.ts';
import { enviarPedido } from './pedido.ts';
import { rotarQr } from './qr.ts';

/**
 * DP-10.1 · CADA COMANDA NACE CON LA ESTACIÓN DE SU CATEGORÍA, por el mesero y por el QR, con
 * las estaciones ENCENDIDAS o APAGADAS (contra Postgres real).
 *
 * La cadena es Producto → Categoría → Estación activa → la general. El mesero ya la seguía; el
 * portal del comensal, no: con las estaciones apagadas mandaba la comanda SIN estación (por
 * área), y con ellas encendidas tomaba la estación de la categoría aunque estuviera apagada y su
 * nombre de una instantánea vacía. En Don Poncho eso es una comanda que la pantalla de Cocina o
 * la de Bebidas no enseña.
 */

const PIMIENTA = 'pimienta-de-la-prueba-de-estaciones-0123456789';
type Platillo = 'taco' | 'agua' | 'flan' | 'tortillas';

async function cocinaConPortal(estacionesActivas: boolean) {
  const negocio = await sembrarNegocio({
    nombre: `Barbacoa ${estacionesActivas ? 'con' : 'sin'} estaciones`,
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  const db = obtenerDb();
  const org = negocio.organizacionId;
  const estacion = async (nombre: string, color: string, esGeneral = false) =>
    (
      await db
        .insertInto('estaciones_preparacion')
        .values({ organizacion_id: org, nombre, color, es_general: esGeneral })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const estaciones = {
    cocina: await estacion('Cocina', '#83653f', true),
    bebidas: await estacion('Bebidas', '#0891b2'),
    postres: await estacion('Postres', '#db2777'),
  };
  // La instantánea de la categoría, vacía como en producción: el nombre sale de la estación.
  const categoria = async (nombre: string, estacionId: string) =>
    (
      await db
        .insertInto('categorias')
        .values({ organizacion_id: org, nombre, estacion_preparacion_id: estacionId })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const categorias = {
    platillos: await categoria('Lo fuerte', estaciones.cocina),
    aguas: await categoria('Para enfriar', estaciones.bebidas),
    postres: await categoria('Lo dulce', estaciones.postres),
  };
  // Postres se apaga DESPUÉS de asignarla: su categoría la sigue nombrando.
  await db
    .updateTable('estaciones_preparacion')
    .set({ activa: false })
    .where('id', '=', estaciones.postres)
    .execute();
  const producto = async (nombre: string, area: string, categoriaId: string | null) =>
    (
      await db
        .insertInto('productos')
        .values({
          organizacion_id: org,
          nombre,
          precio_venta_centavos: 3_500n,
          costo_unitario_centavos: 1_200n,
          estrategia_consumo: 'ninguno',
          area_preparacion: area,
          categoria_id: categoriaId,
          visible_en_menu_digital: true,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  const productos: Record<Platillo, string> = {
    taco: await producto('Taco de barbacoa', 'cocina', categorias.platillos),
    agua: await producto('Agua de jamaica', 'barra', categorias.aguas),
    flan: await producto('Flan napolitano', 'cocina', categorias.postres),
    tortillas: await producto('Tortillas extra', 'cocina', null),
  };
  const banderas = {
    portal_qr_activo: true,
    portal_qr_permitir_pedidos_cliente: true,
    asignacion_mesas_activa: false,
    estaciones_preparacion_activas: estacionesActivas,
  };
  await sql`
    insert into configuracion (organizacion_id, valores)
    values (${org}, ${JSON.stringify(banderas)}::jsonb)
    on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
  `.execute(db);
  const mesa = async (numero: number) => {
    const id = randomUUID();
    await db
      .insertInto('mesas')
      .values({ id, organizacion_id: org, sucursal_id: sucursal.sucursalId, numero })
      .execute();
    return id;
  };
  return {
    negocio,
    ambito,
    estaciones,
    productos,
    mesaDelMesero: await mesa(1),
    mesaDelQr: await mesa(2),
  };
}

type Caso = Awaited<ReturnType<typeof cocinaConPortal>>;

/** Cada platillo de la cuenta, con la estación (y su rótulo) de la comanda donde quedó. */
async function estacionDeCadaPlatillo(
  caso: Caso,
  mesaId: string,
): Promise<Record<string, readonly (string | null)[]>> {
  const { orden_activa_id: ordenId } = await obtenerDb()
    .selectFrom('mesas')
    .select('orden_activa_id')
    .where('id', '=', mesaId)
    .executeTakeFirstOrThrow();
  const filas = await obtenerDb()
    .selectFrom('comanda_items as i')
    .innerJoin('comandas as c', 'c.id', 'i.comanda_id')
    .select(['i.producto_id', 'c.estacion_preparacion_id', 'c.estacion_nombre'])
    .where('c.orden_id', '=', ordenId ?? '')
    .execute();
  const nombreDe = new Map(Object.entries(caso.productos).map(([k, v]) => [v, k]));
  return Object.fromEntries(
    filas.map((f) => [
      nombreDe.get(f.producto_id ?? '') ?? '¿?',
      [f.estacion_preparacion_id, f.estacion_nombre],
    ]),
  );
}

function esperado(caso: Caso) {
  const cocina = [caso.estaciones.cocina, 'Cocina'];
  return {
    taco: cocina,
    agua: [caso.estaciones.bebidas, 'Bebidas'],
    // Su estación está apagada, y el que no tiene categoría: a la general.
    flan: cocina,
    tortillas: cocina,
  };
}

const PLATILLOS: readonly Platillo[] = ['taco', 'agua', 'flan', 'tortillas'];

describe.each([true, false])('estaciones encendidas: %s', (estacionesActivas) => {
  it('el mesero: cada platillo a la estación de su categoría', async () => {
    const caso = await cocinaConPortal(estacionesActivas);
    const { ordenId } = exigirOk(
      await comando(abrirMesa, {
        entrada: { mesaId: caso.mesaDelMesero, personas: 2 },
        ambito: caso.ambito,
        idempotencyKey: clave(),
      }),
      'restaurante.abrir_mesa',
    );
    exigirOk(
      await comando(enviarPedido, {
        entrada: {
          ordenId,
          lineas: PLATILLOS.map((p) => ({ productoId: caso.productos[p], cantidad: '1' })),
        },
        ambito: caso.ambito,
        idempotencyKey: clave(),
      }),
      'restaurante.enviar_pedido',
    );
    expect(await estacionDeCadaPlatillo(caso, caso.mesaDelMesero)).toEqual(esperado(caso));
  });

  it('el comensal desde el QR: la misma estación que si lo pidiera el mesero', async () => {
    const caso = await cocinaConPortal(estacionesActivas);
    const { qrToken } = exigirOk(
      await comando(rotarQr, {
        entrada: { mesaId: caso.mesaDelQr },
        ambito: caso.ambito,
        idempotencyKey: clave(),
      }),
      'restaurante.rotar_qr',
    );
    const peticion = (entrada: unknown) => ({
      token: qrToken,
      organizacionId: caso.negocio.organizacionId,
      entrada,
      idempotencyKey: clave(),
      pimienta: PIMIENTA,
    });
    exigirOk(
      await ejecutarComandoPublico(abrirMesaDesdeQR, peticion({ personas: 2 })),
      'portal.abrir_mesa',
    );
    exigirOk(
      await ejecutarComandoPublico(
        enviarPedidoDesdeQR,
        peticion({
          items: PLATILLOS.map((p) => ({ productoId: caso.productos[p], cantidad: '1' })),
        }),
      ),
      'portal.enviar_pedido',
    );
    expect(await estacionDeCadaPlatillo(caso, caso.mesaDelQr)).toEqual(esperado(caso));
  });
});
