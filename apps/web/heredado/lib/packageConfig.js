'use client';
import {
  INICIO_POR_PLANTILLA,
  MODULOS_POR_PLANTILLA,
  navegacionDePlantilla,
  PLANTILLAS,
} from '@morphiqpos/contracts';

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

/** Las cinco plantillas. Mismo orden y mismos nombres que `PLANTILLAS`. */
export const PACKAGE_KEYS = {
  TIENDA: 'tienda',
  CAFETERIA: 'cafeteria',
  RESTAURANTE: 'restaurante',
  FERRETERIA: 'ferreteria',
  ESTETICA: 'estetica',
};

/** La plantilla MÁS RESTRICTIVA. Es el valor por omisión, y no es negociable. */
export const PLANTILLA_POR_OMISION = PACKAGE_KEYS.TIENDA;

export const PACKAGE_LABELS = {
  tienda: 'Tienda',
  cafeteria: 'Cafetería',
  restaurante: 'Restaurante',
  ferreteria: 'Ferretería',
  estetica: 'Estética',
};

export const PACKAGE_TAGLINES = {
  tienda: 'POS de mostrador con inventario, compras, gastos y costos.',
  cafeteria: 'POS de mostrador para barra: se cobra primero y se prepara al momento.',
  restaurante: 'Sistema completo para restaurantes con mesas, mesero y cocina.',
  ferreteria: 'Mostrador que vende por medida, fía a la obra y factura.',
  estetica: 'La agenda es el negocio: citas, expediente y comisión por profesional.',
};

export const PACKAGE_TARGET = {
  tienda: 'Abarrotes, ferreterías, farmacias y mostradores que controlan existencias.',
  cafeteria: 'Cafeterías, barras y puestos donde quien cobra es quien prepara.',
  restaurante: 'Restaurantes, fondas y bares que atienden por mesa.',
  ferreteria: 'Ferreterías, materiales y refaccionarias que cortan, rentan y dan crédito.',
  estetica: 'Estéticas, barberías, spas y uñas: se atiende con cita y se reparte comisión.',
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
  ferreteria: {
    titulo: 'Mostrador con medida, obra y factura',
    descripcion:
      'El cliente trae la pieza en la mano. Se busca, se corta si hace falta, se cotiza, se fía a la obra y se factura. Lleva el control operativo completo.',
    pasos: ['Mostrador', 'Corte de material', 'Cotización', 'Cuentas', 'Facturación', 'Corte'],
  },
  estetica: {
    titulo: 'Agenda, expediente y comisión',
    descripcion:
      'El día empieza en la agenda y termina en la liquidación. Cada cita tiene profesional, servicio y fórmula, y cada profesional su comisión.',
    pasos: ['Agenda', 'Cita en curso', 'Cobro', 'Corte', 'Liquidación'],
  },
};

/**
 * Los módulos de cada plantilla, LEÍDOS del contrato del servidor.
 *
 * Aquí había tres arreglos copiados a mano —BASE, OPERACION y SALA— y un
 * contrato en `package-config.test.ts` que los comparaba módulo a módulo con
 * `plantillas.ts` para que no divergieran. Dos listas de lo mismo es cómo una
 * se queda atrás, y el contrato existía precisamente porque podían. Ahora hay
 * UNA lista: ésta la deriva de aquélla y no se puede desincronizar.
 *
 * Lo que el contrato comprueba ahora es otra cosa, y más útil: que este archivo
 * no vuelva a declarar módulos por su cuenta.
 */
