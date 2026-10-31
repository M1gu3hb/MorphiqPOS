/**
 * El teléfono de una estación de cocina (DP-9.4): un QR por estación, firmado para el día de
 * operación y revocable, con una API pública estrecha que sólo lee la comanda vigente de SU
 * estación y la prepara o la deja lista.
 */

export { servirTelefonoDeCocina, transicionDelTelefono } from './http.ts';
export {
  conectarTelefonoDeCocina,
  entradaConectarTelefono,
  type TelefonoConectado,
} from './conectar.ts';
export {
  firmarTokenDeEstacion,
  leerTokenDeEstacion,
  type ContenidoDelToken,
} from './token-de-estacion.ts';
export type { ComandaDelTelefono, PantallaDelTelefono } from './consulta.ts';
