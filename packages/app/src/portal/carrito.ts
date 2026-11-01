import 'server-only';

import { createHmac } from 'node:crypto';

import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import type { AmbitoPortal } from './ambito.ts';
import { itemDelCarrito } from './esquemas.ts';

/**
 * EL CARRITO COMPARTIDO DE LA MESA (DP-9.5).
 *
 * Todos los teléfonos que escanean el QR de una mesa arman UN carrito: cada quien agrega, todos
 * ven lo de todos (sondeo de 2-3 s), cada quien quita lo suyo, y cualquiera lo manda. Sale a
 * cocina UNA vez, entero —una comanda por estación—, y se vacía para todos.
 *
 * Aquí: la huella del teléfono, la forma de lo que llega, el latido y la lectura del carrito.
 * Los tres comandos están en `carrito-comandos.ts`.
 */

/** Más de esto en un carrito ya no es una mesa pidiendo. */
export const MAXIMO_EN_EL_CARRITO = 60;
/** Un teléfono cuenta como conectado si latió en este último rato. */
export const SEGUNDOS_CONECTADO = 60;

/** El id que inventa el navegador del teléfono: sólo letras, números, «-» y «_». */
const DISPOSITIVO = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, { error: 'No se pudo reconocer este teléfono.' });

/** Lo que se guarda del teléfono: su huella con la pimienta del servidor, nunca el id. */
export function huellaDelDispositivo(pimienta: string, dispositivo: string): string {
  return createHmac('sha256', pimienta)
    .update(`portal:dispositivo:${dispositivo}`, 'utf8')
    .digest('hex');
}

export const entradaDelTelefono = z.object({ dispositivo: DISPOSITIVO }).strict();
export const entradaAgregarAlCarrito = z
  .object({ dispositivo: DISPOSITIVO, item: itemDelCarrito })
  .strict();
export const entradaQuitarDelCarrito = z
  .object({ dispositivo: DISPOSITIVO, lineaId: z.uuid() })
  .strict();
export const entradaEnviarElCarrito = z
  .object({
    dispositivo: DISPOSITIVO,
    confirmado: z.boolean(),
    /** La nota para cocina de quien lo manda («todo junto, sin picante…»). */
    notaGeneral: z.string().trim().max(300).default(''),
  })
  .strict();

export interface LineaDelCarrito {
  readonly id: string;
  readonly productoId: string;
  readonly nombre: string;
  readonly cantidad: string;
  readonly notas: string;
  /** El precio vigente del catálogo, sólo para enseñarlo: lo que se cobra lo pone el envío. */
  readonly precioCentavos: string;
  /** La agregó ESTE teléfono: sólo ésas se pueden quitar desde aquí. */
  readonly esMia: boolean;
  /**
   * `false`: el negocio la ocultó del menú o la desactivó después de que se agregara. Todos los
   * teléfonos la ven marcada; al enviar se quita y el pedido sale sin ella.
   */
  readonly disponible: boolean;
}

export interface EstadoDelCarrito {
  readonly lineas: readonly LineaDelCarrito[];
  /** Teléfonos distintos que latieron en el último minuto desde que se abrió la cuenta. */
  readonly conectados: number;
  /** Las personas con las que se abrió la mesa. */
  readonly personas: number;
  /** Dos o más teléfonos, o una mesa de dos o más: «Esperen a que todos agreguen…». */
  readonly esperarATodos: boolean;
  /** Cuántas veces ha salido el carrito de esta mesa: si sube, alguien lo mandó. */
  readonly ronda: number;
  readonly ultimoEnvio: { readonly en: string; readonly porEsteTelefono: boolean } | null;
}

/** `2.5000` → `2.5`, `3.0000` → `3`: como la escribió el comensal. */
export function cantidadLegible(cantidad: string): string {
  return cantidad.includes('.') ? cantidad.replace(/\.?0+$/, '') : cantidad;
}

