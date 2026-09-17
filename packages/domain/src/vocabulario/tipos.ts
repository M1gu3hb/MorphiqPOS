/**
 * F-017 · El diccionario de vocabulario del giro.
 *
 * Una entidad interna, N nombres visibles. «Mesa» en un restaurante es
 * «estación» en una estética, «bahía» en un taller y «habitación» en un hotel,
 * y el sistema que las llama a todas «mesa» se siente prestado desde el primer
 * minuto.
 *
 * ── Por qué lleva GÉNERO ───────────────────────────────────────────────────
 * Porque el español lo exige y porque es lo que delata a un sistema traducido a
 * medias. «El bahía está libre» o «la mesa 3 está ocupado» se leen mal en tres
 * segundos, y ningún cliente sabe explicar por qué le parece un producto
 * genérico — sólo sabe que se lo parece.
 *
 * ── Por qué se teclea por GIRO y no por plantilla ──────────────────────────
 * D-04 dice «un diccionario declarado en la plantilla». Al construirlo resultó
 * falso: **Abarrotes Don Chuy y Ferretería La Broca comparten la plantilla
 * `tienda` y NO comparten vocabulario.** Don Chuy vende «productos»; La Broca
 * vende «material» y «piezas», y su propia carpeta lo levantó como defecto
 * («artículo donde debe decir material»). La plantilla dice qué MÓDULOS tiene
 * el negocio; el giro dice CÓMO HABLA. Son ejes distintos, igual que giro y
 * paquete lo fueron en la 054.
 */

/** Los seis géneros gramaticales que hacen falta. No hay más en español. */
export type Genero = 'femenino' | 'masculino';

/** Un término con lo que el español necesita para conjugarlo bien. */
export interface Termino {
  readonly singular: string;
  readonly plural: string;
  readonly genero: Genero;
}

/**
 * Las entidades que cambian de nombre entre giros.
 *
 * Cerrada a propósito: si una pantalla necesita traducir algo que no está aquí,
 * la respuesta es añadirlo a esta lista —y entonces los 78 giros pueden
 * traducirlo— y no inventarse una cadena suelta en el componente.
 */
export const ENTIDADES = [
  'unidad_servicio',
  'orden',
  'linea_orden',
  'responsable',
  'cliente',
  'preparacion',
  'producto',
] as const;

export type Entidad = (typeof ENTIDADES)[number];

export function esEntidad(valor: unknown): valor is Entidad {
  return typeof valor === 'string' && (ENTIDADES as readonly string[]).includes(valor);
}

/**
 * Un diccionario de giro. Una entidad AUSENTE está apagada a propósito.
 *
 * Regla 3 del sistema de diseño: *«si un giro no usa una entidad, no se
 * traduce: se apaga»*. Una ferretería no tiene preparación, y ponerle un nombre
 * a algo que no existe es peor que no tenerlo — obliga a la pantalla a decidir
 * si lo enseña, que es justo lo que el diccionario venía a evitar.
 */
export type Diccionario = Partial<Readonly<Record<Entidad, Termino>>>;

/**
 * Las palabras que TIENEN que concordar con el sustantivo, tecleadas en su
 * forma masculina singular porque es la más corta y la que no se confunde.
 *
 * Existe porque el género del diccionario no sirve de nada si la pantalla
 * escribe «Ninguna» a mano: el día que una cafetería llame «vaso» a su unidad
 * de servicio, el sistema diría «Ninguna vaso está esperando» — que es
 * exactamente lo que la cabecera de este archivo dice que delata a un producto
 * traducido a medias.
 */
export const DETERMINANTES = ['un', 'este', 'ese', 'ningun', 'otro', 'todo', 'cada'] as const;

export type Determinante = (typeof DETERMINANTES)[number];

/** Las cuatro formas de cada determinante: m.sing · f.sing · m.plur · f.plur. */
export const FORMAS_DETERMINANTE: Readonly<
  Record<Determinante, readonly [string, string, string, string]>
> = {
  un: ['un', 'una', 'unos', 'unas'],
  este: ['este', 'esta', 'estos', 'estas'],
  ese: ['ese', 'esa', 'esos', 'esas'],
  // «ningún» lleva tilde en singular masculino y la pierde en plural.
  ningun: ['ningún', 'ninguna', 'ningunos', 'ningunas'],
  otro: ['otro', 'otra', 'otros', 'otras'],
  todo: ['todo', 'toda', 'todos', 'todas'],
  // `cada` es invariable en género y número. Está en la lista para que una
  // pantalla no tenga que saber cuáles concuerdan y cuáles no.
  cada: ['cada', 'cada', 'cada', 'cada'],
};
