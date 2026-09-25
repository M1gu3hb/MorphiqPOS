import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';
import { desdeRango } from './agenda.ts';
import { exigirEspera, type ResultadoEspera } from './espera.ts';

/**
 * LA LISTA DE ESPERA DEL SALÓN, leída y con salida (F-409; C.10 de la 2.4).
 *
 * La espera tenía anotar, avisar y agendar, y le faltaban las dos cosas que la hacen
 * servir: LEERLA —la agenda la enseña en su panel y no había cómo: el puente no sabe leer
 * la `ventana` (`tstzrange`) y la única lectura era «la querían mañana» del tablero, cuatro
 * nombres— y CANCELARLA: una clienta que encontró lugar en otro salón seguía en la lista y
 * la recepción la llamaba cada vez que se liberaba algo.
 */

const RECEPCION = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaCancelarEspera = z.object({ esperaId: z.uuid() });

/** Se CANCELA, no se borra: quién pidió qué y cuándo dice si la lista sirve. */
export const cancelarEspera = definirComando<
  Transaccion,
  typeof entradaCancelarEspera,
  ResultadoEspera
>({
  nombre: 'lista_espera_citas.cancelar',
  entidad: 'lista_espera_cita',
  escribe: true,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCancelarEspera,
  async ejecutar(ctx, entrada) {
    await exigirEspera(ctx, entrada.esperaId);
    const tocadas = await ctx.paso('cancelar', () =>
      ctx.tx
        .updateTable('lista_espera_citas')
        .set({ estado: 'cancelada', updated_at: ctx.ahora })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', entrada.esperaId)
        .where('estado', 'in', ['esperando', 'avisada'])
        .executeTakeFirst(),
    );
    if (Number(tocadas.numUpdatedRows) !== 1) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'Esa espera ya no está viva: o se agendó, o venció, o se canceló.',
      );
    }
    ctx.auditar({ entidadId: entrada.esperaId, payload: { cancelada: true } });
    return { esperaId: entrada.esperaId, estado: 'cancelada' };
  },
});

export const entradaListaDeEspera = z.object({});

export interface EsperaViva {
  readonly esperaId: string;
  readonly clienteId: string;
  readonly clienteNombre: string;
  readonly telefono: string | null;
  readonly servicioId: string | null;
  readonly servicioNombre: string | null;
  readonly profesionalId: string | null;
  readonly profesionalNombre: string | null;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly flexibleDeDia: boolean;
  readonly prioridad: number;
  readonly estado: string;
  readonly avisadaEn: string | null;
  readonly nota: string | null;
}

/**
 * Las que esperan o ya se avisaron y cuya ventana no terminó; primero la prioridad,
 * luego la más antigua. Una ventana que ya pasó no es una espera: nadie aparta el sábado
 * de ayer.
 */
export const listaDeEspera = definirComando<
  Transaccion,
  typeof entradaListaDeEspera,
  { readonly esperas: readonly EsperaViva[] }
>({
  nombre: 'lista_espera_citas.lista',
  entidad: 'lista_espera_cita',
  escribe: false,
  roles: [...RECEPCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaListaDeEspera,
  async ejecutar(ctx) {
    const filas = await ctx.paso('leer_esperas', () =>
      ctx.tx
        .selectFrom('lista_espera_citas')
        .select([
          'id',
          'cliente_id',
          'servicio_id',
          'profesional_id',
          sql<string>`ventana::text`.as('ventana'),
          'flexible_de_dia',
          'prioridad',
          'estado',
          'avisada_en',
          'nota',
          'created_at',
        ])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('estado', 'in', ['esperando', 'avisada'])
        .execute(),
    );
    const vivas = filas
      .map((fila) => ({ fila, rango: desdeRango(String(fila.ventana)) }))
      .filter(({ rango }) => rango === null || rango.fin.getTime() > ctx.ahora.getTime())
      .sort(
        (a, b) =>
          b.fila.prioridad - a.fila.prioridad ||
          new Date(a.fila.created_at).getTime() - new Date(b.fila.created_at).getTime(),
      );
    if (vivas.length === 0) return { esperas: [] };

    const nombres = await nombresDe(
      ctx,
      vivas.map(({ fila }) => fila),
    );
    return {
      esperas: vivas.map(({ fila, rango }) => {
        const clienta = nombres.clientes.get(fila.cliente_id);
        return {
          esperaId: fila.id,
          clienteId: fila.cliente_id,
          clienteNombre: clienta?.nombre ?? 'Sin nombre',
          telefono: clienta?.telefono ?? null,
          servicioId: fila.servicio_id,
          servicioNombre:
            fila.servicio_id === null ? null : (nombres.servicios.get(fila.servicio_id) ?? null),
          profesionalId: fila.profesional_id,
          profesionalNombre:
            fila.profesional_id === null
              ? null
              : (nombres.profesionales.get(fila.profesional_id) ?? null),
          desde: rango?.inicio.toISOString() ?? null,
          hasta: rango?.fin.toISOString() ?? null,
          flexibleDeDia: fila.flexible_de_dia,
          prioridad: fila.prioridad,
          estado: fila.estado,
          avisadaEn: fila.avisada_en === null ? null : new Date(fila.avisada_en).toISOString(),
          nota: fila.nota,
        };
      }),
    };
  },
});

function unicos(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => id !== null))];
}

/** Los nombres de las clientas, los servicios y las profesionales: tres lecturas acotadas. */
async function nombresDe(
  ctx: ContextoComando<Transaccion>,
  filas: readonly {
    readonly cliente_id: string;
    readonly servicio_id: string | null;
    readonly profesional_id: string | null;
  }[],
) {
  const { organizacionId } = ctx.ambito;
  const servicioIds = unicos(filas.map((f) => f.servicio_id));
  const profesionalIds = unicos(filas.map((f) => f.profesional_id));

  const clientes = await ctx.paso('leer_clientas', () =>
    ctx.tx
      .selectFrom('clientes')
      .select(['id', 'nombre', 'telefono'])
      .where('organizacion_id', '=', organizacionId)
      .where('id', 'in', unicos(filas.map((f) => f.cliente_id)))
      .execute(),
  );
  const servicios =
    servicioIds.length === 0
      ? []
      : await ctx.paso('leer_servicios', () =>
          ctx.tx
            .selectFrom('productos')
            .select(['id', 'nombre'])
            .where('organizacion_id', '=', organizacionId)
            .where('id', 'in', servicioIds)
            .execute(),
        );
  const profesionales =
    profesionalIds.length === 0
      ? []
      : await ctx.paso('leer_profesionales', () =>
          ctx.tx
            .selectFrom('profesionales')
            .select(['id', 'nombre_corto'])
            .where('organizacion_id', '=', organizacionId)
            .where('id', 'in', profesionalIds)
            .execute(),
        );
  return {
    clientes: new Map(clientes.map((c) => [c.id, c])),
    servicios: new Map(servicios.map((s) => [s.id, s.nombre])),
    profesionales: new Map(profesionales.map((p) => [p.id, p.nombre_corto])),
  };
}