export const PACKAGE_MODULES = Object.fromEntries(
  PLANTILLAS.map((plantilla) => [plantilla, [...MODULOS_POR_PLANTILLA[plantilla]]]),
);

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
  ferreteria: [
    'Todo lo de Tienda',
    'Mostrador con búsqueda por medida y acabado',
    'Corte de material y retazos',
    'Cotizaciones',
    'Crédito y cobranza por obra',
    'Trabajos de mostrador: renta y garantía',
    'Facturación',
  ],
  estetica: [
    'Agenda del día y agendado con huecos',
    'Citas con profesional, servicio y recurso',
    'Expediente de la clienta con fórmulas',
    'Comisiones y liquidación por profesional',
    'Catálogo de servicios con duración',
    'Inventario de cabina y de anaquel',
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
/**
 * La tabla comparativa, DERIVADA de los módulos.
 *
 * Estaba tecleada a mano con una columna por plantilla, y ya mintió una vez:
 * prometía inventario, compras y recetas donde `PACKAGE_MODULES` no los daba.
 * Un comparador que contradice al gate es una mentira en la pantalla con la que
 * se vende. Cada fila nombra ahora el MÓDULO que la sostiene y la celda sale de
 * si esa plantilla lo trae, así que no puede divergir.
 */
const FILAS_COMPARADOR = [
  { funcion: 'Productos y categorías', modulo: 'productos_basicos' },
  { funcion: 'Caja / Punto de venta', modulo: 'caja_directa' },
  { funcion: 'Tickets', modulo: 'tickets' },
  { funcion: 'Corte de caja y PDF', modulo: 'cortes' },
  { funcion: 'Registros', modulo: 'registros_basicos' },
  { funcion: 'Inventario', modulo: 'inventario' },
  { funcion: 'Compras', modulo: 'compras' },
  { funcion: 'Gastos', modulo: 'gastos' },
  { funcion: 'Recetas / gramajes', modulo: 'recetas' },
  { funcion: 'Costos y utilidad', modulo: 'costos_basicos' },
  { funcion: 'Escáner de código de barras', modulo: 'escaner_codigo_barras' },
  { funcion: 'Portal QR', modulo: 'portal_qr' },
  { funcion: 'Propinas', modulo: 'propinas' },
  { funcion: 'Mesas', modulo: 'mesas' },
  { funcion: 'Mesero', modulo: 'mesero' },
  { funcion: 'Cocina', modulo: 'cocina' },
  { funcion: 'Barra', modulo: 'barra' },
  { funcion: 'Pedido anticipado y recogida', modulo: 'pedido_anticipado' },
  { funcion: 'Sellos de lealtad', modulo: 'sellos_de_lealtad' },
  { funcion: 'Fiado', modulo: 'fiado' },
  { funcion: 'Servicios y recargas', modulo: 'servicios_de_terceros' },
  { funcion: 'Conteo físico', modulo: 'toma_fisica' },
  { funcion: 'Mostrador por medida', modulo: 'mostrador' },
  { funcion: 'Corte de material', modulo: 'corte_de_material' },
  { funcion: 'Cotizaciones', modulo: 'cotizaciones' },
  { funcion: 'Crédito y cobranza', modulo: 'credito_y_cobranza' },
  { funcion: 'Facturación', modulo: 'facturacion' },
  { funcion: 'Agenda y citas', modulo: 'agenda' },
  { funcion: 'Expediente de la clienta', modulo: 'expediente' },
  { funcion: 'Comisiones y liquidación', modulo: 'comisiones' },
  { funcion: 'Catálogo de servicios', modulo: 'catalogo_de_servicios' },
];

export const PACKAGE_COMPARISON = FILAS_COMPARADOR.map((fila) => {
  const celdas = { funcion: fila.funcion, modulo: fila.modulo };
  for (const plantilla of PLANTILLAS) {
    celdas[plantilla] = PACKAGE_MODULES[plantilla].includes(fila.modulo);
  }
  return celdas;
});

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
    case 'ferreteria':
    case 'estetica':
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

/** Los ocho nombres que `normalizarPlantilla` sabe traducir de verdad. */
const NOMBRES_CONOCIDOS = [
  'tienda',
  'cafeteria',
  'restaurante',
  'ferreteria',
  'estetica',
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
  // Y las 57 pantallas de los cinco modelos, con el módulo que cada una
  // declara en su entrada de menú. No se teclean: se leen de `navegacion.ts`,
  // que es la misma tabla que pinta el menú. Escribirlas aquí a mano sería la
  // segunda lista que se queda atrás — y la primera vez que pasó, las 61
  // pantallas no colgaban de ningún sitio.
  ...Object.fromEntries(
    PLANTILLAS.flatMap((plantilla) =>
      navegacionDePlantilla(plantilla).map((entrada) => [entrada.ruta, entrada.modulo]),
    ),
  ),
};

/** Dónde abre cada plantilla. Se reexporta para que el menú y el salto de
 * después de entrar lean lo mismo. */
/**
 * Lo que este modulo REEXPORTA del contrato.
 *
 * `PLANTILLAS` se importaba y se usaba aqui dentro, pero NO salia. El shim de
 * `src/cliente/package-config.ts` hace `export *`, y un `export *` solo reexporta
 * lo que el modulo exporta: cualquier pantalla que pidiera `PLANTILLAS` por el
 * alias `@/lib/packageConfig` rompia EL BUILD, no el typecheck —Turbopack lo
 * resuelve de verdad y dice «The export PLANTILLAS was not found»—. Paso: el Modo
 * presentacion lo pidio para derivar su orden y el build del CI murio ahi.
 *
 * Sale de aqui porque es la lista CANONICA. Que el frontend heredado lea la de
 * `contracts` en vez de una copia es justo lo que hace que la sexta plantilla
 * entre sola.
 */
export { INICIO_POR_PLANTILLA, navegacionDePlantilla, PLANTILLAS };

/**
 * El menú de la plantilla, con el permiso del rol ya aplicado.
 *
 * Las dos preguntas son distintas y se mezclaron una vez: la plantilla dice qué
 * COMPRÓ el negocio y el rol dice qué puede TOCAR esta persona. Aquí se
 * responden en ese orden.
 */
export function navegacionParaRolYPlantilla(rol, paqueteModo, tienePermiso) {
  const entradas = navegacionDePlantilla(normalizarPlantilla(paqueteModo));
  if (typeof tienePermiso !== 'function') return entradas;
  return entradas.filter((entrada) => tienePermiso(rol, entrada.permiso));
}

/**
 * Dónde abre ESTA persona en ESTE negocio.
 *
 * ── Por qué no basta con `ROLE_HOME_ROUTES` ──────────────────────────────────
 * Porque esa tabla manda a las pantallas del punto de venta heredado —`/caja`,
 * `/mesero`, `/cocina`— y no sabe nada de los cinco modelos. Con ella, una
 * estética entraba al tablero genérico en vez de a su agenda, que es la
 * pantalla que abre cuarenta veces al día.
 *
 * Se abre en la PRIMERA entrada del menú que esta persona puede tocar, y el
 * orden del menú es el del día de trabajo de su giro. Así el dueño de un
 * restaurante cae en el mapa de mesas, su cocinero en la cocina y su cajero en
 * el cobro, sin una segunda tabla que se quede atrás.
 */
export function inicioDeLaSesion(rol, paqueteModo, tienePermiso) {
  const plantilla = normalizarPlantilla(paqueteModo);
  const suyas = navegacionParaRolYPlantilla(rol, plantilla, tienePermiso);
  return suyas[0]?.ruta ?? INICIO_POR_PLANTILLA[plantilla] ?? '/';
}

export function isRouteAllowed(routePath, paqueteModo) {
  const moduleNeeded = ROUTE_TO_MODULE[routePath];
  if (!moduleNeeded) return true;
  return canAccessModule(moduleNeeded, paqueteModo);
}
