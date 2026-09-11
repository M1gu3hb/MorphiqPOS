import { ErrorDominio } from '@morphiqpos/contracts';
import {
  cantidad,
  cantidadATexto,
  cantidadExacta,
  ESCALA_CANTIDAD,
  type Cantidad,
} from '@morphiqpos/domain/catalogo';
import { redondear, type Centavos } from '@morphiqpos/domain/dinero';

/**
 * La aritmética de una compra: conversión y costo promedio ponderado.
 *
 * Vive aparte del comando porque es lo único de la compra que se puede probar
 * sin Postgres, y porque hoy la fórmula está copiada en TRES sitios
 * (`RegistrarCompraDialog.jsx:305-313`, `RegistrarInventarioInicialDialog.jsx:230-244`
 * y —mal— `importExecutors.js:41-50`, que es el defecto D-13: sobrescribe el
 * costo sin ponderar). Aquí hay una sola.
 *
 * Todo es `bigint`. El cliente hace `((oldStock * oldCost) + (qtyBase * costPerBase)) / newStock`
 * con `number` y persiste el resultado redondeado a cuatro decimales
 * (`:329`): dos redondeos encadenados sobre punto flotante, en el número del
 * que cuelgan el margen y la utilidad de todo el menú.
 */

/** Una unidad del catálogo estándar, con su factor hacia la unidad de su dimensión. */
interface UnidadEstandar {
  readonly dimension: string;
  readonly factor: bigint;
}

/**
 * Las unidades cuyo factor lo fija el catálogo, no el usuario (F1-04 §0.4).
 *
 * No se reutiliza `normalizarUnidad` de `@morphiqpos/domain/catalogo` porque
 * ésa LANZA ante una unidad que no conoce, y `bolsa` es una de las nueve
 * `DEFAULT_UNIDADES_COMPRA` (`unidadesMedida.js:10-12`) — además de que el
 * administrador puede añadir las suyas (§31). Aquí una unidad desconocida no
 * es un error: es exactamente el caso que la equivalencia resuelve.
 */
const ESTANDAR: Readonly<Record<string, UnidadEstandar>> = {
  kg: { dimension: 'masa', factor: 1000n },
  g: { dimension: 'masa', factor: 1n },
  l: { dimension: 'volumen', factor: 1000n },
  ml: { dimension: 'volumen', factor: 1n },
  m: { dimension: 'longitud', factor: 1n },
  pieza: { dimension: 'conteo', factor: 1n },
};

const ALIAS: Readonly<Record<string, string>> = {
  kilo: 'kg',
  kilos: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  gr: 'g',
  gramo: 'g',
  gramos: 'g',
  lt: 'l',
  lts: 'l',
  litro: 'l',
  litros: 'l',
  mililitro: 'ml',
  mililitros: 'ml',
  metro: 'm',
  metros: 'm',
  piezas: 'pieza',
  pza: 'pieza',
  pzas: 'pieza',
  pz: 'pieza',
  unidad: 'pieza',
  unidades: 'pieza',
};

function normalizar(texto: string): string {
  const clave = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ALIAS[clave] ?? clave;
}

/**
 * Diezmilésimas de unidad **con signo**.
 *
 * `existencias.cantidad` puede ser negativa a propósito
 * (`003_venta_caja_inventario.sql:393-411`: es la deuda con el conteo físico
 * cuando el producto permite venderse sin stock), y `cantidad()` del dominio
 * sólo admite magnitudes.
 */
export function cantidadConSigno(texto: string): bigint {
  const limpio = texto.trim();
  const negativa = limpio.startsWith('-');
  const magnitud: bigint = cantidad(negativa ? limpio.slice(1) : limpio);
  return negativa ? -magnitud : magnitud;
}

/**
 * Cuántas unidades base trae una unidad de compra, cuando lo decide el catálogo.
 *
 * Devuelve `null` para las unidades de empaque (`caja`, `paquete`, `bolsa`, y
 * las que el administrador añada): ahí la equivalencia la captura quien compra,
 * y sin ella la compra es inauditable (F1-04 §23.1).
 */
