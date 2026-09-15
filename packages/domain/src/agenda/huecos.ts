import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import { seEnciman, type Rango } from './duracion.ts';

/**
 * F-404 · Los huecos de verdad de un profesional.
 *
 * ── Por qué esto no es «restar citas al horario» ─────────────────────────
 * Porque el procesado de una clienta NO ocupa al profesional, y ése es
 * exactamente el hueco que vale dinero. Un cálculo de huecos que reste la
 * ocupación completa devuelve la agenda al modelo de un solo número y tira el
 * 25 %–40 % de capacidad que F-415 vino a recuperar.
 *
 * ── Y tampoco es «huecos de cualquier tamaño» ────────────────────────────
 * Un hueco de doce minutos entre dos citas no sirve para nada: no cabe ningún
 * servicio y sólo ensucia la pantalla. Se piden los huecos para UNA duración
 * concreta, que es la pregunta que de verdad se hace en el mostrador — «¿a qué
 * hora le puedo dar un corte?».
 */

export interface VentanaDeTrabajo {
  readonly inicio: Date;
  readonly fin: Date;
}

export interface Hueco {
  readonly inicio: Date;
  readonly fin: Date;
  readonly minutos: number;
}

const MS_POR_MINUTO = 60_000;

/**
 * Los huecos donde CABE un servicio de `minutosNecesarios`.
 *
 * `ocupados` son los rangos ACTIVOS del profesional más sus bloqueos: lo que de
 * verdad lo tiene ocupado. La ocupación de estación va por su lado, porque es
 * otro recurso.
 */
export function huecosDeAgenda(
  ventanas: readonly VentanaDeTrabajo[],
  ocupados: readonly Rango[],
  minutosNecesarios: number,
): readonly Hueco[] {
  if (!Number.isInteger(minutosNecesarios) || minutosNecesarios <= 0) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'Un hueco se busca para un servicio que dura algo.',
      { minutosNecesarios },
    );
  }

  const huecos: Hueco[] = [];

  for (const ventana of ventanas) {
    // Una ventana al revés —fin antes que inicio— no necesita guarda: el
    // barrido de abajo arranca en `inicio` y sólo añade un hueco cuando queda
    // tiempo ANTES de `fin`, así que produce cero. Había aquí una salida
    // temprana y se quitó: no ponía roja ninguna prueba, y una guarda que nadie
    // puede ver fallar es una línea que hay que leer y que no protege de nada.

    // Sólo lo que toca ESTA ventana, ordenado. Un bloqueo de otro día no
    // recorta la mañana de hoy, y sin ordenar el barrido deja huecos negativos.
    const dentro = ocupados
      .filter((o) => seEnciman(o, ventana))
      .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

    let libreDesde = ventana.inicio;
    for (const ocupado of dentro) {
      if (ocupado.inicio.getTime() > libreDesde.getTime()) {
        agregar(huecos, libreDesde, ocupado.inicio, minutosNecesarios);
      }
      // `Math.max` y no una asignación directa: dos citas que se encabalgan
      // —el procesado de una dentro de otra— harían retroceder el reloj y el
      // hueco siguiente saldría contado dos veces.
      if (ocupado.fin.getTime() > libreDesde.getTime()) libreDesde = ocupado.fin;
    }

    if (libreDesde.getTime() < ventana.fin.getTime()) {
      agregar(huecos, libreDesde, ventana.fin, minutosNecesarios);
    }
  }

  return huecos;
}

function agregar(huecos: Hueco[], inicio: Date, fin: Date, minimo: number): void {
  const minutos = Math.floor((fin.getTime() - inicio.getTime()) / MS_POR_MINUTO);
  // Un hueco que no alcanza no es un hueco: es ruido en la pantalla del
  // mostrador justo cuando hay alguien esperando respuesta.
  if (minutos < minimo) return;
  huecos.push({ inicio, fin, minutos });
}

export interface CandidataEnEspera {
  readonly id: string;
  /** Cuándo se apuntó. El orden de la lista, y la única justicia que hay. */
  readonly apuntadaEn: Date;
  /** Las ventanas en que la clienta SÍ puede venir. */
  readonly ventanas: readonly VentanaDeTrabajo[];
  readonly minutosNecesarios: number;
  /** `null` = le da igual quién la atienda. */
  readonly profesionalId: string | null;
}

/**
 * F-409 · A quién se le ofrece el hueco que acaba de liberarse.
 *
 * ── Por qué la lista de espera es una lista y no un aviso masivo ─────────
 * Porque mandarle el hueco a las once clientas de la lista hace que diez se
 * enojen y una conteste. Se ofrece **en orden de llegada** y sólo a quien de
 * verdad puede venir a esa hora: ofrecer un hueco de las 10:00 a quien dijo que
 * sólo puede por la tarde es gastar el único mensaje que la clienta va a leer.
 *
 * ── Por qué el orden es por antigüedad y no por ticket ───────────────────
 * Porque la lista de espera es lo que el salón le promete a la clienta cuando
 * le dice «yo te aviso». Ordenarla por cuánto gasta convierte una promesa en
 * una subasta, y eso se nota a la tercera vez.
 */
export function aQuienSeLeOfrece(
  hueco: Rango,
  profesionalId: string,
  candidatas: readonly CandidataEnEspera[],
): readonly CandidataEnEspera[] {
  const minutosDelHueco = Math.floor(
    (hueco.fin.getTime() - hueco.inicio.getTime()) / MS_POR_MINUTO,
  );

  return candidatas
    .filter((c) => c.minutosNecesarios <= minutosDelHueco)
    .filter((c) => c.profesionalId === null || c.profesionalId === profesionalId)
    .filter((c) => c.ventanas.some((v) => cabeDentro(hueco, v)))
    .sort((a, b) => a.apuntadaEn.getTime() - b.apuntadaEn.getTime());
}

/**
 * El hueco tiene que caber ENTERO en la ventana de la clienta.
 *
 * Que se toquen no basta: si dijo que puede de 4 a 6 y el hueco va de 5:30 a
 * 7:00, ofrecérselo es ofrecerle algo a lo que no puede venir, y la llamada se
 * gasta igual.
 */
function cabeDentro(hueco: Rango, ventana: VentanaDeTrabajo): boolean {
  return (
    hueco.inicio.getTime() >= ventana.inicio.getTime() &&
    hueco.fin.getTime() <= ventana.fin.getTime()
  );
}
