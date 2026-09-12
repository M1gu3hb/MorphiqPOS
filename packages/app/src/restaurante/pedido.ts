import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoOrdenes } from '@morphiqpos/data';
import type { TotalesOrden } from '@morphiqpos/domain/venta';
import type { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { cotizar } from '../venta/cotizar.ts';
import { estacionesActivas, mesaOperable, ordenDeMesa } from './datos.ts';
import { productosDeComanda } from './catalogo-comanda.ts';
import { insertarComandas, insertarItems } from './comandas.ts';
import { agruparEnComandas, resolverEstacion } from './estaciones.ts';
import { entradaEnviarPedido } from './esquemas.ts';
import { insertarLineas, prepararLinea, type LineaPreparada } from './lineas.ts';
import { mesaTrasComanda, type EstadoMesa } from './transiciones.ts';

/**
 * `restaurante.enviar_pedido` — E6-4, el comando más importante del módulo.
 *
 * UNA transacción escribe los cuatro efectos: las líneas de venta con sus
 * instantáneas, la comanda o comandas, sus `comanda_items` apuntando a la línea
 * con `orden_linea_id`, y el estado de preparación de las líneas. **Si una
 * línea falla, falla todo.**
 *
 * ── Los dos defectos que esto cierra ───────────────────────────────────────
 * D-05, los «detalles shadow»: hoy `Mesero.jsx:560-562` conserva en memoria el
 * objeto de la línea que NO se pudo crear y lo usa para sumar el total, así que
 * la cuenta enseña productos que no existen en la base. Aquí el item de cocina
 * y la línea de venta son la misma transacción: o están las dos o no está
 * ninguna, y no hay objeto en memoria del que tirar.
 *
 * `POS.jsx:462`: el `create` del pedido de cocina lleva un `.catch(() => {})`
 * encima. El pedido no llega a cocina y nadie se entera hasta que el comensal
 * pregunta. Aquí no hay nada que tragarse: el fallo revierte la transacción y
 * sube con un mensaje que el mesero entiende.
 *
 * ── Lo que este comando NO hace ────────────────────────────────────────────
 * No toca el inventario. Regla 5 de `F1-01` §3: «el inventario se descuenta
 * SÓLO al cobrar». Enviar a cocina no descuenta nada, ni siquiera reserva.
 */

const ROLES_DE_SALA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Estados de orden a los que todavía se les puede añadir un tiempo más. */
const ORDEN_ADMITE_PEDIDO = ['borrador', 'confirmada'] as const;

export interface ComandaEmitida {
  readonly id: string;
  readonly area: string;
  readonly estacionId: string;
  readonly estacionNombre: string;
  readonly items: number;
}

export interface ResultadoEnviarPedido {
  readonly ordenId: string;
  readonly lineas: number;
  readonly comandas: readonly ComandaEmitida[];
  /** El total lo calcula el servidor sobre las líneas que acaba de escribir. */
  readonly totalCentavos: string;
}

export const enviarPedido = definirComando<
  Transaccion,
  typeof entradaEnviarPedido,
  ResultadoEnviarPedido
>({
  nombre: 'restaurante.enviar_pedido',
  entidad: 'comanda',
  escribe: true,
  roles: [...ROLES_DE_SALA],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaEnviarPedido,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ordenDeMesa(ctx.tx, organizacionId, entrada.ordenId),
    );
    if (!(ORDEN_ADMITE_PEDIDO as readonly string[]).includes(orden.estado)) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya se cerró; no se le pueden mandar más platos.',
        { estado: orden.estado },
      );
    }

    // El precio sale del catálogo DENTRO de esta transacción. El endpoint no
    // recibe importes: si los recibiera, quien llama elegiría lo que paga.
    const preparadas = await ctx.paso('valorar_lineas', () =>
      prepararTodas(ctx.tx, organizacionId, entrada),
    );

    await ctx.paso('escribir_lineas', () =>
      insertarLineas(ctx.tx, organizacionId, entrada.ordenId, preparadas),
    );

    const grupos = agruparEnComandas(preparadas);
    const comandas = grupos.map((grupo) => ({ id: crypto.randomUUID(), grupo }));

    if (comandas.length > 0) {
      await ctx.paso('escribir_comandas', () =>
        insertarComandas(ctx.tx, {
          organizacionId,
          orden,
          notas: entrada.notas ?? null,
          comandas,
        }),
      );
      await ctx.paso('escribir_items', () => insertarItems(ctx.tx, organizacionId, comandas));
    }

    // Los totales se recalculan sobre las líneas persistidas, no sobre lo que
    // trajo la pantalla. Es lo que hace innecesario el rescate de totales en
    // cero de `ventaTotales.js` antes de la precuenta (F1-01 §4).
    const { totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, organizacionId, entrada.ordenId),
    );
    await ctx.paso('confirmar_orden', () =>
      confirmarOrden(ctx.tx, organizacionId, entrada.ordenId, totales),
    );

    const mesaId = orden.mesaId;
    if (mesaId !== null) {
      await ctx.paso('avanzar_mesa', () =>
        avanzarMesa(ctx.tx, organizacionId, mesaId, comandas.length > 0),
      );
    }

    const emitidas = comandas.map(({ id, grupo }) => ({
      id,
      area: grupo.area,
      estacionId: grupo.estacion.id,
      estacionNombre: grupo.estacion.nombre,
      items: grupo.lineas.length,
    }));

    ctx.auditar({
      entidadId: entrada.ordenId,
      payload: {
        lineas: preparadas.length,
        comandas: emitidas.length,
        estaciones: emitidas.map((c) => c.estacionNombre),
        totalCentavos: totales.totalCentavos.toString(),
      },
    });

    return {
      ordenId: entrada.ordenId,
      lineas: preparadas.length,
      comandas: emitidas,
      totalCentavos: totales.totalCentavos.toString(),
    };
  },
});

