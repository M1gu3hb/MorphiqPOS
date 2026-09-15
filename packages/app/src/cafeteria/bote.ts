import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repartirPorPesos, type Centavos } from '@morphiqpos/domain/dinero';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { SERIE_LIQUIDACION, folioVisible } from '../propinas/liquidar.ts';
import { tomarFolioDeLiquidacion } from '../propinas/folio.ts';

/**
 * `cafeteria.repartir_bote` y `ajustar_presencia` — F-248.
 *
 * ── El dolor 2 de `restaurante`, en versión mostrador ─────────────────────
 * El reparto del bote se hace a ojo, en efectivo, y en cuanto entra un tercero
 * los fines de semana empieza el resentimiento. «Yo estuve toda la tarde» contra
 * «yo abrí» no se resuelve discutiendo: se resuelve con las horas de cada uno,
 * que es lo que `presencias_turno` guarda.
 *
 * ── Por horas, y el documento lo dice ─────────────────────────────────────
 * `liquidaciones_propina.reparto_base = 'horas'`. Sin ese campo, dos
 * liquidaciones con el mismo total y repartos distintos serían indistinguibles
 * seis meses después, que es justo cuando alguien pregunta.
 *
 * ── Y dice también si las horas se tecleraron ─────────────────────────────
 * `presencias_turno.origen` distingue lo que registró el PIN de lo que corrigió
 * una persona. Un reparto calculado sobre horas tecleadas no es lo mismo que uno
 * calculado sobre horas registradas, y el que cobra menos tiene derecho a verlo.
 */

export const entradaRepartirBote = z.object({ sesionCajaId: z.uuid() });

export const entradaAjustarPresencia = z.object({
  presenciaId: z.uuid(),
  entroEn: z.iso.datetime().optional(),
  salioEn: z.iso.datetime().optional(),
  motivo: z.string().trim().min(3).max(200),
});

export interface ParteDelBote {
  readonly empleoId: string;
  readonly minutos: number;
  readonly montoCentavos: string;
  readonly origen: string;
}

export interface ResultadoBote {
  readonly liquidacionId: string;
  readonly folio: string;
  readonly totalCentavos: string;
  readonly repartoBase: string;
  readonly hayHorasTecleadas: boolean;
  readonly partes: readonly ParteDelBote[];
}

/** Repartir el bote lo firma quien responde del turno, no quien cobra en él. */
const ROLES = ['gerente', 'administrador', 'dueno'] as const;

export const repartirBote = definirComando<Transaccion, typeof entradaRepartirBote, ResultadoBote>({
  nombre: 'cafeteria.repartir_bote',
  entidad: 'liquidacion_propina',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaRepartirBote,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const sesion = await ctx.paso('cargar_turno', () =>
      ctx.tx
        .selectFrom('sesiones_caja')
        .select([
          'id',
          'sucursal_id as sucursalId',
          'estado',
          'abierta_en as abiertaEn',
          'cerrada_en as cerradaEn',
          'bote_contado_centavos as bote',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.sesionCajaId)
        .executeTakeFirst(),
    );

    if (sesion === undefined) {
      throw new ErrorDominio('CORTE_NO_ENCONTRADO', 'Ese turno no existe en este negocio.');
    }
    if (sesion.estado !== 'cerrada') {
      // Repartir un bote abierto es repartir un número que todavía va a cambiar.
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Ese turno sigue abierto: el bote se reparte al cerrarlo.',
        { estado: sesion.estado },
      );
    }
    if (sesion.bote === null) {
      // Nulo NO es cero: es «no se contó». Repartir cero cuando nadie contó
      // sería firmar un documento que dice que no hubo propina esa noche.
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Ese turno cerró sin contar el bote: no hay nada que repartir todavía.',
      );
    }

    const ya = await ctx.paso('mirar_repartos', () =>
      ctx.tx
        .selectFrom('liquidaciones_propina')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('sesion_caja_id', '=', sesion.id)
        .executeTakeFirst(),
    );
    if (ya !== undefined) {
      throw new ErrorDominio(
        'PROPINA_YA_LIQUIDADA',
        'El bote de ese turno ya se repartió. Un reparto firmado no se vuelve a firmar.',
        { liquidacionId: ya.id },
      );
    }

    const presencias = await ctx.paso('cargar_presencias', () =>
      ctx.tx
        .selectFrom('presencias_turno')
        .select(['id', 'empleado_id as empleadoId', 'minutos', 'origen'])
        .where('organizacion_id', '=', organizacionId)
        .where('sesion_caja_id', '=', sesion.id)
        .execute(),
    );

    const conHoras = presencias.filter((p) => (p.minutos ?? 0) > 0);
    if (conHoras.length === 0) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Ese turno no tiene presencias cerradas: sin horas no hay proporción que repartir.',
      );
    }

    const total = sesion.bote;
    const trozos = repartirPorPesos(
      total as Centavos,
      conHoras.map((p) => p.minutos ?? 0),
    );

    const folio = await ctx.paso('tomar_folio', () =>
      tomarFolioDeLiquidacion(ctx.tx, organizacionId, SERIE_LIQUIDACION),
    );

    const liquidacion = await ctx.paso('crear_liquidacion', () =>
      ctx.tx
        .insertInto('liquidaciones_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sesion.sucursalId,
          serie: folio.serie,
          folio: folio.folio,
          liquidada_en: ctx.ahora,
          rango_inicio: sesion.abiertaEn,
          rango_fin: sesion.cerradaEn ?? ctx.ahora,
          rango_tipo: 'turno',
          empleado_id: null,
          total_centavos: total,
          empleado_liquida_id: empleoId,
          sesion_caja_id: sesion.id,
          reparto_base: 'horas',
          formula_snapshot: JSON.stringify({
            base: 'horas',
            presencias: conHoras.map((p) => ({
              empleado_id: p.empleadoId,
              minutos: p.minutos,
              origen: p.origen,
            })),
          }),
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('escribir_beneficiarios', () =>
      ctx.tx
        .insertInto('liquidacion_propina_beneficiarios')
        .values(
          conHoras.map((p, i) => ({
            liquidacion_id: liquidacion.id,
            empleado_id: p.empleadoId,
            // El «puesto» de un reparto por horas es la base, no un cargo: el
            // acuerdo aquí es el tiempo, y escribir «barista» fingiría que hubo
            // un esquema de puestos que no hubo.
            puesto: 'horas',
            puntos: ((p.minutos ?? 0) / 60).toFixed(2),
            monto_centavos: trozos[i] ?? 0n,
          })),
        )
        .execute(),
    );

    const hayTecleadas = conHoras.some((p) => p.origen === 'manual');

    ctx.auditar({
      entidadId: liquidacion.id,
      payload: {
        sesionCajaId: sesion.id,
        totalCentavos: total.toString(),
        personas: conHoras.length,
        hayHorasTecleadas: hayTecleadas,
      },
    });

    return {
      liquidacionId: liquidacion.id,
      folio: folioVisible(folio.serie, folio.folio),
      totalCentavos: total.toString(),
      repartoBase: 'horas',
      // Se devuelve para que la pantalla lo ENSEÑE. Un reparto sobre horas
      // corregidas a mano no es lo mismo que uno sobre horas registradas, y
      // quien cobra menos tiene derecho a saberlo antes de firmar.
      hayHorasTecleadas: hayTecleadas,
      partes: conHoras.map((p, i) => ({
        empleoId: p.empleadoId,
        minutos: p.minutos ?? 0,
        montoCentavos: (trozos[i] ?? 0n).toString(),
        origen: p.origen,
      })),
    };
  },
});

