/**
 * DÓNDE SE PINTA CADA BLOQUE DE LA AGENDA, y de qué ancho.
 *
 * ── Por qué en su propio archivo ──────────────────────────────────────────
 * Porque es aritmética pura y se puede probar sin navegador, que es lo mismo que
 * hacen `cafeteria/opciones-de-bebida.ts` y `ferreteria/mostrador-datos.ts`. La
 * pantalla es un `.tsx` y la suite de unidad no transforma JSX, así que una regla
 * de colocación que viva dentro del componente no se puede afirmar más que
 * abriendo un navegador — y esta regla es justo la que se rompió sin que nadie la
 * viera.
 *
 * ── El defecto que estas dos funciones arreglan ───────────────────────────
 * Mientras un tinte procesa, la profesional está libre: `agenda.huecos` ofrece ese
 * rato como vendible, así que hay un hueco DENTRO del rango de otra cita. La
 * agenda pintaba los dos con `inset-x-1` y el mismo `top`, y el último del DOM
 * —el hueco— se quedaba encima: **la cita quedaba tapada y no se podía tocar**. Y
 * tocar una cita es lo que la empieza.
 *
 * Medido en el navegador: el clic sobre la cita agotó el límite de tres minutos y
 * Playwright dijo que el botón del hueco «intercepts pointer events». No era un
 * problema de la prueba: era de quien tiene la clienta delante.
 */

/** Las nueve de la mañana, en minutos desde medianoche. Abre el salón. */
export const APERTURA = 9 * 60;
/** Las nueve de la noche. Cierra. */
export const CIERRE = 21 * 60;
/** Píxeles por minuto. Dos: una jornada de doce horas cabe en 1 440 px. */
export const PX = 2;
/**
 * El alto mínimo de un bloque, en minutos.
 *
 * Un servicio de diez minutos dibujado a escala son veinte píxeles: no cabe ni su
 * hora. Se pinta como si durara veinte para que se pueda leer y tocar.
 */
export const MINIMO = 20;

/** 'HH:MM' → minutos desde medianoche. Es el formato que cruza el puente. */
export function aMinutos(hora: string): number {
  const partes = hora.split(':');
  return Number(partes[0] ?? 0) * 60 + Number(partes[1] ?? 0);
}

/**
 * Lo que la colocación necesita saber de un bloque.
 *
 * Su identidad, cuándo empieza, cuándo acaba y si es un hueco. Nada más: el
 * nombre de la clienta no cambia dónde se pinta.
 */
export interface BloqueColocable {
  readonly id: string;
  readonly inicio: string;
  readonly fin: string;
  readonly estado: string;
}

/** Dos bloques se cruzan si comparten un solo minuto. Pegados no es cruzados. */
export function seCruzan(a: BloqueColocable, b: BloqueColocable): boolean {
  return aMinutos(a.inicio) < aMinutos(b.fin) && aMinutos(b.inicio) < aMinutos(a.fin);
}

export interface Colocacion {
  readonly top: string;
  readonly height: string;
  readonly left: string;
  readonly right: string;
}

const MEDIO = '52%';
const BORDE = '4px';

/**
 * Dónde va el bloque dentro de la columna de su profesional.
 *
 * ── Y por qué a lo ancho y no con `z-index` ───────────────────────────────
 * Porque el hueco tiene que seguir siendo tocable: es lo único monetario de esta
 * pantalla —«aquí cabe un corte de $180»— y sepultarlo bajo la cita cambia un
 * defecto por otro. Cuando se cruzan, la cita se queda con la mitad izquierda y el
 * hueco con la derecha, que es lo que hace cualquier agenda con dos cosas a la
 * misma hora. Sin cruce, cada uno ocupa su columna entera.
 *
 * Dos CITAS cruzadas en la misma persona no se estrechan: eso es un error de
 * agenda, y disimularlo haciéndolas angostas es esconderlo.
 */
export function posicionDe(
  bloque: BloqueColocable,
  hermanos: readonly BloqueColocable[] = [],
): Colocacion {
  const desde = Math.max(aMinutos(bloque.inicio), APERTURA);
  const hasta = Math.min(aMinutos(bloque.fin), CIERRE);
  const esHueco = (x: BloqueColocable): boolean => x.estado === 'hueco';
  const cruzado = hermanos.some(
    (otro) => otro.id !== bloque.id && esHueco(otro) !== esHueco(bloque) && seCruzan(otro, bloque),
  );
  return {
    top: `${String((desde - APERTURA) * PX)}px`,
    height: `${String(Math.max(hasta - desde, MINIMO) * PX)}px`,
    left: cruzado && esHueco(bloque) ? MEDIO : BORDE,
    right: cruzado && !esHueco(bloque) ? MEDIO : BORDE,
  };
}
