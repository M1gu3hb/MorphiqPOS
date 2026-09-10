/**
 * Los interruptores de operación que gobiernan el portal QR.
 *
 * ── Por qué se leen aquí y no salen de `leerConfiguracion(publica)` ────────
 * `PUBLICOS` (puente/configuracion.ts) recorta la configuración a lo que se
 * puede ENSEÑAR. Estos doce interruptores son otra cosa: son lo que el servidor
 * necesita para DECIDIR —si el portal está abierto, si el comensal puede
 * ordenar, si puede pedir la cuenta—. Se leen del documento completo, se usan
 * para decidir, y sólo salen convertidos en los booleanos que `F1-04 §36.3`
 * autoriza. Ninguno se devuelve tal cual «porque ya lo tenía a mano».
 *
 * ── Los valores por omisión no son adorno ─────────────────────────────────
 * Su código lee `config?.portal_qr_mostrar_precios !== false`, es decir: lo que
 * falta está encendido. Cambiar ese criterio aquí apagaría los precios de todo
 * negocio que nunca tocó la pantalla de configuración. Las omisiones de abajo
 * son las suyas, copiadas de `PortalCliente.jsx` y `qrUtils.js:31-35`.
 */

/** Cómo se arma el menú: del catálogo del POS, de un menú subido, o los dos. */
export type ModoMenu = 'productos_pos' | 'menu_subido' | 'mixto';

/** Quién puede iniciar el cobro. `mesero_dispara` es el flujo principal. */
export type ModoCuenta = 'mesero_dispara' | 'cliente_solicita' | 'ambos';

export interface BanderasPortal {
  readonly portalActivo: boolean;
  readonly modoMenu: ModoMenu;
  readonly modoCuenta: ModoCuenta;
  readonly mostrarPrecios: boolean;
  readonly mostrarSinImagen: boolean;
  readonly permitirOrdenar: boolean;
  readonly permitirCuenta: boolean;
  readonly permitirAyuda: boolean;
  readonly permitirPedidosCliente: boolean;
  readonly permitirPropinaCliente: boolean;
  readonly mostrarPrecuenta: boolean;
  readonly mensajeBienvenida: string;
  readonly propinasActivas: boolean;
  /** Porcentajes ya validados. Se emiten como el CSV que su `tipsUtils` parsea. */
  readonly porcentajesPropina: readonly number[];
  readonly asignacionMesasActiva: boolean;
  /** Interno: decide el ruteo del pedido a estaciones. NUNCA sale (§36.3). */
  readonly estacionesActivas: boolean;
}

const MODOS_MENU: readonly string[] = ['productos_pos', 'menu_subido', 'mixto'];
const MODOS_CUENTA: readonly string[] = ['mesero_dispara', 'cliente_solicita', 'ambos'];

/** Los de `getPorcentajesSugeridos` (tipsUtils.js:20) cuando no hay nada válido. */
const PORCENTAJES_POR_OMISION: readonly number[] = [5, 10, 15, 20];

const MENSAJE_BIENVENIDA_MAXIMO = 500;

function bandera(
  valores: Readonly<Record<string, unknown>>,
  clave: string,
  omision: boolean,
): boolean {
  const valor = valores[clave];
  return typeof valor === 'boolean' ? valor : omision;
}

function texto(valores: Readonly<Record<string, unknown>>, clave: string, limite: number): string {
  const valor = valores[clave];
  return typeof valor === 'string' ? valor.slice(0, limite) : '';
}

/**
 * Porcentajes sugeridos de propina, validados en el SERVIDOR.
 *
 * Hoy `getPorcentajesSugeridos` parsea texto en el navegador en cada render
 * (`tipsUtils.js:18`). Aquí se parte por coma, se descarta lo que no sea un
 * porcentaje entre 1 y 100, y una lista con basura cae a la sugerida en vez de
 * pintarle al comensal un botón de «NaN %».
 */
export function porcentajesValidos(crudo: unknown): readonly number[] {
  if (typeof crudo !== 'string') return PORCENTAJES_POR_OMISION;

  const limpios = crudo
    .split(',')
    .map((parte) => Number(parte.trim()))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 100);

  return limpios.length > 0 ? limpios : PORCENTAJES_POR_OMISION;
}

function enumerado<T extends string>(
  valores: Readonly<Record<string, unknown>>,
  clave: string,
  permitidos: readonly string[],
  omision: T,
): T {
  const valor = valores[clave];
  return typeof valor === 'string' && permitidos.includes(valor) ? (valor as T) : omision;
}

/** Lee los interruptores del documento de configuración. Función pura. */
export function banderasDe(valores: unknown): BanderasPortal {
  const doc: Readonly<Record<string, unknown>> =
    typeof valores === 'object' && valores !== null && !Array.isArray(valores)
      ? (valores as Record<string, unknown>)
      : {};

  return {
    // El portal nace CERRADO. Un negocio que nunca configuró nada no debe
    // tener un menú público en internet porque alguien adivinó una URL.
    portalActivo: bandera(doc, 'portal_qr_activo', false),
    modoMenu: enumerado(doc, 'portal_qr_modo_menu', MODOS_MENU, 'productos_pos'),
    modoCuenta: enumerado(doc, 'portal_qr_cuenta_modo', MODOS_CUENTA, 'mesero_dispara'),
    mostrarPrecios: bandera(doc, 'portal_qr_mostrar_precios', true),
    mostrarSinImagen: bandera(doc, 'portal_qr_mostrar_sin_imagen', true),
    permitirOrdenar: bandera(doc, 'portal_qr_permitir_ordenar', true),
    permitirCuenta: bandera(doc, 'portal_qr_permitir_cuenta', true),
    permitirAyuda: bandera(doc, 'portal_qr_permitir_ayuda', true),
    // Pedir desde el teléfono sí nace apagado: `PortalCliente.jsx:265` exige
    // que esté encendido a propósito.
    permitirPedidosCliente: bandera(doc, 'portal_qr_permitir_pedidos_cliente', false),
    permitirPropinaCliente: bandera(doc, 'portal_qr_permitir_propina_cliente', true),
    mostrarPrecuenta: bandera(doc, 'portal_qr_mostrar_precuenta', true),
    mensajeBienvenida: texto(doc, 'portal_qr_mensaje_bienvenida', MENSAJE_BIENVENIDA_MAXIMO),
    propinasActivas: bandera(doc, 'propinas_activas', true),
    porcentajesPropina: porcentajesValidos(doc['propina_porcentajes_sugeridos']),
    asignacionMesasActiva: bandera(doc, 'asignacion_mesas_activa', false),
    estacionesActivas: bandera(doc, 'estaciones_preparacion_activas', false),
  };
}
