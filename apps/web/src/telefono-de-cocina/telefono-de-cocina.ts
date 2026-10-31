/**
 * EL TELÉFONO DE UNA ESTACIÓN DE COCINA (DP-9.4): la lógica sin pantalla.
 *
 * Tres acciones —repetir la voz, preparar, listo— con tres botones grandes en la pantalla y,
 * para quien cocina con las manos ocupadas, con una botonera física Bluetooth (un teclado
 * numérico o un pasador de diapositivas) que el teléfono recibe como teclas.
 * `docs/cliente/BOTONERA.md` dice cuál comprar y cómo probarla.
 */

export type AccionDelTelefono = 'repetir' | 'preparar' | 'listo';

/**
 * Las teclas de cada acción. Un teclado numérico manda `1`, `2`, `3`; un pasador de
 * diapositivas, `PageUp`/`PageDown` o las flechas; algunos mandan `b` o `.` en su tercer botón.
 * `Enter` y la barra son «listo»: es el botón grande de casi todos.
 */
export const TECLAS: Readonly<Record<AccionDelTelefono, readonly string[]>> = {
  repetir: ['1', 'r', 'R', 'ArrowLeft', 'PageUp'],
  preparar: ['2', 'p', 'P', 'ArrowUp', 'ArrowDown', 'b', 'B', '.'],
  listo: ['3', 'l', 'L', 'Enter', ' ', 'ArrowRight', 'PageDown'],
};

export function accionDeLaTecla(tecla: string): AccionDelTelefono | null {
  for (const [accion, teclas] of Object.entries(TECLAS) as [
    AccionDelTelefono,
    readonly string[],
  ][]) {
    if (teclas.includes(tecla)) return accion;
  }
  return null;
}

/** Qué se puede hacer con la comanda en pantalla: preparar sólo una nueva; listo, las dos. */
export function accionesPosibles(
  estado: 'nuevo' | 'en_preparacion' | null,
): ReadonlySet<AccionDelTelefono> {
  if (estado === null) return new Set();
  return estado === 'nuevo'
    ? new Set<AccionDelTelefono>(['repetir', 'preparar', 'listo'])
    : new Set<AccionDelTelefono>(['repetir', 'listo']);
}

/**
 * La comanda que hay que anunciar en voz: la que está en pantalla si es nueva para este
 * teléfono. La primera lectura no anuncia nada (al entrar no se suelta lo que ya estaba);
 * después, cada comanda se anuncia una vez.
 */
export function porAnunciar(
  comandaId: string | null,
  anunciadas: ReadonlySet<string> | null,
): string | null {
  if (comandaId === null || anunciadas === null) return null;
  return anunciadas.has(comandaId) ? null : comandaId;
}
