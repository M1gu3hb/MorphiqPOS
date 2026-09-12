import 'server-only';

import { ErrorDominio, PAQUETES_PORTAL } from '@morphiqpos/contracts';
import type { repoVentaCatalogo } from '@morphiqpos/data';

import { cotizar } from '../venta/cotizar.ts';
import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
import { enviarACocina, type ItemParaCocina } from './estaciones.ts';
import { entradaEnviarPedido } from './esquemas.ts';
import { exigirPedidosDesdeElTelefono } from './mesa.ts';
import { cargarProductosDelMenu, valorarParaPedido, type ProductoDelMenu } from './productos.ts';

/**
 * `portal.enviar_pedido` — lo que corrige D-17 de verdad (E7-3).
 *
 * ── EL PRECIO LO PONE EL SERVIDOR ─────────────────────────────────────────
 * `enviarPedidoQR` (qrPedidoFlow.js:271-300) toma `item.precio_venta` del
 * carrito del navegador y lo escribe en `DetalleVenta`, con su costo, su
 * utilidad y su margen calculados ahí mismo. Quien sepa abrir las herramientas
 * del navegador se pone la comida a un peso.
 *
 * Aquí el comensal manda `productoId` y `cantidad`. Nada más: el esquema es
 * estricto y una propiedad `precio` **rechaza la petición entera**. El importe
 * sale de `valorarLinea`, que es EXACTAMENTE la misma función que usa la venta
 * de mostrador. Si un día cambia la regla de precio, cambia en los dos sitios a
 * la vez porque es un solo sitio.
 *
 * ── Lo que este comando NO hace ───────────────────────────────────────────
 * No descuenta inventario. La regla 5 de `F1-01` §3 es explícita —el stock se
 * descuenta SÓLO al cobrar— y está declarada en el propio `qrPedidoFlow.js`.
 * Enviar a cocina no mueve almacén.
 */

export interface ResultadoPedido {
  readonly ventaId: string;
  readonly lineas: number;
  readonly comandas: number;
  /** Calculado en el servidor sobre las líneas ya persistidas. */
  readonly totalCentavos: string;
}

/** Con la cuenta pedida o cerrada ya no se agregan productos. */
const ESTADOS_SIN_AGREGAR: readonly string[] = ['cuenta_solicitada', 'pagada', 'cancelada'];

const ESTADOS_ACTIVOS = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

export const enviarPedidoDesdeQR = definirComandoPublico<
  typeof entradaEnviarPedido,
  ResultadoPedido
>({
  nombre: 'portal.enviar_pedido',
  entidad: 'orden',
  accion: 'enviar_pedido',
  paquetes: PAQUETES_PORTAL,
  entrada: entradaEnviarPedido,
  async ejecutar(ctx, entrada) {
    exigirPedidosDesdeElTelefono(ctx);

    const orden = await ctx.paso('cargar_venta', () => ordenAbiertaDeLaMesa(ctx));

    const productos = await ctx.paso('cargar_menu', () =>
      cargarProductosDelMenu(
        ctx.tx,
        ctx.ambito.organizacionId,
        entrada.items.map((i) => i.productoId),
      ),
    );

    const visual = await siguienteOrdenVisual(ctx, orden.id);
    const paraCocina: ItemParaCocina[] = [];

    let indice = 0;
    for (const item of entrada.items) {
      indice += 1;
      const producto = productos.get(item.productoId);
      // Un producto de otra organización, archivado, u oculto del menú digital
      // responde igual que uno inexistente: distinguirlos dejaría sondear el
      // catálogo ajeno con identificadores.
      if (producto === undefined) {
        throw new ErrorDominio(
          'PRODUCTO_NO_ENCONTRADO',
          'Uno de los productos ya no está disponible. Actualiza el menú y vuelve a intentar.',
        );
      }

      const lineaId = await ctx.paso(`insertar_linea_${indice.toString()}`, () =>
        insertarLinea(ctx, orden.id, producto, item, visual + indice),
      );

      paraCocina.push({
        ordenLineaId: lineaId,
        productoId: producto.id,
        productoNombre: producto.nombre,
        cantidad: item.cantidad,
        notas: item.notas,
        tipoVenta: producto.tipoVenta,
        categoriaId: producto.categoriaId,
        areaPreparacion: producto.areaPreparacion,
      });
    }

    // Los totales se recalculan sobre TODAS las líneas ya persistidas, no sobre
    // las que acaban de entrar: la mesa pudo pedir dos veces y el total es el
    // de la cuenta entera. Es la misma `cotizar` del cobro.
    const { totales } = await ctx.paso('recalcular_totales', () =>
      cotizar(ctx.tx, ctx.ambito.organizacionId, orden.id),
    );

    await ctx.paso('confirmar_venta', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          estado: 'confirmada',
          subtotal_centavos: totales.subtotalCentavos,
          descuento_centavos: totales.descuentoCentavos,
          impuestos_centavos: totales.impuestosCentavos,
          total_centavos: totales.totalCentavos,
          costo_total_centavos: totales.costoTotalCentavos,
          utilidad_centavos: totales.utilidadCentavos,
          margen_bp: totales.margenBp,
          version: orden.version + 1,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', orden.id)
        .execute(),
    );

    const comandas = await ctx.paso('enviar_a_cocina', () =>
      enviarACocina(
        ctx,
        {
          ordenId: orden.id,
          notasAlergias: orden.notas_alergias,
          celebracionEspecial: orden.celebracion_especial,
          tipoCelebracion: orden.tipo_celebracion,
          notas: entrada.notaGeneral,
        },
        paraCocina,
      ),
    );

    await ctx.paso('marcar_mesa', () =>
      ctx.tx
        .updateTable('mesas')
        .set({ estado: 'pedido_enviado', updated_at: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', ctx.ambito.mesaId)
        .execute(),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        lineas: paraCocina.length,
        comandas,
        totalCentavos: totales.totalCentavos.toString(),
      },
    });

    return {
      ventaId: orden.id,
      lineas: paraCocina.length,
      comandas,
      totalCentavos: totales.totalCentavos.toString(),
    };
  },
});

