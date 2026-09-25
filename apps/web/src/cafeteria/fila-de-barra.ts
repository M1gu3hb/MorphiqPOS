/**
 * Qué comanda sigue EN LA FILA de la barra, dicho una vez (C.14 de la 2.4).
 *
 * El cierre de turno filtraba con `estado !== 'entregada' && estado !== 'cancelada'`,
 * y la base escribe `entregado` y `cancelado` —en masculino, `comandas_estado_check`
 * de la 082— y además `no_recogido`: NADA entregado salía nunca de la lista, y en
 * cuanto la barra de la demo empezó a recibir comandas el turno no se podía cerrar.
 * Una lista POSITIVA —los tres que siguen vivos— no se equivoca por una letra.
 */
export const ESTADOS_EN_LA_FILA = ['nuevo', 'en_preparacion', 'listo'] as const;

export function sigueEnLaFila(estado: string | null): boolean {
  return estado !== null && (ESTADOS_EN_LA_FILA as readonly string[]).includes(estado);
}
