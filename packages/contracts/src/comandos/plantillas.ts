/**
 * F-015 · La plantilla de negocio, y el renombre de la decisión D-01.
 *
 * ── Qué cambia ─────────────────────────────────────────────────────────────
 * Los tres valores de `organizaciones.paquete` eran niveles comerciales
 * —`esencial`, `operativo`, `restaurante_pro`— y pasan a nombrar el MODELO DE
 * NEGOCIO al que sirven: `tienda`, `cafeteria`, `restaurante`.
 *
 * ── Por qué no es un `update` de tres valores ──────────────────────────────
 * Escrito plano, `operativo → cafeteria` arrastra a **Abarrotes Don Chuy y
 * Ferretería La Broca** —que hoy están en `operativo`— a la plantilla de un
 * negocio de café. Dos clientes que pagan, operando, con la plantilla
 * equivocada. Por eso D-12 parte **por giro**, no por paquete.
 *
 * Y por eso Café Jacaranda se queda en `restaurante` aunque su giro sea
 * cafetería: tiene contratado el paquete completo con mesero y cocina, y
 * bajarlo a `cafeteria` le quitaría módulos que paga. **El giro dice qué
 * NEGOCIO es; la plantilla dice qué COMPRÓ.** No son lo mismo, y ésa es justo
 * la razón por la que la migración 054 los separó en dos columnas.
 *
 * ── Por qué los nombres viejos siguen aquí ─────────────────────────────────
 * Porque la migración del renombre **NO se aplica en esta fase**: se escribe y
 * se aplica al acoplar, con los negocios cerrados y con respaldo (P-04). Hasta
 * entonces la base sigue guardando `esencial|operativo|restaurante_pro`, y un
 * código que sólo entendiera los nombres nuevos dejaría a los cuatro negocios
 * vivos sin plantilla.
 *
 * Es la regla de orden de despliegue de `supabase-vercel-produccion` §6:
 * **primero lo aditivo, luego el frontend, y sólo entonces se retira lo viejo.**
 * `plantillaDe()` entiende los seis valores; cuando la 058 esté aplicada y
 * verificada, los tres viejos se retiran de aquí y de ningún otro sitio.
 */

import { esGiro, PAQUETES, type Giro } from './ambito.ts';

/**
 * Las tres plantillas de negocio. Son LA MISMA lista que `PAQUETES`.
 *
 * Estaban escritas dos veces, y dos listas de lo mismo es cómo una se queda
 * atrás: basta con añadir una plantilla en un sitio para que el `check` de la
 * base, el gate de comandos y la pantalla dejen de coincidir sin que nada avise.
 * Se declara una vez, en `ambito.ts`, que es donde vive el tipo `Paquete` —el
 * de la columna— y se reexporta aquí con el nombre del dominio.
 */
export const PLANTILLAS = PAQUETES;

export type Plantilla = (typeof PLANTILLAS)[number];

/** Los nombres comerciales anteriores a D-01. La base todavía guarda éstos. */
export const PAQUETES_HEREDADOS = ['esencial', 'operativo', 'restaurante_pro'] as const;

export type PaqueteHeredado = (typeof PAQUETES_HEREDADOS)[number];

/**
 * La plantilla de una FILA de `organizaciones`, normalizando las dos columnas.
 *
 * ── Por qué existe, y por qué es una sola función ──────────────────────────
 * Hay CINCO sitios que leen `organizaciones.paquete` para decidir qué puede
 * hacer un negocio: el resolutor de sesión, el repositorio de comandos, la
 * configuración, la sesión de gestión y el portal público. Los cinco hacían lo
 * mismo —`esPaquete(valor) ? valor : fallar`— y los cinco se romperían igual
 * con el renombre de D-01: mientras la 058 no esté aplicada la columna guarda
 * `restaurante_pro`, que ya no es una plantilla, así que los cinco fallarían
 * cerrado a la vez. Nadie podría entrar, ni cobrar, ni abrir el portal.
 *
 * Cinco copias de una regla es cómo una se queda atrás. Esto es la regla, una
 * vez: normaliza el giro, normaliza el valor guardado, y ante cualquier cosa
 * que no reconozca cae en `tienda`, que es la plantilla MÁS RESTRICTIVA. Sigue
 * fallando cerrado donde importa; lo que ya no hace es confundir «no lo
 * reconozco» con «no existe».
 */
export function plantillaDeOrganizacion(giro: unknown, valorGuardado: unknown): Plantilla {
  return plantillaDe(esGiro(giro) ? giro : 'tienda', valorGuardado);
}

