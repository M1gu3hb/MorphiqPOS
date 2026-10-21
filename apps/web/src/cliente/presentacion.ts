/**
 * EL AVISO DE «CAMBIÓ LA PRESENTACIÓN» (cierre del 21-10).
 *
 * Cuando el dueño enciende o apaga el modo presentación del restaurante, las sesiones del
 * otro lado dejan de valer y el servidor contesta 401 con `x-morphiqpos-presentacion: 1`.
 * Cada `fetch` central pasa su respuesta por aquí; el vigía (`VigiaDePresentacion`) lleva a
 * esa pantalla de vuelta al acceso con un aviso, en vez de dejarla llena de errores.
 */
export const CABECERA_CAMBIO_DE_PRESENTACION = 'x-morphiqpos-presentacion';
export const EVENTO_CAMBIO_DE_PRESENTACION = 'morphiqpos:presentacion';

export function vigilarPresentacion(respuesta: Response): void {
  if (typeof window === 'undefined') return;
  if (respuesta.headers.get(CABECERA_CAMBIO_DE_PRESENTACION) !== '1') return;
  window.dispatchEvent(new Event(EVENTO_CAMBIO_DE_PRESENTACION));
}
