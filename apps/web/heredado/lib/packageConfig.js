'use client';
// Helper central para el sistema de paquetes de MH Astral Systems POS.
// No oculta módulos por sí mismo: solo provee constantes y funciones puras
// que serán consumidas en fases posteriores (Sidebar, rutas, vistas internas).
//
// ── D-01 · LAS PLANTILLAS SON LAS CANÓNICAS, LOS PAQUETES SON ALIAS ────────
// Los tres nombres de este archivo eran NIVELES COMERCIALES —`esencial`,
// `operativo`, `restaurante_pro`— y pasan a nombrar el MODELO DE NEGOCIO al que
// sirven: `tienda`, `cafeteria`, `restaurante`. La fuente de verdad es
// `packages/contracts/src/comandos/plantillas.ts`, que es la que consulta el
// servidor antes de aceptar un POST.
//
// Qué se rompe si se vuelve atrás: el servidor normaliza a los nombres NUEVOS
// (`plantillaDeOrganizacion`), así que un frontend que sólo entendiera los
// viejos cae en su valor por omisión con TODOS los negocios. Cuando ese valor
// era `restaurante_pro`, una tienda de abarrotes recibía el menú de sala entero
// —Mesero, Cocina, Barra— y el dashboard del restaurante. El menú enseñaba lo
// que el POST rechaza, que es la peor de las dos incoherencias posibles.

/** Las tres plantillas. Mismo orden y mismos nombres que `PLANTILLAS`. */
export const PACKAGE_KEYS = {
  TIENDA: 'tienda',
  CAFETERIA: 'cafeteria',
  RESTAURANTE: 'restaurante',
};

/** La plantilla MÁS RESTRICTIVA. Es el valor por omisión, y no es negociable. */
export const PLANTILLA_POR_OMISION = PACKAGE_KEYS.TIENDA;

export const PACKAGE_LABELS = {
  tienda: 'Tienda',
  cafeteria: 'Cafetería',
  restaurante: 'Restaurante',
};

export const PACKAGE_TAGLINES = {
  tienda: 'POS de mostrador con inventario, compras, gastos y costos.',
  cafeteria: 'POS de mostrador para barra: se cobra primero y se prepara al momento.',
  restaurante: 'Sistema completo para restaurantes con mesas, mesero y cocina.',
};

export const PACKAGE_TARGET = {
  tienda: 'Abarrotes, ferreterías, farmacias y mostradores que controlan existencias.',
  cafeteria: 'Cafeterías, barras y puestos donde quien cobra es quien prepara.',
  restaurante: 'Restaurantes, fondas y bares que atienden por mesa.',
};

// Flujo operativo real de cada plantilla (para Modo Presentación)
export const PACKAGE_FLOW = {
  tienda: {
    titulo: 'Caja directa con control operativo completo',
    descripcion:
      'No usa Mesero digital, Cocina digital ni Mesas. Vende en mostrador y controla existencias: inventario, compras, gastos, recetas, gramajes, costos y utilidad básica.',
    pasos: ['Nueva venta', 'Productos', 'Cobro', 'Ticket', 'Corte', 'Control operativo'],
  },
  cafeteria: {
    titulo: 'Caja directa / Barra de mostrador',
    descripcion:
      'No usa Mesero digital, Cocina digital ni Mesas: quien cobra es quien prepara y quien entrega. Lleva el mismo control operativo que la tienda, porque una barra sin inventario no sabe cuánto café le queda.',
    pasos: ['Nueva venta', 'Productos', 'Cobro', 'Ticket', 'Corte', 'Control operativo'],
  },
  restaurante: {
    titulo: 'Sistema completo digital para restaurante',
    descripcion:
      'Flujo completo con Mesero, Mesas, Cocina y Caja. Operación digital interna de extremo a extremo.',
    pasos: ['Mesero toma pedido', 'Cocina prepara', 'Caja cobra', 'Corte', 'Reportes'],
  },
};

