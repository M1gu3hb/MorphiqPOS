/**
 * F-154 y F-436 · La fórmula que se captura con guantes puestos.
 *
 * ── Por qué esto vive aparte de la pantalla ──────────────────────────────
 * Porque el resto de `CitaEnCurso.tsx` pinta y esto CUENTA: cuánto se mezcló,
 * cuánto se usó y cuánto sobró. El sobrante es el 10-20 % del producto de
 * cabina que hoy se tira sin apunte, y es el número que convierte «el tinte se
 * acaba muy rápido» en una cifra.
 *
 * ── El sobrante NO se teclea: se calcula ─────────────────────────────────
 * Pedirlo como tercer campo abre la puerta a que los tres no cuadren, y el que
 * captura tiene las manos ocupadas. Mezclado menos usado, y nunca negativo: un
 * sobrante en rojo es un dato imposible que la pantalla enseñaría como si
 * fuera cierto.
 *
 * ── Los ± mueven de DIEZ en diez ─────────────────────────────────────────
 * Nadie pesa de a un gramo con las manos ocupadas. El paso grande es lo que
 * hace que la captura ocurra; el paso de uno es lo que hace que se abandone.
 */

/** Los ± mueven de diez en diez: nadie pesa de a un gramo con las manos ocupadas. */
export const PASO = 10;

export interface ComponenteDeFormula {
  readonly nombre: string;
  readonly cantidad: number;
  readonly unidad: string;
}

/** Lo que se captura. `mezclado` y `usado` van juntos o el sobrante no cuadra. */
export interface Mezcla {
  readonly mezclado: number;
  readonly usado: number;
  readonly componentes: readonly ComponenteDeFormula[];
  readonly minutos: number;
}

/** El sobrante NO se teclea: se calcula. Es el 10–20 % que hoy se tira sin apunte. */
export function sobrante(mezclado: number, usado: number): number {
  return Math.max(0, mezclado - usado);
}

/** hh:mm desde el inicio real. El documento pide «en curso 00:23», no un cronómetro. */
export function transcurrido(desde: number, ahora: number): string {
  const minutos = Math.max(0, Math.floor((ahora - desde) / 60_000));
  const hh = Math.floor(minutos / 60).toString();
  return `${hh.padStart(2, '0')}:${(minutos % 60).toString().padStart(2, '0')}`;
}

/**
 * Sube o baja un componente, sin mutar la mezcla.
 *
 * Inmutable a propósito: la fórmula de la visita anterior se enseña al lado
 * mientras se edita la de hoy, y mutar la que se está copiando haría que el
 * botón REPETIR dejara de repetir lo que la clienta vio.
 */
export function mover(mezcla: Mezcla, indice: number, delta: number): Mezcla {
  const componentes = mezcla.componentes.map((c, i) =>
    i === indice ? { ...c, cantidad: Math.max(0, c.cantidad + delta) } : c,
  );
  return { ...mezcla, componentes };
}
