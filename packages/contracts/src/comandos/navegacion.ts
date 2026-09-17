/**
 * F-018 · El MENÚ de cada plantilla, y dónde abre cada negocio.
 *
 * ── Qué estaba roto ────────────────────────────────────────────────────────
 * Las 61 pantallas de los cinco modelos estaban construidas, etiquetadas,
 * contadas por `verify:cobertura` y respondiendo por HTTP — y **ninguna colgaba
 * de un menú**. Para abrir cualquiera de ellas había que teclear la URL.
 * `heredado/lib/permissions.js` seguía con su lista fija de doce entradas, que
 * son las del punto de venta de Miguel, y ni una llevaba a una pantalla de
 * modelo. Contar archivos y pedir un 200 mide existencia; esto mide acople.
 *
 * ── Por qué el menú vive en el SERVIDOR y no en `permissions.js` ───────────
 * Porque el navegador no puede ser la fuente de la verdad de lo que un negocio
 * tiene contratado, y ya costó un defecto en esta misma fase: `getCurrentPackage`
 * no reconocía los nombres nuevos y le daba el menú completo a una tienda. El
 * menú se declara aquí, junto a los módulos que lo gobiernan, y el frontend se
 * limita a pintarlo.
 *
 * ── El orden es el DÍA DE TRABAJO, no el alfabeto ──────────────────────────
 * Cada `04-INTERFAZ.md §4.2` lo decide para su giro: un restaurante abre el
 * mapa de mesas y termina en el arqueo; una estética abre la agenda y termina
 * en la liquidación. Ordenar por nombre pondría «Agenda» junto a «Arqueo» y
 * obligaría a leer el menú entero cada vez.
 *
 * ── Lo que esta tabla NO decide ────────────────────────────────────────────
 * Los permisos por rol. Una entrada visible para la plantilla puede seguir
 * estando oculta para un cajero: eso lo filtra `hasPermission` con el rol, y
 * son dos preguntas distintas —qué compró el negocio y qué puede tocar esta
 * persona— que ya se mezclaron una vez.
 */

import { type Giro } from './ambito.ts';
import {
  segunElDato,
  MODULOS_POR_PLANTILLA,
  PLANTILLA_POR_GIRO,
  type Modulo,
  type Plantilla,
} from './plantillas.ts';

export { PLANTILLA_POR_GIRO };
export type { Giro, Modulo, Plantilla };

/**
 * Las entidades que el vocabulario del giro sabe nombrar (F-017).
 *
 * Se escriben aquí como una unión de texto y no se importa el tipo de
 * `@morphiqpos/domain`: `contracts` es la capa de abajo y no depende de nadie.
 * Un contrato en `packages/domain` ata las dos listas.
 */
export type EntidadDeVocabulario =
  | 'unidad_servicio'
  | 'orden'
  | 'linea_orden'
  | 'responsable'
  | 'cliente'
  | 'producto'
  | 'preparacion';

/** Una entrada del menú lateral. */
export interface EntradaDeMenu {
  /** La ruta real de la pantalla. Lo que el navegador abre al tocarla. */
  readonly ruta: string;
  /** El texto por omisión, para cuando el giro no traduce esa entidad. */
  readonly etiqueta: string;
  /** El icono de `lucide-react` que ya usa el menú heredado. */
  readonly icono: string;
  /** El módulo que la gobierna. Sin él en la plantilla, la entrada no sale. */
  readonly modulo: Modulo;
  /** El permiso del rol, con la misma clave que `permissions.js`. */
  readonly permiso: string;
  /** Qué sustantivo del giro la nombra. Sin esto, la etiqueta va tal cual. */
  readonly entidad?: EntidadDeVocabulario;
}

/**
 * La cola común: el tablero y la configuración.
 *
 * Van en las cinco porque son del sistema, no del giro — y porque
 * Configuración es donde se cambia de plantilla: dejarla fuera de un menú
 * encerraría a un negocio en la plantilla que estrenó.
 */
