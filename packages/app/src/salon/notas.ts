import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { SOLO_LO_SUYO, profesionalVisible } from './recorte.ts';

/**
 * `agenda.anotar` — la nota de la cita, escrita DURANTE el servicio (C.10 de la 2.4).
 *
 * `citas.notas` sólo la escribían agendar, el walk-in y reprogramar: lo que la estilista
 * aprende con la clienta sentada —«prefiere el agua tibia», «trae foto de referencia»— no
 * tenía dónde quedarse, y la cita en curso dejaba las notas fuera. Se REEMPLAZA la nota
 * entera, como la ve quien la edita. La estilista sólo anota las citas donde da un
 * servicio: la nota es de SU clienta, no de la de otra.
 */

const CABINA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAnotarCita = z.object({
  citaId: z.uuid(),
  notas: z.string().trim().max(1_000),
});

export const anotarCita = definirComando<
  Transaccion,
  typeof entradaAnotarCita,
  { readonly citaId: string }
>({
  nombre: 'agenda.anotar',
  entidad: 'cita',
  escribe: true,
  roles: [...CABINA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAnotarCita,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    if (SOLO_LO_SUYO.includes(ctx.ambito.rol)) {
      const suya = await profesionalVisible(ctx, null);
      const daUnServicio = await ctx.paso('leer_su_servicio', () =>
        ctx.tx
          .selectFrom('cita_servicios')
          .select('id')
          .where('organizacion_id', '=', organizacionId)
          .where('cita_id', '=', entrada.citaId)
          .where('profesional_id', '=', suya ?? '')
          .executeTakeFirst(),
      );
      if (daUnServicio === undefined) {
        throw new ErrorDominio(
          'PUENTE_SIN_PERMISO',
          'Sólo anotas las citas donde das un servicio.',
        );
      }
    }
    const tocada = await ctx.paso('anotar', () =>
      ctx.tx
        .updateTable('citas')
        .set({ notas: entrada.notas === '' ? null : entrada.notas, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (tocada === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
    }
    ctx.auditar({ entidadId: entrada.citaId, payload: { largo: entrada.notas.length } });
    return { citaId: entrada.citaId };
  },
});
