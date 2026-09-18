/**
 * F-306 · Cuánto falta, calculado en vez de inventado.
 *
 * ── Por qué importa que NO se teclee ───────────────────────────────────────
 * El anfitrión que dice «diez minutos» para que la familia no se vaya consigue
 * que se vaya igual a los veinte, y además molesta. Una espera calculada del
 * promedio real puede equivocarse, pero se equivoca en la misma dirección para
 * todos y se puede corregir mirando el dato.
 *
 * ── El modelo, y lo que deliberadamente no modela ──────────────────────────
 * Es una cola por tamaño de grupo: una pareja no espera a que se libere la mesa
 * de diez. Se cuentan los grupos que van DELANTE y que necesitan una mesa
 * compatible, se reparten entre las mesas compatibles que hay, y cada tanda
 * tarda lo que tarda una mesa.
 *
 * No modela que dos mesas se unan para un grupo de diez (eso es F-302 y lo
 * decide una persona mirando el salón), ni que la cocina vaya más lenta a las
 * 21:00, ni que el grupo de la ventana lleve dos horas con el café. Un modelo
 * que intentara eso sería más difícil de explicar que de acertar.
 */

export interface ColaDeEspera {
  /** Minutos que dura una ocupación, de F-305. La MEDIANA, no el promedio. */
  readonly medianaMinutos: number;
  /** Cuántos grupos van delante y necesitan una mesa de este tamaño. */
  readonly gruposDelante: number;
  /** Mesas del salón con capacidad suficiente para este grupo. */
  readonly mesasCompatibles: number;
  /** De ésas, cuántas están libres AHORA. */
  readonly mesasLibres: number;
}

/**
 * Los minutos que se le dicen al comensal.
 *
 * Con mesa libre compatible, cero: se sienta ya. Sin dato de rotación todavía
 * —un negocio recién instalado— devuelve `null` en vez de un número inventado:
 * «no lo sé» es una respuesta honesta y la pantalla puede decirlo.
 */
export function estimarEspera(cola: ColaDeEspera): number | null {
  if (cola.mesasCompatibles <= 0) return null;
  if (cola.medianaMinutos <= 0) return null;

  // Los que van delante ocupan primero las mesas libres; lo que sobra espera
  // tandas. Cuando sobran mesas —hay sitio para él y para los de delante—
  // `enCola` sale negativo y la división entera lo lleva a cero sin ningún caso
  // aparte: escribir ese `if` era repetir la aritmética con otras palabras y no
  // se podía poner rojo mutándolo, que es la señal de que sobraba.
  const enCola = cola.gruposDelante - cola.mesasLibres;
  const tandas = Math.floor(enCola / cola.mesasCompatibles) + 1;
  return Math.max(0, tandas) * cola.medianaMinutos;
}

/** Los cuatro estados de una espera, y la única forma de moverse entre ellos. */
export const ESTADOS_ESPERA = ['esperando', 'avisado', 'sentado', 'abandono'] as const;
export type EstadoEspera = (typeof ESTADOS_ESPERA)[number];

/**
 * A dónde puede ir una espera desde donde está.
 *
 * `sentado` y `abandono` son terminales: la familia ya está en su mesa o ya se
 * fue, y en los dos casos volver a la cola sería inventar que sigue ahí. Que
 * `esperando` pueda saltar directo a `sentado` sin pasar por `avisado` no es un
 * descuido: se libera una mesa, el anfitrión los ve de pie junto al atril y los
 * sienta sin llamarlos.
 */
const TRANSICIONES: Readonly<Record<EstadoEspera, readonly EstadoEspera[]>> = {
  esperando: ['avisado', 'sentado', 'abandono'],
  avisado: ['sentado', 'abandono'],
  sentado: [],
  abandono: [],
};

/**
 * Acepta `string` y no `EstadoEspera` a propósito: `desde` viene de una columna
 * de texto de la base, y un estado que no está en la tabla no abre ninguna
 * puerta. La comprobación de pertenencia se escribe con `hasOwnProperty`, igual
 * que `entidadMapeada` del puente, porque indexar un `Record` completo con una
 * clave arbitraria le dice al compilador que siempre hay valor y no lo hay.
 */
export function esTransicionDeEsperaValida(desde: string, hasta: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(TRANSICIONES, desde)) return false;
  return TRANSICIONES[desde as EstadoEspera].includes(hasta as EstadoEspera);
}
