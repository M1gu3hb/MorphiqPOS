import { z } from 'zod';

/** URL pública navegable sin protocolos ejecutables ni esquemas de datos. */
export const urlHttp = z.url().refine(
  (valor) => {
    const protocolo = new URL(valor).protocol;
    return protocolo === 'https:' || protocolo === 'http:';
  },
  { message: 'Debe ser una URL HTTP(S) válida.' },
);

export function esUrlHttp(valor: unknown): valor is string {
  return urlHttp.safeParse(valor).success;
}
