import 'server-only';

import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `propinas.guardar_esquema` — F-242.
 *
 * ── El acuerdo por escrito ─────────────────────────────────────────────────
 * En cuanto el restaurante pasa de quince empleados, la propina sólo para
 * meseros genera rotación de personal en cocina. La práctica mexicana —y la que
 * la reforma laboral empuja— es un pool repartido por puntos entre mesero,
 * garrotero, barra, cocina y lavaloza, acordado por escrito.
 *
 * ── Versionado, no editable ────────────────────────────────────────────────
 * Cambiar el reparto NO puede reescribir liquidaciones pasadas. Si el dueño
 * sube los puntos de cocina en marzo, la liquidación de febrero tiene que
 * seguir enseñando la fórmula de febrero. Por eso este comando no modifica el
 * esquema vigente: lo CIERRA el día anterior y crea otro. Sin eso, el sistema
 * resuelve un pleito y crea otro.
 *
 * ── Los puntos son del PUESTO ──────────────────────────────────────────────
 * No de la persona. El acuerdo se firma con el puesto y sobrevive a que alguien
 * se vaya; quien entra a lavaloza entra con los puntos de lavaloza.
 */

export const PUESTOS_DE_PROPINA = [
  'mesero',
  'garrotero',
  'barra',
  'cocina',
  'lavaloza',
  'caja',
] as const;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const entradaGuardarEsquema = z.object({
  nombre: z.string().trim().min(1).max(80),
  vigenteDesde: z.string().regex(FECHA, 'La vigencia va como AAAA-MM-DD.'),
  puntos: z
    .array(
      z.object({
        puesto: z.enum(PUESTOS_DE_PROPINA),
        /**
         * Puntos en CENTÉSIMAS, enteras. `numeric(6,2)` en la base.
         *
         * Entero y no decimal por la misma razón que el dinero: `2.5` puntos
         * llegando como coma flotante y multiplicándose por un pool de $18,433
         * da un centavo distinto según el navegador.
         */
        puntosCentesimas: z.number().int().min(0).max(999_999),
      }),
    )
    .min(1)
    .max(PUESTOS_DE_PROPINA.length),
});

export interface ResultadoEsquema {
  readonly esquemaId: string;
  readonly nombre: string;
  readonly vigenteDesde: string;
  readonly cerroAnterior: string | null;
}

/** El reparto lo acuerda la dirección: no es una decisión de turno. */
const ROLES = ['dueno', 'administrador'] as const;

export const guardarEsquemaPropina = definirComando<
  Transaccion,
  typeof entradaGuardarEsquema,
  ResultadoEsquema
>({
  nombre: 'propinas.guardar_esquema',
  entidad: 'esquema_propina',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaGuardarEsquema,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    if (sucursalId === null) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Un esquema de propina es de un salón: hace falta estar en una sucursal.',
      );
    }

    const puestos = new Set(entrada.puntos.map((p) => p.puesto));
    if (puestos.size !== entrada.puntos.length) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Ese puesto viene dos veces: sus puntos serían dos números para la misma fila.',
      );
    }

    const total = entrada.puntos.reduce((a, p) => a + p.puntosCentesimas, 0);
    if (total <= 0) {
      // Un esquema de cero puntos no reparte nada y dejaría el pool sin
      // repartir. Falla al guardarlo y no la noche que alguien lo use.
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        'Ese esquema reparte cero puntos: nadie recibiría nada.',
      );
    }

    const vigente = await ctx.paso('cargar_vigente', () =>
      ctx.tx
        .selectFrom('esquemas_propina')
        .select(['id', 'vigente_desde'])
        .where('organizacion_id', '=', organizacionId)
        .where('sucursal_id', '=', sucursalId)
        .where('vigente_hasta', 'is', null)
        .executeTakeFirst(),
    );

    let cerroAnterior: string | null = null;
    if (vigente !== undefined) {
      if (vigente.vigente_desde >= entrada.vigenteDesde) {
        throw new ErrorDominio(
          'LIQUIDACION_INVALIDA',
          `El esquema vigente empezó el ${vigente.vigente_desde}: el nuevo tiene que empezar después.`,
          { vigenteDesde: vigente.vigente_desde },
        );
      }
      // Se cierra el día ANTERIOR al nuevo: la restricción de exclusión de la
      // 076 usa un rango cerrado, así que compartir el día sería un traslape.
      const cierre = diaAnterior(entrada.vigenteDesde);
      await ctx.paso('cerrar_vigente', () =>
        ctx.tx
          .updateTable('esquemas_propina')
          .set({ vigente_hasta: cierre, activo: false })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', vigente.id)
          .where('vigente_hasta', 'is', null)
          .execute(),
      );
      cerroAnterior = cierre;
    }

    const esquema = await ctx.paso('crear_esquema', () =>
      ctx.tx
        .insertInto('esquemas_propina')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          nombre: entrada.nombre,
          vigente_desde: entrada.vigenteDesde,
          activo: true,
          empleado_id: empleoId,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    await ctx.paso('escribir_puntos', () =>
      ctx.tx
        .insertInto('esquema_propina_puntos')
        .values(
          entrada.puntos.map((p) => ({
            esquema_id: esquema.id,
            puesto: p.puesto,
            // A `numeric(6,2)` como texto: pasar por `Number` reintroduciría la
            // coma flotante que las centésimas existen para evitar.
            puntos: aDecimal(p.puntosCentesimas),
          })),
        )
        .execute(),
    );

    ctx.auditar({
      entidadId: esquema.id,
      payload: {
        nombre: entrada.nombre,
        vigenteDesde: entrada.vigenteDesde,
        cerroAnterior,
        puestos: entrada.puntos.map((p) => `${p.puesto}:${String(p.puntosCentesimas)}`),
      },
    });

    return {
      esquemaId: esquema.id,
      nombre: entrada.nombre,
      vigenteDesde: entrada.vigenteDesde,
      cerroAnterior,
    };
  },
});

/** `250` → `'2.50'`. Sin pasar por coma flotante. */
export function aDecimal(centesimas: number): string {
  const signo = centesimas < 0 ? '-' : '';
  const absoluto = Math.abs(centesimas);
  return `${signo}${Math.floor(absoluto / 100).toString()}.${(absoluto % 100).toString().padStart(2, '0')}`;
}

/** `'2.50'` → `250`. La vuelta, igual de exacta. */
export function aCentesimas(decimal: string): number {
  const negativo = decimal.startsWith('-');
  const limpio = negativo ? decimal.slice(1) : decimal;
  const [entera = '0', fraccion = ''] = limpio.split('.');
  const valor = Number(entera) * 100 + Number(fraccion.padEnd(2, '0').slice(0, 2));
  return negativo ? -valor : valor;
}

/**
 * El día anterior a una fecha `AAAA-MM-DD`, en texto.
 *
 * Con `Date` en UTC y no con la zona del servidor: una vigencia que se corriera
 * un día según dónde corre el proceso haría que dos esquemas se traslaparan —o
 * que quedara un día sin ninguno— y la liquidación de esa noche no sabría cuál
 * aplicar.
 */
function diaAnterior(fecha: string): string {
  const [a = 0, m = 1, d = 1] = fecha.split('-').map(Number);
  const anterior = new Date(Date.UTC(a, m - 1, d - 1));
  return anterior.toISOString().slice(0, 10);
}
