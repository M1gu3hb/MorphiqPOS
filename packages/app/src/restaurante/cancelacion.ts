import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { definirComando } from '../definicion.ts';
import { ordenDeMesa } from './datos.ts';
import { entradaCancelarOrden } from './esquemas.ts';
import { cerrarOrdenCancelada, limpiarMesa } from './mesas-escrituras.ts';
import { propagarAItems } from './propagacion.ts';
import { ESTADOS_COMANDA_ACTIVOS } from './transiciones.ts';

/**
 * `restaurante.cancelar_orden` — la salida que no existía.
 *
 * ── El agujero que cierra ──────────────────────────────────────────────────
 * Antes de este comando, una cuenta de mesa con líneas NO TENÍA NINGUNA SALIDA
 * salvo cobrarla. Cancelar sólo existía dentro de `liberar_mesa`, y únicamente
 * para la orden VACÍA (`mesas-escrituras.ts`, `cancelarOrdenVacia`). Así que la
 * mesa del cliente que se levanta y se va sin pagar —o el pedido capturado en
 * la mesa equivocada, o la comanda que la cocina no puede sacar— se quedaba
 * clavada: `ordenes_una_activa_por_mesa` impedía abrir otra cuenta en ella y
 * `liberar_mesa` respondía MESA_NO_LIBERABLE. La mesa salía de servicio hasta
 * que alguien ejecutara SQL a mano.
 *
 * ── Por qué no lo hace `liberar_mesa` ──────────────────────────────────────
 * Porque son dos decisiones distintas y con distinto peso. Liberar una mesa sin
 * consumo no cuesta dinero; anular una cuenta con consumo hace desaparecer una
 * venta del corte. Fundirlos convertiría el botón «mesa limpia» del mesero en
 * un anulador silencioso de ventas, que es exactamente lo que `MESA_NO_LIBERABLE`
 * existe para impedir. Aquí hay rol propio y motivo obligatorio.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No toca el inventario ni la caja. El inventario se descuenta SÓLO al cobrar
 * (regla 5 de `F1-01` §3), así que una cuenta que nunca se cobró no tiene nada
 * que devolver. Tampoco borra las líneas: la orden cancelada conserva lo que se
 * capturó, que es lo que permite auditar después qué se anuló y por qué.
 */

/**
 * Cancelar una cuenta con consumo es una decisión de CAJA, no de sala.
 *
 * El mesero queda fuera a propósito: es quien tiene el incentivo más directo
 * para hacer desaparecer una cuenta —la suya— y el mensaje de
 * `MESA_NO_LIBERABLE` ya lo manda al sitio correcto («cóbrala o cancélala en
 * Caja»). Sale de `ctx.ambito.rol`, de la sesión del servidor, nunca del cuerpo
 * (D-03: las cinco funciones de la fuente autorizaban con un string del body).
 */
const ROLES_DE_CANCELACION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export interface ResultadoCancelacion {
  readonly ordenId: string;
  readonly mesaId: string | null;
  readonly mesaLiberada: boolean;
  readonly comandasCanceladas: number;
  /** `true` cuando ya estaba cancelada: el segundo toque no es un error. */
  readonly yaEstabaCancelada: boolean;
}

export const cancelarOrden = definirComando<
  Transaccion,
  typeof entradaCancelarOrden,
  ResultadoCancelacion