export const ajustarPresencia = definirComando<
  Transaccion,
  typeof entradaAjustarPresencia,
  { readonly presenciaId: string; readonly minutos: number | null }
>({
  nombre: 'cafeteria.ajustar_presencia',
  entidad: 'presencia_turno',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAjustarPresencia,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    if (entrada.entroEn === undefined && entrada.salioEn === undefined) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Un ajuste que no cambia ninguna hora no es un ajuste.',
      );
    }

    const presencia = await ctx.paso('cargar_presencia', () =>
      ctx.tx
        .selectFrom('presencias_turno')
        .select(['id', 'sesion_caja_id as sesionCajaId', 'entro_en as entroEn'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.presenciaId)
        .executeTakeFirst(),
    );
    if (presencia === undefined) {
      throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Esa presencia no existe en este negocio.');
    }

    // UN REPARTO FIRMADO NO SE RECALCULA. Si el bote de ese turno ya se
    // repartió, corregir las horas cambiaría la base de un documento que la
    // gente ya cobró — y el sistema pasaría de resolver el pleito a crearlo.
    const repartido = await ctx.paso('mirar_reparto', () =>
      ctx.tx
        .selectFrom('liquidaciones_propina')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('sesion_caja_id', '=', presencia.sesionCajaId)
        .executeTakeFirst(),
    );
    if (repartido !== undefined) {
      throw new ErrorDominio(
        'PROPINA_YA_LIQUIDADA',
        'El bote de ese turno ya se repartió: sus horas no se pueden corregir.',
        { liquidacionId: repartido.id },
      );
    }

    const entroEn = entrada.entroEn === undefined ? presencia.entroEn : new Date(entrada.entroEn);
    const salioEn = entrada.salioEn === undefined ? undefined : new Date(entrada.salioEn);

    if (salioEn !== undefined && salioEn < entroEn) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Esa salida es anterior a la entrada: los minutos saldrían negativos.',
      );
    }

    await ctx.paso('ajustar', () =>
      ctx.tx
        .updateTable('presencias_turno')
        .set({
          entro_en: entroEn,
          ...(salioEn === undefined ? {} : { salio_en: salioEn }),
          // MARCADO como manual, con quién y por qué. Un ajuste sin rastro es
          // el camino corto para inflarse las horas.
          origen: 'manual',
          ajustada_por: empleoId,
          motivo_ajuste: entrada.motivo,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.presenciaId)
        .execute(),
    );

    const minutos =
      salioEn === undefined
        ? null
        : Math.max(0, Math.round((salioEn.getTime() - entroEn.getTime()) / 60_000));

    ctx.auditar({
      entidadId: entrada.presenciaId,
      payload: { motivo: entrada.motivo, minutos },
    });

    return { presenciaId: entrada.presenciaId, minutos };
  },
});