/** El teléfono sigue aquí: su último latido es ahora. */
export async function latir(
  tx: Transaccion,
  ambito: AmbitoPortal,
  huella: string,
  ahora: Date,
): Promise<void> {
  await tx
    .insertInto('dispositivos_mesa')
    .values({
      organizacion_id: ambito.organizacionId,
      mesa_id: ambito.mesaId,
      dispositivo_huella: huella,
      visto_en: ahora,
    })
    .onConflict((oc) =>
      oc
        .columns(['organizacion_id', 'mesa_id', 'dispositivo_huella'])
        .doUpdateSet({ visto_en: ahora }),
    )
    .execute();
}

/** La cuenta abierta de la mesa, sin candado: sólo para saber desde cuándo cuenta el carrito. */
export async function aperturaDeLaCuenta(
  tx: Transaccion,
  ambito: AmbitoPortal,
): Promise<Date | null> {
  const orden = await tx
    .selectFrom('ordenes')
    .select('created_at')
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('mesa_id', '=', ambito.mesaId)
    .where('estado', 'in', [
      'borrador',
      'confirmada',
      'en_preparacion',
      'lista',
      'cuenta_solicitada',
    ])
    .orderBy('created_at', 'desc')
    .executeTakeFirst();
  return orden?.created_at ?? null;
}

/**
 * El carrito de la mesa como lo ve un teléfono. Sin cuenta abierta no hay carrito: lo de una
 * cuenta anterior no se le enseña a la siguiente mesa.
 */
export async function estadoDelCarrito(
  tx: Transaccion,
  ambito: AmbitoPortal,
  huella: string,
  { desde, ahora }: { readonly desde: Date | null; readonly ahora: Date },
): Promise<EstadoDelCarrito> {
  const lineas =
    desde === null
      ? []
      : await tx
          .selectFrom('carrito_mesa_lineas as l')
          .innerJoin('productos as p', (j) =>
            j
              .onRef('p.id', '=', 'l.producto_id')
              .onRef('p.organizacion_id', '=', 'l.organizacion_id'),
          )
          .select([
            'l.id',
            'l.producto_id',
            'l.cantidad',
            'l.notas',
            'l.dispositivo_huella',
            'p.nombre',
            'p.precio_venta_centavos',
            'p.activo',
            'p.visible_en_menu_digital',
          ])
          .where('l.organizacion_id', '=', ambito.organizacionId)
          .where('l.mesa_id', '=', ambito.mesaId)
          .where('l.created_at', '>=', desde)
          .orderBy('l.created_at')
          .orderBy('l.id')
          .execute();

  const umbral = new Date(ahora.getTime() - SEGUNDOS_CONECTADO * 1000);
  const desdeConectados = desde !== null && desde > umbral ? desde : umbral;
  const conectados = await tx
    .selectFrom('dispositivos_mesa')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('mesa_id', '=', ambito.mesaId)
    .where('visto_en', '>=', desdeConectados)
    .executeTakeFirst();
  const mesa = await tx
    .selectFrom('mesas')
    .select('personas_actuales')
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('id', '=', ambito.mesaId)
    .executeTakeFirst();
  const carrito = await tx
    .selectFrom('carritos_mesa')
    .select(['ronda', 'enviado_en', 'enviado_por_huella'])
    .where('organizacion_id', '=', ambito.organizacionId)
    .where('mesa_id', '=', ambito.mesaId)
    .executeTakeFirst();

  const nConectados = Number(conectados?.n ?? 0);
  const personas = desde === null ? 0 : (mesa?.personas_actuales ?? 0);
  return {
    lineas: lineas.map((l) => ({
      id: l.id,
      productoId: l.producto_id,
      nombre: l.nombre,
      cantidad: cantidadLegible(l.cantidad),
      notas: l.notas,
      precioCentavos: l.precio_venta_centavos.toString(),
      esMia: l.dispositivo_huella === huella,
      disponible: l.activo && l.visible_en_menu_digital,
    })),
    conectados: nConectados,
    personas,
    esperarATodos: nConectados >= 2 || personas >= 2,
    ronda: carrito?.ronda ?? 0,
    ultimoEnvio:
      carrito?.enviado_en == null
        ? null
        : {
            en: carrito.enviado_en.toISOString(),
            porEsteTelefono: carrito.enviado_por_huella === huella,
          },
  };
}
