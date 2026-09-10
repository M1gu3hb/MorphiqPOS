/**
 * Errores tipados del dominio.
 *
 * `04-ARQUITECTURA §3` — "Errores tipados: `ErrorDominio` con codigo estable,
 * nunca strings libres."
 *
 * El codigo es lo que viaja: a la interfaz para traducir el mensaje, a la
 * auditoria para poder contar cuantas veces pasa, y a las pruebas para afirmar
 * *que* fallo y no solo *que* fallo algo. Un `throw new Error('total invalido')`
 * no sirve para ninguna de las tres cosas.
 */

/** Codigos estables. Nunca se renombra uno: se marca obsoleto y se agrega otro. */
export const CODIGOS_ERROR = {
  // --- puente de compatibilidad (F1-02 §3) ---
  /** La entidad no está en la lista blanca del puente. */
  PUENTE_ENTIDAD_DESCONOCIDA: 'PUENTE_ENTIDAD_DESCONOCIDA',
  /** Campo que no existe, o que lo calcula el servidor y no se acepta. */
  PUENTE_CAMPO_INVALIDO: 'PUENTE_CAMPO_INVALIDO',
  /** El rol no puede leer o escribir esa entidad. */
  PUENTE_SIN_PERMISO: 'PUENTE_SIN_PERMISO',
  /** No existe — o es de otra organización, que se ve igual. */
  PUENTE_NO_ENCONTRADO: 'PUENTE_NO_ENCONTRADO',

  // --- catálogo: códigos aditivos del carril B ---
  CANTIDAD_INVALIDA: 'CANTIDAD_INVALIDA',
  UNIDAD_INCOMPATIBLE: 'UNIDAD_INCOMPATIBLE',
  CATALOGO_INVALIDO: 'CATALOGO_INVALIDO',
  INVENTARIO_INVALIDO: 'INVENTARIO_INVALIDO',
  STOCK_INSUFICIENTE: 'STOCK_INSUFICIENTE',
  CONFIGURACION_INVALIDA: 'CONFIGURACION_INVALIDA',
  CONFIGURACION_CONFLICTO: 'CONFIGURACION_CONFLICTO',
  // --- dinero ---
  /** Se intento construir un importe que no es un entero de centavos. */
  DINERO_NO_ENTERO: 'DINERO_NO_ENTERO',
  /** El texto recibido no representa un importe. */
  DINERO_TEXTO_INVALIDO: 'DINERO_TEXTO_INVALIDO',
  /** Se pidio repartir en un numero de partes que no es un entero positivo. */
  DINERO_PARTES_INVALIDAS: 'DINERO_PARTES_INVALIDAS',
  /** Se pidio un redondeo con divisor cero. */
  DINERO_DIVISOR_CERO: 'DINERO_DIVISOR_CERO',
  /** Los puntos base de un porcentaje no son un entero. */
  DINERO_PORCENTAJE_INVALIDO: 'DINERO_PORCENTAJE_INVALIDO',

  // --- venta y caja (F1.1 carril A) ---
  /** No hay terminal enrolada: sin ella no se puede vender ni abrir caja. */
  VENTA_SIN_TERMINAL: 'VENTA_SIN_TERMINAL',
  /** El producto no existe, esta archivado, o es de otra organizacion. */
  PRODUCTO_NO_ENCONTRADO: 'PRODUCTO_NO_ENCONTRADO',
  ORDEN_NO_ENCONTRADA: 'ORDEN_NO_ENCONTRADA',
  /** La orden ya se cobro o se cancelo. R14: no hay `update` libre de estado. */
  ORDEN_NO_EDITABLE: 'ORDEN_NO_EDITABLE',
  ORDEN_VACIA: 'ORDEN_VACIA',
  LINEA_NO_ENCONTRADA: 'LINEA_NO_ENCONTRADA',
  /** Lo que suman los pagos no es lo que cuesta la orden. */
  PAGO_NO_CUADRA: 'PAGO_NO_CUADRA',
  /** El cliente no dio suficiente efectivo para el importe de ese renglon. */
  EFECTIVO_INSUFICIENTE: 'EFECTIVO_INSUFICIENTE',
  /** El total que traia la pantalla ya no es el vigente. */
  TOTAL_DESACTUALIZADO: 'TOTAL_DESACTUALIZADO',
  CAJA_CERRADA: 'CAJA_CERRADA',
  CAJA_YA_ABIERTA: 'CAJA_YA_ABIERTA',

  // --- restaurante: mesas, comandas y preparación (F1-02 E6) ---
  /** La mesa no existe, está dada de baja, o es de otra organización. */
  MESA_NO_ENCONTRADA: 'MESA_NO_ENCONTRADA',
  /**
   * Ya hay una venta viva en esa mesa.
   *
   * Lo impone la base con `ordenes_una_activa_por_mesa` (F1-04 §35.5). El
   * código existe para que ese 23505 llegue al mesero como «esa mesa ya está
   * abierta» y no como un 500 sin explicación.
   */
  MESA_YA_ABIERTA: 'MESA_YA_ABIERTA',
  /** Se intentó liberar una mesa cuya venta todavía no se ha cobrado. */
  MESA_NO_LIBERABLE: 'MESA_NO_LIBERABLE',
  COMANDA_NO_ENCONTRADA: 'COMANDA_NO_ENCONTRADA',
  /** El estado pedido no sigue a la tabla de transiciones, o retrocede. */
  TRANSICION_INVALIDA: 'TRANSICION_INVALIDA',
  /** No hay estación de preparación a la que mandar la comanda, ni general. */
  ESTACION_NO_ENCONTRADA: 'ESTACION_NO_ENCONTRADA',

  // --- restaurante: compras, gastos y propinas (F1-02 E4-5 y E6-7) ---
  PROVEEDOR_NO_ENCONTRADO: 'PROVEEDOR_NO_ENCONTRADO',
  /** La compra no existe, o es de otra organización. */
  COMPRA_NO_ENCONTRADA: 'COMPRA_NO_ENCONTRADA',
  /**
   * La compra no se puede registrar tal como viene.
   *
   * Cubre la línea sin equivalencia —sin ella, «3 cajas» no se puede auditar
   * seis meses después (F1-04 §23.1)— y la conversión que no cuadra.
   */
  COMPRA_INVALIDA: 'COMPRA_INVALIDA',
  GASTO_INVALIDO: 'GASTO_INVALIDO',
  PLANTILLA_NO_ENCONTRADA: 'PLANTILLA_NO_ENCONTRADA',
  /** Se intentó liquidar una propina que ya está liquidada. */
  PROPINA_YA_LIQUIDADA: 'PROPINA_YA_LIQUIDADA',
  /** El rango no tiene propinas pendientes, o está al revés. */
  LIQUIDACION_INVALIDA: 'LIQUIDACION_INVALIDA',

  // --- portal QR público (F1-02 E7) ---
  /** El token de la mesa no existe, está desactivado, o caducó. */
  QR_TOKEN_INVALIDO: 'QR_TOKEN_INVALIDO',
  /** El portal está apagado para este negocio. */
  QR_PORTAL_CERRADO: 'QR_PORTAL_CERRADO',
  /** Ya hay una solicitud pendiente de ese tipo en esa mesa (D-17). */
  QR_SOLICITUD_DUPLICADA: 'QR_SOLICITUD_DUPLICADA',
  /** Demasiadas peticiones desde el mismo código en poco tiempo. */
  QR_DEMASIADAS_PETICIONES: 'QR_DEMASIADAS_PETICIONES',

  // --- mantenimiento destructivo (F1-02 E10-4) ---
  /**
   * La confirmación no coincide.
   *
   * Se compara contra el NOMBRE DEL NEGOCIO leído en el servidor, no contra una
   * constante impresa en la pantalla: hoy `reiniciarSistema` compara `confirm`
   * con «BORRAR TODO», que es texto que el atacante ya conoce.
   */
  MANTENIMIENTO_NO_CONFIRMADO: 'MANTENIMIENTO_NO_CONFIRMADO',

  // --- accesos (C-05, C-06) ---
  /** El empleado o la terminal no existen DENTRO de la organizacion de quien pide. */
  ACCESO_NO_ENCONTRADO: 'ACCESO_NO_ENCONTRADO',

  // --- andamiaje de pruebas ---
  /** Se pidio interrumpir despues de un paso que no existe (inyeccion de fallos). */
  PASO_INEXISTENTE: 'PASO_INEXISTENTE',
} as const;

export type CodigoError = (typeof CODIGOS_ERROR)[keyof typeof CODIGOS_ERROR];

/** Datos adicionales del error. Nunca lleva secretos ni datos de cliente (R31). */
export type DetallesError = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Error de una regla de negocio o de una precondicion violada.
 *
 * No se usa para fallos de infraestructura (red caida, disco lleno): esos son
 * excepciones normales y suben tal cual.
 */
export class ErrorDominio extends Error {
  readonly codigo: CodigoError;
  readonly detalles: DetallesError;

  constructor(codigo: CodigoError, mensaje: string, detalles: DetallesError = {}) {
    super(mensaje);
    this.name = 'ErrorDominio';
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

/** Estrecha un `unknown` de un `catch` a `ErrorDominio` (R12). */
export function esErrorDominio(valor: unknown): valor is ErrorDominio {
  return valor instanceof ErrorDominio;
}
