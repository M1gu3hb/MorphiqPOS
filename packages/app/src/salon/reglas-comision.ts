import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * LA REGLA DE COMISIÓN, editable desde el salón (F-440; C.10 de la 2.4).
 *
 * `reglas_comision` guarda «las cinco preguntas contestadas por escrito ANTES de
 * calcular», y NINGÚN comando la escribía: sólo la semilla. La liquidación decía «la
 * edición de la regla es del catálogo» y el catálogo no la tenía. Un salón que cambia a
 * Karla del 40 al 45 % no tenía cómo decirlo.
 *
 * ── Se VERSIONA, nunca se edita en sitio ─────────────────────────────────
 * Es la regla de la 133: lo ya causado no se recalcula jamás. Cambiar una regla es dar de
 * alta la versión siguiente con su fecha de inicio, cerrar la anterior el día antes, y
 * mover a la nueva a quien la tenía asignada —profesionales y servicios—. Las comisiones
 * ya causadas siguen apuntando a la versión con la que se causaron.
 */

const DIRECCION = ['administrador', 'dueno'] as const;
const LECTURA = ['gerente', ...DIRECCION] as const;

const tasa = z.number().int().min(0).max(10_000);

export const entradaGuardarRegla = z
  .object({
    /** La regla que se cambia (se versiona); nula para una regla nueva. */
    reglaId: z.uuid().nullable().default(null),
    nombre: z.string().trim().min(1).max(80),
    esquema: z.enum(['porcentaje_fijo', 'sueldo_mas_comision', 'escalonado', 'sin_comision']),
    tasaServicioBp: tasa,
    tasaProductoBp: tasa,
    base: z.enum(['cobrado', 'lista', 'mitad']),
    sobreIva: z.boolean(),
    material: z.enum(['salon', 'descuenta_base', 'cobra_profesional']),
    reparto: z.enum(['por_servicio', 'todo_a_quien_tomo']).default('por_servicio'),
    /** Para el escalonado: desde cuánto causado del periodo aplica cada tasa. */
    escalones: z
      .array(z.object({ desdeCentavos: z.number().int().min(0), tasaBp: tasa }))
      .max(10)
      .nullable()
      .default(null),
    vigenteDesde: z.iso.date(),
  })
  .superRefine((valor, ctx) => {
    if (valor.esquema === 'escalonado' && (valor.escalones ?? []).length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['escalones'],
        message: 'Una regla escalonada necesita sus escalones.',
      });
    }
  });

export interface ResultadoRegla {
  readonly reglaId: string;
  readonly version: number;
  /** Cuántas profesionales y servicios pasaron a la versión nueva. */
  readonly reasignadas: number;
}

const MS_POR_DIA = 86_400_000;

function diaAnterior(fecha: string): string {
  return new Date(new Date(`${fecha}T00:00:00.000Z`).getTime() - MS_POR_DIA)
    .toISOString()
    .slice(0, 10);
}

