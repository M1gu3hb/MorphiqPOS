import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `expediente.fotos` — las fotos del expediente de una clienta, para su galería (F-434;
 * C.10 de la 2.4).
 *
 * `expediente.foto` las guarda desde la 136 y NADA las leía: ni el puente —no hay entidad
 * para `fotos_expediente`— ni ningún comando. La galería de la cita en curso y la de la
 * ficha de la clienta decían «las fotos cuelgan del servicio» y no enseñaban ninguna.
 *
 * Con su servicio y su momento (antes · después), la más reciente primero, y si tiene
 * consentimiento: una foto sin él se guarda —negarla haría que el salón dejara de
 * documentar— pero no se enseña como publicable.
 */

const CABINA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Sesenta son un año de visitas mensuales con antes y después: la galería no pagina. */
const LIMITE = 60;

export const entradaFotosDeClienta = z.object({ clienteId: z.uuid() });

export interface FotoDelExpediente {
  readonly fotoId: string;
  readonly url: string;
  readonly momento: 'antes' | 'despues';
  readonly tomadaEn: string;
  readonly servicioNombre: string | null;
  readonly conConsentimiento: boolean;
}

export const fotosDeClienta = definirComando<
  Transaccion,
  typeof entradaFotosDeClienta,
  { readonly fotos: readonly FotoDelExpediente[] }
>({
  nombre: 'expediente.fotos',
  entidad: 'cliente',
  escribe: false,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaFotosDeClienta,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const fotos = await ctx.paso('leer_fotos', () =>
      ctx.tx
        .selectFrom('fotos_expediente')
        .select([
          'id',
          'archivo_url',
          'momento',
          'tomada_en',
          'cita_servicio_id',
          'consentimiento_id',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('cliente_id', '=', entrada.clienteId)
        .orderBy('tomada_en', 'desc')
        .limit(LIMITE)
        .execute(),
    );
    const citaServicioIds = [
      ...new Set(fotos.map((f) => f.cita_servicio_id).filter((id): id is string => id !== null)),
    ];
    const servicios =
      citaServicioIds.length === 0
        ? []
        : await ctx.paso('leer_servicios', () =>
            ctx.tx
              .selectFrom('cita_servicios')
              .select(['id', 'servicio_id'])
              .where('organizacion_id', '=', organizacionId)
              .where('id', 'in', citaServicioIds)
              .execute(),
          );
    const productoIds = [...new Set(servicios.map((s) => s.servicio_id))];
    const productos =
      productoIds.length === 0
        ? []
        : await ctx.paso('leer_nombres', () =>
            ctx.tx
              .selectFrom('productos')
              .select(['id', 'nombre'])
              .where('organizacion_id', '=', organizacionId)
              .where('id', 'in', productoIds)
              .execute(),
          );
    const productoDe = new Map(servicios.map((s) => [s.id, s.servicio_id]));
    const nombreDe = new Map(productos.map((p) => [p.id, p.nombre]));

    return {
      fotos: fotos.map((f) => {
        const producto =
          f.cita_servicio_id === null ? undefined : productoDe.get(f.cita_servicio_id);
        return {
          fotoId: f.id,
          url: f.archivo_url,
          momento: f.momento === 'antes' ? 'antes' : 'despues',
          tomadaEn: new Date(f.tomada_en).toISOString(),
          servicioNombre: producto === undefined ? null : (nombreDe.get(producto) ?? null),
          conConsentimiento: f.consentimiento_id !== null,
        };
      }),
    };
  },
});
