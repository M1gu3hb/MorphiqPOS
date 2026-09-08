/**
 * El ámbito de una ejecución: quién opera, en qué organización y desde dónde.
 *
 * R16 es la regla que da forma a este archivo: «El ámbito viene de la sesión del
 * servidor, jamás de un parámetro del cliente.» Por eso `Ambito` no se valida con
 * zod ni se construye desde un cuerpo de petición: lo arma quien resuelve la
 * sesión (F1.1-A-03) y llega ya cerrado al envoltorio.
 *
 * La consecuencia práctica está en `packages/app`: hay un contrato que recorre
 * TODOS los comandos registrados y rechaza que su esquema de entrada declare
 * `organizacion_id`, `sucursal_id`, `identidad_id`, `empleo_id`, `rol` o
 * `terminal_id`. Si un comando pudiera recibirlos, el cliente elegiría su propio
 * ámbito y R16 sería decorativa.
 */

/** Los siete roles de `empleos.rol`. El `check` de la base tiene estos mismos. */
export const ROLES = [
  'dueno',
  'administrador',
  'gerente',
  'cajero',
  'mesero',
  'cocina',
  'almacen',
] as const;

export type Rol = (typeof ROLES)[number];

/**
 * Los cinco paquetes de `organizaciones.paquete` (A-42).
 *
 * No es un adorno de interfaz: gobierna qué comandos existen para una
 * organización, y se verifica en el servidor. «Ocultar un botón no es
 * autorización» (R11).
 */
export const PAQUETES = ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'] as const;

export type Paquete = (typeof PAQUETES)[number];

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

export function esPaquete(valor: unknown): valor is Paquete {
  return typeof valor === 'string' && (PAQUETES as readonly string[]).includes(valor);
}

/**
 * Ámbito de una ejecución interna (cajero, mesero, dueño en la terminal).
 *
 * `sucursalId` y `terminalId` son nulos para un actor de alcance organizacional
 * —un dueño entrando por correo desde su teléfono— y eso es exactamente lo que
 * hace que no pueda operar caja: abrir una sesión de caja exige terminal.
 */
export interface Ambito {
  readonly organizacionId: string;
  readonly sucursalId: string | null;
  readonly terminalId: string | null;
  /** Apunta a `identidades`, no a `personas` ni a `empleos`: es lo que audita. */
  readonly identidadId: string;
  readonly empleoId: string;
  readonly rol: Rol;
}
