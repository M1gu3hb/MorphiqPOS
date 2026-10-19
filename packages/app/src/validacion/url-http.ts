import { z } from 'zod';

/**
 * URL pública navegable sin protocolos ejecutables ni esquemas de datos.
 *
 * El protocolo lo comprueba el propio `z.url`. Era un `refine` con `new URL(valor)`, y zod 4
 * corre los `refine` aunque `z.url()` no haya pasado: con «abc», `new URL` LANZABA dentro de
 * `safeParse` y la foto mal pegada de un producto salía como error interno (500) —y como
 * excepción en `esUrlHttp`, que usa la escritura del puente—.
 */
export const urlHttp = z.url({ protocol: /^https?$/, error: 'Debe ser una URL HTTP(S) válida.' });

export function esUrlHttp(valor: unknown): valor is string {
  return urlHttp.safeParse(valor).success;
}
