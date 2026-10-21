import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { cambiarMesaComando } from './cambio-de-mesa.ts';
import { cancelarOrden } from './cancelacion.ts';
import { abrirMesa, liberarMesa } from './mesas.ts';
import { enviarPedido } from './pedido.ts';
import { separarMesasComando, unirMesasComando } from './union-de-mesas.ts';

/**
 * LOS AVISOS DEL COMENSAL SE VAN CON SU GRUPO, contra Postgres (día completo del restaurante, 2.4).
 *
 * El comensal que pide la cuenta desde su teléfono deja un aviso `pendiente`, y nadie lo cerraba
 * al recoger la mesa. El grupo siguiente pedía su cuenta y el portal, que tiene un índice único
 * «un aviso pendiente por mesa y tipo», ACTUALIZABA el viejo en lugar de crear uno: la tableta del
 * mesero, que sólo avisa de lo nuevo, no se enteraba. Aquí la mesa vuelve al servicio por cada uno
 * de sus cuatro caminos y los avisos vivos de su grupo quedan cerrados.
 *
 * La base falsa no puede probarlo: no tiene el índice, y el índice es lo que convertía el aviso
 * viejo en un obstáculo.
 *
 * ── Qué se vigila ─────────────────────────────────────────────────────────────
 *   · los vivos (`pendiente`, `atendida`) quedan `resuelta`, con su fecha;
 *   · los que ya estaban cerrados NO se tocan (una `cancelada` no pasa a `resuelta`);
 *   · los de OTRA mesa NO se tocan;
 *   · y el grupo siguiente PUEDE dejar su aviso: la inserción que el índice rechazaba pasa.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;
let producto = '';
let mesas: readonly string[] = [];

const ambito = () => ambitoDe(negocio, sucursal.sucursalId, null);
/** Cancelar una cuenta con consumo es de caja o de dirección: el mesero no puede. */
const ambitoDeLaGerente = () => ({ ...ambito(), rol: 'gerente' as const });

