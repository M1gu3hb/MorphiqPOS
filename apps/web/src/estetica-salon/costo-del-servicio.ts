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

/**
 * Qué parte de «lo que le cuesta al salón» puede leer quien entra. Lo calcula la PÁGINA, en el
 * servidor, con los permisos de lo que se va a pedir (`~/servidor/costo-de-la-cita`): la
 * pantalla sólo pide lo que su puesto lee, y no se hace una pregunta que se sabe negada.
 */
export interface QuienVeElCosto {
  /** Puede leer la receta del servicio Y el costo de cada línea: el material tiene precio. */
  readonly material: boolean;
  /** Puede cotizar la cita y, con ello, saber la comisión que va a causar. */
  readonly comision: boolean;
}

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