export const guardarRegla = definirComando<Transaccion, typeof entradaGuardarRegla, ResultadoRegla>(
  {
    nombre: 'comision.guardar_regla',
    entidad: 'regla_comision',
    escribe: true,
    roles: [...DIRECCION],
    paquetes: PAQUETES_TODOS,
    entrada: entradaGuardarRegla,
    async ejecutar(ctx, entrada) {
      const { organizacionId, empleoId } = ctx.ambito;
      const anterior = entrada.reglaId === null ? null : await leerRegla(ctx, entrada.reglaId);
      if (anterior !== null && entrada.vigenteDesde <= anterior.vigente_desde) {
        throw new ErrorDominio(
          'CONFIGURACION_CONFLICTO',
          'La versión nueva empieza después de la que cambia: lo causado no se recalcula.',
        );
      }
      const version = anterior === null ? 1 : anterior.version + 1;
      const nombre = anterior?.nombre ?? entrada.nombre;

      const nueva = await ctx.paso('insertar_version', () =>
        ctx.tx
          .insertInto('reglas_comision')
          .values({
            organizacion_id: organizacionId,
            nombre,
            version,
            esquema: entrada.esquema,
            tasa_servicio_bp: entrada.tasaServicioBp,
            tasa_producto_bp: entrada.tasaProductoBp,
            base: entrada.base,
            sobre_iva: entrada.sobreIva,
            material: entrada.material,
            reparto: entrada.reparto,
            escalones: entrada.escalones === null ? null : JSON.stringify(entrada.escalones),
            vigente_desde: entrada.vigenteDesde,
            creada_por: empleoId,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      let reasignadas = 0;
      if (anterior !== null) {
        await ctx.paso('cerrar_anterior', () =>
          ctx.tx
            .updateTable('reglas_comision')
            .set({ vigente_hasta: diaAnterior(entrada.vigenteDesde) })
            .where('organizacion_id', '=', organizacionId)
            .where('id', '=', anterior.id)
            .execute(),
        );
        const profesionales = await ctx.paso('mover_profesionales', () =>
          ctx.tx
            .updateTable('profesionales')
            .set({ regla_comision_id: nueva.id })
            .where('organizacion_id', '=', organizacionId)
            .where('regla_comision_id', '=', anterior.id)
            .executeTakeFirst(),
        );
        const servicios = await ctx.paso('mover_servicios', () =>
          ctx.tx
            .updateTable('servicios')
            .set({ regla_comision_id: nueva.id })
            .where('organizacion_id', '=', organizacionId)
            .where('regla_comision_id', '=', anterior.id)
            .executeTakeFirst(),
        );
        reasignadas = Number(profesionales.numUpdatedRows) + Number(servicios.numUpdatedRows);
      }

      ctx.auditar({
        entidadId: nueva.id,
        payload: { nombre, version, anterior: anterior?.id ?? null, reasignadas },
      });
      return { reglaId: nueva.id, version, reasignadas };
    },
  },
);

async function leerRegla(ctx: ContextoComando<Transaccion>, reglaId: string) {
  const regla = await ctx.paso('leer_regla', () =>
    ctx.tx
      .selectFrom('reglas_comision')
      .select(['id', 'nombre', 'version', 'vigente_desde'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', reglaId)
      .executeTakeFirst(),
  );
  if (regla === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa regla no existe en este negocio.');
  }
  return { ...regla, vigente_desde: String(regla.vigente_desde).slice(0, 10) };
}

export const entradaAsignarRegla = z.object({
  profesionalId: z.uuid(),
  /** Nula: sin regla propia, manda la del servicio. */
  reglaId: z.uuid().nullable(),
});

/** `comision.asignar_regla` — qué regla cobra cada profesional. */
export const asignarRegla = definirComando<
  Transaccion,
  typeof entradaAsignarRegla,
  { readonly profesionalId: string }
>({
  nombre: 'comision.asignar_regla',
  entidad: 'profesional',
  escribe: true,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAsignarRegla,
  async ejecutar(ctx, entrada) {
    if (entrada.reglaId !== null) await leerRegla(ctx, entrada.reglaId);
    const tocada = await ctx.paso('asignar', () =>
      ctx.tx
        .updateTable('profesionales')
        .set({ regla_comision_id: entrada.reglaId })
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('id', '=', entrada.profesionalId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (tocada === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa profesional no es de este salón.');
    }
    ctx.auditar({ entidadId: entrada.profesionalId, payload: { reglaId: entrada.reglaId } });
    return { profesionalId: entrada.profesionalId };
  },
});

export const entradaPendientesPorProfesional = z.object({
  desde: z.iso.date(),
  hasta: z.iso.date(),
});

export interface PendienteDeProfesional {
  readonly profesionalId: string;
  readonly causadoCentavos: string;
  readonly liquidadoCentavos: string;
  readonly pendienteCentavos: string;
}

/**
 * `liquidaciones.pendientes` — el total por persona del periodo, para la lista de la
 * liquidación: «la lista no trae el total por persona que dibuja el documento». Sólo la
 * dirección: son las comisiones de todas.
 */
export const pendientesPorProfesional = definirComando<
  Transaccion,
  typeof entradaPendientesPorProfesional,
  { readonly profesionales: readonly PendienteDeProfesional[] }
>({
  nombre: 'liquidaciones.pendientes',
  entidad: 'liquidacion',
  escribe: false,
  roles: [...LECTURA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaPendientesPorProfesional,
  async ejecutar(ctx, entrada) {
    const desde = new Date(`${entrada.desde}T00:00:00.000Z`);
    const hasta = new Date(`${entrada.hasta}T00:00:00.000Z`);
    const filas = await ctx.paso('leer_comisiones', () =>
      ctx.tx
        .selectFrom('comisiones_causadas')
        .select(['profesional_id', 'monto_centavos', 'liquidacion_id'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .where('causada_en', '>=', desde)
        .where('causada_en', '<', hasta)
        .execute(),
    );
    const porPersona = new Map<string, { causado: bigint; liquidado: bigint }>();
    for (const fila of filas) {
      const suma = porPersona.get(fila.profesional_id) ?? { causado: 0n, liquidado: 0n };
      const monto = BigInt(fila.monto_centavos);
      porPersona.set(fila.profesional_id, {
        causado: suma.causado + monto,
        liquidado: suma.liquidado + (fila.liquidacion_id === null ? 0n : monto),
      });
    }
    return {
      profesionales: [...porPersona].map(([profesionalId, { causado, liquidado }]) => ({
        profesionalId,
        causadoCentavos: causado.toString(),
        liquidadoCentavos: liquidado.toString(),
        pendienteCentavos: (causado - liquidado).toString(),
      })),
    };
  },
});
