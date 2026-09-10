import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import { aplicarPorcentaje, centavos, CERO } from '@morphiqpos/domain/dinero';
import type { TotalesOrden } from '@morphiqpos/domain/venta';
import type { z } from 'zod';

import { cotizar } from '../venta/cotizar.ts';
import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
import { marcarCuentaSolicitadaDesdeQR, moverMesaDelPortal } from './escrituras.ts';
import { ORDEN_ACTIVA } from './estados.ts';
import { entradaPedirCuenta } from './esquemas.ts';
import {
  actualizarSolicitudDeCuenta,
  insertarSolicitud,
  ruteoDeLaMesa,
  solicitudDeCuentaPendiente,
  type SnapshotDeCuenta,
} from './solicitudes.ts';

/**
 * `portal.pedir_cuenta` — la propina la calcula el SERVIDOR (E7-3).
 *
 * ── Qué manda el comensal y qué no ────────────────────────────────────────
 * Manda el TIPO de propina y, si es porcentaje, el porcentaje. **Nunca un
 * importe.** Hoy `PedirCuentaQR.jsx:257` escribe `subtotal_consumo`,
 * `propina_monto_sugerida` y `total_estimado` calculados en el navegador: tres
 * importes del cliente escritos tal cual en la base. Aquí el subtotal sale de
 * `cotizar` y la propina de `aplicarPorcentaje`, en centavos enteros.
 *
 * ── El total se recalcula, no se lee de la fila ───────────────────────────
 * Hallazgo 3 del veredicto: este comando usaba `ordenes.total_centavos`, un
 * campo que sólo refrescan los comandos de pedido. Si el mesero añadía una
 * botella desde el carrito de mostrador, el 15 % salía sobre el total viejo y
 * la instantánea que el mesero lee en su pantalla decía un consumo que no era.
 * Ahora se cotiza sobre las líneas persistidas —la misma `cotizar` del cobro—
 * y los totales frescos se congelan en la orden, «para que Caja lea el mismo
 * número que se imprimió en la precuenta» (`restaurante/cuenta.ts:172`).
 *
 * ── La regla 1 de `F1-01` §3, que este comando no puede romper ────────────
 * La propina NO entra en `Venta.total`. Se guarda como puntos base en la orden
 * y como instantánea informativa en la solicitud; `total_centavos` lleva la
 * venta sin propina. Quien cobre en caja suma la propina aparte, que es lo que
 * hace que ventas, utilidad y margen sigan significando lo que dicen.
 *
 * ── Lo que falta, y no me toca inventar ───────────────────────────────────
 * `monto_manual` no está en la entrada porque `ordenes` no tiene columna para
 * un importe de propina —sólo `propina_puntos_base`—. `F1-04` §38.2 lo declara
 * hueco confirmado y lo asigna a E6-7. Va en el informe.
 */

export interface ResultadoCuenta {
  readonly ventaId: string;
  readonly subtotalCentavos: string;
  readonly propinaCentavos: string;
  readonly propinaTipo: string;
  /** El código que el comensal lleva a la caja (`F1-04` §6.3). */
  readonly codigoCaja: string;
}

const PUNTOS_BASE_POR_PUNTO = 100;