>({
  nombre: 'restaurante.cancelar_orden',
  entidad: 'orden',
  escribe: true,
  roles: [...ROLES_DE_CANCELACION],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaCancelarOrden,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const orden = await ctx.paso('cargar_orden', () =>
      ordenDeMesa(ctx.tx, organizacionId, entrada.ordenId),
    );

    // Dos toques al mismo botón describen el mismo hecho. Fallarle al segundo
    // dejaría al cajero sin saber si el primero funcionó.
    if (orden.estado === 'cancelada') {
      ctx.auditar({ entidadId: orden.id, payload: { yaEstabaCancelada: true } });
      return {
        ordenId: orden.id,
        mesaId: orden.mesaId,
        mesaLiberada: false,
        comandasCanceladas: 0,
        yaEstabaCancelada: true,
      };
    }

    if (orden.estado === 'pagada') {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta ya se cobró: un cobro se devuelve con un reembolso, no se cancela.',
        { estado: orden.estado },
      );
    }

    const comandas = await ctx.paso('cancelar_comandas', () =>
      cancelarComandasVivas(ctx.tx, organizacionId, orden.id),
    );
    if (comandas.length > 0) {
      await ctx.paso('cancelar_items', () =>
        propagarAItems(ctx.tx, organizacionId, comandas, 'cancelado'),
      );
    }

    // Todas las líneas, no sólo las que tenían comanda: un refresco de botella
    // no genera comanda (`area_preparacion='ninguno'`) y sigue siendo consumo
    // capturado que deja de estar pendiente de preparar.
    await ctx.paso('cancelar_lineas', () => cancelarLineas(ctx.tx, organizacionId, orden.id));

    const filas = await ctx.paso('cerrar_orden', () =>
      cerrarOrdenCancelada(ctx.tx, {
        organizacionId,
        ordenId: orden.id,
        motivo: entrada.motivo,
        empleoId,
        ahora: ctx.ahora,
      }),
    );
    if (filas !== 1) {
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa cuenta cambió mientras se cancelaba: alguien la cobró o la canceló antes. Revísala.',
      );
    }

    // LO QUE DEVUELVE LA MESA AL SERVICIO. Va en la MISMA transacción que el
    // cierre de la orden: si se hicieran aparte y fallara la segunda, quedaría
    // la mesa apuntando con `orden_activa_id` a una orden cancelada — el estado
    // imposible que `detectarHuerfano` busca hoy con cuatro reglas heurísticas.
    const mesaId = orden.mesaId;
    if (mesaId !== null) {
      await ctx.paso('liberar_mesa', () => limpiarMesa(ctx.tx, organizacionId, mesaId));
    }

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        motivo: entrada.motivo,
        estadoPrevio: orden.estado,
        comandasCanceladas: comandas.length,
        mesaId,
      },
    });

    return {
      ordenId: orden.id,
      mesaId,
      mesaLiberada: mesaId !== null,
      comandasCanceladas: comandas.length,
      yaEstabaCancelada: false,
    };
  },
});

/**
 * Cancela lo que siga vivo en cocina y devuelve qué comandas se movieron.
 *
 * `returning` en vez de leer-y-luego-escribir: entre las dos sentencias cabe
 * otra pantalla de cocina marcando «listo», y entonces se propagarían los items
 * de una comanda que el `update` no llegó a tocar.
 */
async function cancelarComandasVivas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<readonly string[]> {
  const filas = await tx
    .updateTable('comandas')
    // Sólo el estado: `comandas` no tiene columna de cancelación, y fabricar un
    // `entregada_en` o un `lista_en` que nadie vivió mentiría en el tiempo de
    // preparación que la cocina mide. Es el mismo criterio que `selloDeTiempo`
    // de `preparacion-escrituras.ts`, que para 'cancelado' devuelve `{}`.
    .set({ estado: 'cancelado' })
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('estado', 'in', [...ESTADOS_COMANDA_ACTIVOS])
    .returning('id')
    .execute();

  return filas.map((fila) => fila.id);
}

async function cancelarLineas(
  tx: Transaccion,
  organizacionId: string,
  ordenId: string,
): Promise<void> {
  await tx
    .updateTable('orden_lineas')
    .set({ estado_preparacion: 'cancelado' })
    .where('organizacion_id', '=', organizacionId)
    .where('orden_id', '=', ordenId)
    .where('estado_preparacion', '<>', 'cancelado')
    .execute();
}