/**
 * Los giros que operan como negocio de alimentos.
 *
 * Es la partición que D-12 usa: un `operativo` de cafetería no es el mismo
 * negocio que un `operativo` de ferretería, y meterlos en la misma plantilla es
 * exactamente el fallo que esta función existe para impedir.
 */
const GIROS_DE_ALIMENTOS: readonly Giro[] = ['cafeteria', 'restaurante'];

/**
 * Lee una tabla total con una clave que viene de los DATOS, no del tipo.
 *
 * Las tablas de este archivo son `Record<K, V>` completas a propósito: olvidar
 * una plantilla o un giro tiene que ser un error de compilación. Pero la clave
 * con la que se consultan sale de `organizaciones.giro` o de `paquete`, y ahí
 * puede haber un valor que el `check` de la columna ya no admite —un respaldo
 * viejo, una copia de desarrollo, una fila tocada a mano—.
 *
 * Sin esto, el `?? 'tienda'` que protege ese caso es «código muerto» para el
 * tipo y `no-unnecessary-condition` lo marca; quitarlo dejaría `undefined`
 * viajando hasta la pantalla. Esta función dice, en un sitio y con su motivo,
 * que la clave no está garantizada.
 */
export function segunElDato<V>(tabla: Readonly<Record<string, V>>, clave: string): V | undefined {
  return (tabla as Readonly<Record<string, V | undefined>>)[clave];
}

export function esPlantilla(valor: unknown): valor is Plantilla {
  return typeof valor === 'string' && (PLANTILLAS as readonly string[]).includes(valor);
}

/**
 * La plantilla efectiva de una organización, a partir de su giro y del valor
 * que tenga hoy la columna.
 *
 * Acepta los seis valores a propósito. Si ya viene un nombre nuevo, se respeta
 * tal cual: la migración 058 pudo haberse aplicado, y el giro no debe volver a
 * decidir sobre algo que ya está decidido.
 */
export function plantillaDe(giro: Giro, valorGuardado: unknown): Plantilla {
  if (esPlantilla(valorGuardado)) return valorGuardado;

  // Sin valor guardado, el giro decide — y lo decide la tabla, no un `switch`
  // que se pueda quedar corto. Es lo que estrena un negocio recién dado de alta.
  if (valorGuardado === undefined || valorGuardado === null || valorGuardado === '') {
    return segunElDato(PLANTILLA_POR_GIRO, giro) ?? 'tienda';
  }

  const esAlimentos = GIROS_DE_ALIMENTOS.includes(giro);

  switch (valorGuardado) {
    case 'restaurante_pro':
      // El paquete completo con mesero y cocina. Sólo un giro de alimentos
      // puede tenerlo —lo garantiza `organizaciones_paquete_compatible_con_giro`
      // desde la 054— y si apareciera en otro giro es un dato corrupto, no una
      // decisión: se degrada a la plantilla más restrictiva en vez de darle
      // módulos de sala a una ferretería.
      return esAlimentos ? 'restaurante' : 'tienda';
    case 'operativo':
      // Los tres nombres heredados los tradujo la 058 y ya no quedan en la
      // base; siguen aquí porque un respaldo viejo o una copia de desarrollo
      // pueden traerlos, y traducir es mejor que degradar.
      return esAlimentos ? 'cafeteria' : (segunElDato(PLANTILLA_POR_GIRO, giro) ?? 'tienda');
    case 'esencial':
      return 'tienda';
    default:
      // Un valor desconocido cae a la plantilla MÁS RESTRICTIVA, nunca a la más
      // permisiva. Un dato roto no puede abrir módulos que nadie contrató.
      return 'tienda';
  }
}

/**
 * Todos los módulos del sistema, que son las perillas de F-016.
 *
 * La lista sale de `apps/web/heredado/lib/packageConfig.js`, que gobierna la
 * navegación de Miguel y no se toca (D-09). Se declara aquí para que el
 * SERVIDOR pueda decidir sin importar código del navegador, que es lo que
 * exige la regla de que la autorización vive en el servidor.
 */
