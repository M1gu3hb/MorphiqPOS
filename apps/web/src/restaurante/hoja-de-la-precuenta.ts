/**
 * LA HOJA DE LA PRECUENTA: lo que el servidor imprime y los totales que la hoja enseña
 * (día completo del restaurante, 2.4).
 *
 * Aparte de `precuenta-de-la-mesa.ts`, que guarda lo que el servidor contestó al pedir la
 * cuenta: aquí se decide qué cifra sale en la hoja —la impresa por el servidor manda sobre
 * la guardada, y la guardada sobre la que el puente no le abre al mesero—.
 */

import { aplicarPorcentaje, centavos } from '@morphiqpos/domain/dinero';

import {
  centavosDelTexto,
  esRegistro,
  type PropinaDeLaHoja,
  type PrecuentaDeLaMesa,
} from './precuenta-de-la-mesa.ts';

/** Lo que dice la hoja impresa por el servidor (`restaurante.imprimir_precuenta`). */
export interface HojaImpresa {
  readonly codigo: string;
  readonly subtotalCentavos: number;
  readonly impuestosCentavos: number;
  readonly totalCentavos: number;
  readonly copia: number;
}

/** La respuesta de `imprimir_precuenta`, validada con el mismo rigor. */
export function hojaDeLaRespuesta(respuesta: unknown): HojaImpresa | null {
  if (!esRegistro(respuesta)) return null;
  const subtotal = centavosDelTexto(respuesta['subtotalCentavos']);
  const impuestos = centavosDelTexto(respuesta['impuestosCentavos']);
  const total = centavosDelTexto(respuesta['totalCentavos']);
  const { codigo, copia } = respuesta;
  if (subtotal === null || impuestos === null || total === null) return null;
  if (typeof codigo !== 'string' || typeof copia !== 'number') return null;
  return {
    codigo,
    subtotalCentavos: subtotal,
    impuestosCentavos: impuestos,
    totalCentavos: total,
    copia,
  };
}

/** Los importes del puente para esa cuenta: `null` cuando el rol no los lee. */
export interface ImportesDelPuente {
  readonly subtotal: number | null;
  readonly impuestos: number | null;
  readonly total: number | null;
}

export interface TotalesDeLaHoja {
  readonly subtotal: number | null;
  readonly impuestos: number | null;
  readonly total: number | null;
  readonly propina: PropinaDeLaHoja;
  /** Lo que la mesa paga: el consumo y, si ya se decidió, su propina. `null` sin total. */
  readonly aPagar: number | null;
  /** De dónde salen los números, para decirlo y para probarlo. */
  readonly origen: 'impresa' | 'puente' | 'guardada' | 'ninguno';
  readonly codigo: string | null;
}

/**
 * La propina de la hoja SOBRE EL TOTAL QUE LA HOJA MUESTRA. Lo guardado es lo que la mesa
 * eligió —el tipo y el porcentaje—, no un importe: si después de pedir la cuenta la mesa pidió
 * otro platillo, el 10 % es el 10 % del consumo de ahora, no el de hace diez minutos.
 */
function propinaSobre(propina: PropinaDeLaHoja, total: number): PropinaDeLaHoja {
  if (propina.tipo !== 'porcentaje') return propina;
  return {
    tipo: 'porcentaje',
    puntosBase: propina.puntosBase,
    importeCentavos: Number(aplicarPorcentaje(centavos(total), propina.puntosBase)),
  };
}

/**
 * LOS NÚMEROS DE LA HOJA, con un orden de verdad: lo que el servidor imprimió manda sobre lo
 * que contestó al pedir la cuenta, y eso sobre la lectura del puente —que para el mesero llega
 * recortada, no en cero—. Nunca se mezclan fuentes dentro de un mismo número.
 */
export function totalesDeLaHoja(
  puente: ImportesDelPuente,
  guardada: PrecuentaDeLaMesa | null,
  impresa: HojaImpresa | null,
): TotalesDeLaHoja {
  const elegida: PropinaDeLaHoja = guardada?.propina ?? { tipo: 'a_definir' };
  const armar = (
    cifras: {
      readonly subtotal: number | null;
      readonly impuestos: number | null;
      readonly total: number;
    },
    origen: TotalesDeLaHoja['origen'],
    codigo: string | null,
  ): TotalesDeLaHoja => {
    const propina = propinaSobre(elegida, cifras.total);
    return {
      ...cifras,
      propina,
      aPagar: cifras.total + (propina.tipo === 'porcentaje' ? propina.importeCentavos : 0),
      origen,
      codigo,
    };
  };

  if (impresa !== null) {
    return armar(
      {
        subtotal: impresa.subtotalCentavos,
        impuestos: impresa.impuestosCentavos,
        total: impresa.totalCentavos,
      },
      'impresa',
      impresa.codigo === '' ? (guardada?.codigoCaja ?? null) : impresa.codigo,
    );
  }
  if (puente.total !== null) {
    return armar(
      { subtotal: puente.subtotal, impuestos: puente.impuestos, total: puente.total },
      'puente',
      guardada?.codigoCaja ?? null,
    );
  }
  if (guardada !== null) {
    return armar(
      {
        subtotal: guardada.subtotalCentavos,
        impuestos: guardada.impuestosCentavos,
        total: guardada.totalCentavos,
      },
      'guardada',
      guardada.codigoCaja,
    );
  }
  return {
    subtotal: null,
    impuestos: null,
    total: null,
    propina: elegida,
    aPagar: null,
    origen: 'ninguno',
    codigo: null,
  };
}
