import type { Rol } from './constants.ts';

/**
 * El puente entre los roles de la base y los de su sistema.
 *
 * No es un capricho de nombres: son dos vocabularios distintos y hay que
 * traducirlos en UN sitio o se traducen mal en veinte.
 *
 *   base       →  su sistema
 *   dueno         administrador
 *   administrador administrador
 *   gerente       administrador
 *   cajero        caja
 *   mesero        mesero
 *   cocina        cocina
 *   almacen       — (no existe en su sistema)
 *
 * Sin esto, `getNavForRole('dueno')` devuelve una lista vacía y la barra
 * lateral sale sin un solo botón. Fue lo primero que se vio al enchufarla.
 *
 * `almacen` devuelve `null` a propósito: su sistema no tiene ese rol, y darle
 * el de administrador para que «no se quede sin menú» sería regalarle
 * configuración, costos y accesos. Sin menú es la respuesta correcta hasta que
 * exista su pantalla; la autorización de verdad la sigue haciendo el servidor.
 */

const A_MH: Readonly<Record<string, Rol>> = {
  dueno: 'administrador',
  administrador: 'administrador',
  gerente: 'administrador',
  cajero: 'caja',
  mesero: 'mesero',
  cocina: 'cocina',
};

export function rolMH(rolDelServidor: string): Rol | null {
  return A_MH[rolDelServidor] ?? null;
}

/**
 * La etiqueta que se enseña, con el rol REAL.
 *
 * Un dueño no dice «Administrador» en pantalla sólo porque por dentro comparta
 * menú con uno. Lo que se traduce es lo que se puede ver; lo que se escribe es
 * lo que la persona es.
 */
const ETIQUETAS: Readonly<Record<string, string>> = {
  dueno: 'Dueño',
  administrador: 'Administrador',
  gerente: 'Gerente',
  cajero: 'Cajero',
  mesero: 'Mesero',
  cocina: 'Cocina',
  almacen: 'Almacén',
};

export function etiquetaDeRol(rolDelServidor: string): string {
  return ETIQUETAS[rolDelServidor] ?? rolDelServidor;
}
