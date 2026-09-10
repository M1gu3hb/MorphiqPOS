import 'server-only';

import { ErrorDominio, PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import { aplicarPorcentaje, centavos, CERO } from '@morphiqpos/domain/dinero';
import type { z } from 'zod';

import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
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
 * la orden y la propina de `aplicarPorcentaje`, en centavos enteros.
 *
 * ── La regla 1 de `F1-01` §3, que este comando no puede romper ────────────
 * La propina NO entra en `Venta.total`. Se guarda como puntos base en la orden
 * y como instantánea informativa en la solicitud; `total_centavos` no se toca.
 * Quien cobre en caja suma la propina aparte, que es lo que hace que ventas,
 * utilidad y margen sigan significando lo que dicen.
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
}

const ESTADOS_ACTIVOS = [
  'borrador',
  'confirmada',
  'en_preparacion',
  'lista',
  'cuenta_solicitada',
] as const;

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

    const cuenta = calcularPropina(ctx, orden.total_centavos, entrada);

    await ctx.paso('marcar_venta', () =>
      ctx.tx
        .updateTable('ordenes')
        .set({
          estado: 'cuenta_solicitada',
          propina_puntos_base: cuenta.propinaBp,
          propina_tipo: cuenta.propinaTipo,
          // Una vez que el comensal eligió algo, el origen es el portal —
          // incluso si eligió «sin propina» o «decidir en caja». Sobrescribe el
          // `pendiente_portal_qr` que dejó el mesero al disparar la cuenta.
          propina_origen: 'portal_qr',
          version: orden.version + 1,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', orden.id)
        .execute(),
    );

    await ctx.paso('avisar_al_mesero', () => avisar(ctx, orden, cuenta));

    await ctx.paso('marcar_mesa', () =>
      ctx.tx
        .updateTable('mesas')
        .set({ estado: 'cuenta_solicitada', updated_at: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', ctx.ambito.mesaId)
        .execute(),
    );

    ctx.auditar({
      entidadId: orden.id,
      payload: {
        propinaTipo: cuenta.propinaTipo,
        propinaBp: cuenta.propinaBp,
        propinaCentavos: cuenta.propinaCentavos.toString(),
      },
    });

    return {
      ventaId: orden.id,
      subtotalCentavos: cuenta.subtotalCentavos.toString(),
      propinaCentavos: cuenta.propinaCentavos.toString(),
      propinaTipo: cuenta.propinaTipo,
    };
  },
});

interface OrdenParaCobrar {
  readonly id: string;
  readonly estado: string;
  readonly version: number;
  readonly total_centavos: bigint;
  readonly propina_tipo: string | null;
  readonly propina_origen: string | null;
}

async function ordenParaCobrar(ctx: ContextoPortal): Promise<OrdenParaCobrar> {
  const orden = await ctx.tx
    .selectFrom('ordenes')
    .select(['id', 'estado', 'version', 'total_centavos', 'propina_tipo', 'propina_origen'])
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('estado', 'in', ESTADOS_ACTIVOS)
    .executeTakeFirst();

  if (orden === undefined) {
    throw new ErrorDominio(
      'ORDEN_NO_ENCONTRADA',
      'No hay una cuenta abierta en esta mesa. Llama al mesero.',
    );
  }
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
 * La propina, en centavos enteros, calculada sobre el total de la orden.
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
  totalCentavos: bigint,
  entrada: z.output<typeof entradaPedirCuenta>,
): PropinaCalculada {
  const subtotal = centavos(totalCentavos);
  const propinasHabilitadas = ctx.banderas.propinasActivas && ctx.banderas.permitirPropinaCliente;

  const bp =
    propinasHabilitadas && entrada.propinaTipo === 'porcentaje'
      ? entrada.propinaPorcentaje * PUNTOS_BASE_POR_PUNTO
      : 0;

  const tipo = tipoDePropina(entrada.propinaTipo, propinasHabilitadas, bp);

  return {
    subtotalCentavos: subtotal,
    propinaCentavos: bp === 0 ? CERO : aplicarPorcentaje(subtotal, bp),
    propinaBp: bp,
    propinaTipo: tipo,
  };
}

function tipoDePropina(pedido: string, habilitadas: boolean, bp: number): string {
  if (!habilitadas) return 'sin_propina';
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
