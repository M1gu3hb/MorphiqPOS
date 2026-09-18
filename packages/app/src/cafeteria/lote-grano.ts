import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `cafeteria.abrir_lote_grano` — F-157.
 *
 * ── Grano de cinco semanas para espresso ───────────────────────────────────
 * El cliente lo nota antes que la dueña: sabe a cartón y la crema no aguanta.
 * Hoy nadie sabe de cuándo es la bolsa que está en la tolva, porque esa fecha
 * vive en el envase y el envase se tira.
 *
 * ── Lo que esto NO hace, dicho sin adornos ─────────────────────────────────
 * No traza. No sabe qué lote se usó en el latte del martes. Sabe **qué lote
 * está en la tolva hoy y cuántos días lleva del tueste**, que es lo único que
 * dispara una decisión. Trazabilidad completa sería V4 (F-124) y nadie en este
 * giro la pediría jamás: es el 90 % del beneficio por el 10 % del trabajo.
 *
 * ── Abrir uno CIERRA el anterior, en la misma transacción ─────────────────
 * Porque en la barra sólo hay una tolva. Dos lotes abiertos a la vez es lo que
 * pasa de verdad cuando quedan dos bolsas empezadas, pero el sistema no puede
 * saber de cuál se sirvió: con uno el dato es exacto, con dos sería una media
 * que no describe nada.
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const entradaAbrirLote = z.object({
  insumoId: z.uuid(),
  fechaTueste: z.string().regex(FECHA, 'La fecha de tueste va como AAAA-MM-DD.'),
  /** Texto: los gramos son `numeric(14,4)`. */
  gramosRecibidos: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, 'Los gramos van con hasta cuatro decimales.'),
  compraLineaId: z.uuid().optional(),
});

export interface ResultadoLote {
  readonly loteId: string;
  readonly insumoId: string;
  readonly fechaTueste: string;
  readonly diasDeTueste: number;
  readonly cerroAnterior: string | null;
  /** `true` cuando el grano ya pasó su ventana buena al abrirlo. */
  readonly yaPasoSuFrescura: boolean;
}

const ROLES = ['cajero', 'cocina', 'almacen', 'gerente', 'administrador', 'dueno'] as const;

export const abrirLoteGrano = definirComando<Transaccion, typeof entradaAbrirLote, ResultadoLote>({
  nombre: 'cafeteria.abrir_lote_grano',
  entidad: 'lote_grano',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAbrirLote,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    if (sucursalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'Un lote está en la tolva de un local: hace falta estar en una sucursal.',
      );
    }

    const hoy = ctx.ahora.toISOString().slice(0, 10);
    if (entrada.fechaTueste > hoy) {
      // Un tueste futuro es un error de tecleo, y uno que se cuela arruina el
      // único dato que esta tabla aporta.
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        'Ese café se tostó en el futuro: revisa la fecha.',
        { fechaTueste: entrada.fechaTueste },
      );
    }

    const insumo = await ctx.paso('cargar_insumo', () =>
      ctx.tx
        .selectFrom('insumos')
        .select(['id', 'dias_frescura_optima as diasFrescura'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.insumoId)
        .executeTakeFirst(),
    );
    if (insumo === undefined) {
      throw new ErrorDominio('INVENTARIO_INVALIDO', 'Ese insumo no existe en este negocio.');
    }

    const anterior = await ctx.paso('cargar_abierto', () =>
      ctx.tx
        .selectFrom('lotes_grano')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('insumo_id', '=', entrada.insumoId)
        .where('abierto_en', 'is not', null)
        .where('agotado_en', 'is', null)
        .executeTakeFirst(),
    );

    if (anterior !== undefined) {
      // Se agota el anterior ANTES de abrir el nuevo: el índice único parcial
      // de la 085 rechazaría dos abiertos, y ese rechazo llegaría al barista
      // como un 500 en vez de como una tolva que se cambió.
      await ctx.paso('agotar_anterior', () =>
        ctx.tx
          .updateTable('lotes_grano')
          .set({ agotado_en: ctx.ahora })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', anterior.id)
          .where('agotado_en', 'is', null)
          .execute(),
      );
    }

    const lote = await ctx.paso('abrir_lote', () =>
      ctx.tx
        .insertInto('lotes_grano')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          insumo_id: entrada.insumoId,
          fecha_tueste: entrada.fechaTueste,
          compra_linea_id: entrada.compraLineaId ?? null,
          abierto_en: ctx.ahora,
          gramos_recibidos: entrada.gramosRecibidos,
          empleado_id: empleoId,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // La caché del insumo, para que el mapa de barra no haga una consulta con
    // ventana en cada refresco. La verdad sigue siendo `lotes_grano`.
    await ctx.paso('apuntar_lote', () =>
      ctx.tx
        .updateTable('insumos')
        .set({ lote_abierto_id: lote.id })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.insumoId)
        .execute(),
    );

    const dias = diasEntre(entrada.fechaTueste, hoy);
    const yaPaso = insumo.diasFrescura !== null && dias > insumo.diasFrescura;

    ctx.auditar({
      entidadId: lote.id,
      payload: {
        insumoId: entrada.insumoId,
        fechaTueste: entrada.fechaTueste,
        diasDeTueste: dias,
        yaPasoSuFrescura: yaPaso,
        cerroAnterior: anterior?.id ?? null,
      },
    });

    return {
      loteId: lote.id,
      insumoId: entrada.insumoId,
      fechaTueste: entrada.fechaTueste,
      diasDeTueste: dias,
      cerroAnterior: anterior?.id ?? null,
      // No FALLA: abrir una bolsa vieja es una decisión del negocio —se usa para
      // filtrado, no para espresso— y bloquearla dejaría al barista sin café.
      // Lo que hace el sistema es decirlo, que es lo que hoy nadie dice.
      yaPasoSuFrescura: yaPaso,
    };
  },
});

/**
 * Días enteros entre dos fechas `AAAA-MM-DD`, en UTC.
 *
 * En UTC y no con la zona del proceso: un lote que cambiara de día según dónde
 * corre el servidor daría dos respuestas distintas a «¿cuántos días lleva?», y
 * ése es el único número que esta función aporta.
 */
export function diasEntre(desde: string, hasta: string): number {
  const [a1 = 0, m1 = 1, d1 = 1] = desde.split('-').map(Number);
  const [a2 = 0, m2 = 1, d2 = 1] = hasta.split('-').map(Number);
  const uno = Date.UTC(a1, m1 - 1, d1);
  const dos = Date.UTC(a2, m2 - 1, d2);
  return Math.round((dos - uno) / 86_400_000);
}
