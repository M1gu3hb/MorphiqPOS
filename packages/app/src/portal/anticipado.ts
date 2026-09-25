import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { cotizar } from '../venta/cotizar.ts';
import { cargarProductosDelMenu, valorarParaPedido } from './productos.ts';

/**
 * C.14 de la etapa 2.4 · EL PEDIDO ANTICIPADO DE LA CAFETERÍA, SIN SESIÓN Y SIN PAGO.
 *
 * ── Lo que había, y por qué no servía ────────────────────────────────────
 * El menú público leía el puente con SESIÓN —desde el teléfono de una clienta no
 * leía nada— y el botón «apartar» publicaba en `cafeteria.programar_pedido`, que
 * exige sesión Y una orden pagada. Tres imposibilidades a la vez; la pantalla
 * terminó REDACTANDO el pedido para que la clienta lo copiara.
 *
 * ── La decisión, que es de Miguel y ya está tomada ───────────────────────
 * «Cobrar en línea exige pasarela, que es del §10. Mientras, se reserva sin pago y se
 * cobra al recoger.» Así que aquí nace una orden CONFIRMADA —no pagada— con las
 * líneas al precio del CATÁLOGO, y su pedido anticipado `programado`. La barra la
 * prepara cuando toca (`cafeteria.encolar_anticipado` emite la comanda antes del
 * pago), y se cobra y se entrega al recoger: `entregar_anticipado` exige la orden
 * pagada, así que nada sale sin cobrar.
 *
 * ── Lo que protege esta puerta, que no tiene sesión ──────────────────────
 * · El NEGOCIO sale de la dirección (`/n/<slug>`) y del despliegue, nunca del cuerpo;
 *   un negocio que no es cafetería contesta igual que uno que no existe.
 * · El PRECIO sale del catálogo: la entrada trae qué y cuántos, no cuánto.
 * · Sólo lo que está en el menú digital y hoy se vende.
 * · Tres por hueco de cinco minutos, como el comando del mostrador: llenar la agenda
 *   de la barra con reservas falsas cuesta, como mucho, tres por hueco.
 * · Límite por IP y por negocio (`LIMITES_PORTAL`), contado ANTES de la transacción.
 * · Idempotente: la clave de la petición va a `ordenes.idempotency_key`, que es única
 *   por negocio. Un doble toque con mala cobertura devuelve el MISMO apartado.
 */

/** Cuánto antes, como mínimo: lo que la barra tarda en ver el pedido y prepararlo. */
const ANTICIPACION_MINIMA_MIN = 10;
/** Hasta cuándo, como mucho. Nadie aparta el café de mañana desde la fila de hoy. */
const HORIZONTE_MAXIMO_HORAS = 12;
/** Los del hueco: los mismos que `cafeteria.programar_pedido` (tres cada cinco minutos). */
const CABEN_POR_HUECO = 3;
const MINUTOS_DEL_HUECO = 5;
const MS_POR_MINUTO = 60_000;

export const entradaApartarAnticipado = z.object({
  /** El que se canta en la barra. */
  nombre: z.string().trim().min(1).max(40),
  /** Sólo para avisar; pedirlo como requisito espanta a la mitad (`04-INTERFAZ`). */
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9 +()-]{7,20}$/)
    .optional(),
  horaPrometida: z.iso.datetime(),
  items: z
    .array(
      z.object({
        productoId: z.uuid(),
        cantidad: z.number().int().min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
});

export type EntradaApartarAnticipado = z.infer<typeof entradaApartarAnticipado>;

export interface NegocioPublico {
  readonly organizacionId: string;
  readonly sucursalId: string;
}

export interface ResultadoApartado {
  readonly pedidoId: string;
  readonly ordenId: string;
  readonly nombre: string;
  readonly horaPrometida: string;
  readonly totalCentavos: string;
}

export interface ProductoAnticipable {
  readonly id: string;
  readonly nombre: string;
  readonly familia: string;
  readonly precioCentavos: string;
  /** `false` es «hoy no hay»: se ve en gris y no se puede pedir. */
  readonly disponible: boolean;
}

/** El menú que se puede apartar: lo del menú digital, con su precio de catálogo. */
export async function menuAnticipable(
  tx: Transaccion,
  organizacionId: string,
): Promise<readonly ProductoAnticipable[]> {
  const filas = await tx
    .selectFrom('productos')
    .select(['id', 'nombre', 'familia', 'precio_venta_centavos', 'visible_en_pos'])
    .where('organizacion_id', '=', organizacionId)
    .where('activo', '=', true)
    .where('visible_en_menu_digital', '=', true)
    .orderBy('nombre')
    .limit(200)
    .execute();
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    familia: f.familia,
    precioCentavos: String(f.precio_venta_centavos),
    disponible: f.visible_en_pos,
  }));
}