type EntradaPedido = z.output<typeof entradaEnviarPedido>;

/**
 * Valora todas las líneas contra el catálogo antes de escribir ninguna.
 *
 * Todo o nada, y por eso la valoración va primero: si el tercer plato no
 * existe, no se ha escrito el primero y no hay nada que deshacer a mano.
 */
async function prepararTodas(
  tx: Transaccion,
  organizacionId: string,
  entrada: EntradaPedido,
): Promise<readonly LineaPreparada[]> {
  const [productos, estaciones, visualInicial] = await Promise.all([
    productosDeComanda(
      tx,
      organizacionId,
      entrada.lineas.map((l) => l.productoId),
    ),
    estacionesActivas(tx, organizacionId),
    repoOrdenes.siguienteOrdenVisual(tx, organizacionId, entrada.ordenId),
  ]);

  return entrada.lineas.map((capturada, indice) => {
    const producto = productos.get(capturada.productoId);
    if (producto === undefined) {
      throw new ErrorDominio(
        'PRODUCTO_NO_ENCONTRADO',
        'Uno de los productos del pedido ya no está disponible. Quítalo y vuelve a enviar.',
        { productoId: capturada.productoId },
      );
    }
    return prepararLinea(
      capturada,
      producto,
      resolverEstacion(producto.estacionDeCategoriaId, estaciones),
      visualInicial + indice,
    );
  });
}

async function confirmarOrden(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
  totales: TotalesOrden,
): Promise<void> {
  const resultado = await tx
    .updateTable('ordenes')
    .set({
      // `Venta.estado = 'enviada'` es `ordenes.estado = 'confirmada'` (F1-04 §6.6).
      estado: 'confirmada',
      subtotal_centavos: totales.subtotalCentavos,
      descuento_centavos: totales.descuentoCentavos,
      impuestos_centavos: totales.impuestosCentavos,
      // REGLA 1: la venta SIN propina. La propina vive en `pagos`, en otra
      // tabla, y por eso no cabe aquí.
      total_centavos: totales.totalCentavos,
      costo_total_centavos: totales.costoTotalCentavos,
      utilidad_centavos: totales.utilidadCentavos,
      margen_bp: totales.margenBp,
    })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', ordenId)
    // El `where` de estado es lo que impide que dos envíos simultáneos escriban
    // totales sobre una cuenta que un tercero acaba de cobrar.
    .where('estado', 'in', [...ORDEN_ADMITE_PEDIDO])
    .executeTakeFirst();

  if (Number(resultado.numUpdatedRows) !== 1) {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'Esa cuenta cambió mientras se enviaba el pedido. Revísala antes de reintentar.',
    );
  }
}

async function avanzarMesa(
  tx: Transaccion,
  organizacionId: string,
  mesaId: string,
  hayComandas: boolean,
): Promise<void> {
  const mesa = await mesaOperable(tx, organizacionId, mesaId);
  // `nuevo` es el estado con el que nace la comanda; la tabla de F1-04 §8.2 lo
  // traduce a `pedido_enviado`, y devuelve `null` si la mesa ya está en un
  // estado que la cocina no manda (cuenta solicitada, pagada…).
  const destino = hayComandas
    ? mesaTrasComanda(mesa.estado, 'nuevo', false)
    : mesaSinComanda(mesa.estado);
  if (destino === null) return;

  await tx
    .updateTable('mesas')
    .set({ estado: destino })
    .where('organizacion_id', '=', organizacionId)
    .where('id', '=', mesaId)
    .execute();
}

/**
 * A dónde va la mesa cuando el pedido NO generó ninguna comanda.
 *
 * Dos refrescos de botella tienen `area_preparacion='ninguno'`: `areasDe`
 * devuelve `[]`, `agruparEnComandas` no produce ningún grupo y no se inserta ni
 * una fila en `comandas`. Anunciar «pedido enviado» ahí era mentir sobre el
 * salón: ninguna pantalla de cocina veía esa mesa, así que ningún evento de
 * cocina la sacaba nunca de ese estado — sólo `solicitar_cuenta`.
 *
 * Se avanza únicamente desde `esperando_orden`, que es el único hecho nuevo que
 * hay: la mesa ya consumió algo. Desde cualquier otro estado se deja quieta,
 * porque un pedido de sólo bebidas no puede devolver a `ocupada` una mesa que
 * está `en_preparacion` con otros platos en el fuego.
 */
function mesaSinComanda(estado: EstadoMesa): EstadoMesa | null {
  return estado === 'esperando_orden' ? 'ocupada' : null;
}