/**
 * Los tres bloques de módulos, EN EL MISMO ORDEN Y CON LOS MISMOS NOMBRES que
 * `BASE`, `OPERACION` y `SALA` de `plantillas.ts`.
 *
 * No es una coincidencia estética: `package-config.test.ts` compara las dos
 * listas módulo a módulo. Si alguien añade una perilla aquí y no allá, el menú
 * de Miguel ofrecería una pantalla que el comando del servidor rechaza —o al
 * revés, le escondería una que sí contrató— y esa divergencia no puede pasar
 * en silencio.
 */
const MODULOS_BASE = [
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
  // El escáner de código de barras es de mostrador. Restaurante lo excluye
  // explícitamente más abajo; ver MODULOS_EXCLUIDOS_DE_RESTAURANTE.
  'escaner_codigo_barras',
];

/**
 * Operación: existencias, compras y costo.
 *
 * Lo tienen LAS TRES plantillas, y ahí está el cambio de D-01 que más se nota:
 * el viejo `esencial` vendía sin controlar stock, y *una tienda sin inventario
 * no es una tienda, es una calculadora*. Por eso `esencial` NO puede seguir
 * existiendo como preajuste, y por eso `tienda` no se puede mapear hacia él.
 */
const MODULOS_OPERACION = [
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

/** Sala: mesa, mesero y cocina. SÓLO `restaurante`. */
const MODULOS_SALA = [
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
 * Módulos que `restaurante` NO hereda, aunque las plantillas sean acumulativas.
 *
 * Es la única excepción a «restaurante incluye todo lo de mostrador», y existe
 * porque el escáner de código de barras es de MOSTRADOR: se escanea una botella
 * o una bolsa de frituras, no una orden de tacos. Enseñárselo a un restaurante
 * que trabaja por mesa es ofrecerle una función que nunca va a usar y que le
 * ocupa un botón en la pantalla donde más prisa tiene.
 *
 * La lista vive AQUÍ y no repartida por las pantallas: la regla de qué incluye
 * cada plantilla tiene un solo sitio, y `canAccessModule` la respeta sola.
 */
const MODULOS_EXCLUIDOS_DE_RESTAURANTE = ['escaner_codigo_barras'];

export const PACKAGE_MODULES = {
  tienda: [...MODULOS_BASE, ...MODULOS_OPERACION],
  // Misma lista que `tienda`, y así está también en el servidor: lo que separa
  // a una cafetería de mostrador de una tienda es CÓMO HABLA (F-017), no qué
  // módulos tiene. El día que se separen, se separan en los dos sitios a la vez.
  cafeteria: [...MODULOS_BASE, ...MODULOS_OPERACION],
  restaurante: [...MODULOS_BASE, ...MODULOS_OPERACION, ...MODULOS_SALA].filter(
    (modulo) => !MODULOS_EXCLUIDOS_DE_RESTAURANTE.includes(modulo),
  ),
};

// Resumen de funciones por plantilla (para tabla comparativa en UI)
export const PACKAGE_FEATURES = {
  tienda: [
    'Dashboard operativo',
    'Productos y categorías',
    'Punto de venta / Caja directa',
    'Tickets, cortes y PDF de corte',
    'Inventario, compras y gastos',
    'Recetas, gramajes y costos básicos',
    'Escáner de código de barras',
  ],
  cafeteria: [
    'Todo lo de Tienda',
    'Pensada para barra: se cobra y se prepara en el mismo punto',
    'Portal QR para el menú del mostrador',
    'Reportes operativos y exportaciones',
  ],
  restaurante: [
    'Todo lo de Cafetería',
    'Mesas, mesero y cocina',
    'Pedidos por mesa y estados',
    'Mapa avanzado de mesas',
    'Reportes financieros avanzados',
    'Integraciones Google Sheets/Drive preparadas',
  ],
};

// Add-ons que se cotizan aparte (no son plantillas)
export const ADDONS = [
  { key: 'ia_analisis', nombre: 'IA para análisis y reportes' },
  { key: 'pagina_web', nombre: 'Página web del negocio' },
  { key: 'menu_digital', nombre: 'Menú digital público' },
  { key: 'google_real', nombre: 'Google Sheets/Drive conectado' },
  { key: 'app_escritorio', nombre: 'App de escritorio' },
  { key: 'impresoras', nombre: 'Impresoras térmicas / impresión' },
  { key: 'capacitacion', nombre: 'Capacitación' },
  { key: 'carga_masiva', nombre: 'Carga masiva de productos' },
  { key: 'visual_premium', nombre: 'Personalización visual premium' },
  { key: 'multi_sucursal', nombre: 'Multi-sucursal' },
  { key: 'modo_offline', nombre: 'Modo offline / local' },
  { key: 'soporte_prioritario', nombre: 'Soporte prioritario' },
  { key: 'reportes_ejecutivos', nombre: 'Reportes mensuales ejecutivos' },
];

// Comparador detallado fila por fila (para UI tipo tabla)
// valores: true = incluido, false = no incluido, 'addon' = solo como add-on
//
// Cada fila tiene que poder leerse contra PACKAGE_MODULES sin contradecirla:
// una tabla que promete inventario donde el módulo no está es la misma mentira
// que un menú de más, sólo que en la pantalla donde se vende.
export const PACKAGE_COMPARISON = [
  { funcion: 'Dashboard', tienda: 'Operativo', cafeteria: 'Operativo', restaurante: 'Completo' },
  { funcion: 'Productos y categorías', tienda: true, cafeteria: true, restaurante: true },
  { funcion: 'Caja / Punto de venta', tienda: true, cafeteria: true, restaurante: true },
  { funcion: 'Tickets', tienda: true, cafeteria: true, restaurante: true },
  { funcion: 'Corte de caja y PDF', tienda: true, cafeteria: true, restaurante: true },
  {
    funcion: 'Registros',
    tienda: 'Operativos',
    cafeteria: 'Operativos',
    restaurante: 'Completos',
  },
  { funcion: 'Inventario', tienda: true, cafeteria: true, restaurante: true },
  { funcion: 'Compras', tienda: true, cafeteria: true, restaurante: true },
  { funcion: 'Gastos', tienda: true, cafeteria: true, restaurante: true },
  { funcion: 'Recetas / gramajes', tienda: true, cafeteria: true, restaurante: true },
  {
    funcion: 'Costos / utilidad / margen',
    tienda: 'Básico',
    cafeteria: 'Básico',
    restaurante: 'Avanzado',
  },
  { funcion: 'Escáner de código de barras', tienda: true, cafeteria: true, restaurante: false },
  { funcion: 'Mesas', tienda: false, cafeteria: false, restaurante: true },
  { funcion: 'Mesero', tienda: false, cafeteria: false, restaurante: true },
  { funcion: 'Cocina / Barra', tienda: false, cafeteria: false, restaurante: true },
  {
    funcion: 'Reportes financieros avanzados',
    tienda: false,
    cafeteria: false,
    restaurante: true,
  },
  {
    funcion: 'Integraciones preparadas',
    tienda: 'Admin',
    cafeteria: 'Admin',
    restaurante: true,
  },
  { funcion: 'IA para análisis', tienda: 'addon', cafeteria: 'addon', restaurante: 'addon' },
];

// ---------- Normalización ----------

/**
 * Traduce cualquiera de los SEIS nombres a una de las TRES plantillas.
 *
 * ── Por qué los seis, y no sólo los tres nuevos ────────────────────────────
 * La migración del renombre se aplica al acoplar, con los negocios cerrados.
 * Hasta entonces la columna `organizaciones.paquete` guarda todavía los nombres
 * viejos, y un navegador puede tener cacheada una pestaña anterior al
 * despliegue. Entienden los seis el servidor (`plantillaDe`) y esta función, y
 * cuando la 058 esté aplicada y verificada los tres viejos se retiran de los
 * dos sitios a la vez.
 *
 * ── Por qué `operativo` cae en `tienda` y NO en `cafeteria` ────────────────
 * Porque aquí NO hay giro. El servidor parte `operativo` por giro —D-12— justo
 * para no arrastrar a **Abarrotes Don Chuy y Ferretería La Broca**, que hoy
 * están en `operativo`, a la plantilla de un negocio de café. El navegador no
 * recibe el giro, así que toma la misma rama que toma el servidor cuando el
 * giro no se reconoce: `tienda`. No se pierde ni se gana un solo módulo —las
 * dos plantillas traen exactamente los mismos— y lo único que se evita es que
 * una ferretería lea «Cafetería» en su propia pantalla.
 *
 * ── Por qué `restaurante_pro` sí cae en `restaurante` ──────────────────────
 * Porque `organizaciones_paquete_compatible_con_giro` (migración 054) impide
 * que ese valor exista fuera de un giro de alimentos. Si llega al navegador, el
 * giro ES de alimentos, y entonces el servidor dice exactamente lo mismo que
 * decimos aquí. Degradarlo a `tienda` le quitaría a Café Jacaranda el menú de
 * sala que tiene contratado y paga.
 *
 * ── Y por qué lo desconocido cae en `tienda` ───────────────────────────────
 * Un dato roto no puede abrir módulos que nadie contrató. Cuando esto caía en
 * el paquete más permisivo, cualquier valor que el frontend no reconociera
 * —incluidos los tres nombres NUEVOS— abría el sistema entero.
 *
 * @param {unknown} valor
 * @returns {'tienda' | 'cafeteria' | 'restaurante'}
 */
export function normalizarPlantilla(valor) {
  switch (valor) {
    case 'tienda':
    case 'cafeteria':
    case 'restaurante':
      return valor;
    case 'esencial':
    case 'operativo':
      return 'tienda';
    case 'restaurante_pro':
      return 'restaurante';
    default:
      return PLANTILLA_POR_OMISION;
  }
}

/** Los seis nombres que `normalizarPlantilla` sabe traducir de verdad. */
const NOMBRES_CONOCIDOS = [
  'tienda',
  'cafeteria',
  'restaurante',
  'esencial',
  'operativo',
  'restaurante_pro',
];

export function esNombreDePlantilla(valor) {
  return NOMBRES_CONOCIDOS.includes(valor);
}

// ---------- Funciones helper ----------

export function getCurrentPackage(config) {
  return normalizarPlantilla(config?.paquete_modo);
}

/**
 * Compara sin que un nombre inventado se convierta en un «sí».
 *
 * `normalizarPlantilla('lo-que-sea')` vale `tienda` a propósito, así que
 * comparar sin filtrar antes haría que `isPackage(cfgDeTienda, 'cualquiercosa')`
 * devolviera verdadero.
 */
export function isPackage(config, packageName) {
  return (
    esNombreDePlantilla(packageName) &&
    getCurrentPackage(config) === normalizarPlantilla(packageName)
  );
}

export function canAccessModule(moduleName, paqueteModo) {
  return PACKAGE_MODULES[normalizarPlantilla(paqueteModo)].includes(moduleName);
}

export function getPackageLabel(paqueteModo) {
  return PACKAGE_LABELS[normalizarPlantilla(paqueteModo)];
}

export function getPackageFeatures(paqueteModo) {
  return PACKAGE_FEATURES[normalizarPlantilla(paqueteModo)];
}

export function getPackageTagline(paqueteModo) {
  return PACKAGE_TAGLINES[normalizarPlantilla(paqueteModo)];
}

export function getPackageTarget(paqueteModo) {
  return PACKAGE_TARGET[normalizarPlantilla(paqueteModo)];
}

// ---------- Mapa de rutas -> módulo requerido ----------
// Si una ruta no está aquí, se considera siempre accesible.
export const ROUTE_TO_MODULE = {
  '/': 'dashboard_basico',
  '/pos': 'caja_directa',
  '/caja': 'caja_directa',
  '/ventas': 'ventas',
  '/corte-caja': 'cortes',
  '/registros': 'registros_basicos',
  '/configuracion': 'configuracion_basica',
  '/productos': 'productos_basicos',
  // Operación: las tres plantillas
  '/inventario': 'inventario',
  '/compras': 'compras',
  '/recetas': 'recetas',
  '/portal-qr': 'portal_qr',
  // Sala: sólo restaurante
  '/mesas': 'mesas',
  '/mesero': 'mesero',
  '/cocina': 'cocina',
  '/barra': 'barra',
};

export function isRouteAllowed(routePath, paqueteModo) {
  const moduleNeeded = ROUTE_TO_MODULE[routePath];
  if (!moduleNeeded) return true;
  return canAccessModule(moduleNeeded, paqueteModo);
}
