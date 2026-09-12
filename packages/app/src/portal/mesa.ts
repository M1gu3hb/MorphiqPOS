import 'server-only';

import { ErrorDominio, PAQUETES_PORTAL } from '@morphiqpos/contracts';
import type { z } from 'zod';

import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
import { violaIndice } from './errores-sql.ts';
import { ORDEN_ACTIVA } from './estados.ts';
import { entradaAbrirMesa } from './esquemas.ts';
import { puedeOrdenarDesdeQR } from './negocio.ts';

/**
 * `portal.abrir_mesa` — el comensal abre su propia mesa (E7-3).
 *
 * ── Lo que sustituye ──────────────────────────────────────────────────────
 * `abrirMesaDesdeQR` (qrPedidoFlow.js:62-158) hace esto: consulta si hay venta
 * activa, crea la venta, **vuelve a consultar** por si alguien creó otra
 * mientras tanto, y si encuentra dos, cancela la perdedora con
 * `motivo_cancelacion: 'duplicado_apertura_qr'`. Es limpiar después en vez de
 * impedir antes, y es el defecto D-17.
 *
 * Aquí lo impide el índice único parcial `ordenes_una_activa_por_mesa` (§35.5).
 * Dos comensales tocando el botón a la vez: uno abre, el otro recibe
 * `MESA_YA_ABIERTA` y su transacción se revierte entera. Nadie cancela nada
 * porque nunca llegó a existir una segunda venta.
 *
 * ── Y por qué reutilizar no es un error ───────────────────────────────────
 * Si la mesa YA está abierta cuando llega la petición, se devuelve la venta que
 * hay con `reutilizada: true` en vez de fallar. Es la misma idempotencia
 * natural de `venta.crear_orden`: el comensal quiere estar sentado con la mesa
 * abierta, y ya lo está.
 */

export interface ResultadoAbrirMesa {
  readonly ventaId: string;
  readonly reutilizada: boolean;
}

export const abrirMesaDesdeQR = definirComandoPublico<typeof entradaAbrirMesa, ResultadoAbrirMesa>({
  nombre: 'portal.abrir_mesa',
  entidad: 'orden',
  accion: 'abrir_mesa',
  paquetes: PAQUETES_PORTAL,
  entrada: entradaAbrirMesa,
  async ejecutar(ctx, entrada) {
    const { ambito } = ctx;
    exigirPedidosDesdeElTelefono(ctx);

    const meseroId = ambito.empleadoAsignadoId;
    if (meseroId === null) {
      // `qrPedidoFlow.js:63`. Sin mesero asignado nadie recibiría el pedido, y
      // una mesa abierta que nadie atiende es peor que una mesa cerrada.
      throw new ErrorDominio(
        'QR_PORTAL_CERRADO',
        'Esta mesa todavía no tiene mesero asignado. Pide apoyo al personal.',
      );
    }

    const abierta = await ctx.paso('buscar_venta_activa', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select('id')
        .where('organizacion_id', '=', ambito.organizacionId)
        .where('mesa_id', '=', ambito.mesaId)
        .where('estado', 'in', ORDEN_ACTIVA)
        .executeTakeFirst(),
    );

    if (abierta !== undefined) {
      ctx.auditar({ entidadId: abierta.id, payload: { reutilizada: true } });
      return { ventaId: abierta.id, reutilizada: true };
    }

    const ordenId = await ctx.paso('abrir_venta', () => insertarOrden(ctx, entrada, meseroId));

    await ctx.paso('ocupar_mesa', () =>
      ctx.tx
        .updateTable('mesas')
        .set({
          estado: 'esperando_orden',
          orden_activa_id: ordenId,
          personas_actuales: entrada.personas,
          cliente_temporal: entrada.clienteNombre === '' ? null : entrada.clienteNombre,
          notas_alergias: entrada.notasAlergias === '' ? null : entrada.notasAlergias,
          celebracion_especial: entrada.celebracionEspecial,
          tipo_celebracion: entrada.tipoCelebracion === '' ? null : entrada.tipoCelebracion,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', ambito.organizacionId)
        .where('id', '=', ambito.mesaId)
        .execute(),
    );

    ctx.auditar({
      entidadId: ordenId,
      payload: { reutilizada: false, personas: entrada.personas, meseroId },
    });

    return { ventaId: ordenId, reutilizada: false };
  },
});

/**
 * Inserta la orden, traduciendo el choque del índice único.
 *
 * El `catch` traduce y **relanza de inmediato**: tras un 23505 la transacción
 * está abortada y cualquier otra sentencia fallaría. Aquí eso es lo correcto —
 * no hay nada que salvar, la mesa la abrió alguien más.
 */
async function insertarOrden(
  ctx: ContextoPortal,
  entrada: z.output<typeof entradaAbrirMesa>,
  meseroId: string,
): Promise<string> {
  const { ambito } = ctx;
  try {
    const fila = await ctx.tx
      .insertInto('ordenes')
      .values({
        organizacion_id: ambito.organizacionId,
        sucursal_id: ambito.sucursalId,
        // Sin terminal: el teléfono del comensal no es una caja. La
        // trazabilidad del origen la da `estrategia_captura`.
        terminal_id: null,
        estado: 'borrador',
        // `F1-04` §6.5: apertura desde QR es captura `qr` y cumplimiento
        // `preparacion`. Su `tipo_venta:'mesa'` se deriva de ahí al leer.
        estrategia_captura: 'qr',
        estrategia_cumplimiento: 'preparacion',
        mesa_id: ambito.mesaId,
        personas: entrada.personas,
        cliente_nombre: entrada.clienteNombre === '' ? null : entrada.clienteNombre,
        empleado_atiende_id: meseroId,
        notas: entrada.notas === '' ? null : entrada.notas,
        notas_alergias: entrada.notasAlergias === '' ? null : entrada.notasAlergias,
        celebracion_especial: entrada.celebracionEspecial,
        tipo_celebracion: entrada.tipoCelebracion === '' ? null : entrada.tipoCelebracion,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return fila.id;
  } catch (error) {
    if (violaIndice(error, 'ordenes_una_activa_por_mesa')) {
      throw new ErrorDominio(
        'MESA_YA_ABIERTA',
        'Esta mesa acaba de abrirse. Actualiza la pantalla para ver tu cuenta.',
      );
    }
    throw error;
  }
}

/** Las cuatro condiciones de `PortalCliente.jsx:261-266`, en el servidor. */
export function exigirPedidosDesdeElTelefono(ctx: ContextoPortal): void {
  if (puedeOrdenarDesdeQR(ctx.paquete, ctx.banderas)) return;
  throw new ErrorDominio(
    'QR_PORTAL_CERRADO',
    'Este negocio no acepta pedidos desde el teléfono. Llama al mesero.',
  );
}