const CIERRE: readonly EntradaDeMenu[] = [
  {
    ruta: '/',
    etiqueta: 'Tablero',
    icono: 'LayoutDashboard',
    modulo: 'dashboard_basico',
    permiso: 'ver_dashboard',
  },
  {
    ruta: '/configuracion',
    etiqueta: 'Configuración',
    icono: 'Settings',
    modulo: 'configuracion_basica',
    permiso: 'ver_configuracion',
  },
];

/** El día de un restaurante: se abre una mesa y se cierra el arqueo. */
const RESTAURANTE: readonly EntradaDeMenu[] = [
  {
    ruta: '/restaurante/mapa-de-mesas',
    etiqueta: 'Mesas',
    icono: 'LayoutGrid',
    modulo: 'mapa_mesas',
    permiso: 'ver_mesero',
    entidad: 'unidad_servicio',
  },
  {
    ruta: '/restaurante/mesa-activa',
    etiqueta: 'Mesa activa',
    icono: 'UtensilsCrossed',
    modulo: 'mesas',
    permiso: 'ver_mesero',
    entidad: 'unidad_servicio',
  },
  {
    ruta: '/restaurante/precuenta',
    etiqueta: 'Precuenta',
    icono: 'ReceiptText',
    modulo: 'pedidos_mesa',
    permiso: 'ver_mesero',
  },
  {
    ruta: '/restaurante/cocina',
    etiqueta: 'Cocina',
    icono: 'ChefHat',
    modulo: 'cocina',
    permiso: 'ver_cocina',
    entidad: 'preparacion',
  },
  {
    ruta: '/restaurante/cobro',
    etiqueta: 'Cobro',
    icono: 'CreditCard',
    modulo: 'ventas',
    permiso: 'ver_caja',
  },
  {
    ruta: '/restaurante/caja',
    etiqueta: 'Caja',
    icono: 'Landmark',
    modulo: 'caja_directa',
    permiso: 'ver_caja',
  },
  {
    ruta: '/restaurante/cierre-diario-y-arqueo',
    etiqueta: 'Cierre y arqueo',
    icono: 'ClipboardCheck',
    modulo: 'cortes',
    permiso: 'ver_caja',
  },
  {
    ruta: '/restaurante/productos',
    etiqueta: 'Productos',
    icono: 'Tag',
    modulo: 'productos_basicos',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
  {
    ruta: '/restaurante/recetas',
    etiqueta: 'Recetas',
    icono: 'BookOpen',
    modulo: 'recetas',
    permiso: 'ver_recetas',
  },
  {
    ruta: '/restaurante/inventario',
    etiqueta: 'Inventario',
    icono: 'Package',
    modulo: 'inventario',
    permiso: 'ver_inventario',
  },
  {
    ruta: '/restaurante/registros',
    etiqueta: 'Registros',
    icono: 'FileText',
    modulo: 'registros_basicos',
    permiso: 'ver_registros',
  },
];

/** El día de una cafetería: se cobra de pie y la barra llama por nombre. */
const CAFETERIA: readonly EntradaDeMenu[] = [
  {
    ruta: '/cafeteria/cobrar',
    etiqueta: 'Cobrar',
    icono: 'CreditCard',
    modulo: 'caja_directa',
    permiso: 'ver_caja',
  },
  {
    ruta: '/cafeteria/opciones-de-la-bebida',
    etiqueta: 'Opciones de la bebida',
    icono: 'SlidersHorizontal',
    modulo: 'modificadores_de_bebida',
    permiso: 'ver_productos',
    entidad: 'linea_orden',
  },
  {
    ruta: '/cafeteria/cobro-y-propina',
    etiqueta: 'Cobro y propina',
    icono: 'HandCoins',
    modulo: 'propinas',
    permiso: 'ver_caja',
  },
  {
    ruta: '/cafeteria/barra',
    etiqueta: 'Barra',
    icono: 'Coffee',
    modulo: 'barra',
    permiso: 'ver_cocina',
    entidad: 'preparacion',
  },
  {
    ruta: '/cafeteria/recogida',
    etiqueta: 'Recogida',
    icono: 'BellRing',
    modulo: 'pedido_anticipado',
    permiso: 'ver_cocina',
  },
  {
    ruta: '/cafeteria/turno',
    etiqueta: 'Turno',
    icono: 'Clock',
    modulo: 'turno_de_barra',
    permiso: 'ver_caja',
  },
  {
    ruta: '/cafeteria/cierre-de-turno-y-arqueo',
    etiqueta: 'Cierre de turno',
    icono: 'ClipboardCheck',
    modulo: 'cortes',
    permiso: 'ver_caja',
  },
  {
    ruta: '/cafeteria/clientes-y-sellos',
    etiqueta: 'Clientes y sellos',
    icono: 'Stamp',
    modulo: 'sellos_de_lealtad',
    permiso: 'ver_ventas',
    entidad: 'cliente',
  },
  {
    ruta: '/cafeteria/productos',
    etiqueta: 'Productos',
    icono: 'Tag',
    modulo: 'productos_basicos',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
  {
    ruta: '/cafeteria/recetas',
    etiqueta: 'Recetas',
    icono: 'BookOpen',
    modulo: 'recetas',
    permiso: 'ver_recetas',
  },
  {
    ruta: '/cafeteria/inventario',
    etiqueta: 'Inventario',
    icono: 'Package',
    modulo: 'inventario',
    permiso: 'ver_inventario',
  },
];

/** El día de una tiendita: se cobra, se fía y se cuenta el anaquel. */
const TIENDA: readonly EntradaDeMenu[] = [
  {
    ruta: '/abarrotes/cobrar',
    etiqueta: 'Cobrar',
    icono: 'ScanBarcode',
    modulo: 'caja_directa',
    permiso: 'ver_caja',
  },
  {
    ruta: '/abarrotes/caja',
    etiqueta: 'Caja',
    icono: 'Landmark',
    modulo: 'caja_directa',
    permiso: 'ver_caja',
  },
  {
    ruta: '/abarrotes/fiado',
    etiqueta: 'Fiado',
    icono: 'NotebookPen',
    modulo: 'fiado',
    permiso: 'ver_ventas',
    entidad: 'cliente',
  },
  {
    ruta: '/abarrotes/servicios',
    etiqueta: 'Servicios',
    icono: 'Smartphone',
    modulo: 'servicios_de_terceros',
    permiso: 'ver_ventas',
  },
  {
    ruta: '/abarrotes/producto',
    etiqueta: 'Productos',
    icono: 'Tag',
    modulo: 'productos_basicos',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
  {
    ruta: '/abarrotes/alta-rapida-de-producto',
    etiqueta: 'Alta rápida',
    icono: 'PlusCircle',
    modulo: 'productos_basicos',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
  {
    ruta: '/abarrotes/existencias',
    etiqueta: 'Existencias',
    icono: 'Package',
    modulo: 'inventario',
    permiso: 'ver_inventario',
  },
  {
    ruta: '/abarrotes/entradas',
    etiqueta: 'Entradas',
    icono: 'Truck',
    modulo: 'entradas_de_mercancia',
    permiso: 'ver_compras',
  },
  {
    ruta: '/abarrotes/conteo',
    etiqueta: 'Conteo',
    icono: 'ListChecks',
    modulo: 'toma_fisica',
    permiso: 'ver_inventario',
  },
  {
    ruta: '/abarrotes/cortes',
    etiqueta: 'Cortes',
    icono: 'ClipboardCheck',
    modulo: 'cortes',
    permiso: 'ver_caja',
  },
  {
    ruta: '/abarrotes/registros',
    etiqueta: 'Registros',
    icono: 'FileText',
    modulo: 'registros_basicos',
    permiso: 'ver_registros',
  },
];

/** El día de una ferretería: el mostrador manda, y se vende por medida. */
const FERRETERIA: readonly EntradaDeMenu[] = [
  {
    ruta: '/ferreteria/mostrador',
    etiqueta: 'Mostrador',
    icono: 'Search',
    modulo: 'mostrador',
    permiso: 'ver_caja',
  },
  {
    ruta: '/ferreteria/caja',
    etiqueta: 'Caja',
    icono: 'Landmark',
    modulo: 'caja_directa',
    permiso: 'ver_caja',
  },
  {
    ruta: '/ferreteria/cotizacion',
    etiqueta: 'Cotización',
    icono: 'FileSpreadsheet',
    modulo: 'cotizaciones',
    permiso: 'ver_ventas',
  },
  {
    ruta: '/ferreteria/cuentas',
    etiqueta: 'Cuentas',
    icono: 'Wallet',
    modulo: 'credito_y_cobranza',
    permiso: 'ver_ventas',
    entidad: 'cliente',
  },
  {
    ruta: '/ferreteria/corte-de-material',
    etiqueta: 'Corte de material',
    icono: 'Scissors',
    modulo: 'corte_de_material',
    permiso: 'ver_inventario',
    entidad: 'producto',
  },
  {
    ruta: '/ferreteria/trabajos-de-mostrador',
    etiqueta: 'Trabajos de mostrador',
    icono: 'Wrench',
    modulo: 'trabajos_de_mostrador',
    permiso: 'ver_ventas',
  },
  {
    ruta: '/ferreteria/material',
    etiqueta: 'Materiales',
    icono: 'Tag',
    modulo: 'productos_basicos',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
  {
    ruta: '/ferreteria/ficha-de-pieza',
    etiqueta: 'Ficha de pieza',
    icono: 'Ruler',
    modulo: 'piezas_y_medidas',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
  {
    ruta: '/ferreteria/existencias',
    etiqueta: 'Existencias',
    icono: 'Package',
    modulo: 'inventario',
    permiso: 'ver_inventario',
  },
  {
    ruta: '/ferreteria/entradas',
    etiqueta: 'Entradas',
    icono: 'Truck',
    modulo: 'entradas_de_mercancia',
    permiso: 'ver_compras',
  },
  {
    ruta: '/ferreteria/conteo',
    etiqueta: 'Conteo',
    icono: 'ListChecks',
    modulo: 'toma_fisica',
    permiso: 'ver_inventario',
  },
  {
    ruta: '/ferreteria/facturacion',
    etiqueta: 'Facturación',
    icono: 'FileCheck',
    modulo: 'facturacion',
    permiso: 'ver_ventas',
  },
];

/** El día de una estética: la agenda ES el negocio, y termina liquidando. */
const ESTETICA: readonly EntradaDeMenu[] = [
  {
    ruta: '/estetica-salon/agenda-del-dia',
    etiqueta: 'Agenda',
    icono: 'CalendarDays',
    modulo: 'agenda',
    permiso: 'ver_dashboard',
  },
  {
    ruta: '/estetica-salon/agendar',
    etiqueta: 'Agendar',
    icono: 'CalendarPlus',
    modulo: 'citas',
    permiso: 'ver_ventas',
    entidad: 'orden',
  },
  {
    ruta: '/estetica-salon/cita-en-curso',
    etiqueta: 'Cita en curso',
    icono: 'Timer',
    modulo: 'citas',
    permiso: 'ver_ventas',
    entidad: 'orden',
  },
  {
    ruta: '/estetica-salon/mi-dia',
    etiqueta: 'Mi día',
    icono: 'UserCheck',
    modulo: 'agenda_por_profesional',
    permiso: 'ver_mesero',
    entidad: 'responsable',
  },
  {
    ruta: '/estetica-salon/cobrar',
    etiqueta: 'Cobrar',
    icono: 'CreditCard',
    modulo: 'caja_directa',
    permiso: 'ver_caja',
  },
  {
    ruta: '/estetica-salon/caja-y-corte',
    etiqueta: 'Caja y corte',
    icono: 'ClipboardCheck',
    modulo: 'cortes',
    permiso: 'ver_caja',
  },
  {
    ruta: '/estetica-salon/liquidacion',
    etiqueta: 'Liquidación',
    icono: 'HandCoins',
    modulo: 'comisiones',
    permiso: 'ver_registros',
  },
  {
    ruta: '/estetica-salon/clientas',
    etiqueta: 'Clientas',
    icono: 'Users',
    modulo: 'clientes',
    permiso: 'ver_ventas',
    entidad: 'cliente',
  },
  {
    ruta: '/estetica-salon/historial-de-la-clienta',
    etiqueta: 'Historial',
    icono: 'History',
    modulo: 'expediente',
    permiso: 'ver_ventas',
    entidad: 'cliente',
  },
  {
    ruta: '/estetica-salon/catalogo-de-servicios',
    etiqueta: 'Servicios',
    icono: 'Sparkles',
    modulo: 'catalogo_de_servicios',
    permiso: 'ver_productos',
    entidad: 'linea_orden',
  },
  {
    ruta: '/estetica-salon/ficha-del-profesional',
    etiqueta: 'Profesionales',
    icono: 'IdCard',
    modulo: 'profesionales',
    permiso: 'ver_configuracion',
    entidad: 'responsable',
  },
  {
    ruta: '/estetica-salon/productos',
    etiqueta: 'Productos',
    icono: 'Tag',
    modulo: 'productos_basicos',
    permiso: 'ver_productos',
    entidad: 'producto',
  },
];

const MENU: Readonly<Record<Plantilla, readonly EntradaDeMenu[]>> = {
  tienda: [...TIENDA, ...CIERRE],
  cafeteria: [...CAFETERIA, ...CIERRE],
  restaurante: [...RESTAURANTE, ...CIERRE],
  ferreteria: [...FERRETERIA, ...CIERRE],
  estetica: [...ESTETICA, ...CIERRE],
};

/**
 * El menú de una plantilla, ya filtrado por los módulos que esa plantilla trae.
 *
 * El filtro no es decorativo: una entrada que la plantilla no incluye sería una
 * promesa que el POST rechaza, que es exactamente el defecto que cerró esta
 * fase cuando `getCurrentPackage` le daba el menú completo a una tienda.
 */
export function navegacionDePlantilla(plantilla: Plantilla): readonly EntradaDeMenu[] {
  const modulos = new Set<string>(segunElDato(MODULOS_POR_PLANTILLA, plantilla) ?? []);
  return (segunElDato(MENU, plantilla) ?? []).filter((entrada) => modulos.has(entrada.modulo));
}

/**
 * Dónde abre cada negocio al entrar.
 *
 * No es una preferencia: está decidido en `04-SISTEMA-DE-DISENO §2 eje A` y en
 * cada `04-INTERFAZ.md`. Un restaurante abre el mapa de mesas porque lo primero
 * que hace el mesero es ver quién está sentado; una estética abre la agenda
 * porque el hueco de las 3 pm no se recupera mañana; una tiendita abre el cobro
 * con el foco en el escáner porque la fila no espera.
 */
export const INICIO_POR_PLANTILLA: Readonly<Record<Plantilla, string>> = {
  tienda: '/abarrotes/cobrar',
  cafeteria: '/cafeteria/cobrar',
  restaurante: '/restaurante/mapa-de-mesas',
  ferreteria: '/ferreteria/mostrador',
  estetica: '/estetica-salon/agenda-del-dia',
};

/** ¿Esta ruta pertenece a la plantilla? Lo que el envoltorio de modelos exige. */
export function rutaPermitidaEnPlantilla(ruta: string, plantilla: Plantilla): boolean {
  const limpia = ruta.split('?')[0]?.replace(/\/+$/, '') ?? '';
  return navegacionDePlantilla(plantilla).some((entrada) => entrada.ruta === limpia);
}