export const pedirCuentaQR = definirComandoPublico<typeof entradaPedirCuenta, ResultadoCuenta>({
  nombre: 'portal.pedir_cuenta',
  entidad: 'orden',
  accion: 'pedir_cuenta',
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaPedirCuenta,
  async ejecutar(ctx, entrada) {
    const orden = await ctx.paso('cargar_venta', () => ordenParaCobrar(ctx));
    exigirQuePuedaPedirla(ctx, orden);

    const { totales } = await ctx.paso('cotizar', () =>
      cotizar(ctx.tx, ctx.ambito.organizacionId, orden.id),
    );

    const cuenta = calcularPropina(ctx, totales.totalCentavos, entrada);

    const codigoCaja = await ctx.paso('marcar_venta', () =>
      marcarCuentaSolicitadaDesdeQR(ctx.tx, {
        organizacionId: ctx.ambito.organizacionId,
        ordenId: orden.id,
        version: orden.version,
        ahora: ctx.ahora,
        mesaNumero: ctx.ambito.mesaNumero,
        codigoPrevio: orden.codigo_caja,
        totales,
        propinaPuntosBase: cuenta.propinaBp,
        propinaTipo: cuenta.propinaTipo,
      }),
    );

    await ctx.paso('avisar_al_mesero', () => avisar(ctx, orden, cuenta));

    await ctx.paso('marcar_mesa', () =>
      moverMesaDelPortal(ctx.tx, {
        organizacionId: ctx.ambito.organizacionId,
        mesaId: ctx.ambito.mesaId,
        estado: 'cuenta_solicitada',
        ahora: ctx.ahora,
      }),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        codigoCaja,
        propinaTipo: cuenta.propinaTipo,
        propinaBp: cuenta.propinaBp,
        propinaCentavos: cuenta.propinaCentavos.toString(),
        totalCentavos: totales.totalCentavos.toString(),
      },
    });

    return {
      ventaId: orden.id,
      subtotalCentavos: cuenta.subtotalCentavos.toString(),
      propinaCentavos: cuenta.propinaCentavos.toString(),
      propinaTipo: cuenta.propinaTipo,
      codigoCaja,
    };
  },
});

interface OrdenParaCobrar {
  readonly id: string;
  readonly estado: string;
  readonly version: number;
  readonly codigo_caja: string | null;
  readonly propina_tipo: string | null;
  readonly propina_origen: string | null;
}

async function ordenParaCobrar(ctx: ContextoPortal): Promise<OrdenParaCobrar> {
  const orden = await ctx.tx
    .selectFrom('ordenes')
    .select(['id', 'estado', 'version', 'codigo_caja', 'propina_tipo', 'propina_origen'])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('estado', 'in', ORDEN_ACTIVA)
    .executeTakeFirst();

  if (orden === undefined) {
    throw new ErrorDominio(
      'ORDEN_NO_ENCONTRADA',
      'No hay una cuenta abierta en esta mesa. Llama al mesero.',
    );
  }
  // `total_centavos` NO se lee aquí a propósito: es el campo obsoleto del
  // hallazgo 3. El importe sobre el que se calcula la propina sale de
  // `cotizar`, unas líneas más abajo y dentro de la misma transacción.
  return orden;
}

/**
 * Quién puede iniciar el cobro.
 *
 * `mesero_dispara` es el flujo principal y el comensal NO se lo salta: si el
 * mesero no ha pedido la cuenta, lo que puede hacer es avisar
 * (`portal.crear_solicitud`), no abrir la pantalla de propina. Cuando el mesero
 * sí la disparó —la venta queda con `pendiente_portal_qr`— el comensal entra a
 * confirmar su propina aunque el modo sea `mesero_dispara`, que es justo para
 * lo que existe ese estado intermedio.
 */
function exigirQuePuedaPedirla(ctx: ContextoPortal, orden: OrdenParaCobrar): void {
  const { modoCuenta, permitirCuenta } = ctx.banderas;
  const clienteInicia = modoCuenta === 'cliente_solicita' || modoCuenta === 'ambos';
  const meseroDisparo =
    orden.propina_origen === 'pendiente_portal_qr' ||
    orden.propina_tipo === 'pendiente_cliente' ||
    orden.estado === 'cuenta_solicitada';

  if (permitirCuenta && (clienteInicia || meseroDisparo)) return;

  throw new ErrorDominio(
    'QR_PORTAL_CERRADO',
    'El mesero es quien pide la cuenta en este negocio. Avísale desde el botón de atención.',
  );
}

interface PropinaCalculada extends SnapshotDeCuenta {
  readonly propinaBp: number;
}

