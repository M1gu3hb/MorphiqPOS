import { agendaDelDia, listaDeEspera } from '@morphiqpos/app/salon';

/**
 * ¿La casa de esta persona, en un salón, es la AGENDA? (D.1 de la 2.4)
 *
 * En una estética `/` es la agenda del día —la pantalla que se abre ochenta veces al día—
 * y se le servía a TODO el negocio. Al almacén, cuyo puesto no la puede leer, le pintaba
 * su estado de error con un 403 del servidor en lugar de su inicio. La respuesta sale de
 * los roles del propio comando que la pinta (`agenda.dia`): si mañana lo lee otro puesto,
 * ese puesto también abre en la agenda, sin una segunda lista que se quede atrás.
 */
export function abreEnLaAgenda(rol: string): boolean {
  return (agendaDelDia.roles as readonly string[]).includes(rol);
}

/**
 * ¿Lee esta persona la LISTA DE ESPERA? (D.1 de la 2.4)
 *
 * La agenda la pintaba para todo el que la abre, y la estilista —que abre la agenda pero no
 * la lista, que es de la recepción— recibía un 403 en cada apertura. Como `abreEnLaAgenda`:
 * de los roles del comando que la lee (`lista_espera_citas.lista`), no de otra lista.
 */
export function veLaListaDeEspera(rol: string): boolean {
  return (listaDeEspera.roles as readonly string[]).includes(rol);
}
