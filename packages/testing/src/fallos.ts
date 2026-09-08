import { CODIGOS_ERROR, ErrorDominio } from '@morphiqpos/contracts/errores';

/**
 * Inyeccion de fallos (F1.0-T10).
 *
 * `13-PRUEBAS §6` exige cuatro escenarios donde se interrumpe un paso **interno**
 * de una transaccion y se verifica que no queda nada a medias:
 *
 *   FAULT-01  cobrarOrden, despues del pago y antes del stock
 *   FAULT-02  enviarComanda, a mitad de las lineas
 *   FAULT-03  recibirCompra, entre la compra y la entrada de stock
 *   FAULT-04  devolverOrden, entre el reembolso y el retorno a inventario
 *
 * Los cuatro comparten la misma forma: un comando ejecuta pasos con nombre
 * dentro de una transaccion, y la prueba dice "revienta justo despues de este".
 * Por eso el mecanismo vive aqui y no se reinventa en cada prueba.
 *
 * La clave esta en el nombre: el punto de interrupcion se elige por **nombre de
 * paso**, no por posicion. Un indice se rompe en cuanto alguien agrega un paso
 * intermedio, y entonces la prueba sigue pasando... interrumpiendo otra cosa.
 */

/** Error con el que se interrumpe. Se distingue de un fallo real. */
export class FalloInyectado extends Error {
  readonly paso: string;

  constructor(paso: string) {
    super(`Fallo inyectado despues del paso "${paso}"`);
    this.name = 'FalloInyectado';
    this.paso = paso;
  }
}

/** Un paso con nombre dentro de una operacion. */
export interface Paso<T> {
  readonly nombre: string;
  readonly ejecutar: () => Promise<T> | T;
}

export interface OpcionesInyeccion {
  /** Nombre del paso DESPUES del cual se interrumpe. */
  readonly interrumpirDespuesDe: string;
}

/**
 * Ejecuta pasos en orden e interrumpe despues del que se indique.
 *
 * Falla si el paso nombrado no existe. Es deliberado: una prueba que cree estar
 * interrumpiendo "despues del pago" cuando ese paso se renombro no prueba nada,
 * y pasaria en verde para siempre.
 */
export async function ejecutarConFallo<T>(
  pasos: readonly Paso<T>[],
  opciones: OpcionesInyeccion,
): Promise<T[]> {
  const objetivo = opciones.interrumpirDespuesDe;

  if (!pasos.some((paso) => paso.nombre === objetivo)) {
    throw new ErrorDominio(
      CODIGOS_ERROR.PASO_INEXISTENTE,
      `No existe el paso "${objetivo}". Pasos disponibles: ${pasos.map((p) => p.nombre).join(', ')}.`,
      { objetivo },
    );
  }

  const resultados: T[] = [];

  for (const paso of pasos) {
    resultados.push(await paso.ejecutar());
    if (paso.nombre === objetivo) {
      throw new FalloInyectado(paso.nombre);
    }
  }

  return resultados;
}

/** Ejecuta los mismos pasos sin interrumpir, para comparar. */
export async function ejecutarCompleto<T>(pasos: readonly Paso<T>[]): Promise<T[]> {
  const resultados: T[] = [];
  for (const paso of pasos) resultados.push(await paso.ejecutar());
  return resultados;
}

/** True si el error viene de la inyeccion y no de un fallo real del sistema. */
export function esFalloInyectado(valor: unknown): valor is FalloInyectado {
  return valor instanceof FalloInyectado;
}
