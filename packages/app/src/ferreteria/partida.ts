import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoOrdenes, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { ejecutarAgregarLinea } from '../venta/carrito.ts';

/**
 * `ferreteria.agregar_partida` — poner la pieza de la ficha EN LA VENTA (F-061).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `ferreteria/FichaDePieza.tsx` tiene el botón AGREGAR A LA VENTA y publicaba en
 * `/api/ferreteria/agregar-partida`, **una ruta que no existía**: se resolvía la
 * duda del cliente —la medida, el equivalente, la ubicación— y después había que
 * volver al mostrador y teclear la pieza otra vez. Diez a veinticinco veces al
 * día, con el cliente enfrente.
 *
 * ── Por qué NO manda `ordenId`, y por qué eso es lo correcto ─────────────
 * `venta.agregar_linea` pide la orden, y la ficha no tiene ninguna: se llega a
 * ella desde la búsqueda del mostrador, no desde el carrito. La orden es la de
 * ESTA TERMINAL, y la terminal sale de la sesión: pedirle a la pantalla que
 * cargue primero el borrador para poder mandarlo sería un viaje de ida y vuelta
 * para averiguar algo que el servidor ya sabe.
 *
 * Y si no hay borrador, se abre. Es la misma regla que `venta.crear_orden`: el
 * carrito ES la orden en borrador, y el índice parcial
 * `ordenes_borrador_por_terminal` garantiza que no haya dos.
 */

const MOSTRADOR = ['cajero', 'mesero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAgregarPartida = z.object({
  piezaId: z.uuid(),
  /** Como TEXTO: quien convierte cantidades es el servidor. */
  cantidad: z
    .string()
    .regex(/^\d{1,10}(\.\d{1,4})?$/, 'La cantidad va con hasta cuatro decimales.'),
  /** «pieza», «caja», «kilo»: la forma en que se está vendiendo esta partida. */
  unidad: z.string().trim().min(1).max(10).optional(),
  /**
   * La PRESENTACIÓN que se vende —la caja de 500—, cuando no es la base. La línea dice
   * «1 caja (500 pz)», lleva el precio de la caja y descuenta 500 (F-147). Sin esto la
   * ficha comparaba la caja y sólo dejaba vender piezas (C.10 de la 2.4).
   */
  presentacionId: z.uuid().optional(),
});

export interface ResultadoPartida {
  readonly ordenId: string;
  readonly lineaId: string;
  readonly subtotalCentavos: string;
  /** `true` cuando la venta se abrió aquí: la ficha puede decirlo. */
  readonly ventaNueva: boolean;
}

export const agregarPartida = definirComando<
  Transaccion,
  typeof entradaAgregarPartida,
  ResultadoPartida
>({
  nombre: 'ferreteria.agregar_partida',
  entidad: 'orden',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaAgregarPartida,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, terminalId, empleoId } = ctx.ambito;
    if (sucursalId === null || terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Para vender hace falta una terminal dada de alta en una sucursal.',
      );
    }

    const abierta = await ctx.paso('buscar_borrador', () =>
      repoOrdenes.borradorDeTerminal(ctx.tx, organizacionId, terminalId),
    );

    const ordenId =
      abierta?.id ??
      (await ctx.paso('crear_borrador', () =>
        repoOrdenes.crearBorrador(ctx.tx, {
          organizacionId,
          sucursalId,
          terminalId,
          empleadoAtiendeId: empleoId,
          sesionCajaId: null,
        }),
      ));

    const puesta = await ejecutarAgregarLinea(ctx, ordenId, {
      productoId: entrada.piezaId,
      cantidad: entrada.cantidad,
      ...(entrada.unidad === undefined ? {} : { unidad: entrada.unidad }),
      ...(entrada.presentacionId === undefined ? {} : { presentacionId: entrada.presentacionId }),
    });

    ctx.auditar({
      entidadId: ordenId,
      payload: {
        lineaId: puesta.lineaId,
        piezaId: entrada.piezaId,
        cantidad: puesta.cantidad,
        ventaNueva: abierta === null,
      },
    });

    return {
      ordenId,
      lineaId: puesta.lineaId,
      subtotalCentavos: puesta.subtotalCentavos,
      ventaNueva: abierta === null,
    };
  },
});