export const MODULOS = [
  // Base: los tiene toda plantilla.
  'dashboard_basico',
  'productos_basicos',
  'categorias',
  'caja_directa',
  'ventas',
  'detalle_ventas',
  'metodos_pago',
  'tickets',
  'cortes',
  'pdf_corte',
  'registros_basicos',
  'configuracion_basica',
  'integraciones_preparadas_admin',
  'escaner_codigo_barras',
  // Operación: inventario, compras y costo.
  'inventario',
  'compras',
  'gastos',
  'movimientos_inventario',
  'recetas',
  'gramajes',
  'ingredientes',
  'costos_basicos',
  'utilidad_basica',
  'margen_basico',
  'reportes_operativos',
  'exportaciones',
  'dashboard_operativo',
  'portal_qr',
  // Sala: mesa, mesero y cocina.
  'mesas',
  'mesero',
  'cocina',
  'barra',
  'pedidos_mesa',
  'estados_mesa',
  'mapa_mesas',
  'configuracion_mesas',
  'reportes_financieros_avanzados',
  'dashboard_completo',
  'integraciones_preparadas',
  'configuracion_completa',
  // Mostrador de café: la barra que prepara y la fila que espera.
  'pedido_anticipado',
  'turno_de_barra',
  'sellos_de_lealtad',
  'modificadores_de_bebida',
  'propinas',
  // Retail: lo que una tiendita y una ferretería hacen y un restaurante no.
  'fiado',
  'servicios_de_terceros',
  'toma_fisica',
  'entradas_de_mercancia',
  // Ferretería: se vende por medida, se fía a obra y se factura.
  'mostrador',
  'piezas_y_medidas',
  'corte_de_material',
  'credito_y_cobranza',
  'cotizaciones',
  'trabajos_de_mostrador',
  'facturacion',
  // Servicios con cita: la agenda ES el negocio.
  'agenda',
  'citas',
  'agenda_por_profesional',
  'expediente',
  'comisiones',
  'catalogo_de_servicios',
  'profesionales',
  'clientes',
] as const;

export type Modulo = (typeof MODULOS)[number];

export function esModulo(valor: unknown): valor is Modulo {
  return typeof valor === 'string' && (MODULOS as readonly string[]).includes(valor);
}

const BASE: readonly Modulo[] = [
  'dashboard_basico',
  'productos_basicos',
  'categorias',
  'caja_directa',
  'ventas',
  'detalle_ventas',
  'metodos_pago',
  'tickets',
  'cortes',
  'pdf_corte',
  'registros_basicos',
  'configuracion_basica',
  'integraciones_preparadas_admin',
  'escaner_codigo_barras',
];

const OPERACION: readonly Modulo[] = [
  'inventario',
  'compras',
  'gastos',
  'movimientos_inventario',
  'recetas',
  'gramajes',
  'ingredientes',
  'costos_basicos',
  'utilidad_basica',
  'margen_basico',
  'reportes_operativos',
  'exportaciones',
  'dashboard_operativo',
  'portal_qr',
];

const SALA: readonly Modulo[] = [
  'mesas',
  'mesero',
  'cocina',
  'barra',
  'pedidos_mesa',
  'estados_mesa',
  'mapa_mesas',
  'configuracion_mesas',
  'reportes_financieros_avanzados',
  'dashboard_completo',
  'integraciones_preparadas',
  'configuracion_completa',
];

/**
 * El PREAJUSTE de cada plantilla — decisión pendiente P-01, implementada como
 * «plantilla de partida + perillas por módulo».
 *
 * `tienda` incluye operación porque D-01 lo dice con todas sus letras: *una
 * tienda sin inventario no es una tienda, es una calculadora*. El `esencial`
 * viejo vendía sin controlar stock, y el renombre a `tienda` sólo es honesto si
 * viene con stock, presentaciones, código de barras y mínimos.
 *
 * El escáner de barras NO está en `restaurante`: es de mostrador, y así estaba
 * ya en `packageConfig.js`, que excluye `escaner_codigo_barras` de Pro.
 */
/** Lo propio de un mostrador de café: la barra, la fila y el sello. */
const CAFE: readonly Modulo[] = [
  'barra',
  'pedido_anticipado',
  'turno_de_barra',
  'sellos_de_lealtad',
  'modificadores_de_bebida',
];

/** Lo propio de un anaquel: se fía, se cobra un servicio y se cuenta. */
const RETAIL: readonly Modulo[] = [
  'fiado',
  'servicios_de_terceros',
  'toma_fisica',
  'entradas_de_mercancia',
];

/** Lo propio de una ferretería: medida, obra y factura. */
const FERRETERIA: readonly Modulo[] = [
  'mostrador',
  'piezas_y_medidas',
  'corte_de_material',
  'credito_y_cobranza',
  'cotizaciones',
  'trabajos_de_mostrador',
  'facturacion',
];

/** Lo propio de un negocio con cita: la agenda, el expediente y la comisión. */
const CITA: readonly Modulo[] = [
  'agenda',
  'citas',
  'agenda_por_profesional',
  'expediente',
  'comisiones',
  'catalogo_de_servicios',
  'profesionales',
  'clientes',
];

