/**
 * LA MATRIZ DE UN CÓDIGO QR.
 *
 * El dominio no codifica: quien dibuja un QR recibe la matriz ya hecha (la app usa el paquete
 * `qrcode`) y aquí sólo se le pregunta qué módulos están oscuros. Lo único que el diseño necesita
 * además es la versión, porque de ella depende dónde caen los patrones de alineación, y esos hay
 * que dibujarlos cuadrados o el lector pierde la referencia.
 */

export const VERSION_MINIMA = 1;
export const VERSION_MAXIMA = 40;

export interface MatrizQr {
  /** Módulos por lado: `17 + 4 × versión`. */
  readonly tamano: number;
  /** De 1 a 40. */
  readonly version: number;
  /** ¿Está oscuro el módulo (x, y)? Fuera de la matriz es siempre `false`. */
  modulo(x: number, y: number): boolean;
}

/** Módulos por lado de una versión: 21 para la 1, 177 para la 40. */
export function tamanoDeVersion(version: number): number {
  return 17 + 4 * version;
}

function exigirVersion(version: number): void {
  if (!Number.isInteger(version) || version < VERSION_MINIMA || version > VERSION_MAXIMA) {
    throw new RangeError(
      `La versión de un QR va de ${VERSION_MINIMA} a ${VERSION_MAXIMA}; llegó ${version}.`,
    );
  }
}

/**
 * Los centros de los patrones de alineación de una versión, en módulos (la tabla E.1 de la norma
 * ISO/IEC 18004). La versión 1 no tiene; de la 2 en adelante el primero es siempre 6, el último
 * cae a 7 módulos del borde y los de en medio se reparten a pasos iguales (pares, salvo en la 32).
 * Las combinaciones de estos valores, menos las tres que caerían sobre un buscador, son los
 * patrones.
 */
export function posicionesDeAlineacion(version: number): readonly number[] {
  exigirVersion(version);
  if (version === 1) return [];
  const cantidad = Math.floor(version / 7) + 2;
  const paso = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (cantidad * 2 - 2)) * 2;
  const ultimo = tamanoDeVersion(version) - 7;
  const intermedios = Array.from(
    { length: cantidad - 1 },
    (_, i) => ultimo - paso * (cantidad - 2 - i),
  );
  return [6, ...intermedios];
}

/**
 * Una matriz a partir de sus filas (`filas[y][x]`, `true` = oscuro). Sirve para las pruebas y para
 * quien ya tenga la matriz como arreglo. Copia las filas: lo que se cambie después afuera no mueve
 * el dibujo.
 *
 * @param version si no se da, sale del tamaño. Con un tamaño que no corresponde a ninguna versión
 *   lanza `RangeError`: una matriz mal formada dibujaría un QR que ningún lector reconoce.
 */
export function matrizDesdeFilas(
  filas: readonly (readonly boolean[])[],
  version?: number,
): MatrizQr {
  const tamano = filas.length;
  if (filas.some((fila) => fila.length !== tamano)) {
    throw new RangeError('La matriz de un QR es cuadrada: todas las filas miden lo mismo.');
  }
  const deducida = (tamano - 17) / 4;
  const elegida = version ?? deducida;
  exigirVersion(elegida);
  if (tamanoDeVersion(elegida) !== tamano) {
    throw new RangeError(
      `Una matriz de ${tamano} módulos no es de la versión ${elegida} (` +
        `${tamanoDeVersion(elegida)} módulos).`,
    );
  }
  const copia = filas.map((fila) => [...fila]);
  return {
    tamano,
    version: elegida,
    modulo: (x, y) => copia[y]?.[x] === true,
  };
}
