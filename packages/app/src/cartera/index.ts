/**
 * La cartera de crédito · F-610 a F-617.
 *
 * Vive fuera de `abarrotes/` y de `ferreteria/` a propósito: son las MISMAS
 * ocho funciones en los dos giros, y el mapa las pide además en otros catorce
 * modelos del arquetipo A5. Ponerlas dentro de uno obligaría al otro a heredar
 * de un vecino, que es justo lo que los rangos de D-08 vienen a evitar.
 */
export {
  emitirDocumentoCredito,
  entradaEmitirDocumento,
  entradaEstadoDeCuenta,
  estadoDeCuenta,
  type RenglonDeEstado,
  type ResultadoDocumento,
  type ResultadoEstadoDeCuenta,
} from './documento.ts';

export {
  carteraPorAntiguedad,
  entradaCartera,
  entradaMuro,
  entradaRegistrarPago,
  fijarMuroDeCredito,
  registrarPagoCredito,
  type ResultadoCartera,
  type ResultadoMuro,
  type ResultadoPagoCredito,
} from './cobranza.ts';
