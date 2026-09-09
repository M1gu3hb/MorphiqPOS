import 'server-only';

import { desdeTexto } from '@morphiqpos/domain/dinero';

/**
 * Los tipos del puente y las conversiones de valor (F1-02 §3).
 *
 * Su frontend habla en pesos decimales, fechas ISO y booleanos `activo`. El
 * backend habla en `bigint` de centavos, `timestamptz` y columnas que a veces
 * se llaman `activa`. Aquí está la única traducción, y es simétrica: lo que
 * sale tiene que volver a entrar igual.
 *
 * Por eso cada entidad lleva una prueba de ida y vuelta. Un campo mal mapeado
 * no da error: da un precio con dos ceros de más en un ticket, seis meses
 * después.
 */

/** Cómo se convierte un valor entre su mundo y el de la base. */
export type Conversion =
  /** Texto tal cual. */
  | 'texto'
  /** Entero. */
  | 'entero'
  /**
   * DINERO. En la base es `bigint` de CENTAVOS; él lo lee en pesos decimales.
   * Nunca se hace aritmética del lado de él: el servidor recalcula siempre.
   */
  | 'dinero'
  /** `numeric` de Postgres, que Kysely entrega como cadena. Él espera número. */
  | 'decimal'
  /** Puntos base en la base (1600 = 16 %); él lo lee en por ciento. */
  | 'puntos_base'
  | 'booleano'
  /** `timestamptz` ↔ ISO 8601. */
  | 'fecha'
  /** `date` ↔ `YYYY-MM-DD`. */
  | 'dia'
  /** JSON opaco: viaja sin tocar. */
  | 'json';

export interface CampoMapeado {
  /** La columna en la tabla destino. */
  readonly columna: string;
  readonly conversion: Conversion;
  /**
   * `false` cuando lo calcula el SERVIDOR y no se acepta del cliente:
   * subtotales, totales, utilidad, margen, costos derivados. Es la regla que
   * no se negocia — el endpoint no acepta importes del cliente.
   */
  readonly escribible?: boolean;
  /**
   * `true` cuando el campo puede salir por el endpoint PÚBLICO del portal QR.
   * Todo lo demás se filtra: es lo que cierra la fuga D-14, donde hoy el portal
   * expone `presentacion_password` y los identificadores de Google a
   * cualquiera que escanee un código.
   */
  readonly publico?: boolean;
}

export type PoliticaDeEscritura =
  /** Escrituras simples de catálogo: pasan por un comando delgado. */
  | 'directa'
  /**
   * Sólo por comando transaccional dedicado. El puente RECHAZA la escritura.
   * Son las catorce operaciones de `F1-01` §6: cobrar, enviar pedido, abrir
   * mesa, corte… Escribir una venta campo por campo desde el navegador es
   * exactamente lo que producía el defecto D-07.
   */
  | 'comando'
  /** No se escribe nunca: es una vista o un derivado. */
  | 'lectura';

export interface MapaEntidad {
  /** La tabla destino en el esquema nuevo. */
  readonly tabla: string;
  /** Alias de la tabla en las consultas. */
  readonly alias?: string;
  readonly campos: Readonly<Record<string, CampoMapeado>>;
  readonly escritura: PoliticaDeEscritura;
  /**
   * Filtro que SIEMPRE se aplica, además del ámbito. Sirve para las tablas que
   * el backend comparte entre varios conceptos —`categorias` guarda las de
   * producto y las de insumo en la misma tabla, distinguidas por `tipo`—.
   */
  readonly filtroFijo?: Readonly<Record<string, string | boolean>>;
  /** Orden por omisión cuando él no pide ninguno. */
  readonly ordenPorOmision?: string;
  /** Roles que pueden LEER esta entidad. `undefined` = cualquiera con sesión. */
  readonly rolesLectura?: readonly string[];
}

/** Nada de `list(10000)`: el tope existe para que una pantalla no tumbe la base. */
export const LIMITE_MAXIMO = 1000;
export const LIMITE_POR_OMISION = 200;

const CENTAVOS_POR_PESO = 100;

/**
 * Un `unknown` a texto, sin `[object Object]`.
 *
 * `String(valor)` sobre un objeto da `[object Object]`, que es exactamente el
 * valor que acaba guardado en una columna cuando nadie mira. Aquí un objeto se
 * serializa como JSON, que al menos se puede leer y depurar.
 */
function aTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') {
    return valor.toString();
  }
  return JSON.stringify(valor);
}

/** De la base hacia su frontend. */
export function haciaEl(valor: unknown, conversion: Conversion): unknown {
  if (valor === null || valor === undefined) return null;
  switch (conversion) {
    case 'dinero':
      return Number(valor) / CENTAVOS_POR_PESO;
    case 'decimal':
      return Number(valor);
    case 'entero':
      return Number(valor);
    case 'puntos_base':
      return Number(valor) / CENTAVOS_POR_PESO;
    case 'booleano':
      return Boolean(valor);
    case 'fecha':
      return valor instanceof Date ? valor.toISOString() : aTexto(valor);
    case 'dia':
      return valor instanceof Date ? valor.toISOString().slice(0, 10) : aTexto(valor);
    case 'json':
      return valor;
    case 'texto':
    default:
      return aTexto(valor);
  }
}

/**
 * De su frontend hacia la base.
 *
 * El redondeo del dinero es a centavo entero y se hace AQUÍ, una sola vez. Un
 * `45.55 * 100` en coma flotante da `4554.999…`; sin el redondeo, un producto
 * de 45.55 se guardaría a 45.54 y nadie sabría por qué.
 */
export function haciaLaBase(valor: unknown, conversion: Conversion): unknown {
  if (valor === null || valor === undefined) return null;
  switch (conversion) {
    case 'dinero':
      // `desdeTexto` del dominio, NO `Math.round(x * 100)`.
      //
      // La multiplicación en coma flotante pierde el medio centavo justo en el
      // caso que importa: `1234.995 * 100` da `123499.49999…`, así que redondear
      // ahí devuelve 1234.99 en vez de 1235.00. `desdeTexto` arma el importe
      // como fracción exacta y redondea UNA vez, con la regla única del sistema.
      // Lo cazó la prueba de ida y vuelta.
      return desdeTexto(aTexto(valor)) as bigint;
    case 'puntos_base':
      return Math.round(Number(valor) * CENTAVOS_POR_PESO);
    case 'decimal':
      return Number(valor).toString();
    case 'entero':
      return Math.trunc(Number(valor));
    case 'booleano':
      return Boolean(valor);
    case 'fecha':
      return new Date(aTexto(valor));
    case 'dia':
      return aTexto(valor).slice(0, 10);
    case 'json':
      return valor;
    case 'texto':
    default:
      return aTexto(valor);
  }
}

/**
 * Los tres campos automáticos que su frontend lee SIEMPRE.
 *
 * `Configuracion.jsx` depende de `updated_date` para volver a hidratar los
 * formularios: si falta, los interruptores se quedan con el valor viejo
 * después de guardar.
 */
export const CAMPOS_AUTOMATICOS: Readonly<Record<string, CampoMapeado>> = {
  id: { columna: 'id', conversion: 'texto', escribible: false, publico: true },
  created_date: { columna: 'created_at', conversion: 'fecha', escribible: false },
  updated_date: { columna: 'updated_at', conversion: 'fecha', escribible: false },
};
