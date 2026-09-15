import 'server-only';

import { ErrorDominio, PAQUETES_PORTAL } from '@morphiqpos/contracts';

import { definirComandoPublico, type ContextoPortal } from './definicion-publica.ts';
import { violaIndice } from './errores-sql.ts';
import { ORDEN_ACTIVA } from './estados.ts';
import { entradaCrearSolicitud } from './esquemas.ts';

/**
 * `portal.crear_solicitud` — «llama al mesero» sin carrera (E7-3).
 *
 * ── El anti-duplicado deja de vivir en el cliente ─────────────────────────
 * `PortalCliente.jsx:524-532` consulta si hay una solicitud pendiente del mismo
 * tipo y, si no la hay, la crea. Entre la consulta y la creación cabe otro
 * teléfono de la misma mesa haciendo lo mismo: dos avisos idénticos en la
 * pantalla del mesero. Es TOCTOU, y es media D-17.
 *
 * Aquí no se consulta antes. Se inserta, y si el índice único parcial
 * `solicitudes_qr_una_pendiente` (§35.11) rechaza la fila, ESO es la respuesta:
 * ya avisaste. La base decide, no una lectura previa que envejece en el camino.
 */

export interface ResultadoSolicitud {
  readonly solicitudId: string;
  readonly tipo: string;
}

export const crearSolicitudQR = definirComandoPublico<
  typeof entradaCrearSolicitud,
  ResultadoSolicitud
>({
  nombre: 'portal.crear_solicitud',
  entidad: 'solicitud_qr',
  accion: 'crear_solicitud',
  paquetes: PAQUETES_PORTAL,
  entrada: entradaCrearSolicitud,
  async ejecutar(ctx, entrada) {
    exigirTipoHabilitado(ctx, entrada.tipo);

    const ordenId = await ctx.paso('buscar_venta', () => ordenActiva(ctx));
    const ruteo = ruteoDeLaMesa(ctx);

    const id = await ctx.paso('crear_solicitud', () =>
      insertarSolicitud(ctx, {
        tipo: entrada.tipo,
        ordenId,
        ruteo,
      }),
    );

    ctx.auditar({ entidadId: id, payload: { tipo: entrada.tipo, ruteo: ruteo.modo } });
    return { solicitudId: id, tipo: entrada.tipo };
  },
});

/** Los tres interruptores de `getTiposSolicitudHabilitados` (qrUtils.js:31-35). */
function exigirTipoHabilitado(ctx: ContextoPortal, tipo: string): void {
  const habilitado =
    (tipo === 'ordenar' && ctx.banderas.permitirOrdenar) ||
    (tipo === 'cuenta' && ctx.banderas.permitirCuenta) ||
    (tipo === 'ayuda' && ctx.banderas.permitirAyuda);

  if (habilitado) return;
  throw new ErrorDominio(
    'QR_PORTAL_CERRADO',
    'Este aviso no está disponible en este negocio. Llama al mesero.',
  );
}

export interface RuteoDeMesa {
  readonly modo: 'asignado' | 'general';
  readonly destinoId: string | null;
}

/**
 * A quién le llega el aviso.
 *
 * Con asignación de mesas activa y mesero asignado, va a ese mesero; si no,
 * queda general y lo ve cualquiera. Mismas dos condiciones de
 * `PortalCliente.jsx:536-539`, resueltas donde no se pueden falsear.
 */
export function ruteoDeLaMesa(ctx: ContextoPortal): RuteoDeMesa {
  const destino = ctx.ambito.empleadoAsignadoId;
  return ctx.banderas.asignacionMesasActiva && destino !== null
    ? { modo: 'asignado', destinoId: destino }
    : { modo: 'general', destinoId: null };
}

/** La venta viva de la mesa. Informativa en la solicitud: nunca cobra nada. */
export async function ordenActiva(ctx: ContextoPortal): Promise<string | null> {
  const fila = await ctx.tx
    .selectFrom('ordenes')
    .select('id')
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('estado', 'in', ORDEN_ACTIVA)
    .executeTakeFirst();

  return fila?.id ?? null;
}

export interface SnapshotDeCuenta {
  readonly subtotalCentavos: bigint;
  readonly propinaCentavos: bigint;
  readonly propinaBp: number;
  readonly propinaTipo: string;
}

interface DatosSolicitud {
  readonly tipo: string;
  readonly ordenId: string | null;
  readonly ruteo: RuteoDeMesa;
  readonly cuenta?: SnapshotDeCuenta;
}

/**
 * Inserta la solicitud y traduce el choque del índice único.
 *
 * El `catch` traduce y relanza de inmediato: tras el 23505 la transacción está
 * abortada y no hay nada más que hacer con ella. Y no hace falta: la solicitud
 * que ya existe es exactamente la que el comensal quería crear.
 */
export async function insertarSolicitud(
  ctx: ContextoPortal,
  datos: DatosSolicitud,
): Promise<string> {
  try {
    const fila = await ctx.tx
      .insertInto('solicitudes_qr')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        mesa_id: ctx.ambito.mesaId,
        orden_id: datos.ordenId,
        tipo: datos.tipo,
        estado: 'pendiente',
        empleado_destino_id: datos.ruteo.destinoId,
        ruteo_modo: datos.ruteo.modo,
        origen: 'portal_qr',
        // Instantánea del código con el que entró el comensal (F1-04 §28).
        token_mesa: ctx.ambito.tokenMesa,
        subtotal_consumo_centavos: datos.cuenta?.subtotalCentavos ?? null,
        propina_sugerida_centavos: datos.cuenta?.propinaCentavos ?? null,
        propina_sugerida_bp: datos.cuenta?.propinaBp ?? null,
        propina_tipo: datos.cuenta?.propinaTipo ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return fila.id;
  } catch (error) {
    if (violaIndice(error, 'solicitudes_qr_una_pendiente')) {
      throw new ErrorDominio(
        'QR_SOLICITUD_DUPLICADA',
        'Ya avisamos al mesero. Llegará en un momento.',
        { tipo: datos.tipo },
      );
    }
    throw error;
  }
}

/** Actualiza la instantánea de una solicitud de cuenta que ya estaba pendiente. */
export async function actualizarSolicitudDeCuenta(
  ctx: ContextoPortal,
  solicitudId: string,
  datos: DatosSolicitud,
): Promise<void> {
  await ctx.tx
    .updateTable('solicitudes_qr')
    .set({
      orden_id: datos.ordenId,
      empleado_destino_id: datos.ruteo.destinoId,
      ruteo_modo: datos.ruteo.modo,
      token_mesa: ctx.ambito.tokenMesa,
      subtotal_consumo_centavos: datos.cuenta?.subtotalCentavos ?? null,
      propina_sugerida_centavos: datos.cuenta?.propinaCentavos ?? null,
      propina_sugerida_bp: datos.cuenta?.propinaBp ?? null,
      propina_tipo: datos.cuenta?.propinaTipo ?? null,
      updated_at: ctx.ahora,
    })
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('id', '=', solicitudId)
    .execute();
}

/** La solicitud de cuenta que siga pendiente en esta mesa, si la hay. */
export async function solicitudDeCuentaPendiente(ctx: ContextoPortal): Promise<string | null> {
  const fila = await ctx.tx
    .selectFrom('solicitudes_qr')
    .select('id')
    .where('organizacion_id', '=', ctx.ambito.organizacionId)
    .where('mesa_id', '=', ctx.ambito.mesaId)
    .where('tipo', '=', 'cuenta')
    .where('estado', '=', 'pendiente')
    .executeTakeFirst();

  return fila?.id ?? null;
}
