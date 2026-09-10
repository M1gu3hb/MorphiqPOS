import { aCentavos, aNumero, aPesos } from './conversion.ts';

/**
 * La mesa y su cuenta, recortadas para el comensal (`F1-04` §36.2, nota 2).
 *
 * El ámbito público lee «únicamente la venta activa de su propia mesa, resuelta
 * por `token_mesa`, y sólo para la precuenta». Ni una lista de ventas, ni la
 * mesa de al lado, ni una sola columna de costo.
 */

// ── Mesa y cuenta ──────────────────────────────────────────────────────────

/**
 * El estado de la mesa que el comensal necesita para saber qué puede hacer.
 *
 * No sale `qr_token` —ya lo tiene—, ni `empleado_asignado_id`, ni el nombre del
 * mesero, ni la zona, ni la posición en el mapa: son datos de la operación.
 * `tiene_mesero` sale como booleano porque su portal necesita saber si puede
 * abrir la mesa, no a quién le toca.
 */
export interface MesaPublica {
  readonly id: string;
  readonly numero: number;
  readonly nombre: string;
  readonly estado: string;
  readonly tiene_mesero: boolean;
  readonly venta_activa_id: string | null;
  readonly puede_abrir: boolean;
  readonly puede_pedir: boolean;
}

export interface FilaLineaCuenta {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: string;
  readonly unidad: string;
  readonly precio_unitario_centavos: bigint;
  readonly total_centavos: bigint;
  readonly notas: string | null;
  readonly estado_preparacion: string;
}

export interface LineaDeCuenta {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: number | null;
  readonly unidad: string;
  readonly precio_unitario: number | null;
  readonly precio_unitario_centavos: string | null;
  readonly total: number | null;
  /** El entero exacto. Es el que su pantalla debe sumar, no el flotante. */
  readonly total_centavos: string | null;
  readonly notas: string;
  readonly estado_preparacion: string;
}

/**
 * Una línea de la precuenta.
 *
 * Sin `costo_unitario_centavos` y sin `utilidad_centavos`. El comensal ve lo
 * que va a pagar; lo que le cuesta al negocio no es asunto suyo, y enseñarlo
 * sería peor que el defecto que este endpoint viene a cerrar.
 */
export function lineaDeCuenta(fila: FilaLineaCuenta): LineaDeCuenta {
  return {
    id: fila.id,
    producto_nombre: fila.producto_nombre,
    cantidad: aNumero(fila.cantidad),
    unidad: fila.unidad,
    precio_unitario: aPesos(fila.precio_unitario_centavos),
    precio_unitario_centavos: aCentavos(fila.precio_unitario_centavos),
    total: aPesos(fila.total_centavos),
    total_centavos: aCentavos(fila.total_centavos),
    notas: fila.notas ?? '',
    estado_preparacion: fila.estado_preparacion,
  };
}

export interface FilaCuenta {
  readonly id: string;
  readonly estado: string;
  readonly serie: string;
  readonly folio: bigint | null;
  readonly personas: number;
  readonly subtotal_centavos: bigint;
  readonly descuento_centavos: bigint;
  readonly impuestos_centavos: bigint;
  readonly total_centavos: bigint;
  readonly propina_puntos_base: number;
  readonly propina_tipo: string | null;
  readonly propina_origen: string | null;
  readonly satisfaccion_score: number | null;
}

export interface CuentaPublica {
  readonly id: string;
  readonly estado: string;
  readonly folio: string;
  readonly personas: number;
  readonly subtotal: number | null;
  readonly subtotal_centavos: string | null;
  readonly descuento: number | null;
  readonly descuento_centavos: string | null;
  readonly impuestos: number | null;
  readonly impuestos_centavos: string | null;
  readonly total: number | null;
  /** Sin propina (regla 1 de `F1-01` §3), y exacto. */
  readonly total_centavos: string | null;
  readonly propina_porcentaje: number;
  readonly propina_tipo: string;
  readonly propina_origen: string;
  readonly ya_valorada: boolean;
  readonly lineas: readonly LineaDeCuenta[];
}

const PUNTOS_BASE_POR_PUNTO = 100;

/**
 * La cuenta de ESTA mesa, y sólo para la precuenta (`§36.2`, nota 2).
 *
 * Fuera quedan `costo_total_centavos`, `utilidad_centavos` y `margen_bp`, que
 * son las tres columnas por las que un competidor sabría el margen del negocio
 * escaneando un código pegado en una mesa.
 */
/**
 * La cuenta de ESTA mesa, con la precuenta sólo si el negocio la enseña.
 *
 * `conPrecuenta` es `portal_qr_mostrar_precuenta` ya decidido en el servidor.
 * Apagada, no salen ni los totales ni las líneas —que es lo que ES la
 * precuenta—, y lo demás sí: el estado y `ya_valorada` no son dinero y su
 * pantalla los necesita para saber qué puede hacer el comensal. Hasta el
 * hallazgo 7 la bandera se publicaba y no gobernaba nada: la cuenta entera
 * salía igual y ocultarla era cosa del navegador.
 */
export function cuentaPublica(
  fila: FilaCuenta,
  lineas: readonly FilaLineaCuenta[],
  conPrecuenta: boolean,
): CuentaPublica {
  const importe = (centavos: bigint): bigint | null => (conPrecuenta ? centavos : null);

  return {
    id: fila.id,
    estado: fila.estado,
    folio: fila.folio === null ? '' : `${fila.serie}-${fila.folio.toString()}`,
    personas: fila.personas,
    subtotal: aPesos(importe(fila.subtotal_centavos)),
    subtotal_centavos: aCentavos(importe(fila.subtotal_centavos)),
    descuento: aPesos(importe(fila.descuento_centavos)),
    descuento_centavos: aCentavos(importe(fila.descuento_centavos)),
    impuestos: aPesos(importe(fila.impuestos_centavos)),
    impuestos_centavos: aCentavos(importe(fila.impuestos_centavos)),
    total: aPesos(importe(fila.total_centavos)),
    total_centavos: aCentavos(importe(fila.total_centavos)),
    propina_porcentaje: fila.propina_puntos_base / PUNTOS_BASE_POR_PUNTO,
    propina_tipo: fila.propina_tipo ?? '',
    propina_origen: fila.propina_origen ?? '',
    ya_valorada: fila.satisfaccion_score !== null,
    lineas: conPrecuenta ? lineas.map(lineaDeCuenta) : [],
  };
}
