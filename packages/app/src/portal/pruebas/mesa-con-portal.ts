import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import type { ZodType } from 'zod';

import { comando } from '../../produccion.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
} from '../../pruebas/negocio-real.ts';
import { rotarQr } from '../../restaurante/qr.ts';
import { agregarAlCarrito, enviarElCarrito } from '../carrito-comandos.ts';
import { leerElCarrito } from '../carrito-http.ts';
import { ejecutarComandoPublico } from '../comando-publico.ts';
import type { ComandoPublico } from '../definicion-publica.ts';
import { abrirMesaDesdeQR } from '../mesa.ts';

/**
 * LA MESA CON SU PORTAL, para las pruebas del carrito compartido (DP-9.5): un negocio con dos
 * platillos (cocina y barra), una mesa con su QR y los comandos públicos del teléfono.
 */

export const PIMIENTA = 'pimienta-de-la-prueba-del-carrito-0123456789';
export const TELEFONO_A = 'telefonoA_0123456789abcdef';
export const TELEFONO_B = 'telefonoB_0123456789abcdef';

export async function mesaConPortal({ pedidos = true }: { readonly pedidos?: boolean } = {}) {
  const negocio = await sembrarNegocio({
    nombre: 'Fonda del carrito',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  const taco = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Taco de barbacoa',
    precioCentavos: 3_500n,
    existencia: '100',
  });
  const agua = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Agua de jamaica',
    precioCentavos: 2_800n,
    existencia: '100',
  });
  const mesaId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: true, area_preparacion: 'cocina' })
      .where('id', '=', taco.productoId)
      .execute();
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: true, area_preparacion: 'barra' })
      .where('id', '=', agua.productoId)
      .execute();
    const banderas = {
      portal_qr_activo: true,
      portal_qr_permitir_pedidos_cliente: pedidos,
      asignacion_mesas_activa: false,
    };
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify(banderas)}::jsonb)
      on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
    await tx
      .insertInto('mesas')
      .values({
        id: mesaId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursal.sucursalId,
        numero: 3,
        nombre: 'Mesa 3',
      })
      .execute();
  });
  const { qrToken } = exigirOk(
    await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
    'restaurante.rotar_qr',
  );
  /** `interrumpirEn`: rompe el comando en ese paso, para probar que revierte entero. */
  const publico = <E extends ZodType, S>(
    definicion: ComandoPublico<E, S>,
    entrada: unknown,
    interrumpirEn?: string,
  ) =>
    ejecutarComandoPublico(definicion, {
      token: qrToken,
      organizacionId: negocio.organizacionId,
      entrada,
      idempotencyKey: clave(),
      pimienta: PIMIENTA,
      interrumpirEn,
    });
  const mirar = (dispositivo: string, ahora = new Date()) =>
    leerElCarrito({
      token: qrToken,
      organizacionId: negocio.organizacionId,
      pimienta: PIMIENTA,
      dispositivo,
      ahora,
    });
  const abrir = async (personas: number) =>
    exigirOk(
      await publico(abrirMesaDesdeQR, {
        personas,
        clienteNombre: '',
        notas: '',
        notasAlergias: '',
      }),
      'portal.abrir_mesa',
    );
  const agregar = (dispositivo: string, productoId: string, cantidad = '1', notas = '') =>
    publico(agregarAlCarrito, { dispositivo, item: { productoId, cantidad, notas } });
  const enviar = (dispositivo: string, confirmado: boolean) =>
    publico(enviarElCarrito, { dispositivo, confirmado });
  return {
    negocio,
    mesaId,
    taco: taco.productoId,
    agua: agua.productoId,
    mirar,
    abrir,
    agregar,
    enviar,
    publico,
  };
}

export async function lineasDeLaCuenta(mesaId: string) {
  return obtenerDb()
    .selectFrom('orden_lineas as l')
    .innerJoin('ordenes as o', 'o.id', 'l.orden_id')
    .select([
      'l.producto_nombre',
      'l.cantidad',
      'l.precio_unitario_centavos',
      'l.subtotal_centavos',
    ])
    .where('o.mesa_id', '=', mesaId)
    .orderBy('l.orden_visual')
    .execute();
}

export async function comandasDe(mesaId: string): Promise<number> {
  const fila = await obtenerDb()
    .selectFrom('comandas as c')
    .innerJoin('ordenes as o', 'o.id', 'c.orden_id')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('o.mesa_id', '=', mesaId)
    .executeTakeFirst();
  return Number(fila?.n ?? 0);
}