export function equivalenciaCanonica(unidadCapturada: string, unidadBase: string): Cantidad | null {
  const capturada = ESTANDAR[normalizar(unidadCapturada)];
  if (capturada === undefined) return null;

  const base = ESTANDAR[normalizar(unidadBase)];
  if (base?.dimension !== capturada.dimension) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      `No se puede comprar en ${unidadCapturada} un insumo que se mide en ${unidadBase}: ` +
        'son medidas distintas. Usa una unidad de empaque y captura su equivalencia.',
    );
  }
  return cantidadExacta(capturada.factor * ESCALA_CANTIDAD, base.factor);
}

/**
 * La equivalencia que se va a guardar, tras comprobar la que llegó.
 *
 * Cuando el catálogo ya la conoce —3 kg de un insumo en gramos son 3000 g—, una
 * equivalencia distinta no se corrige en silencio: se rechaza. El diálogo de
 * Miguel manda `ing.cantidad_por_compra_default || 1` como respaldo
 * (`RegistrarCompraDialog.jsx:301`) y luego la ignora para las unidades
 * estándar; aceptarla aquí convertiría «3 kg» en «3 g» sin que nadie lo note.
 */
export function equivalenciaDeLinea(
  unidadCapturada: string,
  unidadBase: string,
  declarada: Cantidad,
): Cantidad {
  const canonica = equivalenciaCanonica(unidadCapturada, unidadBase);
  if (canonica === null) return declarada;
  if (canonica !== declarada) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      `Una unidad de ${unidadCapturada} son ${cantidadATexto(canonica)} ${unidadBase}, ` +
        `no ${cantidadATexto(declarada)}. Corrige la equivalencia de la línea.`,
    );
  }
  return canonica;
}

/** `cantidad = cantidad_capturada * equivalencia`, exacta o falla. */
export function convertirAUnidadBase(capturada: Cantidad, equivalencia: Cantidad): Cantidad {
  const producto = capturada * equivalencia;
  if (producto % ESCALA_CANTIDAD !== 0n) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      'La cantidad convertida no cabe en cuatro decimales exactos. Revisa la equivalencia: ' +
        'redondearla aquí falsearía el inventario y el costo.',
    );
  }
  return cantidadExacta(producto, ESCALA_CANTIDAD);
}

/**
 * Lo que costó UNA unidad de la medida que se le pase.
 *
 * Con la cantidad en unidad base da el costo unitario que va al ledger; con la
 * cantidad capturada da el costo por unidad de compra que precarga el próximo
 * pedido. Una sola división y un solo redondeo en los dos casos.
 */
export function costoPorUnidad(costoTotal: Centavos, cantidadDeLaUnidad: Cantidad): Centavos {
  if (cantidadDeLaUnidad <= 0n) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      'Una línea de compra sin cantidad no tiene costo unitario.',
    );
  }
  return redondear(costoTotal * ESCALA_CANTIDAD, cantidadDeLaUnidad);
}

export interface EntradaDePromedio {
  /** Existencia ANTES de esta compra, en diezmilésimas y con signo. */
  readonly existenciaAnterior: bigint;
  readonly costoAnteriorCentavos: Centavos;
  readonly cantidadEntrante: Cantidad;
  readonly costoTotalCentavos: Centavos;
}

/**
 * Costo promedio ponderado, en una sola división y un solo redondeo.
 *
 *     nuevo = (existencia * costo_anterior + costo_total) / (existencia + entrante)
 *
 * El cliente pasa por `costPerBase = cost / qtyBase` y luego multiplica otra vez
 * por `qtyBase`: matemáticamente se cancela, en punto flotante no. Aquí el
 * costo total entra entero y nunca se divide por la cantidad.
 *
 * Una existencia negativa cuenta como cero. No es una existencia con costo: es
 * lo que se debe al conteo físico, y ponderar contra ella daría un promedio
 * negativo que la base rechaza (`check costo_unitario_centavos >= 0`).
 */
export function costoPromedioPonderado(datos: EntradaDePromedio): Centavos {
  if (datos.cantidadEntrante <= 0n) {
    throw new ErrorDominio(
      'COMPRA_INVALIDA',
      'Una compra sin cantidad no puede mover el costo promedio.',
    );
  }
  const anterior = datos.existenciaAnterior > 0n ? datos.existenciaAnterior : 0n;
  const numerador =
    anterior * datos.costoAnteriorCentavos + datos.costoTotalCentavos * ESCALA_CANTIDAD;
  return redondear(numerador, anterior + datos.cantidadEntrante);
}
