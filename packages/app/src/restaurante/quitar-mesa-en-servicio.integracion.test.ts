import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { escribirDatos } from '../puente/comandos.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
  type SucursalReal,
} from '../pruebas/negocio-real.ts';
import { cancelarOrden } from './cancelacion.ts';
import { abrirMesa } from './mesas.ts';
import { unirMesasComando } from './union-de-mesas.ts';

/**
 * UNA MESA EN SERVICIO NO SE QUITA DEL MAPA, contra Postgres (cierre del restaurante, 21-10).
 *
 * «Quitar del mapa» es el borrado suave del puente: apaga `mesas.activa`. La pantalla
 * deshabilitaba el botón de una mesa ocupada, pero el servidor lo dejaba pasar, y la cuenta
 * quedaba colgando de una mesa dada de baja. Ahora el `update` que apaga la mesa lleva la
 * condición en su `where` (`apagarSoloSi` del mapa): se mira lo PERSISTIDO después de cada
 * intento, no sólo la respuesta.
 */

let negocio: NegocioReal;
let sucursal: SucursalReal;
let mesas: readonly string[] = [];

/** Quitar mesas es de dirección: el puente sólo deja escribir a dueño, administrador y gerente. */
const ambito = () => ambitoDe(negocio, sucursal.sucursalId, null);

function mesaDe(indice: number): string {
  const id = mesas[indice];
  if (id === undefined) throw new Error(`La siembra no creó la mesa ${String(indice)}.`);
  return id;
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Restaurante de las mesas que se quitan',
    rol: 'gerente',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  sucursal = await sembrarSucursal(negocio, { terminales: [] });
  mesas = (
    await obtenerDb()
      .insertInto('mesas')
      .values(
        [1, 2, 3, 4, 5].map((numero) => ({
          organizacion_id: negocio.organizacionId,
          sucursal_id: sucursal.sucursalId,
          numero,
        })),
      )
      .returning('id')
      .execute()
  ).map((m) => m.id);
});

async function abrir(indice: number): Promise<string> {
  const abierta = await comando(abrirMesa, {
    entrada: { mesaId: mesaDe(indice), personas: 2 },
    ambito: ambito(),
    idempotencyKey: clave(),
  });
  return exigirOk(abierta, 'restaurante.abrir_mesa').ordenId;
}

function quitar(id: string, operacion: 'delete' | 'update' = 'delete') {
  return comando(escribirDatos, {
    entrada: {
      entidad: 'Mesa',
      operacion,
      id,
      ...(operacion === 'update' ? { datos: { activo: false } } : {}),
    },
    ambito: ambito(),
    idempotencyKey: clave(),
  });
}

async function mesaPersistida(id: string) {
  return obtenerDb()
    .selectFrom('mesas')
    .select(['activa', 'estado', 'orden_activa_id'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

describe('quitar una mesa del mapa', () => {
  it('una mesa libre se quita: queda dada de baja', async () => {
    exigirOk(await quitar(mesaDe(0)), 'puente.escribir (quitar la mesa 1)');
    expect(await mesaPersistida(mesaDe(0))).toMatchObject({ activa: false, estado: 'libre' });
  });

  it('una mesa con su cuenta abierta NO, ni por el borrado ni por un update; y la cuenta sigue en su mesa', async () => {
    const ordenId = await abrir(1);

    for (const operacion of ['delete', 'update'] as const) {
      const salida = await quitar(mesaDe(1), operacion);
      expect(salida.ok, `quitar con ${operacion} una mesa en servicio pasó`).toBe(false);
      if (salida.ok) return;
      expect(salida.error.datos?.['regla']).toBe('MESA_YA_ABIERTA');
      // Lo que lee el dueño dice por qué y qué hacer, no «no existe».
      expect(salida.error.mensaje).toMatch(/en servicio/);
    }

    expect(await mesaPersistida(mesaDe(1))).toEqual({
      activa: true,
      estado: 'esperando_orden',
      orden_activa_id: ordenId,
    });

    // Lo demás de la mesa se sigue editando en servicio: el candado es sólo para apagarla.
    exigirOk(
      await comando(escribirDatos, {
        entrada: { entidad: 'Mesa', operacion: 'update', id: mesaDe(1), datos: { capacidad: 6 } },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'puente.escribir (capacidad de una mesa en servicio)',
    );
  });

  it('la mesa unida a otra tampoco, aunque no tenga cuenta propia', async () => {
    await abrir(2);
    exigirOk(
      await comando(unirMesasComando, {
        entrada: { mesaPrincipalId: mesaDe(2), mesaIds: [mesaDe(3)] },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'restaurante.unir_mesas',
    );
    expect((await mesaPersistida(mesaDe(3))).orden_activa_id).toBeNull();

    const salida = await quitar(mesaDe(3));
    expect(salida.ok).toBe(false);
    expect((await mesaPersistida(mesaDe(3))).activa).toBe(true);
  });

  it('con la cuenta cancelada vuelve a estar libre, y entonces sí se quita', async () => {
    const ordenId = await abrir(4);
    exigirOk(
      await comando(cancelarOrden, {
        entrada: { ordenId, motivo: 'se fueron sin consumir' },
        ambito: ambito(),
        idempotencyKey: clave(),
      }),
      'restaurante.cancelar_orden',
    );

    exigirOk(await quitar(mesaDe(4)), 'puente.escribir (quitar la mesa ya libre)');
    expect((await mesaPersistida(mesaDe(4))).activa).toBe(false);
  });

  it('una mesa que no existe sigue siendo «no existe», no «en servicio»', async () => {
    const salida = await quitar('00000000-0000-4000-8000-000000000000');
    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.datos?.['regla']).toBe('PUENTE_NO_ENCONTRADO');
  });
});
