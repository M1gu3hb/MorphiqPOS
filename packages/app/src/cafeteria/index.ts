/**
 * `cafeteria` — lo que un mostrador de café necesita y `operativo` no tenía.
 *
 * El nombre del paquete sigue siendo `operativo` hasta que se aplique la 066:
 * los comandos declaran `PAQUETES_OPERATIVOS`, que es el conjunto que hoy
 * contiene a este giro. Declarar un paquete `cafeteria` que todavía no existe
 * dejaría estos comandos apagados para el cliente que los necesita.
 */
export {
  MEDIOS_DE_LLAMADO,
  deshacerEntrega,
  entradaLlamarPedido,
  entradaPedidoDeBarra,
  entregarPedidoDeBarra,
  llamarPedido,
  marcarNoRecogido,
  type ResultadoEntrega,
  type ResultadoLlamado,
} from './barra.ts';

export {
  MOTIVOS_DE_BARRA,
  entradaCalibracion,
  entradaMermaBarra,
  porShots,
  registrarCalibracion,
  registrarMermaBarra,
  type ResultadoMerma,
} from './merma-barra.ts';

export { abrirLoteGrano, diasEntre, entradaAbrirLote, type ResultadoLote } from './lote-grano.ts';

export {
  ajustarPresencia,
  entradaAjustarPresencia,
  entradaRepartirBote,
  repartirBote,
  type ParteDelBote,
  type ResultadoBote,
} from './bote.ts';
