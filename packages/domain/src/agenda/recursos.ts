import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

import { seEnciman, type Rango } from './duracion.ts';

/**
 * F-403 · La agenda por RECURSO: lavabo, secadora, cabina.
 *
 * ── Por qué la agenda de personas no alcanza ─────────────────────────────
 * Un salón con cuatro estilistas y UN lavabo no puede dar cuatro lavados a la
 * misma hora, aunque las cuatro estén libres. `huecosDeAgenda` contesta «¿está
 * libre Karla?»; esto contesta «¿y el lavabo?». Sin la segunda pregunta, el
 * sistema agenda cuatro citas que sólo se pueden dar de una en una, y eso no se
 * descubre en la pantalla: se descubre con cuatro clientas sentadas esperando.
 *
 * ── La CAPACIDAD es del tipo, no de la pieza ─────────────────────────────
 * Un salón no tiene «lavabo 1» y «lavabo 2» en la cabeza de nadie: tiene «dos
 * lavabos». Agendar contra una pieza concreta obligaría a elegir cuál, y a
 * mover citas cuando una se ocupa. Se agenda contra el TIPO con su capacidad, y
 * qué pieza toca se decide el día que la clienta llega — que es como funciona
 * de verdad.
 *
 * ── Y el recurso se ocupa DURANTE EL PROCESADO ───────────────────────────
 * Ésta es la asimetría que define el modelo: durante los 35 minutos de
 * procesado la profesional queda libre y el lavabo NO. Tratarlos igual tira el
 * 25-40 % de capacidad que el bloque de agenda vino a recuperar, o promete
 * lavabos que no hay. Por eso lo que entra aquí es el rango COMPLETO del
 * servicio, y lo que entra en la agenda de la persona son sólo sus tramos
 * activos.
 */

export interface TipoDeRecurso {
  readonly tipo: string;
  /** Cuántas piezas hay de este tipo. Dos lavabos son capacidad 2. */
  readonly capacidad: number;
}

/** Lo que un servicio necesita: el tipo, y cuántas piezas a la vez. */
export interface DemandaDeRecurso {
  readonly tipo: string;
  readonly piezas: number;
}

export interface OcupacionDeRecurso {
  readonly tipo: string;
  readonly rango: Rango;
  /** Casi siempre 1. Un color a dos cabezas puede pedir dos. */
  readonly piezas: number;
}

export interface Veredicto {
  readonly cabe: boolean;
  /** Los tipos que impiden la cita. Vacío cuando cabe. */
  readonly saturados: readonly string[];
}

function exigirEntero(valor: number, nombre: string, minimo: number): void {
  if (!Number.isInteger(valor) || valor < minimo) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      `«${nombre}» tiene que ser un entero de ${minimo} para arriba.`,
      { valor },
    );
  }
}

/**
 * F-403 · Cuántas piezas de este tipo están ocupadas en el instante más cargado
 * del rango que se quiere agendar.
 *
 * Se mira el PICO y no el promedio: dos lavados de media hora dentro de una
 * hora dan un promedio de uno y un pico de dos, y lo que decide si cabe es el
 * pico. El barrido va por los inicios de las ocupaciones que se solapan, porque
 * el máximo simultáneo sólo puede cambiar cuando algo empieza.
 */
export function piezasOcupadasEnPico(
  tipo: string,
  rango: Rango,
  ocupaciones: readonly OcupacionDeRecurso[],
): number {
  const suyas = ocupaciones.filter((o) => o.tipo === tipo && seEnciman(o.rango, rango));
  if (suyas.length === 0) return 0;

  // Los instantes candidatos: el inicio del rango que se pregunta y el de cada
  // ocupación que cae dentro. En cualquier otro punto el conteo no sube.
  const instantes = [rango.inicio.getTime(), ...suyas.map((o) => o.rango.inicio.getTime())].filter(
    (t) => t >= rango.inicio.getTime() && t < rango.fin.getTime(),
  );

  let pico = 0;
  for (const t of instantes) {
    const simultaneas = suyas
      .filter((o) => o.rango.inicio.getTime() <= t && t < o.rango.fin.getTime())
      .reduce((suma, o) => suma + o.piezas, 0);
    if (simultaneas > pico) pico = simultaneas;
  }
  return pico;
}

/**
 * F-403 · ¿Caben los recursos que este servicio necesita, en este rango?
 *
 * Devuelve QUÉ tipo satura y no sólo un booleano: la pantalla de agendar tiene
 * que poder decir «no hay lavabo a esa hora» en vez de «no se puede», que es lo
 * que hace que la recepcionista llame al dueño en lugar de ofrecer las 12:30.
 */
export function recursosDisponibles(
  rango: Rango,
  demandas: readonly DemandaDeRecurso[],
  tipos: readonly TipoDeRecurso[],
  ocupaciones: readonly OcupacionDeRecurso[],
): Veredicto {
  if (rango.fin.getTime() <= rango.inicio.getTime()) {
    throw new ErrorDominio(
      CODIGOS_ERROR.CONFIGURACION_INVALIDA,
      'El rango de la cita termina antes de empezar.',
    );
  }

  const capacidadDe = new Map(tipos.map((t) => [t.tipo, t.capacidad]));
  const saturados: string[] = [];

  for (const demanda of demandas) {
    exigirEntero(demanda.piezas, 'piezas', 1);
    const capacidad = capacidadDe.get(demanda.tipo);
    if (capacidad === undefined) {
      // Un servicio que pide un recurso que el salón no tiene NO se agenda en
      // silencio: es una configuración a medias, y descubrirla con la clienta
      // sentada es lo que este veredicto evita.
      saturados.push(demanda.tipo);
      continue;
    }
    exigirEntero(capacidad, 'capacidad', 0);
    const ocupadas = piezasOcupadasEnPico(demanda.tipo, rango, ocupaciones);
    if (ocupadas + demanda.piezas > capacidad) saturados.push(demanda.tipo);
  }

  return { cabe: saturados.length === 0, saturados };
}

/**
 * F-403 · El rango que una cita ocupa de un recurso: COMPLETO.
 *
 * Existe como función propia y de una línea para que haya UN solo sitio que lo
 * diga. Cuando cada comando lo calcula por su cuenta, alguno acaba restando el
 * procesado —porque «la profesional está libre»— y el lavabo se promete dos
 * veces a la misma hora.
 */
export function rangoDelRecurso(cita: Rango): Rango {
  return cita;
}
