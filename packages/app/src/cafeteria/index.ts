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