function mesaDe(indice: number): string {
  const id = mesas[indice];
  if (id === undefined) throw new Error(`La siembra no creó la mesa ${String(indice)}.`);
  return id;
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Restaurante de los avisos',
    rol: 'mesero',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  sucursal = await sembrarSucursal(negocio, { terminales: [] });
  const db = obtenerDb();
  await db
    .insertInto('estaciones_preparacion')
    .values({ organizacion_id: negocio.organizacionId, nombre: 'Cocina general', es_general: true })
    .execute();
  producto = (
    await db
      .insertInto('productos')
      .values({
        organizacion_id: negocio.organizacionId,
        nombre: 'Cerveza clara',
        precio_venta_centavos: 5_500n,
        costo_unitario_centavos: 2_750n,
        estrategia_consumo: 'ninguno',
        area_preparacion: 'cocina',
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
  mesas = (
    await db
      .insertInto('mesas')
      .values(
        [1, 2, 3, 4, 5, 6, 7].map((numero) => ({
          organizacion_id: negocio.organizacionId,
          sucursal_id: sucursal.sucursalId,
          numero,
        })),
      )
      .returning('id')
      .execute()
  ).map((m) => m.id);
});

type EstadoDelAviso = 'pendiente' | 'atendida' | 'resuelta' | 'cancelada';
type TipoDeAviso = 'ordenar' | 'cuenta' | 'ayuda';

/** El aviso que dejó un comensal desde su teléfono, tal como lo deja `portal.crear_solicitud`. */
async function dejarAviso(
  indiceDeMesa: number,
  tipo: TipoDeAviso,
  estado: EstadoDelAviso = 'pendiente',
): Promise<string> {
  return (
    await obtenerDb()
      .insertInto('solicitudes_qr')
      .values({
        organizacion_id: negocio.organizacionId,
        mesa_id: mesaDe(indiceDeMesa),
        tipo,
        estado,
        atendida_en: estado === 'atendida' ? new Date() : null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
  ).id;
}

async function avisoDe(id: string) {
  return obtenerDb()
    .selectFrom('solicitudes_qr')
    .select(['estado', 'resuelta_en'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

async function abrir(indice: number): Promise<string> {
  const abierta = await comando(abrirMesa, {
    entrada: { mesaId: mesaDe(indice), personas: 2 },
    ambito: ambito(),
    idempotencyKey: clave(),
  });
  return exigirOk(abierta, 'restaurante.abrir_mesa').ordenId;
}

async function pedirUna(ordenId: string): Promise<void> {
  exigirOk(
    await comando(enviarPedido, {
      entrada: { ordenId, lineas: [{ productoId: producto, cantidad: '1' }] },
      ambito: ambito(),
      idempotencyKey: clave(),
    }),
    'restaurante.enviar_pedido',
  );
}

describe('los avisos del comensal se van con su grupo', () => {
  it('«mesa limpia» cierra los avisos vivos de la mesa, y el grupo siguiente puede dejar el suyo', async () => {
    await abrir(0);
    const cuenta = await dejarAviso(0, 'cuenta');
    const ayuda = await dejarAviso(0, 'ayuda', 'atendida');
    const yaCancelado = await dejarAviso(0, 'ordenar', 'cancelada');
    const deOtraMesa = await dejarAviso(6, 'cuenta');

    exigirOk(
      await comando(liberarMesa, {
        entrada: { mesaId: mesaDe(0) },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'restaurante.liberar_mesa',
    );

    const cerrada = await avisoDe(cuenta);
    expect(cerrada.estado, 'el aviso de la cuenta pedida sigue vivo').toBe('resuelta');
    expect(cerrada.resuelta_en, 'el aviso se cerró sin fecha').not.toBeNull();
    expect((await avisoDe(ayuda)).estado, 'el aviso atendido sigue vivo').toBe('resuelta');
    expect((await avisoDe(yaCancelado)).estado, 'lo cancelado no se vuelve resuelto').toBe(
      'cancelada',
    );
    expect((await avisoDe(deOtraMesa)).estado, 'se cerró el aviso de OTRA mesa').toBe('pendiente');

    // El grupo siguiente pide su cuenta: el índice «un aviso pendiente por mesa y tipo» ya no
    // estorba, así que el portal crea un aviso NUEVO y la tableta del mesero se entera.
    const delSiguiente = await dejarAviso(0, 'cuenta');
    expect(delSiguiente).not.toBe(cuenta);
    expect((await avisoDe(delSiguiente)).estado).toBe('pendiente');
  });

  it('cancelar la cuenta de la mesa también cierra los avisos de su grupo', async () => {
    const ordenId = await abrir(1);
    await pedirUna(ordenId);
    const cuenta = await dejarAviso(1, 'cuenta');

    exigirOk(
      await comando(cancelarOrden, {
        entrada: { ordenId, motivo: 'se fueron sin consumir' },
        ambito: ambitoDeLaGerente(),
        idempotencyKey: clave(),
      }),
      'restaurante.cancelar_orden',
    );

    expect((await avisoDe(cuenta)).estado, 'la cuenta se canceló y su aviso sigue vivo').toBe(
      'resuelta',
    );
  });

  it('mudar la cuenta a otra mesa cierra los avisos de la MESA VIEJA y no toca los de la nueva', async () => {
    const ordenId = await abrir(2);
    await pedirUna(ordenId);
    const dejadoEnLaVieja = await dejarAviso(2, 'ayuda');
    const deLaNueva = await dejarAviso(3, 'ayuda');

    exigirOk(
      await comando(cambiarMesaComando, {
        entrada: { ordenId, mesaDestinoId: mesaDe(3) },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'restaurante.cambiar_mesa',
    );

    // El cambio en sí: la cuenta está en la mesa nueva y la vieja volvió al servicio. Antes de que
    // se soltara la vieja ANTES de tomar la nueva, la base rechazaba la segunda cuenta activa
    // (`mesas_una_orden_activa`) y el mesero leía «Algo falló de nuestro lado» en cada cambio.
    const db = obtenerDb();
    const mesaVieja = await db
      .selectFrom('mesas')
      .select(['estado', 'orden_activa_id'])
      .where('id', '=', mesaDe(2))
      .executeTakeFirstOrThrow();
    const mesaNueva = await db
      .selectFrom('mesas')
      .select(['estado', 'orden_activa_id'])
      .where('id', '=', mesaDe(3))
      .executeTakeFirstOrThrow();
    const cuenta = await db
      .selectFrom('ordenes')
      .select('mesa_id')
      .where('id', '=', ordenId)
      .executeTakeFirstOrThrow();
    expect(mesaVieja).toEqual({ estado: 'libre', orden_activa_id: null });
    expect(mesaNueva.orden_activa_id).toBe(ordenId);
    expect(mesaNueva.estado).not.toBe('libre');
    expect(cuenta.mesa_id).toBe(mesaDe(3));

    expect((await avisoDe(dejadoEnLaVieja)).estado, 'la mesa vieja quedó con su aviso').toBe(
      'resuelta',
    );
    expect((await avisoDe(deLaNueva)).estado, 'se cerró el aviso de la mesa que recibió').toBe(
      'pendiente',
    );
  });

  it('separar un grupo de mesas cierra los avisos de las mesas que vuelven al servicio', async () => {
    const principal = await abrir(4);
    await pedirUna(principal);
    const delMiembro = await dejarAviso(5, 'cuenta');
    const delaPrincipal = await dejarAviso(4, 'cuenta');

    const unido = exigirOk(
      await comando(unirMesasComando, {
        entrada: { mesaPrincipalId: mesaDe(4), mesaIds: [mesaDe(5)] },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'restaurante.unir_mesas',
    );
    exigirOk(
      await comando(separarMesasComando, {
        entrada: { unionId: unido.unionId },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'restaurante.separar_mesas',
    );

    expect((await avisoDe(delMiembro)).estado, 'la mesa liberada quedó con su aviso').toBe(
      'resuelta',
    );
    // La principal conserva su cuenta y sigue sentada: su aviso es de un grupo que sigue ahí.
    expect((await avisoDe(delaPrincipal)).estado, 'se cerró el aviso de quien sigue sentado').toBe(
      'pendiente',
    );
  });
});