interface OrdenAbierta {
  readonly id: string;
  readonly estado: string;
  readonly version: number;
  readonly notas_alergias: string | null;
  readonly celebracion_especial: boolean;
  readonly tipo_celebracion: string | null;
}

async function ordenAbiertaDeLaMesa(ctx: ContextoPortal): Promise<OrdenAbierta> {
  const orden = await ctx.tx
    .selectFrom('ordenes')
    .select([
      'id',
      'estado',
      'version',
      'notas_alergias',
      'celebracion_especial',
      'tipo_celebracion',
    ])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('estado', 'in', ESTADOS_ACTIVOS)
    .executeTakeFirst();

  if (orden === undefined) {
    throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Abre la mesa antes de pedir.');
  }
  if (ESTADOS_SIN_AGREGAR.includes(orden.estado)) {
    throw new ErrorDominio(
      'ORDEN_NO_EDITABLE',
      'La cuenta ya fue solicitada para esta mesa. Llama al mesero si necesitas algo más.',
      { estado: orden.estado },
    );
  }
  return orden;
}

async function siguienteOrdenVisual(ctx: ContextoPortal, ordenId: string): Promise<number> {
  const fila = await ctx.tx
    .selectFrom('orden_lineas')
    .select((eb) => eb.fn.max('orden_visual').as('maximo'))
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('orden_id', '=', ordenId)
    .executeTakeFirst();

  return fila?.maximo ?? 0;
}

/**
 * Escribe la línea con el precio del CATÁLOGO.
 *
 * `valorarLinea` traduce la fila de `productos` al contrato del dominio y
 * aplica la regla del tipo de venta: precio fijo por cantidad, variable por
 * medida con sus mínimos e incrementos, o porción de contenedor. Es la misma
 * traducción que usa el mostrador, así que un capuchino cuesta lo mismo si lo
 * pide el mesero o si lo pide el comensal desde su teléfono.
 */
async function insertarLinea(
  ctx: ContextoPortal,
  ordenId: string,
  producto: ProductoDelMenu,
  item: { readonly cantidad: string; readonly notas: string },
  ordenVisual: number,
): Promise<string> {
  const paraPrecio: repoVentaCatalogo.ProductoParaVender = producto.paraVender;
  const valorada = valorarParaPedido(paraPrecio, item.cantidad);

  const fila = await ctx.tx
    .insertInto('orden_lineas')
    .values({
      organizacion_id: ctx.ambito.organizacionId,
      orden_id: ordenId,
      producto_id: producto.id,
      producto_nombre: producto.nombre,
      sku: paraPrecio.sku,
      codigo_barras: paraPrecio.codigoBarras,
      cantidad: valorada.cantidad,
      unidad: valorada.unidad,
      precio_unitario_centavos: valorada.precio.precioUnitarioCentavos,
      costo_unitario_centavos: paraPrecio.costoUnitarioCentavos,
      subtotal_centavos: valorada.precio.subtotalCentavos,
      total_centavos: valorada.precio.subtotalCentavos,
      es_mayoreo: valorada.precio.esMayoreo,
      tipo_venta: paraPrecio.tipoVenta,
      notas: item.notas === '' ? null : item.notas,
      orden_visual: ordenVisual,
      estado_preparacion: 'pendiente',
      // Instantánea fiel: la columna admite los cuatro valores del producto
      // (`cocina`, `barra`, `ambos`, `ninguno`). Colapsarla aquí perdería el
      // dato justo cuando alguien reimprima el ticket seis meses después.
      area_preparacion_snapshot: producto.areaPreparacion,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return fila.id;
}
