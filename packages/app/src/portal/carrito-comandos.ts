import 'server-only';

import { ErrorDominio, PAQUETES_PORTAL } from '@morphiqpos/contracts';

import {
  MAXIMO_EN_EL_CARRITO,
  entradaAgregarAlCarrito,
  entradaEnviarElCarrito,
  entradaQuitarDelCarrito,
  estadoDelCarrito,
  huellaDelDispositivo,
  latir,
  type EstadoDelCarrito,
} from './carrito.ts';
import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
import { exigirPedidosDesdeElTelefono } from './mesa.ts';
import { ordenAbiertaDeLaMesa, pedirEnLaMesa, type ResultadoPedido } from './pedido.ts';
import { cargarProductosDelMenu } from './productos.ts';

/**
 * LOS TRES COMANDOS DEL CARRITO COMPARTIDO (DP-9.5): agregar, quitar lo propio y enviar.
 *
 * Los tres leen la cuenta de la mesa CON CANDADO (`ordenAbiertaDeLaMesa`), como el pedido de
 * siempre y el cobro: dos «Enviar» a la vez se forman, el segundo espera al primero y encuentra
 * el carrito vacío. Un pedido, no dos (R10).
 */

function huellaDe(ctx: ContextoPortal, dispositivo: string): string {
  return huellaDelDispositivo(ctx.pimienta, dispositivo);
}

async function lineasPendientes(ctx: ContextoPortal, desde: Date) {
  return ctx.tx
    .selectFrom('carrito_mesa_lineas')
    .select(['id', 'producto_id', 'cantidad', 'notas'])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('created_at', '>=', desde)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
}

export const agregarAlCarrito = definirComandoPublico<
  typeof entradaAgregarAlCarrito,
  EstadoDelCarrito
>({
  nombre: 'portal.carrito_agregar',
  entidad: 'mesa',
  accion: 'carrito',
  paquetes: PAQUETES_PORTAL,
  entrada: entradaAgregarAlCarrito,
  async ejecutar(ctx, entrada) {
    exigirPedidosDesdeElTelefono(ctx);
    const huella = huellaDe(ctx, entrada.dispositivo);
    const orden = await ctx.paso('cargar_venta', () => ordenAbiertaDeLaMesa(ctx));

    const productos = await ctx.paso('cargar_menu', () =>
      cargarProductosDelMenu(ctx.tx, ctx.ambito.organizacionId, [entrada.item.productoId]),
    );
    if (!productos.has(entrada.item.productoId)) {
      throw new ErrorDominio(
        'PRODUCTO_NO_ENCONTRADO',
        'Ese producto ya no está disponible. Actualiza el menú y vuelve a intentar.',
      );
    }

    // Lo que quedó de una cuenta anterior ya no es de nadie: se va antes de contar.
    await ctx.paso('olvidar_lo_viejo', () =>
      ctx.tx
        .deleteFrom('carrito_mesa_lineas')
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('mesa_id', '=', ctx.ambito.mesaId)
        .where('created_at', '<', orden.created_at)
        .execute(),
    );
    const hay = await lineasPendientes(ctx, orden.created_at);
    if (hay.length >= MAXIMO_EN_EL_CARRITO) {
      throw new ErrorDominio(
        'QR_CARRITO_LLENO',
        `El carrito de la mesa ya tiene ${String(MAXIMO_EN_EL_CARRITO)} cosas: envíenlo y sigan pidiendo.`,
      );
    }

    const linea = await ctx.paso('agregar', () =>
      ctx.tx
        .insertInto('carrito_mesa_lineas')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          mesa_id: ctx.ambito.mesaId,
          dispositivo_huella: huella,
          producto_id: entrada.item.productoId,
          cantidad: entrada.item.cantidad,
          notas: entrada.item.notas,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );
    await ctx.paso('latir', () => latir(ctx.tx, ctx.ambito, huella, ctx.ahora));

    ctx.auditar({
      entidadId: ctx.ambito.mesaId,
      payload: { lineaId: linea.id, productoId: entrada.item.productoId },
    });
    return estadoDelCarrito(ctx.tx, ctx.ambito, huella, {
      desde: orden.created_at,
      ahora: ctx.ahora,
    });
  },
});

export const quitarDelCarrito = definirComandoPublico<
  typeof entradaQuitarDelCarrito,
  EstadoDelCarrito