/**
 * La propina, en centavos enteros, calculada sobre el total recién cotizado.
 *
 * `aplicarPorcentaje` redondea una sola vez con la regla única del sistema. No
 * hay `Math.round(x * 100)` en ningún punto del camino: ahí es donde se pierde
 * el medio centavo, y una propina de «15 % de 133.33» es exactamente el caso.
 *
 * Un 0 % pedido como `porcentaje` se registra como `sin_propina`: significan lo
 * mismo, y guardar «porcentaje del 0 %» dejaría un tipo que ningún reporte sabe
 * agrupar.
 */
function calcularPropina(
  ctx: ContextoPortal,
  totalCentavos: TotalesOrden['totalCentavos'],
  entrada: z.output<typeof entradaPedirCuenta>,
): PropinaCalculada {
  const subtotal = centavos(totalCentavos);
  const propinasHabilitadas = ctx.banderas.propinasActivas && ctx.banderas.permitirPropinaCliente;

  if (!propinasHabilitadas) {
    return { subtotalCentavos: subtotal, propinaCentavos: CERO, propinaBp: 0, propinaTipo: 'sin_propina' };
  }

  /**
   * El importe escrito a mano manda TAL CUAL; los puntos base se derivan de él.
   *
   * Al revés que el porcentaje, donde el importe se deriva de los puntos. Si se
   * guardaran sólo los puntos, una propina de $50 sobre una cuenta de $1 210
   * volvería a la caja como 4,13 % = $49,97, y el comensal que escribió 50
   * vería 49,97. Se guardan los dos: el importe es lo que pidió, y los puntos
   * son para los reportes que agrupan por porcentaje.
   *
   * `subtotal` en cero —una cuenta sin líneas— no puede dividir: los puntos se
   * quedan en cero y el importe se conserva igual.
   */
  if (entrada.propinaTipo === 'monto_manual') {
    const pedidos = centavos(BigInt(entrada.propinaSugeridaCentavos ?? 0));
    if (pedidos === CERO) {
      return { subtotalCentavos: subtotal, propinaCentavos: CERO, propinaBp: 0, propinaTipo: 'sin_propina' };
    }
    const base = subtotal === CERO ? 0 : Number((pedidos * 10_000n) / subtotal);
    return {
      subtotalCentavos: subtotal,
      propinaCentavos: pedidos,
      propinaBp: base,
      propinaTipo: 'monto_manual',
    };
  }

  const bp =
    entrada.propinaTipo === 'porcentaje' ? entrada.propinaPorcentaje * PUNTOS_BASE_POR_PUNTO : 0;

  const tipo = tipoDePropina(entrada.propinaTipo, bp);

  return {
    subtotalCentavos: subtotal,
    propinaCentavos: bp === 0 ? CERO : aplicarPorcentaje(subtotal, bp),
    propinaBp: bp,
    propinaTipo: tipo,
  };
}

function tipoDePropina(pedido: string, bp: number): string {
  if (pedido === 'decidir_en_caja') return 'decidir_en_caja';
  return bp > 0 ? 'porcentaje' : 'sin_propina';
}

/**
 * El aviso al mesero, sin notificación falsa.
 *
 * Si el mesero fue quien disparó la cuenta, ya lo sabe: crear una solicitud
 * sería avisarle de algo que él pidió (el arreglo 6B-C de
 * `PedirCuentaQR.jsx:222-232`). Si ya había una pendiente, se actualiza su
 * instantánea en vez de duplicarla.
 */
async function avisar(
  ctx: ContextoPortal,
  orden: OrdenParaCobrar,
  cuenta: PropinaCalculada,
): Promise<void> {
  const pendiente = await solicitudDeCuentaPendiente(ctx);
  const datos = { tipo: 'cuenta', ordenId: orden.id, ruteo: ruteoDeLaMesa(ctx), cuenta };

  if (pendiente !== null) {
    await actualizarSolicitudDeCuenta(ctx, pendiente, datos);
    return;
  }

  const meseroDisparo =
    orden.propina_origen === 'pendiente_portal_qr' || orden.propina_tipo === 'pendiente_cliente';
  if (meseroDisparo) return;

  await insertarSolicitud(ctx, datos);
}
