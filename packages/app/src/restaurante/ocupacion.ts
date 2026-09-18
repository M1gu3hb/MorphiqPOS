import 'server-only';

import { PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `restaurante.rotacion_de_mesas` — F-305.
 *
 * ── La pregunta que el dueño no puede contestar hoy ────────────────────────
 * «¿Cuánto tarda una mesa en mi restaurante?» De ese número depende su
 * rotación, y de su rotación depende el negocio: cuántas mesas poner, cuánta
 * gente contratar el viernes, si vale la pena la terraza. Hoy `mesas.estado`
 * sólo guarda el estado ACTUAL, así que al liberar la mesa se borra la historia
 * de la noche y no queda nada que promediar.
 *
 * ── La mediana, no sólo el promedio ────────────────────────────────────────
 * Una mesa que se quedó abierta toda la noche porque nadie la liberó mete un
 * ciclo de 400 minutos y arrastra el promedio del turno entero. La mediana
 * aguanta ese caso y es la que el dueño debería mirar; el promedio se devuelve
 * igual porque es el número que la gente espera ver, y verlos juntos es lo que
 * enseña cuándo hay un dato raro.
 *
 * ── Y el ciclo abierto se excluye ──────────────────────────────────────────
 * La vista `ocupacion_mesas` devuelve con `fin` nulo la mesa que está ocupada
 * ahora mismo. Promediarla diría que esa mesa tardó lo que lleva sentada, que
 * todavía no se sabe. Se filtra aquí, y está dicho en la vista para que nadie
 * lo olvide en la siguiente consulta.
 */

const ROLES = ['gerente', 'administrador', 'dueno'] as const;

export const entradaRotacion = z.object({
  /** Cuántos días atrás mirar. Un turno, una semana, un mes. */
  dias: z.number().int().min(1).max(90).default(7),
});

export interface RotacionPorMesa {
  readonly mesaId: string;
  readonly numero: number;
  readonly ciclos: number;
  readonly minutosPromedio: number;
  readonly minutosMediana: number;
}

export interface Rotacion {
  readonly desde: string;
  readonly ciclos: number;
  readonly minutosPromedio: number;
  readonly minutosMediana: number;
  /** Del momento en que se sientan a que piden la cuenta. */
  readonly minutosHastaCuenta: number;
  readonly personasPromedio: number;
  readonly porMesa: readonly RotacionPorMesa[];
}

export const rotacionDeMesas = definirComando<Transaccion, typeof entradaRotacion, Rotacion>({
  nombre: 'restaurante.rotacion_de_mesas',
  entidad: 'mesa',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_RESTAURANTE,
  entrada: entradaRotacion,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;
    const desde = new Date(ctx.ahora.getTime() - entrada.dias * 24 * 60 * 60 * 1000);

    let consulta = ctx.tx
      .selectFrom('ocupacion_mesas as o')
      .leftJoin('mesas as m', 'm.id', 'o.mesa_id')
      .select([
        'o.mesa_id as mesaId',
        'o.minutos_ocupada as minutos',
        'o.minutos_hasta_cuenta as minutosHastaCuenta',
        'o.personas as personas',
        'm.numero as numero',
      ])
      .where('o.organizacion_id', '=', organizacionId)
      // El ciclo vigente no se promedia: todavía no ha terminado.
      .where('o.fin', 'is not', null)
      .where('o.inicio', '>=', desde);

    // Sin sucursal en la sesión se mira el negocio entero. Es el caso del dueño
    // de dos locales, que es precisamente quien más quiere comparar.
    if (sucursalId !== null) {
      consulta = consulta.where('o.sucursal_id', '=', sucursalId);
    }

    const filas = await ctx.paso('leer_ocupacion', () => consulta.execute());

    const minutos = filas.map((f) => f.minutos ?? 0);
    const hastaCuenta = filas
      .map((f) => f.minutosHastaCuenta)
      .filter((m): m is number => m !== null);
    const personas = filas.map((f) => f.personas).filter((p): p is number => p !== null);

    const porMesa = new Map<string, { numero: number; minutos: number[] }>();
    for (const fila of filas) {
      const actual = porMesa.get(fila.mesaId) ?? { numero: fila.numero ?? 0, minutos: [] };
      actual.minutos.push(fila.minutos ?? 0);
      porMesa.set(fila.mesaId, actual);
    }

    return {
      desde: desde.toISOString(),
      ciclos: filas.length,
      minutosPromedio: promedio(minutos),
      minutosMediana: mediana(minutos),
      minutosHastaCuenta: mediana(hastaCuenta),
      personasPromedio: promedio(personas),
      porMesa: [...porMesa.entries()]
        .map(([mesaId, datos]) => ({
          mesaId,
          numero: datos.numero,
          ciclos: datos.minutos.length,
          minutosPromedio: promedio(datos.minutos),
          minutosMediana: mediana(datos.minutos),
        }))
        .sort((a, b) => a.numero - b.numero),
    };
  },
});

/** Redondeado al minuto: medio minuto de rotación no le sirve a nadie. */
function promedio(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/**
 * La mediana, con el promedio de los dos centrales cuando son pares.
 *
 * `toSorted` y no `sort`: ordenar en su sitio mutaría el arreglo que el llamador
 * sigue usando para el promedio, y el promedio saldría igual —sumar no depende
 * del orden— hasta el día que alguien añada un cálculo que sí dependa.
 */
function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[medio] ?? 0;
  return Math.round(((ordenados[medio - 1] ?? 0) + (ordenados[medio] ?? 0)) / 2);
}