/** El escáner es de mostrador: un mesero no pasa un código de barras. */
const BASE_SIN_ESCANER: readonly Modulo[] = BASE.filter((m) => m !== 'escaner_codigo_barras');

/**
 * El PREAJUSTE de cada plantilla — decisión pendiente P-01, implementada como
 * «plantilla de partida + perillas por módulo».
 *
 * ── Por qué son CINCO y no tres ────────────────────────────────────────────
 * Eran tres, y dos de ellas —`tienda` y `cafeteria`— tenían los MISMOS 28
 * módulos, uno por uno. Es decir: de tres plantillas, dos eran la misma, y
 * ferretería y estética no tenían ninguna propia. Ninguno de los 38 módulos
 * nombraba agenda, cita, comisión, expediente, cotización, corte de material ni
 * crédito, que es lo que esos dos negocios HACEN todo el día. El resultado era
 * que la plantilla no decidía nada para dos de los cinco modelos.
 *
 * Ahora cada modelo tiene la suya, y las cinco se distinguen por módulos, no
 * sólo por vocabulario:
 *
 *   tienda       32 · mostrador con anaquel: fía, cobra servicios y cuenta
 *   cafeteria    34 · mostrador con barra: prepara, llama y sella
 *   restaurante  40 · sala entera, sin escáner de barras
 *   ferreteria   39 · anaquel + medida, obra y factura
 *   estetica     37 · agenda, expediente y comisión
 *
 * `tienda` incluye operación porque D-01 lo dice con todas sus letras: *una
 * tienda sin inventario no es una tienda, es una calculadora*.
 */
export const MODULOS_POR_PLANTILLA: Readonly<Record<Plantilla, readonly Modulo[]>> = {
  tienda: [...BASE, ...OPERACION, ...RETAIL],
  cafeteria: [...BASE, ...OPERACION, ...CAFE, 'propinas'],
  restaurante: [...BASE_SIN_ESCANER, ...OPERACION, ...SALA, 'propinas'],
  ferreteria: [...BASE, ...OPERACION, ...RETAIL, ...FERRETERIA],
  estetica: [...BASE, ...OPERACION, ...CITA, 'propinas'],
};

/**
 * Qué plantilla estrena un negocio de cada giro, DECLARADO uno por uno.
 *
 * ── Por qué existe este mapa ───────────────────────────────────────────────
 * Porque `plantillaDe` termina en `default: return 'tienda'` y eso hacía que la
 * puerta del acople aprobara cualquier giro, incluido uno inventado: la
 * comprobación «¿este giro cae en una plantilla real?» era una tautología. Por
 * eso no vio que `ferreteria` y `estetica` no tenían plantilla propia.
 *
 * El `default` sigue existiendo y sigue siendo correcto —un dato corrupto tiene
 * que caer en la plantilla más restrictiva, no reventar— pero ya no es lo que
 * se aprueba. Lo que se aprueba es esta tabla, y `verify:acople` exige que sus
 * claves sean exactamente `GIROS` en las dos direcciones.
 *
 * `farmacia` toma `tienda`: su modelo no está construido todavía y el mostrador
 * con inventario es lo más cercano. Cuando llegue su carpeta tendrá la suya, y
 * esta tabla es el sitio donde se verá que falta.
 */
export const PLANTILLA_POR_GIRO: Readonly<Record<Giro, Plantilla>> = {
  tienda: 'tienda',
  ferreteria: 'ferreteria',
  farmacia: 'tienda',
  cafeteria: 'cafeteria',
  restaurante: 'restaurante',
  estetica: 'estetica',
};

/** Una perilla: el módulo y si el negocio lo tiene encendido o apagado. */
export interface PerillaDeModulo {
  readonly modulo: Modulo;
  readonly activo: boolean;
}

/**
 * Los módulos efectivos: el preajuste de la plantilla, más las perillas.
 *
 * Una perilla sólo existe cuando alguien la tocó: la tabla guarda EXCEPCIONES,
 * no el estado completo. Así, cambiar el preajuste de una plantilla llega a
 * todos los negocios que no lo hayan personalizado, que es justo lo que se
 * quiere de un preajuste.
 */
export function modulosActivos(
  plantilla: Plantilla,
  perillas: readonly PerillaDeModulo[] = [],
): ReadonlySet<Modulo> {
  const activos = new Set<Modulo>(MODULOS_POR_PLANTILLA[plantilla]);
  for (const perilla of perillas) {
    if (perilla.activo) activos.add(perilla.modulo);
    else activos.delete(perilla.modulo);
  }
  return activos;
}
