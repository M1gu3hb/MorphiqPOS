import { ErrorDominio } from '@morphiqpos/contracts';

/**
 * El periodo que se liquida (F1-04 §30).
 *
 * ── Por qué el rango llega resuelto y no se calcula aquí ───────────────────
 * `LiquidarPropinasDialog.jsx:57-66` calcula «hoy», «esta semana», «quincena» y
 * «este mes» con `date-fns` en la hora local de la terminal, y le enseña al
 * administrador las dos fechas antes de que pulse el botón. Derivar el rango otra
 * vez en el servidor, en UTC o en la zona de la organización, abriría la puerta a
 * que se liquide un periodo distinto del que la pantalla mostró — y eso es dinero
 * de meseros, no una preferencia de interfaz.
 *
 * Así que el instante viaja explícito y `rangoTipo` es la ETIQUETA de cómo se
 * eligió, que es justo lo que `liquidaciones_propina.rango_tipo` guarda. El total
 * sigue calculándolo el servidor: un rango no es un importe.
 */

/** Los seis valores del `check` de `liquidaciones_propina.rango_tipo`. */
export const RANGOS_DE_LIQUIDACION = [
  'dia',
  'semana',
  'quincena',
  'mes',
  'personalizado',
  'mesero',
] as const;

export type RangoDeLiquidacion = (typeof RANGOS_DE_LIQUIDACION)[number];

/**
 * Tope del periodo, en días.
 *
 * Un año y un día. No es una cifra redonda por gusto: cubre «todo el año pasado»
 * —que es el rango más largo que alguien pide de verdad— y corta el
 * `rango_inicio: '1970-01-01'` que barrería el histórico entero de una vez, sin
 * que nadie pueda revisar lo que se está liquidando.
 */
export const DIAS_MAXIMOS_DE_RANGO = 366;

const MILISEGUNDOS_POR_DIA = 86_400_000;

export interface RangoResuelto {
  readonly inicio: Date;
  readonly fin: Date;
}

/**
 * Valida el periodo y lo devuelve como dos instantes.
 *
 * Falla con `LIQUIDACION_INVALIDA` en vez de corregir en silencio. Un rango al
 * revés hoy no liquida nada y el diálogo enseña «$0.00» sin decir por qué, que es
 * indistinguible de «no hubo propinas».
 */
export function resolverRango(desde: string, hasta: string): RangoResuelto {
  const inicio = instante(desde, 'desde');
  const fin = instante(hasta, 'hasta');

  if (fin.getTime() < inicio.getTime()) {
    throw new ErrorDominio(
      'LIQUIDACION_INVALIDA',
      'El periodo está al revés: la fecha final es anterior a la inicial.',
      { desde, hasta },
    );
  }

  const dias = (fin.getTime() - inicio.getTime()) / MILISEGUNDOS_POR_DIA;
  if (dias > DIAS_MAXIMOS_DE_RANGO) {
    throw new ErrorDominio(
      'LIQUIDACION_INVALIDA',
      `El periodo no puede pasar de ${DIAS_MAXIMOS_DE_RANGO} días. Liquida por partes.`,
      { dias: Math.floor(dias) },
    );
  }

  return { inicio, fin };
}

function instante(valor: string, cual: 'desde' | 'hasta'): Date {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorDominio(
      'LIQUIDACION_INVALIDA',
      `La fecha «${cual}» del periodo no es una fecha válida.`,
      { valor },
    );
  }
  return fecha;
}