>({
  nombre: 'portal.carrito_quitar',
  entidad: 'mesa',
  accion: 'carrito',
  paquetes: PAQUETES_PORTAL,
  entrada: entradaQuitarDelCarrito,
  async ejecutar(ctx, entrada) {
    exigirPedidosDesdeElTelefono(ctx);
    const huella = huellaDe(ctx, entrada.dispositivo);
    const orden = await ctx.paso('cargar_venta', () => ordenAbiertaDeLaMesa(ctx));

    // Sólo la suya: la de otro teléfono responde igual que una que ya no está.
    const quitada = await ctx.paso('quitar', () =>
      ctx.tx
        .deleteFrom('carrito_mesa_lineas')
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('mesa_id', '=', ctx.ambito.mesaId)
        .where('id', '=', entrada.lineaId)
        .where('dispositivo_huella', '=', huella)
        .returning('id')
        .executeTakeFirst(),
    );
    if (quitada === undefined) {
      throw new ErrorDominio(
        'QR_LINEA_AJENA',
        'Eso lo agregó otro teléfono (o ya no está): sólo quien lo agregó lo quita.',
      );
    }

    ctx.auditar({ entidadId: ctx.ambito.mesaId, payload: { lineaId: entrada.lineaId } });
    return estadoDelCarrito(ctx.tx, ctx.ambito, huella, {
      desde: orden.created_at,
      ahora: ctx.ahora,
    });
  },
});

export interface ResultadoDelEnvio {
  /** `false`: otro teléfono lo mandó primero y aquí ya no había nada que enviar. */
  readonly enviado: boolean;
  readonly ronda: number;
  readonly pedido: ResultadoPedido | null;
}

export const enviarElCarrito = definirComandoPublico<
  typeof entradaEnviarElCarrito,
  ResultadoDelEnvio
>({
  nombre: 'portal.carrito_enviar',
  entidad: 'orden',
  accion: 'enviar_pedido',
  paquetes: PAQUETES_PORTAL,
  entrada: entradaEnviarElCarrito,
  async ejecutar(ctx, entrada) {
    exigirPedidosDesdeElTelefono(ctx);
    const huella = huellaDe(ctx, entrada.dispositivo);
    const { organizacionId, mesaId } = ctx.ambito;

    // La cuenta, con su candado: si la caja la cierra mientras tanto, aquí se espera y se dice.
    const orden = await ctx.paso('cargar_venta', () => ordenAbiertaDeLaMesa(ctx));
    await ctx.paso('fila_del_carrito', () =>
      ctx.tx
        .insertInto('carritos_mesa')
        .values({ organizacion_id: organizacionId, mesa_id: mesaId })
        .onConflict((oc) => oc.columns(['organizacion_id', 'mesa_id']).doNothing())
        .execute(),
    );
    // EL CANDADO del envío: el segundo «Enviar» espera aquí y, cuando pasa, el carrito ya está
    // vacío.
    const antes = await ctx.tx
      .selectFrom('carritos_mesa')
      .select('ronda')
      .where('organizacion_id', '=', organizacionId)
      .where('mesa_id', '=', mesaId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    const lineas = await lineasPendientes(ctx, orden.created_at);
    if (lineas.length === 0) {
      ctx.auditar({ entidadId: orden.id, payload: { enviado: false, ronda: antes.ronda } });
      return { enviado: false, ronda: antes.ronda, pedido: null };
    }

    const estado = await estadoDelCarrito(ctx.tx, ctx.ambito, huella, {
      desde: orden.created_at,
      ahora: ctx.ahora,
    });
    if (estado.esperarATodos && !entrada.confirmado) {
      throw new ErrorDominio(
        'QR_CARRITO_SIN_CONFIRMAR',
        '¿Ya pidieron todos? Confirma para mandar el pedido completo.',
      );
    }

    const pedido = await pedirEnLaMesa(
      ctx,
      orden,
      lineas.map((l) => ({ productoId: l.producto_id, cantidad: l.cantidad, notas: l.notas })),
      entrada.notaGeneral,
    );

    await ctx.paso('vaciar', () =>
      ctx.tx
        .deleteFrom('carrito_mesa_lineas')
        .where('organizacion_id', '=', organizacionId)
        .where(
          'id',
          'in',
          lineas.map((l) => l.id),
        )
        .execute(),
    );
    const ronda = antes.ronda + 1;
    await ctx.paso('subir_la_ronda', () =>
      ctx.tx
        .updateTable('carritos_mesa')
        .set({ ronda, enviado_en: ctx.ahora, enviado_por_huella: huella })
        .where('organizacion_id', '=', organizacionId)
        .where('mesa_id', '=', mesaId)
        .execute(),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        enviado: true,
        ronda,
        lineas: pedido.lineas,
        comandas: pedido.comandas,
        totalCentavos: pedido.totalCentavos,
      },
    });
    return { enviado: true, ronda, pedido };
  },
});
