import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `expediente.capturar_formula` — lo que DE VERDAD se mezcló (F-154).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `estetica-salon/CitaEnCurso.tsx` captura la fórmula con guantes de tinte puestos
 * y la publicaba en `/api/expediente/capturar-formula`, **una ruta que no existe**.
 * La pantalla trata ese fallo como lo más grave que le puede pasar —«una fórmula
 * perdida en silencio no se recupera jamás»— y tenía razón: la clienta vuelve en
 * seis semanas pidiendo «lo mismo», y sin este registro «lo mismo» es una
 * suposición de la estilista que ese día quizá no está.
 *
 * `agenda.cerrar_servicio` recibe una `formula` y sólo la AUDITA: la auditoría no
 * es el expediente. Nadie puede pedirle a la clienta que espere mientras se busca
 * en un registro de accesos.
 *
 * ── Por qué se captura al MEZCLAR y no al cerrar ─────────────────────────
 * Porque se mezcla al principio y se cierra al final, y en medio pasan cuarenta
 * minutos de procesado en los que la estilista atiende a otra clienta. Lo que no
 * se apunta cuando se hace, se apunta mal o no se apunta.
 *
 * ── Y por qué el sobrante se guarda ──────────────────────────────────────
 * Porque es el 10–20 % del tinte que hoy se tira sin apunte. Mezclado y usado van
 * los dos, y el sobrante se deriva: guardar sólo el usado esconde justo el número
 * que dice cuánto se está desperdiciando al mes.
 */

const PROFESIONAL = ['dueno', 'administrador', 'gerente', 'cajero', 'mesero'] as const;

const componente = z.object({
  nombre: z.string().trim().min(1).max(80),
  /** Gramos o mililitros: un tinte no se mide en piezas. */
  cantidad: z.number().min(0).max(100_000),
  unidad: z.string().trim().min(1).max(12),
});

export const entradaCapturarFormula = z.object({
  citaId: z.uuid(),
  /** Lo que se preparó y lo que se puso. El sobrante sale de los dos. */
  mezclado: z.number().min(0).max(100_000).default(0),
  usado: z.number().min(0).max(100_000).default(0),
  componentes: z.array(componente).max(20).default([]),
  /** Minutos de procesado. Es lo que hace repetible «lo mismo». */
  minutos: z.number().int().min(0).max(600).default(0),
  resultado: z.string().trim().max(200).nullable().default(null),
});

export interface ResultadoFormula {
  readonly formulaId: string;
  readonly clienteId: string;
  readonly sobrante: number;
}

export const capturarFormula = definirComando<
  Transaccion,
  typeof entradaCapturarFormula,
  ResultadoFormula
>({
  nombre: 'expediente.capturar_formula',
  entidad: 'formula_aplicada',
  escribe: true,
  roles: [...PROFESIONAL],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCapturarFormula,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const cita = await ctx.paso('cargar_cita', () =>
      ctx.tx
        .selectFrom('citas')
        .select(['id', 'cliente_id', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.citaId)
        .executeTakeFirst(),
    );
    if (cita === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa cita no existe en este negocio.');
    }
    // La fórmula es DE LA CLIENTA: es su expediente, y de ahí sale el botón
    // REPETIR de la visita siguiente. Una cita sin ficha —alguien que llegó sin
    // cita previa— no tiene dónde guardarla, y decirlo es mejor que escribir una
    // fórmula que nadie va a volver a encontrar.
    // En una CONSTANTE y no leyendo la propiedad: TypeScript no conserva el
    // estrechamiento de una propiedad dentro de una función que se ejecuta después
    // —el `ctx.paso` de abajo es una— y con la propiedad haría falta un `??` que
    // sería una rama muerta.
    const clienteId = cita.cliente_id;
    if (clienteId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esa cita no tiene clienta con ficha: la fórmula se guarda en su expediente.',
      );
    }

    /**
     * El SERVICIO de la cita al que se le atribuye, y quién lo hizo.
     *
     * Se toma el primero que siga vivo: una cita de tinte y corte tiene dos
     * servicios y la fórmula es del tinte, que es el que está en curso cuando se
     * mezcla. Si ya están todos cerrados se deja nulo en vez de colgarla del
     * corte: una fórmula atribuida al servicio equivocado es peor que una sin
     * atribuir, porque el reporte de consumo por servicio mentiría.
     */
    const servicio = await ctx.paso('cargar_servicio', () =>
      ctx.tx
        .selectFrom('cita_servicios')
        .select(['id', 'servicio_id', 'profesional_id', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('cita_id', '=', entrada.citaId)
        .where('estado', 'not in', ['cerrado', 'cancelado'])
        .limit(1)
        .executeTakeFirst(),
    );

    const sobrante = Math.max(0, entrada.mezclado - entrada.usado);

    const fila = await ctx.paso('guardar_formula', () =>
      ctx.tx
        .insertInto('formulas_aplicadas')
        .values({
          organizacion_id: organizacionId,
          cliente_id: clienteId,
          cita_servicio_id: servicio?.id ?? null,
          servicio_id: servicio?.servicio_id ?? null,
          // Quien la mezcló. `profesional_id` del servicio si lo hay; si no, nulo:
          // el empleo de quien teclea no es necesariamente la profesional.
          profesional_id: servicio?.profesional_id ?? null,
          // El jsonb con lo que se mezcló, tal cual. NO apunta al catálogo: una
          // fórmula congelada tiene que seguir leyéndose cuando la marca ya no se
          // venda, y ése es justo el caso que hace falta dentro de seis semanas.
          formula: JSON.stringify({
            mezclado: entrada.mezclado,
            usado: entrada.usado,
            sobrante,
            componentes: entrada.componentes,
            capturadaPor: empleoId,
          }),
          minutos_procesado: entrada.minutos === 0 ? null : entrada.minutos,
          resultado: entrada.resultado,
          aplicada_en: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: {
        citaId: entrada.citaId,
        clienteId,
        citaServicioId: servicio?.id ?? null,
        componentes: entrada.componentes.length,
        sobrante,
      },
    });

    return { formulaId: fila.id, clienteId, sobrante };
  },
});
