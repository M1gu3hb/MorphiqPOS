import 'server-only';

/**
 * El puente de roles (F1-02 §3).
 *
 * Son dos vocabularios distintos y hay que traducirlos en UN sitio o se
 * traducen mal en veinte:
 *
 *   la base        →  su sistema
 *   dueno             administrador
 *   administrador     administrador
 *   gerente           administrador
 *   cajero            caja
 *   mesero            mesero
 *   cocina            cocina
 *   almacen           — (no existe en su sistema)
 *
 * Su `permissions.js` decide QUÉ SE DIBUJA con los suyos. Sin esta traducción,
 * `getNavForRole('dueno')` devuelve una lista vacía y la barra lateral sale sin
 * un solo botón.
 *
 * **Esto no es autorización.** La autorización vive en el servidor, dentro del
 * envoltorio `comando()`, que comprueba el rol de la sesión en cada escritura.
 * Ocultar un botón no es autorización; esta tabla sólo evita enseñarle a un
 * cajero un menú que no le sirve.
 *
 * `almacen` devuelve `null` a propósito: su sistema no tiene ese rol, y darle
 * el de administrador «para que no se quede sin menú» sería regalarle
 * configuración, costos y accesos.
 */

/** Los cuatro roles de su `constants.js`, más el legado `barra`. */
export type RolMH = 'administrador' | 'caja' | 'mesero' | 'cocina';

const A_MH: Readonly<Record<string, RolMH>> = {
  dueno: 'administrador',
  administrador: 'administrador',
  gerente: 'administrador',
  cajero: 'caja',
  mesero: 'mesero',
  cocina: 'cocina',
};

export function rolMH(rolDeLaBase: string): RolMH | null {
  return A_MH[rolDeLaBase] ?? null;
}

/**
 * La etiqueta que se enseña, con el rol REAL.
 *
 * Un dueño no dice «Administrador» en pantalla sólo porque por dentro comparta
 * menú con uno. Lo que se traduce es lo que se puede VER; lo que se escribe es
 * lo que la persona ES.
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

export function etiquetaDeRol(rolDeLaBase: string): string {
  return ETIQUETAS[rolDeLaBase] ?? rolDeLaBase;
}

/**
 * Un color estable por persona, derivado de su identificador.
 *
 * Su pantalla de acceso pinta una tarjeta por usuario y espera un `color`. La
 * ficha de empleado de esta base no guarda ninguno todavía, así que se deriva
 * del id: la misma persona sale siempre del mismo color, y dos personas
 * distintas casi nunca coinciden. Cuando la ficha guarde color, se lee de ahí
 * y esta función se queda como reserva.
 */
const PALETA = [
  '#2563eb',
  '#0891b2',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#0f766e',
] as const;

export function colorDePersona(id: string): string {
  let suma = 0;
  for (let i = 0; i < id.length; i += 1) suma = (suma * 31 + id.charCodeAt(i)) >>> 0;
  return PALETA[suma % PALETA.length] ?? PALETA[0];
}
