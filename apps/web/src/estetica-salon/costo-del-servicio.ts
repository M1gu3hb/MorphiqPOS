import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * LO QUE LE CUESTA AL SALÓN LA CITA QUE SE ESTÁ DANDO: el material por la receta de
 * cabina de cada servicio y la comisión que va a causar (C.10 de la 2.4).
 *
 * «El costo de material con la comisión necesita el escandallo de cabina», decía la
 * cabecera — y el escandallo existía: la receta del servicio (`RecetaEscandallo`) con su
 * costo por línea, la misma que descuenta la cabina al cerrar el servicio. La comisión la
 * cotiza el servidor (`venta.cotizar_cita`). Ninguna de las dos es el cobro: son lo que
 * la dueña quiere saber de la cita que está en la silla.
 */

export interface LineaDeCabina {
  /** EN PESOS; no llega a quien no ve costos de insumo. */
  readonly costo_linea_calculado?: number | null;
}

/** El material de todas las recetas; nulo si falta el costo de alguna línea. */
export function materialDe(lineas: readonly LineaDeCabina[]): number | null {
  let total = 0;
  for (const linea of lineas) {
    const costo = centavosDe(
      'RecetaEscandallo',
      'costo_linea_calculado',
      linea.costo_linea_calculado,
    );
    if (costo === null) return null;
    total += costo;
  }
  return total;
}

export interface CostoDeLaCita {
  readonly materialCentavos: number | null;
  readonly comisionCentavos: number | null;
  /** El precio menos lo que se sabe; nulo si falta alguna de las dos. */
  readonly leQuedaCentavos: number | null;
}

export function costoDeLaCita(
  precioCentavos: number,
  materialCentavos: number | null,
  comisionCentavos: number | null,
): CostoDeLaCita {
  return {
    materialCentavos,
    comisionCentavos,
    leQuedaCentavos:
      materialCentavos === null || comisionCentavos === null
        ? null
        : precioCentavos - materialCentavos - comisionCentavos,
  };
}
