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
 * Los giros describen qué clase de negocio opera la organización.
 *
 * Esta lista y el `check` de `organizaciones.giro` son LA MISMA: la escribió la
 * 054 con cinco valores y la 164 la reescribe entera para añadir `estetica`. Si
 * divergen, una pantalla ofrece un giro que Postgres rechaza con un 23514 —o la
 * base admite uno que ningún diccionario sabe nombrar—, así que un contrato lee
 * ese SQL del disco y compara las dos listas (`giro-estetica.test.ts`).
 *
 * Son también las claves de `DICCIONARIOS` (F-017), y eso lo ata otro contrato
 * en las dos direcciones: un giro sin diccionario cae al vocabulario base y
 * habla como cualquier negocio, que es el defecto que F-017 existe para cerrar;
 * un diccionario sin giro es vocabulario que nadie puede llegar a ver.
 */
export const GIROS = [
  'tienda',
  'ferreteria',
  'farmacia',
  'cafeteria',
  'restaurante',
  'estetica',
] as const;

export type Giro = (typeof GIROS)[number];

/**
 * Las CINCO PLANTILLAS de negocio que gobiernan módulos y comandos.
 *
 * Se llamaban `esencial`, `operativo` y `restaurante_pro` —niveles
 * comerciales— y ahora nombran el MODELO DE NEGOCIO al que sirven. El renombre
 * es D-01, lo aplica la migración 058 y `plantillaDe()` traduce los seis
 * valores, así que este código funciona ANTES y DESPUÉS de aplicarla: es la
 * regla de orden de despliegue de `supabase-vercel-produccion` §6.
 *
 * El nombre del tipo sigue siendo `Paquete` a propósito: la columna se llama
 * `organizaciones.paquete` y renombrar el tipo sin renombrar la columna crea
 * dos vocabularios para lo mismo, que es peor que un nombre heredado.
 */
export const PAQUETES = ['tienda', 'cafeteria', 'restaurante', 'ferreteria', 'estetica'] as const;

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
 * Donde hay operación: inventario, compras, gastos, recetas y costos.
 *
 * Eran dos de los tres porque `esencial` vendía sin controlar stock. Ese nivel
 * YA NO EXISTE: D-01 dice con todas sus letras que *una tienda sin inventario
 * no es una tienda, es una calculadora*, y `MODULOS_POR_PLANTILLA` le da a
 * `tienda` el bloque de operación entero. Dejar esta lista en dos habría
 * partido el sistema por la mitad: el módulo `recetas` encendido y el comando
 * `inventario.guardar_receta` devolviendo 403.
 *
 * Que hoy sean las tres no la vuelve inútil: lo que decide si una ferretería
 * costea recetas ya no es la plantilla, es la PERILLA (F-016), que es donde esa
 * decisión debe vivir porque cambia negocio por negocio.
 */
export const PAQUETES_OPERATIVOS = PAQUETES;

/** Funciones exclusivas de sala, mesero y cocina. */
export const PAQUETES_RESTAURANTE = ['restaurante'] as const;

/**
 * Donde el cliente puede PEDIR desde el QR de su mesa.
 *
 * Era `PAQUETES_OPERATIVOS` —las tres de entonces— y con cinco plantillas eso
 * dejaba a una ferretería aceptando pedidos desde un QR de mesa. No es un
 * permiso de más cualquiera: abre una comanda que nadie va a preparar.
 *
 * Ordenar desde el QR exige que el negocio PREPARE lo que vende, y eso son dos:
 * el restaurante y la cafetería. El MENÚ público, que sólo se lee, lo trae el
 * módulo `portal_qr` y ése sí lo tienen las cinco.
 */
export const PAQUETES_PORTAL = ['cafeteria', 'restaurante'] as const;

/**
 * Donde se vende de mostrador con caja.
 *
 * Hoy son los cinco. Está nombrado igual porque `venta` y `catálogo` no
 * significan lo mismo, y cuando llegue un paquete de servicios sin caja —una
 * estética que sólo agenda— cambiará éste y no el otro.
 */
export const PAQUETES_MOSTRADOR = PAQUETES;

/**
 * EL TABLERO DE CADA MODELO, que es de SU plantilla y de ninguna otra (F-056).
 *
 * Son cinco subconjuntos de uno solo, y viven aquí por la misma razón que los
 * demás: escritos a mano en el comando, `verify:paquetes` los caza —«ningún
 * comando escribe la lista a mano»— y tiene razón. Lo comprobó este commit: los
 * cuatro tableros nuevos declaraban `paquetes: ['tienda']` y el contrato salió en
 * rojo antes de mutar nada.
 *
 * Es un `Record<Paquete, …>`, y eso es la mitad del valor: cuando llegue una sexta
 * plantilla **esto no compila** hasta que alguien decida qué mira su dueño al abrir
 * el sistema. Cinco literales sueltos en cinco archivos no avisarían de nada.
 */
export const PAQUETES_DEL_TABLERO: Readonly<Record<Paquete, readonly Paquete[]>> = {
  tienda: ['tienda'],
  cafeteria: ['cafeteria'],
  restaurante: ['restaurante'],
  ferreteria: ['ferreteria'],
  estetica: ['estetica'],
};

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

export function esPaquete(valor: unknown): valor is Paquete {
  return typeof valor === 'string' && (PAQUETES as readonly string[]).includes(valor);
}

export function esGiro(valor: unknown): valor is Giro {
  return typeof valor === 'string' && (GIROS as readonly string[]).includes(valor);
}

/**
 * La plantilla `restaurante` sólo cabe en un giro de alimentos.
 *
 * Es el mismo `check` que la base tiene desde la 054 y que la 058 reescribe con
 * el nombre nuevo: `paquete <> 'restaurante' or giro in ('cafeteria',
 * 'restaurante')`. Que el código y el `check` digan lo mismo NO es redundancia:
 * el código da un mensaje que se entiende y la base impide el dato imposible.
 */
export function paquetePermitidoParaGiro(paquete: Paquete, giro: Giro): boolean {
  // Sala sólo donde hay cocina. Lo mismo dice el `check`
  // `organizaciones_paquete_compatible_con_giro` de la 058, y las dos listas
  // son la misma a propósito: la pantalla no puede ofrecer lo que el POST
  // rechaza.
  if (paquete === 'restaurante' || paquete === 'cafeteria') {
    return giro === 'cafeteria' || giro === 'restaurante';
  }
  // Y las tres de mostrador —tienda, ferretería y estética— las puede tomar
  // cualquier giro que no sea de alimentos. Un salón que además vende producto
  // de anaquel puede querer la de tienda, y eso es una decisión suya.
  return giro !== 'cafeteria' && giro !== 'restaurante';
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
