import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-156-bis · El conteo de leche de la barra, que se hace de pie.
 *
 * ── Por qué la leche necesita su propio conteo ───────────────────────────
 * Porque es el insumo que más se pierde y el único que se mide en dos unidades
 * a la vez: hay cartones cerrados y hay UNO abierto por la mitad. Un conteo
 * general pide mililitros, y nadie mira un cartón y dice «quedan 380». Se
 * cuentan cartones y se estima el abierto en cuartos, que es como de verdad se
 * ve: «uno y tres cuartos».
 *
 * ── Y por qué se compara contra lo esperado EN EL MOMENTO ────────────────
 * La diferencia entre lo que el sistema cree y lo que hay en la nevera es merma
 * de barra: lo que se tiró al vaporizar de más, lo que se quedó en la jarra, lo
 * que se agrió. Es el 3 %–8 % del costo de la leche y hoy no aparece en ningún
 * sitio, así que nadie sabe si comprar de más es sobrecompra o desperdicio.
 * Guardar el conteo sin la diferencia sería guardar un número sin pregunta.
 *
 * ── El conteo NO ajusta solo ─────────────────────────────────────────────
 * Devuelve la diferencia y quien cuenta decide si la aplica. Ajustar en
 * automático haría que un cartón mal contado a las siete de la mañana se
 * convirtiera en una merma de dos litros sin que nadie lo hubiera mirado, y a
 * la segunda vez el barista deja de contar.
 */

const BARRA = ['mesero', 'cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Los cuartos son cómo se ve un cartón: «uno y tres cuartos». */
const CUARTOS = [0, 1, 2, 3, 4] as const;
const ESCALA = 10_000n;

export const entradaContarLeche = z.object({
  almacenId: z.uuid(),
  conteos: z
    .array(
      z.object({
        insumoId: z.uuid(),
        /** Los cerrados, que se cuentan mirando. */
        cartonesCerrados: z.number().int().min(0).max(200),
        /** El abierto, en cuartos: 0, 1, 2, 3 o 4. Nadie dice «380 ml». */
        cuartosDelAbierto: z.union([
          z.literal(0),
          z.literal(1),
          z.literal(2),
          z.literal(3),
          z.literal(4),
        ]),
        /** Cuántos mililitros trae un cartón entero. Normalmente 1000. */
        mlPorCarton: z.number().int().min(100).max(20_000).default(1_000),
      }),
    )
    .min(1)
    .max(20),
});

export interface DiferenciaDeLeche {
  readonly insumoId: string;
  readonly nombre: string;
  readonly contadoMl: string;
  readonly esperadoMl: string;
  /** Negativo es lo que falta: ESO es la merma de barra. */
  readonly diferenciaMl: string;
  /** En puntos base sobre lo esperado, para ordenar por gravedad. */
  readonly desvioBp: number;
}

export interface ResultadoConteoLeche {
  readonly diferencias: readonly DiferenciaDeLeche[];
  readonly faltanteTotalMl: string;
  /** Cuántos se pasan del desvío que se considera normal en barra. */
  readonly fueraDeRango: number;
}

/** Por encima de esto no es vaporizar de más: es un cartón que no se contó. */
const DESVIO_NORMAL_BP = 800;

export const contarLeche = definirComando<
  Transaccion,
  typeof entradaContarLeche,
  ResultadoConteoLeche
>({
  nombre: 'cafeteria.contar_leche',
  entidad: 'insumo',
  escribe: false,
  roles: [...BARRA],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaContarLeche,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const insumoIds = entrada.conteos.map((c) => c.insumoId);
    const insumos = await ctx.paso('leer_insumos', () =>
      ctx.tx
        .selectFrom('insumos')
        .select(['id', 'nombre', 'unidad_base'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', 'in', insumoIds)
        .execute(),
    );
    if (insumos.length !== insumoIds.length) {
      throw new ErrorDominio(
        'PUENTE_NO_ENCONTRADO',
        'Alguno de esos insumos no existe en este negocio.',
      );
    }
    for (const insumo of insumos) {
      if (insumo.unidad_base !== 'ml') {
        // Contar cartones de algo que se mide en piezas convertiría cada cartón
        // en mil piezas. La unidad base es la que hace que la cuenta signifique
        // algo, y aquí tiene que ser mililitros.
        throw new ErrorDominio(
          'CONFIGURACION_INVALIDA',
          `«${insumo.nombre}» no se mide en mililitros: no se cuenta por cartones.`,
        );
      }
    }

    const existencias = await ctx.paso('leer_existencias', () =>
      ctx.tx
        .selectFrom('existencias')
        .select(['insumo_id', 'cantidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', '=', entrada.almacenId)
        .where('insumo_id', 'in', insumoIds)
        .execute(),
    );
    const esperadoPorInsumo = new Map(existencias.map((e) => [e.insumo_id, aEscala(e.cantidad)]));
    const nombrePorInsumo = new Map(insumos.map((i) => [i.id, i.nombre]));

    let faltante = 0n;
    let fueraDeRango = 0;

    const diferencias = entrada.conteos.map((conteo) => {
      // Cartones enteros más los cuartos del abierto. El cuarto es la unidad de
      // la vista —«uno y tres cuartos»— y se convierte aquí, una sola vez.
      const mlPorCarton = BigInt(conteo.mlPorCarton);
      const contado =
        (BigInt(conteo.cartonesCerrados) * mlPorCarton +
          (mlPorCarton * BigInt(conteo.cuartosDelAbierto)) / 4n) *
        ESCALA;

      const esperado = esperadoPorInsumo.get(conteo.insumoId) ?? 0n;
      const diferencia = contado - esperado;
      if (diferencia < 0n) faltante += -diferencia;

      const desvioBp = esperado === 0n ? 0 : Number((diferencia * 10_000n) / esperado);
      if (Math.abs(desvioBp) > DESVIO_NORMAL_BP) fueraDeRango += 1;

      return {
        insumoId: conteo.insumoId,
        nombre: nombrePorInsumo.get(conteo.insumoId) ?? 'Sin nombre',
        contadoMl: deEscala(contado),
        esperadoMl: deEscala(esperado),
        diferenciaMl: deEscala(diferencia),
        desvioBp,
      };
    });

    // NO ajusta. Un cartón mal contado a las siete de la mañana se convertiría
    // en una merma de dos litros sin que nadie lo hubiera mirado, y a la segunda
    // vez el barista deja de contar. La merma se registra aparte, a mano, con
    // `registrarMermaBarra`.
    return {
      diferencias,
      faltanteTotalMl: deEscala(faltante),
      fueraDeRango,
    };
  },
});

/** Reexportado para la pantalla: los cinco valores que admite el abierto. */
export { CUARTOS };

function aEscala(valor: string): bigint {
  const [entero = '0', decimal = ''] = valor.trim().split('.');
  const signo = entero.startsWith('-') ? -1n : 1n;
  const magnitud =
    BigInt(entero.replace('-', '')) * ESCALA + BigInt(decimal.padEnd(4, '0').slice(0, 4));
  return signo * magnitud;
}

function deEscala(valor: bigint): string {
  const negativo = valor < 0n;
  const magnitud = negativo ? -valor : valor;
  const entero = magnitud / ESCALA;
  const resto = (magnitud % ESCALA).toString().padStart(4, '0');
  return `${negativo ? '-' : ''}${entero}.${resto}`;
}
