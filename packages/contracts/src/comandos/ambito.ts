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

/** Los giros describen qué clase de negocio opera la organización. */
export const GIROS = ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'] as const;

export type Giro = (typeof GIROS)[number];

/** Los tres paquetes comerciales que gobiernan módulos y comandos. */
export const PAQUETES = ['esencial', 'operativo', 'restaurante_pro'] as const;

export type Paquete = (typeof PAQUETES)[number];

/**
 * Los subconjuntos de paquetes que declaran los comandos (A-42, F1.1-C-15).
 *
 * Viven aquí y no en cada archivo porque había CINCO copias del mismo arreglo
 * —`TODOS`, `TODOS_LOS_PAQUETES`, `PAQUETES` y dos literales sueltos— y basta
 * con que una se quede corta al añadir un giro para que un comando desaparezca
 * de un paquete entero sin que nada avise. Un contrato de `verify:paquetes`
 * exige que ningún comando escriba la lista a mano.
 */
export const PAQUETES_TODOS = PAQUETES;

/**
 * Donde una receta significa algo: se prepara comida.
 *
 * En una ferretería un producto no se compone de ingredientes, así que costear
 * recetas ahí no es una función que falte — es una que no aplica.
 */
export const PAQUETES_OPERATIVOS = ['operativo', 'restaurante_pro'] as const;

/** Funciones exclusivas de sala, mesero y cocina. */
export const PAQUETES_RESTAURANTE = ['restaurante_pro'] as const;

/** El portal QR está contratado desde Operativo, igual que en la navegación. */
export const PAQUETES_PORTAL = PAQUETES_OPERATIVOS;

/**
 * Donde se vende de mostrador con caja.
 *
 * Hoy son los cinco. Está nombrado igual porque `venta` y `catálogo` no
 * significan lo mismo, y cuando llegue un paquete de servicios sin caja —una
 * estética que sólo agenda— cambiará éste y no el otro.
 */
export const PAQUETES_MOSTRADOR = PAQUETES;

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

export function esPaquete(valor: unknown): valor is Paquete {
  return typeof valor === 'string' && (PAQUETES as readonly string[]).includes(valor);
}

export function esGiro(valor: unknown): valor is Giro {
  return typeof valor === 'string' && (GIROS as readonly string[]).includes(valor);
}

export function paquetePermitidoParaGiro(paquete: Paquete, giro: Giro): boolean {
  return paquete !== 'restaurante_pro' || giro === 'cafeteria' || giro === 'restaurante';
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