/** Aparta el pedido: orden confirmada al precio del catálogo y su pedido programado. */
export async function apartarAnticipado(
  tx: Transaccion,
  negocio: NegocioPublico,
  entrada: EntradaApartarAnticipado,
  ahora: Date,
  idempotencyKey: string | null,
): Promise<ResultadoApartado> {
  const { organizacionId, sucursalId } = negocio;

  if (idempotencyKey !== null) {
    const previo = await apartadoConClave(tx, organizacionId, idempotencyKey);
    if (previo !== null) return previo;
  }

  const prometida = new Date(entrada.horaPrometida);
  const minutosQueFaltan = (prometida.getTime() - ahora.getTime()) / MS_POR_MINUTO;
  if (minutosQueFaltan < ANTICIPACION_MINIMA_MIN) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `Elige una hora de al menos ${String(ANTICIPACION_MINIMA_MIN)} minutos más tarde: la barra necesita verlo antes.`,
    );
  }
  if (minutosQueFaltan > HORIZONTE_MAXIMO_HORAS * 60) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Esa hora está muy lejos: se aparta para hoy, en las próximas horas.',
    );
  }

  if ((await enElHueco(tx, negocio, prometida)) >= CABEN_POR_HUECO) {
    throw new ErrorDominio(
      'CONFIGURACION_CONFLICTO',
      'A esa hora ya hay varios pedidos apartados. Elige otra, por favor.',
    );
  }

  const productos = await cargarProductosDelMenu(
    tx,
    organizacionId,
    entrada.items.map((i) => i.productoId),
  );
  for (const item of entrada.items) {
    const producto = productos.get(item.productoId);
    // Uno oculto, archivado o de otro negocio contesta igual que uno que no existe:
    // distinguirlos dejaría sondear el catálogo ajeno con identificadores.
    if (producto === undefined) {
      throw new ErrorDominio(
        'PRODUCTO_NO_ENCONTRADO',
        'Uno de los productos ya no está en el menú. Actualiza y vuelve a intentar.',
      );
    }
  }
  const hoyNoHay = await tx
    .selectFrom('productos')
    .select(['id'])
    .where('organizacion_id', '=', organizacionId)
    .where(
      'id',
      'in',
      entrada.items.map((i) => i.productoId),
    )
    .where('visible_en_pos', '=', false)
    .execute();
  if (hoyNoHay.length > 0) {
    throw new ErrorDominio(
      'PRODUCTO_NO_ENCONTRADO',
      'Uno de los productos hoy no hay. Quítalo del pedido y vuelve a intentar.',
    );
  }

  const orden = await tx
    .insertInto('ordenes')
    .values({
      organizacion_id: organizacionId,
      sucursal_id: sucursalId,
      // CONFIRMADA y no pagada: se cobra al recoger. `entregar_anticipado` lo exige.
      estado: 'confirmada',
      canal: 'anticipado',
      nombre_pedido: entrada.nombre,
      idempotency_key: idempotencyKey,
      created_at: ahora,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  let visual = 0;
  for (const item of entrada.items) {
    const producto = productos.get(item.productoId);
    if (producto === undefined) continue;
    visual += 1;
    const valorada = valorarParaPedido(producto.paraVender, String(item.cantidad));
    await tx
      .insertInto('orden_lineas')
      .values({
        organizacion_id: organizacionId,
        orden_id: orden.id,
        producto_id: producto.id,
        producto_nombre: producto.nombre,
        sku: producto.paraVender.sku,
        codigo_barras: producto.paraVender.codigoBarras,
        cantidad: valorada.cantidad,
        unidad: valorada.unidad,
        precio_unitario_centavos: valorada.precio.precioUnitarioCentavos,
        costo_unitario_centavos: producto.paraVender.costoUnitarioCentavos,
        subtotal_centavos: valorada.precio.subtotalCentavos,
        total_centavos: valorada.precio.subtotalCentavos,
        es_mayoreo: valorada.precio.esMayoreo,
        tipo_venta: producto.paraVender.tipoVenta,
        orden_visual: visual,
        estado_preparacion: 'pendiente',
        area_preparacion_snapshot: producto.areaPreparacion,
      })
      .execute();
  }

  // Los totales, con la MISMA cotización del cobro: lo que se dice aquí es lo que se
  // cobra en la barra.
  const { totales } = await cotizar(tx, organizacionId, orden.id);
  await tx
    .updateTable('ordenes')
    .set({
      subtotal_centavos: totales.subtotalCentavos,
      descuento_centavos: totales.descuentoCentavos,
      impuestos_centavos: totales.impuestosCentavos,
      total_centavos: totales.totalCentavos,
      costo_total_centavos: totales.costoTotalCentavos,
      utilidad_centavos: totales.utilidadCentavos,
      margen_bp: totales.margenBp,
      updated_at: ahora,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', orden.id)
    .execute();

  const pedido = await tx
    .insertInto('pedidos_anticipados')
    .values({
      organizacion_id: organizacionId,
      sucursal_id: sucursalId,
      orden_id: orden.id,
      nombre: entrada.nombre,
      telefono: entrada.telefono ?? null,
      hora_prometida: prometida,
      estado: 'programado',
      // Sin empleado: lo apartó la clienta desde su teléfono.
      empleado_id: null,
      created_at: ahora,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return {
    pedidoId: pedido.id,
    ordenId: orden.id,
    nombre: entrada.nombre,
    horaPrometida: prometida.toISOString(),
    totalCentavos: totales.totalCentavos.toString(),
  };
}

/** El apartado que ya nació con esta clave: el doble toque devuelve el mismo. */
async function apartadoConClave(
  tx: Transaccion,
  organizacionId: string,
  clave: string,
): Promise<ResultadoApartado | null> {
  const orden = await tx
    .selectFrom('ordenes')
    .select(['id', 'total_centavos'])
    .where('organizacion_id', '=', organizacionId)
    .where('idempotency_key', '=', clave)
    .executeTakeFirst();
  if (orden === undefined) return null;
  const pedido = await tx
    .selectFrom('pedidos_anticipados')
    .select(['id', 'nombre', 'hora_prometida'])
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', orden.id)
    .executeTakeFirst();
  if (pedido === undefined) return null;
  return {
    pedidoId: pedido.id,
    ordenId: orden.id,
    nombre: pedido.nombre,
    horaPrometida: pedido.hora_prometida.toISOString(),
    totalCentavos: String(orden.total_centavos),
  };
}

/** Cuántos apartados vivos hay en el hueco de cinco minutos de esa hora. */
async function enElHueco(
  tx: Transaccion,
  negocio: NegocioPublico,
  prometida: Date,
): Promise<number> {
  const ancho = MINUTOS_DEL_HUECO * MS_POR_MINUTO;
  const inicio = new Date(Math.floor(prometida.getTime() / ancho) * ancho);
  const fin = new Date(inicio.getTime() + ancho);
  const filas = await tx
    .selectFrom('pedidos_anticipados')
    .select(['id'])
    .where('organizacion_id', '=', negocio.organizacionId)
    .where('sucursal_id', '=', negocio.sucursalId)
    .where('estado', 'in', ['programado', 'en_fila'])
    .where('hora_prometida', '>=', inicio)
    .where('hora_prometida', '<', fin)
    .execute();
  return filas.length;
}
